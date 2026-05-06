import { useRef, useState } from 'react';
import { Check, Upload } from 'lucide-react';
import type { UserStatus } from '@quorum/shared';
import { useAuth } from '@/auth/store';
import { useRuntime } from '@/auth/runtime-store';
import { ApiError } from '@/api/client';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: { value: Exclude<UserStatus, 'offline'>; label: string; hint: string }[] = [
  { value: 'online', label: 'В сети', hint: 'Виден всем как online' },
  { value: 'idle', label: 'Не активен', hint: 'Жёлтая метка вместо зелёной' },
  { value: 'dnd', label: 'Не беспокоить', hint: 'Скрыть всплывающие уведомления' },
];

export function AccountSection(): JSX.Element {
  const user = useAuth((s) => s.user);
  const runtime = useRuntime((s) => s.runtime);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [status, setStatus] = useState<Exclude<UserStatus, 'offline'>>(
    (user?.status as Exclude<UserStatus, 'offline'>) ?? 'online',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    displayName !== (user?.displayName ?? '') || status !== (user?.status ?? 'online');

  const onSave = async (): Promise<void> => {
    if (!runtime || !user) return;
    setSaving(true);
    setError(null);
    try {
      const res = await runtime.session.auth.updateMe({
        displayName: displayName !== user.displayName ? displayName : undefined,
        status: status !== user.status ? status : undefined,
      });
      useAuth.setState({ user: res.user });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[640px] space-y-8">
      <section>
        <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Имя для отображения
        </h3>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={48}
          className="w-full rounded bg-bg-deepest px-3 py-2 text-[15px] text-text-primary outline-none focus:ring-2 focus:ring-accent-primary"
        />
        <p className="mt-2 text-[13px] text-text-muted">
          Логин: <span className="font-mono text-text-secondary">@{user?.username}</span> — изменить нельзя.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Статус
        </h3>
        <div className="space-y-1">
          {STATUS_OPTIONS.map((opt) => {
            const checked = status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={cn(
                  'flex w-full items-start gap-3 rounded px-3 py-2 text-left transition-colors',
                  checked ? 'bg-bg-active' : 'hover:bg-bg-hover',
                )}
              >
                <span
                  className={cn(
                    'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    checked
                      ? 'border-accent-primary bg-accent-primary text-white'
                      : 'border-text-muted/40',
                  )}
                >
                  {checked && <Check size={10} strokeWidth={3} />}
                </span>
                <div>
                  <div className="text-[14px] text-text-primary">{opt.label}</div>
                  <div className="text-[12px] text-text-muted">{opt.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-text-muted uppercase">
          Аватар
        </h3>
        <AvatarUploader />
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!dirty || saving}
          className="rounded bg-accent-primary px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Сохраняем…' : 'Сохранить изменения'}
        </button>
        {savedAt && !dirty && !saving && (
          <span className="text-[13px] text-accent-success">Сохранено ✓</span>
        )}
        {error && <span className="text-[13px] text-accent-danger">{error}</span>}
      </div>
    </div>
  );
}

/**
 * Загрузка аватара. Алгоритм:
 *   1. Юзер выбирает image (png/jpeg/webp/gif).
 *   2. Через canvas даунскейлим до 256×256 (centered cover-crop).
 *   3. canvas.toBlob('image/webp', 0.85) → POST /me/avatar.
 *   4. После успеха — обновляем useAuth.user.avatarUrl, чтобы аватары
 *      везде сразу подменились (MemberAvatar реактивно перерендерит).
 */
function AvatarUploader(): JSX.Element {
  const user = useAuth((s) => s.user);
  const runtime = useRuntime((s) => s.runtime);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const initials = avatarInitials(user?.displayName ?? user?.username ?? '?');
  const remoteUrl = runtime?.avatarsApi.resolveUrl(user?.avatarUrl) ?? null;
  const showImage = preview ?? remoteUrl;

  const onPick = async (file: File): Promise<void> => {
    if (!runtime || !user) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await downscaleToWebp(file, 256, 0.85);
      // Локальный preview сразу — UX мгновенный.
      setPreview(URL.createObjectURL(blob));
      const res = await runtime.avatarsApi.upload(blob);
      // Cache-bust: добавляем `?v=timestamp` чтобы обойти кеш предыдущего
      // относительного URL (он совпадает по path при перезагрузке аватара).
      const bust = `${res.avatarUrl}?v=${Date.now()}`;
      useAuth.setState({ user: { ...user, avatarUrl: bust } });
    } catch (e) {
      setErr(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Не удалось загрузить',
      );
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-accent-primary text-[28px] font-semibold text-white">
        {showImage ? (
          <img src={showImage} alt="avatar" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <div className="flex-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPick(f);
            // Сбрасываем чтобы можно было повторно выбрать тот же файл.
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-2 rounded-md bg-accent-primary px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          <Upload size={14} />
          {busy ? 'Загружаем…' : 'Загрузить аватар'}
        </button>
        <p className="mt-2 text-[12px] text-text-muted">
          PNG/JPEG/WebP/GIF до 1 МБ. Картинка обрежется до квадрата и пережмётся в 256×256 WebP.
        </p>
        {err && <p className="mt-1 text-[12px] text-accent-danger">{err}</p>}
      </div>
    </div>
  );
}

/** Даунскейл изображения в square cover-crop через offscreen canvas. */
async function downscaleToWebp(file: File, size: number, quality: number): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  // Квадратный crop из центра исходной картинки.
  const minSide = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - minSide) / 2;
  const sy = (img.naturalHeight - minSide) / 2;
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('toBlob_failed'));
        else resolve(blob);
      },
      'image/webp',
      quality,
    );
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = URL.createObjectURL(file);
  });
}

function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
