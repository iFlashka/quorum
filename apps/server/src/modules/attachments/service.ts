import { ulid } from 'ulid';
import { imageSize } from 'image-size';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { attachments, channels, members, messages } from '../../db/schema.js';
import { type FileStorage, makeStoragePath } from '../../storage/index.js';
import type { PublicAttachment } from '@quorum/shared';

export class AttachmentMimeError extends Error {
  readonly statusCode = 415;
  constructor(public readonly mimeType: string) {
    super(`mime_type_not_allowed:${mimeType}`);
    this.name = 'AttachmentMimeError';
  }
}

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'video/mp4',
  'video/webm',
]);

export class AttachmentsService {
  constructor(
    private readonly db: DbClient,
    private readonly storage: FileStorage,
  ) {}

  isMimeAllowed(mime: string): boolean {
    return ALLOWED_MIME.has(mime.toLowerCase());
  }

  async upload(
    uploaderId: string,
    payload: { filename: string; mimeType: string; data: Buffer },
  ): Promise<PublicAttachment> {
    if (!this.isMimeAllowed(payload.mimeType)) {
      throw new AttachmentMimeError(payload.mimeType);
    }

    // Генерим path, сохраняем на диск.
    const id = ulid();
    const path = makeStoragePath(new Date(), id, payload.filename);
    const stored = await this.storage.put(path, payload.data);

    let width: number | null = null;
    let height: number | null = null;
    if (payload.mimeType.startsWith('image/')) {
      try {
        const dim = imageSize(payload.data);
        width = dim.width ?? null;
        height = dim.height ?? null;
      } catch {
        // Если файл повреждён — вставим без размеров.
      }
    }

    const [row] = await this.db
      .insert(attachments)
      .values({
        uploaderId,
        filename: payload.filename,
        mimeType: payload.mimeType,
        sizeBytes: stored.sizeBytes,
        storagePath: stored.path,
        width,
        height,
      })
      .returning();
    if (!row) throw new Error('failed_to_insert_attachment');

    return {
      id: row.id,
      messageId: '', // ещё не привязан
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      url: `/attachments/${row.id}`,
    };
  }

  /**
   * Достать attachment по id с проверкой что текущий юзер имеет доступ:
   *   - либо это его собственный pending upload (messageId IS NULL & uploaderId = me)
   *   - либо attachment привязан к message в канале гилды, в которой юзер — member.
   */
  async getAccessible(
    userId: string,
    attachmentId: string,
  ): Promise<{
    storagePath: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  } | null> {
    const [row] = await this.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);
    if (!row) return null;

    // Pending upload — доступен только uploader-у.
    if (row.messageId === null) {
      if (row.uploaderId !== userId) return null;
      return row;
    }

    // Attached — проверяем membership в гилде через JOIN message → channel → members.
    const [acc] = await this.db
      .select({ ok: members.id })
      .from(attachments)
      .innerJoin(messages, eq(messages.id, attachments.messageId))
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .innerJoin(
        members,
        and(eq(members.guildId, channels.guildId), eq(members.userId, userId)),
      )
      .where(eq(attachments.id, attachmentId))
      .limit(1);
    if (!acc) return null;

    return row;
  }

  /** Открыть Read-stream для отдачи через HTTP без загрузки в память. */
  streamFile(storagePath: string): NodeJS.ReadableStream {
    return this.storage.stream(storagePath);
  }

  /** Очистка orphan-uploads: pending старше TTL — удалить с диска и из БД. */
  async cleanupOrphans(maxAgeMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const orphans = await this.db
      .select()
      .from(attachments)
      .where(and(isNull(attachments.messageId), lt(attachments.createdAt, cutoff)));

    for (const o of orphans) {
      await this.storage.remove(o.storagePath).catch(() => undefined);
    }
    if (orphans.length > 0) {
      await this.db
        .delete(attachments)
        .where(
          and(
            isNull(attachments.messageId),
            lt(attachments.createdAt, cutoff),
          ),
        );
    }
    return orphans.length;
  }
}
