/**
 * 1-на-1 голосовые звонки. Сервис в состоянии безголосого брокера сигналинга:
 * принимает invite/accept/decline/cancel/hangup/offer/answer/ice от клиентов
 * и форвардит через EventBus конкретному пользователю.
 *
 * Источник истины — in-memory `activeCalls`. Для нашего pet-сценария (5–10
 * человек) это адекватно: при рестарте процесса все звонки умирают вместе,
 * клиенты получат `disconnect` от WS и сами вернутся в `idle`.
 *
 * Группировка событий:
 *   - lifecycle: invite → ringing → accepted/declined/cancelled → ended
 *   - signaling: offer/answer/ice — пробрасываются как есть только пока active
 *   - проверки: invite между разными guild'ами без пересечения members запрещён
 *   - таймауты: 45s на pickup (после — auto-decline:'timeout')
 */

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { members } from '../../db/schema.js';
import type { EventBus } from '../../realtime/event-bus.js';
import type { ServerEvent } from '@quorum/shared';
import type { DmChannelsService } from '../dm/service.js';

export type CallStatus = 'ringing' | 'active' | 'ended';

export interface CallRecord {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: CallStatus;
  /** Unix-ms когда status стал 'active'. Используется для duration в call_ended system-message. */
  acceptedAt: number | null;
  /** setTimeout-handle для авто-отбоя по timeout. Чистится при любом терминальном переходе. */
  timeoutTimer: NodeJS.Timeout | null;
}

export type DeclineReason = 'busy' | 'rejected' | 'unreachable' | 'timeout';

export const RING_TIMEOUT_MS = 45_000;

export class CallsService {
  /** callId → CallRecord. */
  private readonly calls = new Map<string, CallRecord>();
  /** userId → callId. Один юзер — максимум один активный звонок. */
  private readonly callByUser = new Map<string, string>();

  constructor(
    private readonly db: DbClient,
    private readonly events: EventBus,
    private readonly dmChannels: DmChannelsService,
  ) {}

  /** Вызывается WS-плагином когда юзер отваливается — отбиваем все его звонки. */
  onUserDisconnected(userId: string): void {
    const callId = this.callByUser.get(userId);
    if (!callId) return;
    const call = this.calls.get(callId);
    if (!call) {
      this.callByUser.delete(userId);
      return;
    }
    const otherId = call.fromUserId === userId ? call.toUserId : call.fromUserId;
    if (call.status === 'ringing') {
      this.terminate(call, otherId, { t: 'call.declined', callId, reason: 'unreachable' });
    } else {
      const durationText = formatDuration(
        call.acceptedAt ? Date.now() - call.acceptedAt : 0,
      );
      this.terminate(call, otherId, { t: 'call.ended', callId });
      void this.broadcastSystemMessage(
        call.fromUserId,
        call.toUserId,
        'call_ended',
        `Звонок завершён · ${durationText}`,
      );
    }
  }

  async invite(fromUserId: string, toUserId: string): Promise<void> {
    if (fromUserId === toUserId) {
      this.sendError(fromUserId, 'call_self', 'нельзя позвонить себе');
      return;
    }
    if (this.callByUser.has(fromUserId)) {
      this.sendError(fromUserId, 'call_busy_self', 'у вас уже есть активный звонок');
      return;
    }
    if (this.callByUser.has(toUserId)) {
      // Звонимый занят — короткий путь, без записи звонка.
      this.events.publishToUser(fromUserId, {
        t: 'call.declined',
        callId: '00000000-0000-0000-0000-000000000000',
        reason: 'busy',
      });
      return;
    }

    const sharedGuild = await this.haveCommonGuild(fromUserId, toUserId);
    if (!sharedGuild) {
      this.sendError(fromUserId, 'call_forbidden', 'нет общей гилды с этим пользователем');
      return;
    }

    const callId = randomUUID();
    const record: CallRecord = {
      id: callId,
      fromUserId,
      toUserId,
      status: 'ringing',
      acceptedAt: null,
      timeoutTimer: setTimeout(() => this.timeoutRing(callId), RING_TIMEOUT_MS),
    };
    this.calls.set(callId, record);
    this.callByUser.set(fromUserId, callId);
    this.callByUser.set(toUserId, callId);

    this.events.publishToUser(toUserId, {
      t: 'call.ringing',
      callId,
      fromUserId,
    });
    // Звонящий должен видеть тот же callId, чтобы потом cancel/hangup ссылаться на него.
    this.events.publishToUser(fromUserId, {
      t: 'call.ringing',
      callId,
      fromUserId,
    });
  }

  accept(userId: string, callId: string): void {
    const call = this.calls.get(callId);
    if (call?.toUserId !== userId || call.status !== 'ringing') return;
    this.clearTimeout(call);
    call.status = 'active';
    call.acceptedAt = Date.now();
    this.events.publishToUser(call.fromUserId, { t: 'call.accepted', callId });
    this.events.publishToUser(call.toUserId, { t: 'call.accepted', callId });
    void this.broadcastSystemMessage(call.fromUserId, call.toUserId, 'call_started', 'Начал звонок');
  }

  decline(userId: string, callId: string, reason: 'busy' | 'rejected' = 'rejected'): void {
    const call = this.calls.get(callId);
    if (call?.toUserId !== userId || call.status !== 'ringing') return;
    this.terminate(call, call.fromUserId, { t: 'call.declined', callId, reason });
  }

