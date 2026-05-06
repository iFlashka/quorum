import { MOCK_MEMBERS, type MockMember } from '@/mock/fixtures';
import { cn } from '@/lib/utils';

const STATUS_COLOR: Record<MockMember['status'], string> = {
  online: 'bg-accent-success',
  idle: 'bg-accent-warning',
  dnd: 'bg-accent-danger',
  offline: 'bg-text-muted',
};

const ROLE_LABEL: Record<NonNullable<MockMember['role']>, string> = {
  owner: 'OWNER',
  admin: 'ADMINS',
  member: 'MEMBERS',
};

export function MemberList(): JSX.Element {
  const grouped = MOCK_MEMBERS.reduce<Record<string, MockMember[]>>((acc, m) => {
    const key = m.role ?? 'member';
    (acc[key] ??= []).push(m);
    return acc;
  }, {});

  const order: NonNullable<MockMember['role']>[] = ['owner', 'admin', 'member'];

  return (
    <aside className="flex w-[240px] shrink-0 flex-col overflow-y-auto bg-bg-darker pt-4 pr-2 pl-2">
      {order.map((role) => {
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

function MemberRow({ member }: { member: MockMember }): JSX.Element {
  const muted = member.status === 'offline';
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-bg-hover',
        muted && 'opacity-50',
      )}
    >
      <div className="relative shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary text-[13px] font-semibold text-white">
          {member.initials}
        </div>
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-[3px] border-bg-darker',
            STATUS_COLOR[member.status],
          )}
        />
      </div>
      <span className="truncate text-[15px] font-medium text-text-secondary">{member.name}</span>
    </button>
  );
}
