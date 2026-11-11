import {join} from 'node:path';
import type {BunPlugin} from 'bun';

/** Build the isolated Node runtime entry used by the package's Node condition. */
export async function buildNodeWasmRuntime(root: string, outdir: string) {
  const plugin: BunPlugin = {name: 'node-file-wasm-loader', setup(build) {
    build.onResolve({filter: /^(?:\.\/loader\.js|\.\/pkg\/umf_core_wasm\.js)$/}, args => {
      if (args.importer.endsWith('bindings/core/wasm/index.js') && args.path === './loader.js') {
        return {path: join(root, 'bindings/core/wasm/loader-node.js')};
      }
      if (args.importer.endsWith('bindings/core/wasm/loader-node.js') && args.path === './pkg/umf_core_wasm.js') {
        return {path: args.path, external: true};
      }
      return undefined;
    });
  }};
  const result = await Bun.build({
    entrypoints: [join(root, 'bindings/core/wasm/index.js')],
    outdir,
    naming: 'index-node.js',
    target: 'node',
    format: 'esm',
    plugins: [plugin],
  });
  if (!result.success) throw new Error(result.logs.join('\n'));
}