  cancel(userId: string, callId: string): void {
    const call = this.calls.get(callId);
    if (call?.fromUserId !== userId || call.status !== 'ringing') return;
    this.terminate(call, call.toUserId, { t: 'call.cancelled', callId });
  }

  hangup(userId: string, callId: string): void {
    const call = this.calls.get(callId);
    if (!call) return;
    if (call.fromUserId !== userId && call.toUserId !== userId) return;
    if (call.status !== 'active') return;
    const otherId = call.fromUserId === userId ? call.toUserId : call.fromUserId;
    const durationText = formatDuration(
      call.acceptedAt ? Date.now() - call.acceptedAt : 0,
    );
    this.terminate(call, otherId, { t: 'call.ended', callId });
    void this.broadcastSystemMessage(
      call.fromUserId,
      call.toUserId,
      'call_ended',
      `Звонок завершён · ${durationText}`,
    );
  }

  forwardOffer(userId: string, callId: string, sdp: string): void {
    const peer = this.peerOf(userId, callId, 'active');
    if (!peer) return;
    this.events.publishToUser(peer, { t: 'call.offer', callId, sdp });
  }

  forwardAnswer(userId: string, callId: string, sdp: string): void {
    const peer = this.peerOf(userId, callId, 'active');
    if (!peer) return;
    this.events.publishToUser(peer, { t: 'call.answer', callId, sdp });
  }

  forwardIce(userId: string, callId: string, candidate: string): void {
    const peer = this.peerOf(userId, callId, 'active');
    if (!peer) return;
    this.events.publishToUser(peer, { t: 'call.ice', callId, candidate });
  }

  forwardMedia(
    userId: string,
    callId: string,
    cameraStreamId: string | null,
    screenStreamId: string | null,
  ): void {
    const peer = this.peerOf(userId, callId, 'active');
    if (!peer) return;
    this.events.publishToUser(peer, {
      t: 'call.media',
      callId,
      cameraStreamId,
      screenStreamId,
    });
  }

  /** Для тестов и graceful shutdown. */
  shutdown(): void {
    for (const call of this.calls.values()) this.clearTimeout(call);
    this.calls.clear();
    this.callByUser.clear();
  }

  // ---- helpers ----

  private peerOf(userId: string, callId: string, expected: CallStatus): string | null {
    const call = this.calls.get(callId);
    if (call?.status !== expected) return null;
    if (call.fromUserId === userId) return call.toUserId;
    if (call.toUserId === userId) return call.fromUserId;
    return null;
  }

  private terminate(call: CallRecord, notifyUserId: string, event: ServerEvent): void {
    this.clearTimeout(call);
    call.status = 'ended';
    this.calls.delete(call.id);
    this.callByUser.delete(call.fromUserId);
    this.callByUser.delete(call.toUserId);
    this.events.publishToUser(notifyUserId, event);
  }

  private timeoutRing(callId: string): void {
    const call = this.calls.get(callId);
    if (call?.status !== 'ringing') return;
    // Информируем обе стороны.
    this.events.publishToUser(call.fromUserId, {
      t: 'call.declined',
      callId,
      reason: 'timeout',
    });
    this.terminate(call, call.toUserId, {
      t: 'call.declined',
      callId,
      reason: 'timeout',
    });
  }

  private clearTimeout(call: CallRecord): void {
    if (call.timeoutTimer) {
      clearTimeout(call.timeoutTimer);
      call.timeoutTimer = null;
    }
  }

  private sendError(userId: string, code: string, message: string): void {
    this.events.publishToUser(userId, { t: 'error', code, message });
  }

  private async haveCommonGuild(a: string, b: string): Promise<boolean> {
    // Маленькая выборка — у пары пользователей пересечение по guildId редко больше 1–2.
    const aRows = await this.db
      .select({ guildId: members.guildId })
      .from(members)
      .where(eq(members.userId, a));
    if (aRows.length === 0) return false;
    const aGuilds = new Set(aRows.map((r) => r.guildId));

    const bRows = await this.db
      .select({ guildId: members.guildId })
      .from(members)
      .where(eq(members.userId, b));
    return bRows.some((r) => aGuilds.has(r.guildId));
  }

  /**
   * Вставляет system-сообщение в DM между caller/callee и шлёт обоим
   * `dm.message.create`. Ошибка не валит звонок — только логируется
   * через void-catch в caller'ах.
   */
  private async broadcastSystemMessage(
    fromUserId: string,
    toUserId: string,
    kind: 'call_started' | 'call_ended',
    content: string,
  ): Promise<void> {
    try {
      const message = await this.dmChannels.insertSystemMessage(
        fromUserId,
        toUserId,
        kind,
        content,
      );
      this.events.publishToUser(fromUserId, { t: 'dm.message.create', message });
      this.events.publishToUser(toUserId, { t: 'dm.message.create', message });
    } catch {
      // не падаем — звонок уже state-completed.
    }
  }
}

/** «1 ч 23 мин 12 сек» / «3 мин 4 сек» / «12 сек». */
function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} ч ${m} мин ${s} сек`;
  if (m > 0) return `${m} мин ${s} сек`;
  return `${s} сек`;
}
