/**
 * Минимальный input для DM-чата. Без mentions/typing/attachments —
 * только text + emoji + Enter-to-send. Для пет-проекта 5–10 friends
 * это достаточно; полноценный input пресоберётся при необходимости.
 */

import { useEffect, useState } from 'react';
import { Plus, Smile } from 'lucide-react';
import { useSendDm } from '@/hooks/use-dm';
import { ApiError } from '@/api/client';
import { cn } from '@/lib/utils';
import { EmojiPickerPopover } from './EmojiPickerPopover';

interface DmMessageInputProps {
  dmChannelId: string;
  peerName: string;
}

export function DmMessageInput({ dmChannelId, peerName }: DmMessageInputProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const sendMut = useSendDm(dmChannelId);

  // При смене канала сбрасываем draft.
  useEffect(() => {
    setDraft('');
    setError(null);
    setPickerOpen(false);
  }, [dmChannelId]);

  const onSubmit = (): void => {
    const content = draft.trim();
    if (!content) return;
    setError(null);
    sendMut.mutate(
      { content },
      {
        onSuccess: () => setDraft(''),
        onError: (err: unknown) => {
          if (err instanceof ApiError) setError(err.message);
          else if (err instanceof Error) setError(err.message);
          else setError('Не удалось отправить');
        },
      },
    );
  };

  const insertEmoji = (emoji: string): void => {
    setDraft((d) => d + emoji);
  };

  return (
    <footer className="relative px-4 pt-2 pb-6">
      <div
        className={cn(
          'flex items-end gap-3 rounded-lg bg-bg-elevated px-4 py-[11px]',
          sendMut.isPending && 'opacity-60',
        )}
      >
        <button
          type="button"
          aria-label="attach"
          title="Прикрепить (скоро)"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-text-muted text-bg-elevated hover:bg-text-secondary"
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          placeholder={`Написать ${peerName}`}
          disabled={sendMut.isPending}
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
