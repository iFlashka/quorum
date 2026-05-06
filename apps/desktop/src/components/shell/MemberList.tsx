import { Phone } from 'lucide-react';
import type { PublicMember, UserStatus } from '@quorum/shared';
import { useGuildMembers } from '@/hooks/use-guild-data';
import { useRealtime } from '@/realtime/store';
import { useSelection } from '@/state/selection';
import { useAuth } from '@/auth/store';
import { useVoice } from '@/voice/store';
import { useVoiceOrchestrator } from '@/voice/context';
import { cn } from '@/lib/utils';

const STATUS_COLOR: Record<UserStatus, string> = {
  online: 'bg-accent-success',
  idle: 'bg-accent-warning',
  dnd: 'bg-accent-danger',
  offline: 'bg-text-muted',
};

const ROLE_LABEL = {
  owner: 'OWNER',
  admin: 'ADMINS',
  member: 'MEMBERS',
} as const;

const ROLE_ORDER = ['owner', 'admin', 'member'] as const;

export function MemberList(): JSX.Element {
  const guildId = useSelection((s) => s.guildId);
  const { data, isLoading } = useGuildMembers(guildId);
  const presence = useRealtime((s) => s.presence);
  const members = data?.members ?? [];

  // Применяем live-presence поверх БД-status (если WS прислал свежее значение).
  const overlaid = members.map((m) => ({
    ...m,
    status: presence.get(m.userId) ?? m.status,
  }));

  const grouped = overlaid.reduce<Record<string, typeof overlaid>>((acc, m) => {
    (acc[m.role] ??= []).push(m);
    return acc;
  }, {});

  return (
    <aside className="flex w-[240px] shrink-0 flex-col overflow-y-auto bg-bg-darker pt-4 pr-2 pl-2">
      {isLoading && members.length === 0 && (
        <div className="px-2 text-[13px] text-text-muted">Загрузка участников…</div>
      )}
      {ROLE_ORDER.map((role) => {
        const list = grouped[role];
        if (!list || list.length === 0) return null;
        return (
          <section key={role} className="mb-3">
            <h3 className="px-2 pb-1 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
              {ROLE_LABEL[role]} — {list.length}
            </h3>
            <ul className="space-y-0.5">
              {list.map((member) => (
                <li key={member.id}>
                  <MemberRow member={member} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </aside>
  );
}

function MemberRow({ member }: { member: PublicMember }): JSX.Element {
  const muted = member.status === 'offline';
  const meId = useAuth((s) => s.user?.id);
  const phase = useVoice((s) => s.phase);
  const orchestrator = useVoiceOrchestrator();
  const isMe = meId === member.userId;
  const callable =
    !isMe && member.status !== 'offline' && phase === 'idle';

  const onCall = (e: React.MouseEvent): void => {
    e.stopPropagation();
    void orchestrator.placeCall(member.userId);
  };

  return (
    <div
      className={cn(
        'group flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-bg-hover',
        muted && 'opacity-50',
      )}
    >
      <div className="relative shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary text-[13px] font-semibold text-white">
          {avatarInitials(member.displayName || member.username)}
        </div>
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 h-[14px] w-[14px] rounded-full border-[2px] border-bg-darker',
            STATUS_COLOR[member.status],
          )}
        />
      </div>
      <span className="flex-1 truncate text-[15px] font-medium text-text-secondary">
        {member.nickname ?? member.displayName ?? member.username}
      </span>
      {callable && (
        <button
          type="button"
          aria-label={`call ${member.username}`}
          onClick={onCall}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-bg-default hover:text-accent-success"
          title="Позвонить"
        >
          <Phone size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
