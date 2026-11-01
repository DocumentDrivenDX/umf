// SPDX-License-Identifier: MIT OR Apache-2.0
import {checkCoreDistribution,inspectCoreDistribution} from './check-core-authority';
import {mkdir} from 'node:fs/promises';
const output='.cache/sdk-distribution';await mkdir(output,{recursive:true});
const loader=await Bun.build({entrypoints:['src/domain-packs/loader-contract.ts'],outdir:'dist',naming:'loader-contract.js',target:'browser',format:'esm'});
if(!loader.success)throw Error(loader.logs.join('\n'));
const metadata=await Bun.file('package.json').json();
const manifest={name:metadata.name,version:metadata.version,license:metadata.license,type:'module',exports:{'.':{types:'./dist/src/index.d.ts',import:'./dist/umf.js'},'./loader-contract':{types:'./dist/src/domain-packs/loader-contract.d.ts',import:'./dist/loader-contract.js'}},dependencies:metadata.dependencies};
Object.assign(manifest.exports,{'./runtime/wasm':{types:'./dist/runtime/wasm/index.d.ts',import:'./dist/runtime/wasm/index.js'}});
await Bun.write(output+'/package.json',JSON.stringify(manifest,null,2)+'\n');
await Bun.write(output+'/README.md',`# UMF SDK ${metadata.version}

This SDK includes browser ESM, TypeScript declarations, schemas and the shared
Rust/WASM engine for actions and sagas. Install this archive with Bun or npm.

Initialize the bundled saga interpretation explicitly using public exports:

\`\`\`js
import {Registry, registerSagas, createSagaResources, inspectSagas} from '@umf/core';
import {initializeWasm, initializeCodegenWasm} from '@umf/core/runtime/wasm';

const resources = createSagaResources();
const core = await initializeWasm(undefined, globalThis, resources);
const engine = await initializeCodegenWasm(undefined, globalThis, resources);
const registry = registerSagas(new Registry(core), engine);
// const inspection = inspectSagas(document, registry);
\`\`\`

The SDK provides declaration, inspection, editing, exchange and capability
assessment. Hosts supply authenticated action execution, durable coordination
and independently qualified provider bindings. Vocabulary versions remain
explicit; declaration compatibility does not verify execution.

[Saga usage and examples](https://github.com/DocumentDrivenDX/umf/blob/main/docs/helix/05-deploy/sagas.md)
`);
await checkCoreDistribution('dist');
const child=Bun.spawn(['python3','scripts/package-sdk.py'],{stdout:'inherit',stderr:'inherit'});
if(await child.exited)throw Error('SDK archive failed');

const inventory=Bun.spawn(['python3','-c',"import json,tarfile;print(json.dumps([m.name for m in tarfile.open('.cache/sdk-distribution/umf-sdk.tgz').getmembers() if m.isfile()]))"],{stdout:'pipe',stderr:'inherit'});
const members=JSON.parse(await new Response(inventory.stdout).text()) as string[];if(await inventory.exited)throw Error('SDK archive inventory failed');const issues=inspectCoreDistribution(members);if(issues.length)throw Error(issues.join('\n'));console.log(JSON.stringify({coreDistribution:'sdk-archive',files:members.length}));
