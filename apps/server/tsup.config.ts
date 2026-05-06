import { defineConfig } from 'tsup';

/**
 * Production-сборка сервера. tsup bundle'ит включая `@quorum/shared` (workspace
 * пакет), поэтому единственный output-файл self-contained кроме node_modules.
 *
 * В dev мы по-прежнему гоняем `tsx watch src/index.ts` — там shared резолвится
 * через workspace-symlink + ts-source. tsup используется только для prod.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  bundle: true,
  splitting: false,
  // shared компилируется внутрь bundle, остальное (fastify, drizzle и т.д.)
  // оставляем external — в проде установится через pnpm.
  noExternal: ['@quorum/shared'],
  clean: true,
  sourcemap: true,
  // Drizzle migrations folder копируется отдельно (это .sql, не TS).
});
