/**
 * Discord-style плашка активного voice-канала, рендерится над UserCard
 * в нижней части ChannelSidebar. Two-row layout:
 *
 *   ┌─────────────────────────────────────┐
 *   │ ▰▰▰ Голосовая связь подключена   ✕  │ ← header + disconnect
 *   │     {channelName} / {guildName}     │
 *   ├─────────────────────────────────────┤
 *   │  [📺]  [💻]  [🎤]  [🎧]               │ ← controls row
 *   └─────────────────────────────────────┘
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  ChevronUp,
  PartyPopper,
  PhoneOff,
  ScreenShare,
  Sparkles,
  Video,
  VideoOff,
} from 'lucide-react';
import { useShallow } from 'zustand/shallow';
import type { ScreenQualitySettings } from '@quorum/shared';
import { useChannelVoice } from '@/voice/channel-store';
import { useChannelVoiceOrchestrator } from '@/voice/channel-context';
import { useAuth } from '@/auth/store';
import { useVoicePrefs } from '@/voice/prefs';
import { useGuildChannels, useGuilds } from '@/hooks/use-guild-data';
import { ScreenSharePicker } from './ScreenSharePicker';
import { cn } from '@/lib/utils';

export function VoiceChannelBar(): JSX.Element | null {
  const phase = useChannelVoice((s) => s.phase);
  const channelId = useChannelVoice((s) => s.channelId);
  const guildId = useChannelVoice((s) => s.guildId);
  const meId = useAuth((s) => s.user?.id);
  const myParticipant = useChannelVoice(
    useShallow((s) => (meId ? s.participants.get(meId) : undefined)),
  );
  const orchestrator = useChannelVoiceOrchestrator();

  const { data: guildsData } = useGuilds();
  const { data: channelsData } = useGuildChannels(guildId);

  if (phase === 'idle' || !channelId) return null;

  const channel = channelsData?.channels.find((c) => c.id === channelId);
  const guild = guildsData?.guilds.find((g) => g.id === guildId);
  const channelLabel = channel?.name ?? '...';
  const guildLabel = guild?.name ?? '';

  const cameraOn = !!myParticipant?.cameraTrack;
  const screenOn = !!myParticipant?.screenTrack;
  const speaking = myParticipant?.speaking ?? false;
  const disabled = phase !== 'joined';
  const live = phase === 'joined';

  const headerLabel =
    phase === 'joining'
      ? 'Подключение…'
      : phase === 'leaving'
        ? 'Отключение…'
        : 'Голосовая связь подключена';

  return (
    <div className="border-t border-bg-active bg-bg-deepest px-2 py-2.5">
      {/* Top row: meter + status + disconnect */}
      <div className="flex items-center gap-2 px-1">
        <AudioMeter active={live && speaking} />
        <div className="min-w-0 flex-1 leading-tight">
          <div
            className={cn(
              'truncate text-[16px] font-semibold',
              live ? 'text-accent-success' : 'text-text-secondary',
            )}
          >
            {headerLabel}
          </div>
          {live && (channelLabel || guildLabel) && (
            <div className="truncate text-[12px] text-text-muted">
              <span className="font-medium text-text-secondary">{channelLabel}</span>
              {guildLabel && <span> / {guildLabel}</span>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void orchestrator.leave()}
          title="Покинуть канал"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-default text-text-secondary transition-colors hover:bg-accent-danger hover:text-white"
        >
          <PhoneOff size={16} strokeWidth={2} />
        </button>
      </div>

      {/* Bottom row: 4 квадратных control'а — Stream / Cam / Soundboard / Activity.
          mic+deafen уехали в UserCard (как в Discord 2026). */}
      <div className="mt-2 grid grid-cols-4 gap-1 px-1">
        <ScreenShareSplitButton
          screenOn={screenOn}
          disabled={disabled}
          onToggle={() => void orchestrator.toggleScreenShare()}
        />
        <BarButton
          title={cameraOn ? 'Выключить камеру' : 'Включить камеру'}
          active={cameraOn}
          disabled={disabled}
          onClick={() => void orchestrator.toggleCamera()}
        >
          {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
        </BarButton>
        <BarButton
          title="Soundboard (скоро)"
          active={false}
          disabled={disabled}
          onClick={() => undefined}
        >
          <PartyPopper size={18} />
        </BarButton>
        <BarButton
          title="Активности (скоро)"
          active={false}
          disabled={disabled}
          onClick={() => undefined}
        >
          <Sparkles size={18} />
        </BarButton>
      </div>
    </div>
  );
}

/**
 * Маленький audio-meter (4 вертикальные полоски). При active анимация —
 * полоски пульсируют с разными фазами через CSS scaleY-keyframes; при
 * idle полоски статично средней высоты.
 */
function AudioMeter({ active }: { active: boolean }): JSX.Element {
  return (
    <div
      aria-hidden
      className="flex h-[14px] w-[14px] shrink-0 items-end justify-between"
      title={active ? 'Голос активен' : 'Тишина'}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'block w-[2px] rounded-sm bg-accent-success origin-bottom transition-all',
            active ? 'animate-meter-bar' : 'h-[5px]',
          )}
          style={
            active
              ? {
                  animationDelay: `${i * 90}ms`,
                  animationDuration: '700ms',
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

interface BarButtonProps {
  title: string;
  active: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function BarButton({
  title,
  active,
  danger,
  disabled,
  onClick,
  children,
}: BarButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex h-9 items-center justify-center rounded-md transition-colors disabled:opacity-50',
        active && danger
          ? 'bg-accent-danger text-white hover:bg-red-600'
          : active
            ? 'bg-accent-primary text-white hover:bg-accent-hover'
            : 'bg-bg-default text-text-secondary hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Split-кнопка screen-share: основная часть тогглит трансляцию, узкий ▾-caret
 * справа открывает popover-picker качества. Когда трансляция активна,
 * popover показывает «Сохранить» (фаза C live-switch — отложено), иначе
 * «Начать трансляцию» — стартует сразу с draft-настройками.
 */
function ScreenShareSplitButton({
  screenOn,
  disabled,
  onToggle,
}: {
  screenOn: boolean;
  disabled: boolean;
  onToggle: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const caretRef = useRef<HTMLButtonElement>(null);
  const orchestrator = useChannelVoiceOrchestrator();
  const updatePrefs = useVoicePrefs((s) => s.update);

  const onConfirm = (next: ScreenQualitySettings): void => {
    // Делаем diff ДО того как обновим prefs — иначе prev = next.
    const prev = useVoicePrefs.getState().screenShare;
    const bitrateChanged = prev.bitrateKbps !== next.bitrateKbps;
    const resOrFpsChanged =
      prev.width !== next.width ||
      prev.height !== next.height ||
      prev.frameRate !== next.frameRate;

    void updatePrefs({ screenShare: next }).then(async () => {
      if (!screenOn) {
        void orchestrator.toggleScreenShare();
        return;
      }
      // Live-apply: bitrate без re-publish, разрешение/fps требуют рестарт.
      let bitrateApplied = false;
      if (bitrateChanged) {
        bitrateApplied = await orchestrator.applyScreenShareBitrate(next.bitrateKbps);
      }
      if (resOrFpsChanged) {
        toast.info('Разрешение и FPS применятся при следующем рестарте трансляции.');
      } else if (bitrateApplied) {
        toast.success(`Битрейт обновлён до ${next.bitrateKbps} Кбит/с.`);
      }
    });
    setOpen(false);
  };

  return (
    <div className="flex">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        title={screenOn ? 'Остановить трансляцию' : 'Транслировать экран'}
        className={cn(
          'flex h-9 flex-1 items-center justify-center rounded-l-md transition-colors disabled:opacity-50',
          screenOn
            ? 'bg-accent-primary text-white hover:bg-accent-hover'
            : 'bg-bg-default text-text-secondary hover:bg-bg-hover hover:text-text-primary',
        )}
      >
        <ScreenShare size={18} />
      </button>
      <button
        ref={caretRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Качество трансляции"
        className={cn(
          'flex h-9 w-4 items-center justify-center rounded-r-md border-l border-bg-deepest transition-colors',
          screenOn
            ? 'bg-accent-primary text-white hover:bg-accent-hover'
            : 'bg-bg-default text-text-secondary hover:bg-bg-hover hover:text-text-primary',
        )}
      >
        <ChevronUp size={12} strokeWidth={2.5} />
      </button>
      {open && (
        <ScreenShareSplitPopover
          anchorRef={caretRef}
          mode={screenOn ? 'apply-when-restart' : 'pre-stream'}
          onClose={() => setOpen(false)}
          onConfirm={onConfirm}
        />
      )}
    </div>
  );
}

const POPOVER_W = 360;
const POPOVER_GAP = 8;

interface PopoverProps {
  anchorRef: React.RefObject<HTMLElement>;
  mode: 'pre-stream' | 'apply-when-restart';
  onConfirm: (next: ScreenQualitySettings) => void;
  onClose: () => void;
}

function ScreenShareSplitPopover({
  anchorRef,
  mode,
  onConfirm,
  onClose,
}: PopoverProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const a = anchorRef.current;
    if (!a) return;
    const rect = a.getBoundingClientRect();
    const vh = window.innerHeight;
    // Позиция: над caret'ом, выровнено по правому краю caret'а.
    const estH = 460;
    let top = rect.top - estH - POPOVER_GAP;
    if (top < 8) top = 8;
    let left = rect.right - POPOVER_W;
    if (left < 8) left = 8;
    if (top + estH > vh - 8) top = vh - estH - 8;
    setPos({ top, left });
  }, [anchorRef]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      if (ref.current?.contains(e.target as Node)) return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose, anchorRef]);

  if (!pos) return <></>;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      style={
        {
          top: pos.top,
          left: pos.left,
          '--popover-origin': 'bottom right',
        } as React.CSSProperties
      }
      className="animate-popover-pop-in fixed z-[70]"
    >
      <ScreenSharePicker
        mode={mode}
        onConfirm={onConfirm}
        onCancel={onClose}
      />
    </div>,
    document.body,
  );
}
