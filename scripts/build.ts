import { rm, cp } from 'node:fs/promises';
// A public-bundle refresh may retain independently built native/browser bundles.
if(!process.argv.includes('--preserve-specialized-bundles')) await rm('dist', {recursive:true,force:true});
const result=await Bun.build({entrypoints:['src/index.ts'],outdir:'dist',naming:'umf.js',target:'browser',format:'esm',sourcemap:'external'});
if(!result.success) throw new Error(result.logs.join('\n'));
const types=Bun.spawn(['bun','node_modules/typescript/bin/tsc','--emitDeclarationOnly'],{stdout:'inherit',stderr:'inherit'});
if(await types.exited) process.exit(1);
await cp('spec', 'dist/spec', {recursive:true});
console.log(`Browser ESM built: ${result.outputs[0]!.size} bytes; declarations emitted.`);
