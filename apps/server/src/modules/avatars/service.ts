/**
 * Сервис загрузки аватаров. По одному файлу на пользователя — путь в storage
 * фиксирован: `avatars/{userId}.webp` (или .png/.jpeg, см. allowed mime). Новый
 * upload перезаписывает предыдущий.
 *
 * Resize не делаем на сервере — клиент обязан прислать quadrate ≤ 256×256
 * (canvas-resize в desktop). Здесь только валидируем mime/size и пишем.
 *
 * Avatar-URL в БД хранится как `/avatars/{userId}` без расширения — клиент
 * получит правильный mime по Content-Type заголовку при GET. Расширение
 * решает только filesystem layout (нужно знать чтобы повторно открыть файл).
 */

import { eq } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';
import { users } from '../../db/schema.js';
import type { FileStorage } from '../../storage/index.js';

export class AvatarMimeError extends Error {
  readonly statusCode = 415;
  constructor(public readonly mimeType: string) {
    super(`avatar_mime_not_allowed:${mimeType}`);
    this.name = 'AvatarMimeError';
  }
}

export class AvatarSizeError extends Error {
  readonly statusCode = 413;
  constructor(public readonly sizeBytes: number) {
    super(`avatar_too_large:${sizeBytes}`);
    this.name = 'AvatarSizeError';
  }
}

const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg']);
const MAX_SIZE_BYTES = 1024 * 1024; // 1 MB

interface UploadPayload {
  mimeType: string;
  data: Buffer;
}

interface AvatarRecord {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

export class AvatarsService {
  /** Map'им последний загруженный mime/size в памяти — для отдачи через GET. */
  private readonly inMemoryMeta = new Map<string, AvatarRecord>();

  constructor(
    private readonly db: DbClient,
    private readonly storage: FileStorage,
  ) {}

  isMimeAllowed(mime: string): boolean {
    return ALLOWED_MIME.has(mime.toLowerCase());
  }

  /** Загрузить новый аватар; вернуть relative-URL для users.avatarUrl. */
  async upload(userId: string, payload: UploadPayload): Promise<{ avatarUrl: string }> {
    if (!this.isMimeAllowed(payload.mimeType)) {
      throw new AvatarMimeError(payload.mimeType);
    }
    if (payload.data.byteLength > MAX_SIZE_BYTES) {
      throw new AvatarSizeError(payload.data.byteLength);
    }

    const ext = mimeToExt(payload.mimeType);
    const storagePath = `avatars/${userId}.${ext}`;
    const stored = await this.storage.put(storagePath, payload.data);

    this.inMemoryMeta.set(userId, {
      storagePath: stored.path,
      mimeType: payload.mimeType,
      sizeBytes: stored.sizeBytes,
    });

    const avatarUrl = `/avatars/${userId}`;
    await this.db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
    return { avatarUrl };
  }

  /**
   * Резолв пути и mime для GET /avatars/:userId. На холодном старте сервера
   * inMemoryMeta пуста — пробуем по очереди известные расширения и берём
   * первое найденное.
   */
  async resolve(userId: string): Promise<AvatarRecord | null> {
    const cached = this.inMemoryMeta.get(userId);
    if (cached) return cached;

    for (const mime of ALLOWED_MIME) {
      const path = `avatars/${userId}.${mimeToExt(mime)}`;
      try {
        const sizeBytes = await this.storage.size(path);
        const rec = { storagePath: path, mimeType: mime, sizeBytes };
        this.inMemoryMeta.set(userId, rec);
        return rec;
      } catch {
        // файла нет — пробуем следующий
      }
    }
    return null;
  }

  streamFile(storagePath: string) {
    return this.storage.stream(storagePath);
  }
}

function mimeToExt(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
    default:
      return 'webp';
  }
}
