/**
 * Кликабельная аватарка с Discord-style popover о пользователе.
 *
 * Используется в Message (автор), MemberList (правая колонка) и
 * VoiceChannelMembers (под voice-каналом). Один общий компонент чтобы стиль
 * + поведение popover'а были консистентными.
 *
 * Popover монтируется в `document.body` через portal — иначе clip'ит overflow
 * родительскими scroll-контейнерами (channel-sidebar, message-list).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone } from 'lucide-react';
import type { PublicMember, UserStatus } from '@quorum/shared';
import { useAuth } from '@/auth/store';
import { useRuntime } from '@/auth/runtime-store';
import { useVoice } from '@/voice/store';
import { useVoiceOrchestrator } from '@/voice/context';
import { cn } from '@/lib/utils';
import { roleColorStyle } from '@/lib/role-color';

const STATUS_COLOR: Record<UserStatus, string> = {
  online: 'bg-accent-success',
  idle: 'bg-accent-warning',
  dnd: 'bg-accent-danger',
  offline: 'bg-text-muted',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  online: 'В сети',
  idle: 'Не активен',
  dnd: 'Не беспокоить',
  offline: 'Не в сети',
};

const ROLE_LABEL = {
  owner: 'Владелец',
  admin: 'Администратор',
  member: 'Участник',
} as const;

export interface MemberAvatarProps {
  /** Минимально необходимые данные пользователя — у автора message их хватает. */
  user: {
    userId: string;
    username: string;
    displayName: string;
    /** Avatar URL — относительный (`/avatars/{id}`) или абсолютный/data:. */
    avatarUrl?: string | null;
  };
  /** Полный member из guild-cache, если есть. Влияет на role/status в popover. */
  member?: PublicMember;
  /** Размер аватарки в px. */
  size?: number;
  /** Цвет ring-а вокруг status-dot — должен совпадать с фоном родителя. */
  ringColor?: 'bg-darker' | 'bg-deepest' | 'bg-default';
  /** Если true — popover не открывается (используется для своего же аватара). */
  disablePopover?: boolean;
  /** Доп. классы на аватарке. */
  className?: string;
  /** Скрыть status-dot. */
  hideStatus?: boolean;
}

