const result=await Bun.build({entrypoints:['native/arrow/runtime.ts'],outdir:'dist/arrow',naming:'runtime.js',target:'browser',format:'esm'});
if(!result.success)throw Error(result.logs.join('\n'));
console.log('Optional pinned Arrow schema backend built');
export {};
