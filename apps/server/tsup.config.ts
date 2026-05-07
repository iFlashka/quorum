import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsup';

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

function copyMigrations(): void {
  copyDir(join('src', 'db', 'migrations'), join('dist', 'db', 'migrations'));
}

export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate.ts', 'src/db/bootstrap.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  bundle: true,
  splitting: false,
  noExternal: ['@quorum/shared'],
  clean: true,
  sourcemap: true,
  async onSuccess() {
    copyMigrations();
  },
});
