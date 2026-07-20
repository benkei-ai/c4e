import { defineConfig } from 'tsup';

export default defineConfig({
  // `actions` is a SEPARATE, server-only entry: the browser bundles must
  // never reach it, and re-exporting it from the barrel would close an
  // import cycle (the barrel is what the engine loads to register bundles).
  entry: { index: 'src/index.ts', actions: 'src/actions/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // @benkei-ai/core is a peer dep — its bundled foundation classes
  // (CapabilityRegistry, Benkei, …) are the SINGLE physical copy used by both
  // this catalog and the host. NEVER inline it.
  external: ['@benkei-ai/core', 'zod'],
});
