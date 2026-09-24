const result=await Bun.build({entrypoints:['native/postgresql/runtime.ts'],outdir:'dist/postgresql',naming:'runtime.js',target:'browser',format:'esm',external:['fs','path']});
if(!result.success)throw new Error(result.logs.join('\n'));
await Bun.write('dist/postgresql/libpg-query.wasm',Bun.file('node_modules/@libpg-query/parser/wasm/libpg-query.wasm'));
console.log('Optional PostgreSQL parser/deparser browser runtime built');
export {};
