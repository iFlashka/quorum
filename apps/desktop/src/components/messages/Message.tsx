import { useMemo, useState } from 'react';
import { CornerUpLeft, Pencil, SmilePlus, Trash2 } from 'lucide-react';
import type { PublicMember, PublicMessage } from '@quorum/shared';
import { useAuth } from '@/auth/store';
import { useDeleteMessage, useEditMessage, useToggleReaction } from '@/hooks/use-messages';
import { useSelection } from '@/state/selection';
import { useReply } from '@/state/reply-store';
import { extractUrls } from '@/hooks/use-unfurl';
import { cn } from '@/lib/utils';
import { roleColorStyle } from '@/lib/role-color';
import { MemberAvatar } from '@/components/shell/MemberAvatar';
import { AttachmentTile } from './AttachmentTile';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ReplyContext } from './ReplyContext';
import { Embed } from './Embed';

interface MessageProps {
  message: PublicMessage;
  /** True если предыдущее сообщение от того же автора и в пределах 5 минут — компактный рендер. */
  grouped: boolean;
  userById: Map<string, PublicMember>;
  /**
   * Скрыть hover-toolbar кнопки Reaction / Edit / Delete (Reply остаётся).
   * Используется в DM-рендере: реакций для DM пока нет endpoint'а, edit/delete
   * требуют DM-API а не channel-API.
   */
  disableActions?: boolean;
}

