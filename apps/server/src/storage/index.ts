/**
 * Абстракция над файловым хранилищем. Сейчас одна реализация — LocalStorage,
 * пишущая в `infra/data/uploads/`. В фазе 7 при необходимости заменим на S3.
 */

import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createReadStream, type ReadStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface StoredObject {
  /** Относительный путь для записи в БД (storage_path). */
  path: string;
  sizeBytes: number;
}

export interface FileStorage {
  /** Сохранить буфер по относительному пути. Создаёт промежуточные директории. */
  put(path: string, data: Buffer): Promise<StoredObject>;
  /** Прочитать как Buffer (для теста / маленьких файлов). */
  read(path: string): Promise<Buffer>;
  /** Открыть Read-stream для отдачи через HTTP без загрузки в память. */
  stream(path: string): ReadStream;
  /** Размер файла в байтах. */
  size(path: string): Promise<number>;
  /** Удалить. Идемпотентно: missing → no-op. */
  remove(path: string): Promise<void>;
}

export class LocalStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private resolveSafe(path: string): string {
    const full = resolve(this.root, path);
    if (!full.startsWith(this.root)) {
      // Защита от path traversal, e.g. '../../etc/passwd'.
      throw new Error('storage_path_outside_root');
    }
    return full;
  }

  async put(path: string, data: Buffer): Promise<StoredObject> {
    const full = this.resolveSafe(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    const stats = await stat(full);
    return { path, sizeBytes: stats.size };
  }

  read(path: string): Promise<Buffer> {
    return readFile(this.resolveSafe(path));
  }

  stream(path: string): ReadStream {
    return createReadStream(this.resolveSafe(path));
  }

  async size(path: string): Promise<number> {
    const stats = await stat(this.resolveSafe(path));
    return stats.size;
  }

  async remove(path: string): Promise<void> {
    try {
      await unlink(this.resolveSafe(path));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  }
}

/**
 * Генерирует относительный путь для нового файла.
 * Формат: `YYYY/MM/{ulid}-{safeFilename}` — даты для ротации/архивации,
 * ulid для уникальности, имя для удобства отладки в файловой системе.
 */
export function makeStoragePath(now: Date, id: string, originalName: string): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safe = sanitizeFilename(originalName);
  return join(yyyy, mm, `${id}-${safe}`).replace(/\\/g, '/');
}

const UNSAFE_FILENAME_CHARS = /[^a-zA-Z0-9._-]+/g;

export function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(-128); // обрезаем длиннющие имена
  const safe = trimmed.replace(UNSAFE_FILENAME_CHARS, '_');
  return safe.replace(/^_+|_+$/g, '') || 'file';
}
