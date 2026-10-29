import {readFile} from 'node:fs/promises';
import {runSuite} from './suite.mjs';
const repo=process.env.UMF_ROOT;if(!repo)throw Error('UMF_ROOT is required');
const [kind,nullability]=await Promise.all([import(new URL('src/model/field-kind.ts',`file://${repo}/`).href),import(new URL('src/model/nullability.ts',`file://${repo}/`).href)]);
const typescript={...kind,...nullability};
const read=async p=>JSON.parse(await readFile(`${repo}/${p}`,'utf8'));
const fixtures={source:await read('scripts/rust-migration/r5/kind-nullability/input.json'),surrogate:await read('scripts/rust-migration/r5/kind-nullability/surrogate-input.json'),successes:await read('scripts/rust-migration/r5/kind-nullability/frozen-typescript.json'),refusals:await read('scripts/rust-migration/r5/kind-nullability/frozen-refusals.json')};
const result=await runSuite(typescript,typescript,fixtures,(route,id)=>globalThis.progress={route,id});
process.stdout.write(JSON.stringify({status:'typescript-source-preflight-passed',counts:result.counts})+'\n');
