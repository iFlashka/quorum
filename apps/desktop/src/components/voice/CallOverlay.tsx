import { useEffect, useMemo, useRef } from 'react';
import { Headphones, HeadphoneOff, Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { useVoice, type CallPhase } from '@/voice/store';
import { useVoiceOrchestrator } from '@/voice/context';
import { cn } from '@/lib/utils';

const PHASE_LABEL: Record<Exclude<CallPhase, 'idle'>, string> = {
  calling: 'Звоним…',
  ringing: 'Входящий вызов',
  connecting: 'Соединение…',
  active: 'В разговоре',
  ending: 'Завершение…',
};

/**
 * Single overlay для всех состояний звонка:
 *   - ringing → fullscreen-modal с Accept/Decline
 *   - calling/connecting/active → компактная плашка снизу-по-центру
 *
 * Отрисовывается поверх всего, поэтому подключается на уровне App.
 */
export function CallOverlay(): JSX.Element | null {
  const phase = useVoice((s) => s.phase);
  const peer = useVoice((s) => s.peer);
  const muted = useVoice((s) => s.muted);
  const deafened = useVoice((s) => s.deafened);
  const remoteStream = useVoice((s) => s.remoteStream);
  const connectionState = useVoice((s) => s.connectionState);
  const orchestrator = useVoiceOrchestrator();

  const audioRef = useRef<HTMLAudioElement>(null);

  // Подключаем remote-track в скрытый <audio> элемент. Deafen → muted на нём.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (remoteStream && el.srcObject !== remoteStream) {
      el.srcObject = remoteStream;
      el.play().catch(() => undefined);
    }
    if (!remoteStream) el.srcObject = null;
  }, [remoteStream]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = deafened;
  }, [deafened]);

  const peerName = peer?.displayName ?? peer?.username ?? '...';
  const initials = useMemoInitials(peerName);

  if (phase === 'idle') return null;

  if (phase === 'ringing') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm">
        <div className="w-[420px] rounded-2xl bg-bg-elevated p-8 text-center shadow-elevated">
          <PeerAvatar initials={initials} size={96} />
          <div className="mt-5 text-[13px] tracking-wide text-text-muted uppercase">
            Входящий вызов
          </div>
          <div className="mt-1 text-[22px] font-semibold text-text-primary">{peerName}</div>
          <div className="mt-8 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => orchestrator.decline()}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-danger text-white transition-colors hover:bg-red-600"
              title="Отклонить"
            >
              <PhoneOff size={22} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              onClick={() => orchestrator.accept()}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-success text-white transition-colors hover:bg-green-600"
              title="Принять"
            >
              <Phone size={22} strokeWidth={2.25} />
            </button>
          </div>
        </div>
        <audio ref={audioRef} autoPlay hidden />
      </div>
    );
  }

  // Активный/исходящий звонок — мини-плашка над user-card.
  return (
    <div className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-xl bg-bg-elevated px-4 py-3 shadow-elevated">
        <PeerAvatar initials={initials} size={40} />
        <div className="min-w-[160px]">
          <div className="truncate text-[14px] font-semibold text-text-primary">
            {peerName}
          </div>
          <div className="text-[12px] text-text-muted">
            {PHASE_LABEL[phase]} {connectionStateLabel(connectionState, phase)}
          </div>
        </div>
        <div className="ml-2 flex items-center gap-1.5">
          <CircleButton
            title={muted ? 'Включить микрофон' : 'Выключить микрофон'}
            active={muted}
            onClick={() => orchestrator.toggleMute()}
            disabled={phase !== 'active' && phase !== 'connecting'}
          >
            {muted ? <MicOff size={16} /> : <Mic size={16} />}
          </CircleButton>
          <CircleButton
            title={deafened ? 'Включить звук' : 'Выключить звук'}
            active={deafened}
            onClick={() => orchestrator.toggleDeafen()}
            disabled={phase !== 'active' && phase !== 'connecting'}
          >
            {deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
          </CircleButton>
          <button
            type="button"
            onClick={() => orchestrator.hangup()}
            title="Завершить"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-danger text-white transition-colors hover:bg-red-600"
          >
            <PhoneOff size={16} />
          </button>
        </div>
      </div>
      <audio ref={audioRef} autoPlay hidden />
    </div>
  );
}

function useMemoInitials(name: string): string {
  return useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return '?';
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
    return trimmed.slice(0, 2).toUpperCase();
  }, [name]);
}

function PeerAvatar({ initials, size }: { initials: string; size: number }): JSX.Element {
  return (
    <div
      style={{ height: size, width: size, fontSize: size * 0.32 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-primary font-semibold text-white"
    >
      {initials}
    </div>
  );
}

interface CircleButtonProps {
  title: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function CircleButton({
  title,
  active,
  onClick,
  disabled,
  children,
}: CircleButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-50',
        active
          ? 'bg-accent-danger text-white hover:bg-red-600'
          : 'bg-bg-default text-text-secondary hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}

function connectionStateLabel(
  state: RTCPeerConnectionState | 'new',
  phase: CallPhase,
): string {
  if (phase !== 'active') return '';
  if (state === 'connected') return '';
  if (state === 'disconnected' || state === 'failed') return '· разрыв';
  return '· подключение';
}
