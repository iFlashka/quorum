#!/usr/bin/env node
/**
 * Генератор звуковых семплов для Quorum.
 *
 * Пишет 8 WAV-файлов в `apps/desktop/public/sounds/`. Все файлы —
 * 16-bit PCM mono 44.1 kHz, поэтому загружаются HTMLAudioElement без декодеров.
 *
 * Семейство тонов: dial-tones (425/440 Hz) для звонков и pluck-блипы для
 * notify-событий. Это оригинальный синтез — не сэмплы Discord (его аудио
 * защищены копирайтом). Поведение/моменты воспроизведения — как в Discord.
 *
 * Файлы можно подменить своими: положи WAV с тем же именем (или MP3 +
 * подправь путь в SoundManager).
 *
 * Запуск:  node scripts/gen-sounds.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44_100;
const PEAK = 0.55; // ~ -5 dBFS, оставляем headroom

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'apps', 'desktop', 'public', 'sounds');
mkdirSync(OUT_DIR, { recursive: true });

/** Возвращает Float32Array длиной seconds*SAMPLE_RATE, заполненный нулями. */
function silence(seconds) {
  return new Float32Array(Math.round(seconds * SAMPLE_RATE));
}

/** ADSR-огибающая. Все аргументы — в секундах, возвращает множитель в [0;1]. */
function envelope(t, total, attack, release, sustainLevel = 1) {
  if (t < attack) return (t / attack) * sustainLevel;
  if (t > total - release) return Math.max(0, ((total - t) / release) * sustainLevel);
  return sustainLevel;
}

/** Записывает в samples тон на интервале [start; start+duration). */
function addTone(samples, startSec, duration, freq, amp = 1, attack = 0.01, release = 0.04) {
  const start = Math.round(startSec * SAMPLE_RATE);
  const len = Math.round(duration * SAMPLE_RATE);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, duration, attack, release);
    const idx = start + i;
    if (idx >= samples.length) break;
    samples[idx] += amp * env * Math.sin(2 * Math.PI * freq * t);
  }
}

/** Кодирует Float32Array в 16-bit PCM little-endian Buffer. */
function pcm16le(samples) {
  const buf = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let v = samples[i];
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    buf.writeInt16LE(Math.round(v * 32767 * PEAK), i * 2);
  }
  return buf;
}

/** Полный WAV (RIFF) с PCM-данными. */
function buildWav(samples) {
  const data = pcm16le(samples);
  const header = Buffer.alloc(44);
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // subchunk1 size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function write(name, samples) {
  const path = resolve(OUT_DIR, `${name}.wav`);
  writeFileSync(path, buildWav(samples));
  const seconds = (samples.length / SAMPLE_RATE).toFixed(2);
  console.log(`✓ ${name}.wav  ${seconds}s  ${(samples.length * 2 / 1024).toFixed(1)} KiB`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. ring-out — исходящий гудок. Классический ringback: 1.0s ON / 1.0s OFF на
// частоте 425 Hz (стандарт Восточной Европы). Лупится бесшовно.
// ──────────────────────────────────────────────────────────────────────────────
{
  const total = 2.0;
  const s = silence(total);
  addTone(s, 0.0, 1.0, 425, 0.95, 0.02, 0.08);
  write('ring-out', s);
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. ring-in — входящий звонок. Двух-нотный «динь-динь»: 587 Hz + 880 Hz
// (D5 + A5 — мажорная квинта), 0.5s ON / 0.1s pause / 0.5s ON / 0.9s silence.
// ──────────────────────────────────────────────────────────────────────────────
{
  const total = 2.0;
  const s = silence(total);
  for (const start of [0.0, 0.6]) {
    addTone(s, start, 0.5, 587.33, 0.55, 0.01, 0.15);
    addTone(s, start, 0.5, 880.0, 0.45, 0.01, 0.15);
  }
  write('ring-in', s);
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. connect — звонок принят. Восходящая пара C5→E5 (мажорное «всё ок»).
// ──────────────────────────────────────────────────────────────────────────────
{
  const total = 0.45;
  const s = silence(total);
  addTone(s, 0.00, 0.16, 523.25, 0.85, 0.005, 0.05); // C5
  addTone(s, 0.16, 0.22, 659.25, 0.85, 0.005, 0.08); // E5
  write('connect', s);
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. disconnect — звонок завершён. Нисходящая E5→C5.
// ──────────────────────────────────────────────────────────────────────────────
{
  const total = 0.45;
  const s = silence(total);
  addTone(s, 0.00, 0.16, 659.25, 0.85, 0.005, 0.05);
  addTone(s, 0.16, 0.22, 523.25, 0.85, 0.005, 0.08);
  write('disconnect', s);
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. mention — короткий внимание-pluck. G5+B5 (терция), 0.25s.
// ──────────────────────────────────────────────────────────────────────────────
{
  const total = 0.32;
  const s = silence(total);
  addTone(s, 0.00, 0.30, 783.99, 0.6, 0.003, 0.18); // G5
  addTone(s, 0.00, 0.30, 987.77, 0.4, 0.003, 0.18); // B5
  write('mention', s);
}

// ──────────────────────────────────────────────────────────────────────────────
// 6. message — мягкий тук на новое сообщение в активном канале. Коротенькая
// нота C5 с быстрым декей. По дефолту off в настройках.
// ──────────────────────────────────────────────────────────────────────────────
{
  const total = 0.16;
  const s = silence(total);
  addTone(s, 0.0, 0.15, 523.25, 0.5, 0.003, 0.12);
  write('message', s);
}

// ──────────────────────────────────────────────────────────────────────────────
// 7. join — кто-то зашёл в голосовой канал. Восходящий двойник C5→G5.
// ──────────────────────────────────────────────────────────────────────────────
{
  const total = 0.32;
  const s = silence(total);
  addTone(s, 0.00, 0.10, 523.25, 0.7, 0.003, 0.05); // C5
  addTone(s, 0.10, 0.18, 783.99, 0.7, 0.003, 0.10); // G5
  write('join', s);
}

// ──────────────────────────────────────────────────────────────────────────────
// 8. leave — кто-то вышел. Нисходящий G5→C5.
// ──────────────────────────────────────────────────────────────────────────────
{
  const total = 0.32;
  const s = silence(total);
  addTone(s, 0.00, 0.10, 783.99, 0.7, 0.003, 0.05);
  addTone(s, 0.10, 0.18, 523.25, 0.7, 0.003, 0.10);
  write('leave', s);
}

console.log(`\nГотово. Файлы в ${OUT_DIR}`);
