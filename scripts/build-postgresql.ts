// SPDX-License-Identifier: MIT OR Apache-2.0
const result=await Bun.build({
 entrypoints:['native/postgresql/runtime.ts'],outdir:'dist/postgresql',naming:'runtime.js',
 target:'browser',format:'esm',external:['fs','path'],
 plugins:[{name:'postgresql-browser-wasm-location',setup(build){
  build.onLoad({filter:/@libpg-query\/parser\/wasm\/index\.js$/},async({path})=>{
   const source=await Bun.file(path).text();
   const initialization='PgQueryModule()';
   if(source.split(initialization).length!==2)throw new Error('Expected one pinned PostgreSQL module initialization');
   return {contents:source.replace(initialization,'PgQueryModule({locateFile: name => new URL(name, import.meta.url).href})'),loader:'js'};
  });
 }}],
});
if(!result.success)throw new Error(result.logs.join('\n'));
await Bun.write('dist/postgresql/libpg-query.wasm',Bun.file('node_modules/@libpg-query/parser/wasm/libpg-query.wasm'));
console.log('Optional PostgreSQL parser/deparser browser runtime built');
export {};
