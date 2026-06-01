import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // @benkei-ai/core is a peer dep — its bundled foundation classes
  // (CapabilityRegistry, Benkei, …) are the SINGLE physical copy used by both
  // this catalog and the host. NEVER inline it.
  external: ['@benkei-ai/core', 'zod'],
});
