import { useEffect, useRef, useState } from 'react';
import { Plus, Smile } from 'lucide-react';
import { useSendMessage } from '@/hooks/use-messages';
import { useSelection } from '@/state/selection';
import { useRuntime } from '@/auth/runtime-store';
import { ApiError } from '@/api/client';
import { cn } from '@/lib/utils';

interface MessageInputProps {
  channelName?: string;
}

const TYPING_THROTTLE_MS = 4_000;

export function MessageInput({ channelName }: MessageInputProps): JSX.Element {
  const channelId = useSelection((s) => s.channelId);
  const sendMut = useSendMessage(channelId);
  const ws = useRuntime((s) => s.runtime?.ws);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lastTypingSent = useRef(0);

  // Сброс draft при смене канала.
  useEffect(() => {
    setDraft('');
    setError(null);
  }, [channelId]);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft(e.target.value);
    if (!channelId || !ws) return;
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = now;
      ws.send({ t: 'typing.start', channelId });
    }
  };

  const onSubmit = (): void => {
    const content = draft.trim();
    if (!content || !channelId) return;
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

  const placeholder = channelName ? `Сообщение в #${channelName}` : 'Сообщение в канал';

  return (
    <footer className="px-4 pt-2 pb-6">
      <div
        className={cn(
          'flex items-end gap-3 rounded-lg bg-bg-elevated px-4 py-[11px]',
          sendMut.isPending && 'opacity-60',
        )}
      >
        <button
          type="button"
          aria-label="attach"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-text-muted text-bg-elevated hover:bg-text-secondary"
          title="Загрузка файлов появится в фазе 2C"
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
        <textarea
          value={draft}
          onChange={onChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          disabled={!channelId || sendMut.isPending}
          className="flex-1 resize-none bg-transparent text-[15px] text-text-primary outline-none placeholder:text-text-muted"
        />
        <Smile
          size={20}
          strokeWidth={1.75}
          className="shrink-0 text-text-muted hover:text-text-secondary"
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
