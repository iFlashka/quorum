import { useEffect, useRef } from 'react';
import { Glyph } from '@/components/Glyph';
import { cn } from '@/lib/utils';

interface VideoTileProps {
  /** MediaStream с video-track или null если только аватар. */
  stream: MediaStream | null;
  /** Имя для отображения. */
  name: string;
  /** Зеркалить (для local camera preview). */
  mirror?: boolean;
  /** Показывать бейдж muted. */
  muted?: boolean;
  /** Зелёное кольцо вокруг тайла когда говорит. */
  speaking?: boolean;
  /** Растягивать на всю grid-area (для screenshare). */
  large?: boolean;
  /** Доп. классы для wrapper'а (для grid-positioning). */
  className?: string;
}

/**
 * Один тайл видео-сетки. Если stream нет — показывает аватар-инициалы.
 */
export function VideoTile({
  stream,
  name,
  mirror,
  muted,
  speaking,
  large,
  className,
}: VideoTileProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => undefined);
    }
    if (!stream) el.srcObject = null;
  }, [stream]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg bg-bg-deepest',
        speaking && 'ring-2 ring-accent-success',
        large ? 'aspect-video w-full' : 'aspect-video',
        className,
      )}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            'h-full w-full object-cover',
            mirror && 'scale-x-[-1]',
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-primary text-2xl font-semibold text-white">
            {avatarInitials(name)}
          </div>
        </div>
      )}
      <div className="absolute right-2 bottom-2 left-2 flex items-center gap-1.5">
        <span className="truncate rounded bg-black/60 px-1.5 py-0.5 text-[12px] text-white">
          {name}
        </span>
        {muted && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-danger text-white">
            <Glyph name="micOff" size={12} />
          </span>
        )}
      </div>
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
