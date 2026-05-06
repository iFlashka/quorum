import { useEffect, useMemo, useRef, useState } from 'react';
import { File as FileIcon, Plus, Smile, X } from 'lucide-react';
import type { PublicAttachment, PublicMember } from '@quorum/shared';
import { useSendMessage } from '@/hooks/use-messages';
import { useGuildMembers } from '@/hooks/use-guild-data';
import { useSelection } from '@/state/selection';
import { useRuntime } from '@/auth/runtime-store';
import { ApiError } from '@/api/client';
import { cn } from '@/lib/utils';
import { serializeMentions } from '@/lib/mentions';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { MentionMenu } from './MentionMenu';

interface MessageInputProps {
  channelName?: string;
}

const TYPING_THROTTLE_MS = 4_000;
const MAX_FILES = 5;

interface PendingUpload {
  /** Локальный uuid пока не загружен; после успеха заменится на `attachmentId`. */
  localId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** object-URL для превью (отзывается при размонтировании). */
  previewUrl: string | null;
  /** После успешного upload — id сервера. */
  attachmentId: string | null;
  /** True пока pending. */
  uploading: boolean;
  error: string | null;
}

export function MessageInput({ channelName }: MessageInputProps): JSX.Element {
  const channelId = useSelection((s) => s.channelId);
  const guildId = useSelection((s) => s.guildId);
  const sendMut = useSendMessage(channelId);
  const ws = useRuntime((s) => s.runtime?.ws);
  const attachmentsApi = useRuntime((s) => s.runtime?.attachmentsApi);
  const { data: membersData } = useGuildMembers(guildId);
  const members = useMemo(() => membersData?.members ?? [], [membersData]);

  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const mentionStartRef = useRef<number | null>(null);
  const lastTypingSent = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft('');
    setError(null);
    setPickerOpen(false);
    setMentionQuery(null);
    mentionStartRef.current = null;
    setPending((prev) => {
      for (const p of prev) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
      return [];
    });
  }, [channelId]);

  // На размонтирование — освобождаем object-URLs.
  useEffect(() => {
    return () => {
      for (const p of pending) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup только при unmount, иначе мерцание
  }, []);

  const updateMentionState = (text: string, caret: number): void => {
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i]!;
      if (ch === '@') {
        const before = i === 0 ? '' : text[i - 1]!;
        if (i === 0 || /\s/.test(before)) {
          const query = text.slice(i + 1, caret);
          if (/\s/.test(query)) {
            setMentionQuery(null);
            mentionStartRef.current = null;
            return;
          }
          mentionStartRef.current = i;
          setMentionQuery(query);
          return;
        }
        break;
      }
      if (/\s/.test(ch)) break;
      i--;
    }
    setMentionQuery(null);
    mentionStartRef.current = null;
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const next = e.target.value;
    setDraft(next);
    updateMentionState(next, e.target.selectionStart ?? next.length);

    if (!channelId || !ws) return;
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = now;
      ws.send({ t: 'typing.start', channelId });
    }
  };

  const onSelectionChange = (): void => {
    const el = textareaRef.current;
    if (!el) return;
    updateMentionState(draft, el.selectionStart ?? draft.length);
  };

  const acceptMention = (member: PublicMember): void => {
    const start = mentionStartRef.current;
    if (start === null) return;
    const el = textareaRef.current;
    const caret = el?.selectionEnd ?? draft.length;
    // В textarea показываем читаемый @username; в `<@uuid>` сериализуем
    // прямо перед отправкой через `serializeMentions`.
    const replacement = `@${member.username} `;
    const next = draft.slice(0, start) + replacement + draft.slice(caret);
    setDraft(next);
    setMentionQuery(null);
    mentionStartRef.current = null;
    requestAnimationFrame(() => {
      const e = textareaRef.current;
      if (!e) return;
      e.focus();
      const cursor = start + replacement.length;
      e.setSelectionRange(cursor, cursor);
    });
  };

  const onSubmit = (): void => {
    const content = serializeMentions(draft.trim(), members);
    const stillUploading = pending.some((p) => p.uploading);
    if (stillUploading) return;
    const attachmentIds = pending
      .map((p) => p.attachmentId)
      .filter((id): id is string => !!id);
    if (!content && attachmentIds.length === 0) return;
    if (!channelId) return;

    setError(null);
    sendMut.mutate(
      {
        content: content || ' ', // сервер требует min 1 символ; пробел сойдёт если только attachments
        ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
      },
      {
        onSuccess: () => {
          setDraft('');
          setPending((prev) => {
            for (const p of prev) {
              if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
            }
            return [];
          });
        },
        onError: (err: unknown) => {
          if (err instanceof ApiError) setError(err.message);
          else if (err instanceof Error) setError(err.message);
          else setError('Не удалось отправить');
        },
      },
    );
  };

  const insertEmoji = (emoji: string): void => {
    const el = textareaRef.current;
    if (!el) {
      setDraft((d) => d + emoji);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + emoji.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const handleFiles = async (files: FileList | null): Promise<void> => {
    if (!files || !channelId || !attachmentsApi) return;
    const arr = Array.from(files).slice(0, MAX_FILES - pending.length);
    if (arr.length === 0) return;

    const newItems: PendingUpload[] = arr.map((f) => ({
      localId: crypto.randomUUID(),
      filename: f.name,
      mimeType: f.type || 'application/octet-stream',
      sizeBytes: f.size,
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
      attachmentId: null,
      uploading: true,
      error: null,
    }));
    setPending((prev) => [...prev, ...newItems]);

    await Promise.all(
      arr.map(async (f, idx) => {
        const localId = newItems[idx]!.localId;
        try {
          const result: PublicAttachment = await attachmentsApi.upload(channelId, f);
          setPending((prev) =>
            prev.map((p) =>
              p.localId === localId
                ? { ...p, attachmentId: result.id, uploading: false }
                : p,
            ),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'upload failed';
          setPending((prev) =>
            prev.map((p) =>
              p.localId === localId ? { ...p, uploading: false, error: msg } : p,
            ),
          );
        }
      }),
    );
  };

  const removePending = (localId: string): void => {
    setPending((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
  };

  const placeholder = channelName ? `Сообщение в #${channelName}` : 'Сообщение в канал';
  const stillUploading = pending.some((p) => p.uploading);

  return (
    <footer className="relative px-4 pt-2 pb-6">
      {mentionQuery !== null && (
        <MentionMenu
          members={members}
          query={mentionQuery}
          onSelect={acceptMention}
          onClose={() => setMentionQuery(null)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          // Сбрасываем value чтобы можно было прикрепить тот же файл повторно после удаления.
          e.target.value = '';
        }}
      />

      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 rounded-lg bg-bg-elevated p-2">
          {pending.map((p) => (
            <PendingItem key={p.localId} item={p} onRemove={() => removePending(p.localId)} />
          ))}
        </div>
      )}

      <div
        className={cn(
          'flex items-end gap-3 rounded-lg bg-bg-elevated px-4 py-[11px]',
          sendMut.isPending && 'opacity-60',
        )}
      >
        <button
          type="button"
          aria-label="attach"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-text-muted text-bg-elevated hover:bg-text-secondary"
          title="Прикрепить файл (до 25 МБ)"
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={onChange}
          onKeyUp={onSelectionChange}
          onClick={onSelectionChange}
          onKeyDown={(e) => {
            if (mentionQuery !== null && (e.key === 'Enter' || e.key === 'Tab')) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!stillUploading) onSubmit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          disabled={!channelId || sendMut.isPending}
          className="flex-1 resize-none bg-transparent text-[15px] text-text-primary outline-none placeholder:text-text-muted"
        />
        <EmojiPickerPopover
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={insertEmoji}
          placement="up"
          anchor={
            <button
              type="button"
              aria-label="emoji"
              onClick={() => setPickerOpen((v) => !v)}
              className="shrink-0 text-text-muted hover:text-text-secondary"
            >
              <Smile size={20} strokeWidth={1.75} />
            </button>
          }
        />
      </div>
      {error && (
        <p className="mt-2 px-2 text-[12px] text-accent-danger" role="alert">
          {error}
        </p>
      )}
    </footer>
  );
}

function PendingItem({
  item,
  onRemove,
}: {
  item: PendingUpload;
  onRemove: () => void;
}): JSX.Element {
  return (
    <div
      className={cn(
        'relative flex h-[88px] w-[140px] shrink-0 flex-col items-stretch overflow-hidden rounded-md border border-border-subtle bg-bg-default',
        item.error && 'border-accent-danger/60',
      )}
    >
      <div className="flex flex-1 items-center justify-center bg-bg-deepest">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt={item.filename} className="h-full w-full object-cover" />
        ) : (
          <FileIcon size={28} strokeWidth={1.5} className="text-text-muted" />
        )}
      </div>
      <div className="px-2 py-1">
        <div className="truncate text-[12px] text-text-secondary" title={item.filename}>
          {item.filename}
        </div>
        <div className="num-tabular text-[10px] text-text-muted">
          {item.uploading ? 'Загрузка…' : item.error ? 'Ошибка' : formatSize(item.sizeBytes)}
        </div>
      </div>
      <button
        type="button"
        aria-label="remove"
        onClick={onRemove}
        className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg-deepest text-text-secondary hover:bg-accent-danger hover:text-white"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
