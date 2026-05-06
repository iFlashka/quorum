import { randomBytes } from 'node:crypto';

// Crockford-base32 без I, L, O, U чтобы не путать визуально и не пересекаться с реальными словами.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateInviteCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[ILOU]/g, (ch) => {
    // Базовая нормализация распространённых ошибок: I/1, L/1, O/0, U/V.
    if (ch === 'I' || ch === 'L') return '1';
    if (ch === 'O') return '0';
    return 'V';
  });
}