export function Message({ message, grouped, userById, disableActions }: MessageProps): JSX.Element {
  const me = useAuth((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [pickerOpen, setPickerOpen] = useState(false);

  const channelId = useSelection((s) => s.channelId);
  const editMut = useEditMessage(channelId);
  const deleteMut = useDeleteMessage(channelId);
  const reactMut = useToggleReaction(channelId);
  const setReply = useReply((s) => s.setReply);

  const isMine = me?.id === message.author.id;
  const mentionsMe = !!me && message.mentionedUserIds.includes(me.id);
  const embedUrls = useMemo(() => extractUrls(message.content).slice(0, 4), [message.content]);

  const submitEdit = (): void => {
    if (!draft.trim() || draft === message.content) {
      setEditing(false);
      setDraft(message.content);
      return;
    }
    editMut.mutate(
      { messageId: message.id, content: draft },
      {
        onSuccess: () => setEditing(false),
      },
    );
  };

  const cancelEdit = (): void => {
    setDraft(message.content);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        'group relative transition-colors hover:bg-bg-elevated',
        grouped ? 'mt-0 py-[2px]' : 'mt-[17px] pt-[2px] pb-[2px]',
        mentionsMe &&
          'bg-[rgba(250,166,26,0.06)] before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-[#faa61a] hover:bg-[rgba(250,166,26,0.10)]',
      )}
    >
      {message.replyToPreview && (
        <ReplyContext preview={message.replyToPreview} userById={userById} />
      )}
      <div className="flex gap-4 px-4">
      {grouped ? (
        <div className="num-tabular flex w-10 shrink-0 justify-end pr-0.5 text-[10px] leading-[22px] text-text-muted opacity-0 group-hover:opacity-100">
          {formatTimestamp(message.createdAt)}
        </div>
      ) : (
        <MemberAvatar
          user={{
            userId: message.author.id,
            username: message.author.username,
            displayName: message.author.displayName,
            avatarUrl: message.author.avatarUrl,
          }}
          member={userById.get(message.author.id)}
          size={40}
          ringColor="bg-default"
          hideStatus
        />
      )}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span
              className="text-[15px] font-medium text-text-primary"
              style={roleColorStyle(userById.get(message.author.id)?.role)}
            >
              {message.author.displayName || message.author.username}
            </span>
            <span className="num-tabular text-[12px] text-text-muted">
              {formatRelativeWithDate(message.createdAt)}
            </span>
          </div>
        )}

        {editing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitEdit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              className="w-full resize-none rounded-md bg-bg-elevated px-3 py-2 text-[15px] text-text-primary outline-none"
              rows={Math.min(8, draft.split('\n').length)}
            />
            <div className="mt-1 text-[11px] text-text-muted">
              <span>escape — отмена · enter — сохранить</span>
            </div>
          </div>
        ) : (
          <>
            <MarkdownRenderer content={message.content} userById={userById} />
            {message.editedAt && (
              <span className="ml-1 text-[10px] text-text-muted" title={message.editedAt}>
                (изменено)
              </span>
            )}
            {message.attachments.length > 0 && (
              <div className="mt-1 flex flex-col gap-1">
                {message.attachments.map((a) => (
                  <AttachmentTile key={a.id} attachment={a} />
                ))}
              </div>
            )}
            {embedUrls.length > 0 && (
              <div className="flex flex-col gap-1">
                {embedUrls.map((u) => (
                  <Embed key={u} url={u} />
                ))}
              </div>
            )}
          </>
        )}

        {message.reactions.length > 0 && !editing && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() =>
                  reactMut.mutate({
                    messageId: message.id,
                    emoji: r.emoji,
                    add: !r.reactedByMe,
                  })
                }
                className={cn(
                  'flex h-7 items-center gap-1 rounded-md border px-2 text-[14px] transition-colors',
                  r.reactedByMe
                    ? 'border-accent-primary/60 bg-accent-primary/15 text-text-primary hover:bg-accent-primary/25'
                    : 'border-border-subtle bg-bg-elevated text-text-secondary hover:bg-bg-hover',
                )}
              >
                <span>{r.emoji}</span>
                <span className="num-tabular text-[13px]">{r.count}</span>
              </button>
            ))}
          </div>
        )}
        </div>
      </div>

      {!editing && (
        <div className="absolute top-[-12px] right-4 hidden gap-0.5 rounded-md border border-border-subtle bg-bg-elevated p-0.5 shadow-elevated group-hover:flex">
          {!disableActions && (
            <EmojiPickerPopover
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              onSelect={(emoji) => {
                setPickerOpen(false);
                const existing = message.reactions.find((r) => r.emoji === emoji);
                reactMut.mutate({
                  messageId: message.id,
                  emoji,
                  add: !existing?.reactedByMe,
                });
              }}
              placement="down"
              anchor={
                <ActionButton title="Реакция" onClick={() => setPickerOpen((v) => !v)}>
                  <SmilePlus size={16} strokeWidth={1.75} />
                </ActionButton>
              }
            />
          )}
          {channelId && (
            <ActionButton
              title="Ответить"
              onClick={() =>
                setReply(channelId, {
                  messageId: message.id,
                  authorDisplayName:
                    message.author.displayName || message.author.username,
                  contentPreview: makePreview(message.content),
                })
              }
            >
              <CornerUpLeft size={16} strokeWidth={1.75} />
            </ActionButton>
          )}
          {isMine && !disableActions && (
            <ActionButton title="Редактировать" onClick={() => setEditing(true)}>
              <Pencil size={16} strokeWidth={1.75} />
            </ActionButton>
          )}
          {isMine && !disableActions && (
            <ActionButton
              title="Удалить"
              danger
              onClick={() => deleteMut.mutate(message.id)}
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
}

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  danger?: boolean;
}

function ActionButton({ danger, className, children, ...rest }: ActionButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-text-secondary transition-colors',
        danger ? 'hover:bg-accent-danger hover:text-white' : 'hover:bg-bg-hover hover:text-text-primary',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const REPLY_PREVIEW_LIMIT = 80;
function makePreview(content: string): string {
  const cleaned = content.replace(/<@[0-9a-f-]{36}>/gi, '@…').replace(/\n+/g, ' ').trim();
  if (cleaned.length <= REPLY_PREVIEW_LIMIT) return cleaned;
  return cleaned.slice(0, REPLY_PREVIEW_LIMIT - 1) + '…';
}

function formatRelativeWithDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (isToday) return `Сегодня в ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return `Вчера в ${time}`;
  }
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${time}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