export function MemberAvatar(props: MemberAvatarProps): JSX.Element {
  const {
    user,
    member,
    size = 40,
    ringColor = 'bg-default',
    disablePopover = false,
    className,
    hideStatus = false,
  } = props;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initials = avatarInitials(user.displayName || user.username);
  const status = member?.status;
  const avatarsApi = useRuntime((s) => s.runtime?.avatarsApi);
  const rawUrl = user.avatarUrl ?? member?.avatarUrl ?? null;
  const imgUrl = avatarsApi ? avatarsApi.resolveUrl(rawUrl) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          if (disablePopover) return;
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-primary font-semibold text-white',
          !disablePopover && 'cursor-pointer transition-transform hover:scale-[1.04]',
          className,
        )}
      >
        {imgUrl ? (
          <img src={imgUrl} alt={user.username} className="h-full w-full object-cover" />
        ) : (
          initials
        )}
        {!hideStatus && status && (
          <span
            className={cn(
              'absolute -right-0.5 -bottom-0.5 h-[14px] w-[14px] rounded-full border-[2px]',
              STATUS_COLOR[status],
              ringColor === 'bg-darker' && 'border-bg-darker',
              ringColor === 'bg-deepest' && 'border-bg-deepest',
              ringColor === 'bg-default' && 'border-bg-default',
            )}
          />
        )}
      </button>
      {open && (
        <MemberPopover
          user={user}
          member={member}
          anchorRef={triggerRef}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface MemberPopoverProps {
  user: MemberAvatarProps['user'];
  member?: PublicMember;
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
}

const POPOVER_W = 320;
const POPOVER_GAP = 8;

function MemberPopover({ user, member, anchorRef, onClose }: MemberPopoverProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const meId = useAuth((s) => s.user?.id);
  const avatarsApi = useRuntime((s) => s.runtime?.avatarsApi);

  useLayoutEffect(() => {
    const a = anchorRef.current;
    if (!a) return;
    const rect = a.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Предпочтительно справа от аватара; если не помещается — слева; если ни так
    // ни так — клампим в видимую область.
    let left = rect.right + POPOVER_GAP;
    if (left + POPOVER_W > vw - 8) {
      left = rect.left - POPOVER_W - POPOVER_GAP;
    }
    if (left < 8) left = 8;
    let top = rect.top;
    // высота известна только после mount, оценим грубо ~280px
    const estH = 280;
    if (top + estH > vh - 8) top = vh - estH - 8;
    if (top < 8) top = 8;
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

  const initials = avatarInitials(user.displayName || user.username);
  const status = member?.status;
  const role = member?.role;
  const isMe = meId === user.userId;
  const rawUrl = user.avatarUrl ?? member?.avatarUrl ?? null;
  const imgUrl = avatarsApi ? avatarsApi.resolveUrl(rawUrl) : null;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      style={
        {
          top: pos.top,
          left: pos.left,
          width: POPOVER_W,
          '--popover-origin': 'top left',
        } as React.CSSProperties
      }
      className="animate-popover-pop-in fixed z-[70] overflow-hidden rounded-lg bg-bg-deepest shadow-elevated"
    >
      <div className="h-[60px] bg-accent-primary/90" />
      <div className="relative px-4 pb-4">
        <div
          className="absolute -top-[42px] flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full border-[6px] border-bg-deepest bg-accent-primary text-[28px] font-semibold text-white"
        >
          {imgUrl ? (
            <img src={imgUrl} alt={user.username} className="h-full w-full object-cover" />
          ) : (
            initials
          )}
          {status && (
            <span
              className={cn(
                'absolute right-0.5 bottom-0.5 h-5 w-5 rounded-full border-[4px] border-bg-deepest',
                STATUS_COLOR[status],
              )}
            />
          )}
        </div>
        <div className="pt-12">
          <div
            className="text-[18px] font-semibold leading-tight text-text-primary"
            style={roleColorStyle(role)}
          >
            {user.displayName || user.username}
            {isMe && <span className="ml-2 text-[12px] font-normal text-text-muted">(вы)</span>}
          </div>
          <div className="text-[13px] text-text-muted">@{user.username}</div>
        </div>

        {(status ?? role) && (
          <div className="mt-3 space-y-2 rounded-md bg-bg-default px-3 py-2">
            {status && (
              <Field label="Статус">
                <span className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', STATUS_COLOR[status])} />
                  {STATUS_LABEL[status]}
                </span>
              </Field>
            )}
            {role && <Field label="Роль">{ROLE_LABEL[role]}</Field>}
          </div>
        )}

        {!isMe && <CallButton userId={user.userId} status={status} onAction={onClose} />}
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-wide text-text-muted uppercase">
        {label}
      </div>
      <div className="text-[13px] text-text-primary">{children}</div>
    </div>
  );
}

interface CallButtonProps {
  userId: string;
  status?: UserStatus;
  onAction: () => void;
}

function CallButton({ userId, status, onAction }: CallButtonProps): JSX.Element {
  const phase = useVoice((s) => s.phase);
  const orchestrator = useVoiceOrchestrator();
  const offline = status === 'offline';
  const inCall = phase !== 'idle';
  const disabled = offline || inCall;
  const reason = offline
    ? 'Не в сети'
    : inCall
      ? 'Сейчас в звонке'
      : 'Голосовой звонок';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        void orchestrator.placeCall(userId);
        onAction();
      }}
      className={cn(
        'mt-3 flex w-full items-center justify-center gap-2 rounded-md py-2 text-[14px] font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed bg-bg-default text-text-muted'
          : 'bg-accent-primary text-white hover:bg-accent-hover',
      )}
      title={reason}
    >
      <Phone size={16} strokeWidth={2} />
      Позвонить
    </button>
  );
}

function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
