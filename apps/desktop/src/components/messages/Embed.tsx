/**
 * Discord-style embed-карточка для ссылок в сообщении.
 *
 * Layout:
 *   - левая accent-полоса 4px (как rich-embed в Discord)
 *   - siteName сверху серым
 *   - title (clickable, с цветом text-link)
 *   - description обрезанный до 4 строк
 *   - thumbnail справа 80×80 (или большая внизу для og:type=video / image)
 *
 * При status=loading/null — рендерит ничего, чтобы не моргать
 * скелетоном на каждое hover.
 */

import { useUnfurl } from '@/hooks/use-unfurl';
import { cn } from '@/lib/utils';

interface EmbedProps {
  url: string;
}

export function Embed({ url }: EmbedProps): JSX.Element | null {
  const { data, isLoading } = useUnfurl(url);
  if (isLoading || !data) return null;

  const isLargeImage =
    data.type === 'video.other' ||
    data.type === 'video' ||
    data.type === 'article' ||
    Boolean(data.image && !data.title); // pure image-link

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'mt-1 flex max-w-[520px] gap-3 overflow-hidden rounded-md border-l-4 bg-bg-elevated px-3 py-2',
        'border-l-accent-primary/70 hover:bg-bg-hover',
      )}
    >
      <div className="min-w-0 flex-1 leading-snug">
        {data.siteName && (
          <div className="truncate text-[12px] text-text-muted">{data.siteName}</div>
        )}
        {data.title && (
          <div className="truncate text-[14px] font-semibold text-text-link hover:underline">
            {data.title}
          </div>
        )}
        {data.description && (
          <div className="mt-1 line-clamp-3 text-[13px] text-text-secondary">
            {data.description}
          </div>
        )}
        {isLargeImage && data.image && (
          <img
            src={data.image}
            alt={data.title ?? ''}
            className="mt-2 max-h-[280px] max-w-full rounded-md object-cover"
            loading="lazy"
          />
        )}
      </div>
      {!isLargeImage && data.image && (
        <img
          src={data.image}
          alt={data.title ?? ''}
          className="h-20 w-20 shrink-0 rounded-md object-cover"
          loading="lazy"
        />
      )}
    </a>
  );
}
