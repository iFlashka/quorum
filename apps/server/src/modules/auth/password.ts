import { hash, verify } from '@node-rs/argon2';

// OWASP-рекомендации для argon2id (2024+): m=19MiB, t=2, p=1.
// algorithm не указываем — argon2id это дефолт в @node-rs/argon2.
const HASH_OPTS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTS);
}

export async function verifyPassword(stored: string, given: string): Promise<boolean> {
  try {
    return await verify(stored, given);
  } catch {
    // Если хэш повреждён или формат не совпадает — трактуем как неверный пароль.
    return false;
  }
}
