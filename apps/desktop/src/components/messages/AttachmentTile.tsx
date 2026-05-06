import { useEffect, useState } from 'react';
import { File as FileIcon, Download } from 'lucide-react';
import type { PublicAttachment } from '@quorum/shared';
import { useRuntime } from '@/auth/runtime-store';
import { cn } from '@/lib/utils';

interface AttachmentTileProps {
  attachment: PublicAttachment;
}

/**
 * Рендер attachment в сообщении. Картинки отображаются inline (с auth-protected
 * blob fetch — server отдаёт content только по Bearer-токену, поэтому делаем
 * fetch с access и заворачиваем в object-URL).
 *
 * Не-картинки — pill с иконкой, размером и кнопкой Download.
 */
export function AttachmentTile({ attachment }: AttachmentTileProps): JSX.Element {
  const isImage = attachment.mimeType.startsWith('image/');
  if (isImage) return <ImageTile attachment={attachment} />;
  return <FileTile attachment={attachment} />;
}

function ImageTile({ attachment }: AttachmentTileProps): JSX.Element {
  const blobUrl = useAuthorizedBlobUrl(attachment);
  const aspect = attachment.width && attachment.height
    ? `${attachment.width} / ${attachment.height}`
    : '4 / 3';

  return (
    <div className="mt-1 max-w-[420px] overflow-hidden rounded-md border border-border-subtle">
      {blobUrl ? (
        <img
          src={blobUrl}
          alt={attachment.filename}
          className="block h-auto w-full max-w-[420px]"
          style={{ aspectRatio: aspect }}
          loading="lazy"
        />
      ) : (
        <div
          className="flex w-full items-center justify-center bg-bg-deepest text-[12px] text-text-muted"
          style={{ aspectRatio: aspect, maxWidth: '420px' }}
        >
          Загрузка изображения…
        </div>
      )}
    </div>
  );
}

function FileTile({ attachment }: AttachmentTileProps): JSX.Element {
  const blobUrl = useAuthorizedBlobUrl(attachment);
  return (
    <div className="mt-1 flex max-w-[420px] items-center gap-3 rounded-md border border-border-subtle bg-bg-deepest px-3 py-2">
      <FileIcon size={28} strokeWidth={1.5} className="shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-text-link" title={attachment.filename}>
          {attachment.filename}
        </div>
        <div className="num-tabular text-[11px] text-text-muted">
          {formatSize(attachment.sizeBytes)}
        </div>
      </div>
      <a
        href={blobUrl ?? '#'}
        download={attachment.filename}
        aria-label="download"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary',
          !blobUrl && 'pointer-events-none opacity-50',
        )}
      >
        <Download size={16} strokeWidth={1.75} />
      </a>
    </div>
  );
}

/**
 * Загружает attachment-байты через auth-protected endpoint, возвращает blob-URL.
 * Освобождает URL при размонтировании или смене attachment.
 */
function useAuthorizedBlobUrl(attachment: PublicAttachment): string | null {
  const api = useRuntime((s) => s.runtime?.api);
  const attachmentsApi = useRuntime((s) => s.runtime?.attachmentsApi);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!api || !attachmentsApi) return;
    let aborted = false;
    let createdUrl: string | null = null;

    const access = api.getAccessToken();
    const fetchUrl = attachmentsApi.buildUrl(attachment.id);

    void (async (): Promise<void> => {
      try {
        const res = await fetch(fetchUrl, {
          headers: access ? { Authorization: `Bearer ${access}` } : {},
        });
        if (!res.ok) return;
        const blob = await res.blob();
        if (aborted) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      } catch {
        // молчим — UI покажет fallback
      }
    })();

    return () => {
      aborted = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [api, attachmentsApi, attachment.id]);

  return url;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
