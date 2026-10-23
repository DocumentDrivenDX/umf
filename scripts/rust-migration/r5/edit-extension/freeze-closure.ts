// SPDX-License-Identifier: MIT OR Apache-2.0
// Reproducible executed-source closure for the live predecessor trace.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
const root=process.cwd();
const entries=['scripts/rust-migration/r5/edit-extension/live-trace.ts','scripts/rust-migration/r5/edit-extension/freeze-closure.ts','scripts/rust-migration/r5/edit-extension/live-trace.json','src/model/document.ts','src/registry/registry.ts','src/validation/document.ts','src/validation/constraint-kernel.ts','src/validation/current-policy.ts','src/generated/core-model.ts','src/generated/core-validators.ts','src/model/json.ts','src/model/types.ts','spec/core/schema.json','spec/core/extension-package.schema.json','spec/core/semantic-type-reference.schema.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json','package.json','bun.lock'];
const files=new Set<string>();
function resolveLocal(from:string,spec:string):string|undefined{const base=resolve(dirname(from),spec);for(const candidate of [base,...['.ts','.tsx','.js','.mjs','.json'].map(s=>base+s),...['index.ts','index.js','index.json'].map(s=>join(base,s))])if(existsSync(candidate)&&statSync(candidate).isFile())return candidate;return;}
function visit(rel:string):void{const normalized=rel.replaceAll('\\','/');if(files.has(normalized))return;files.add(normalized);if(!['.ts','.tsx','.js','.mjs'].includes(extname(normalized)))return;const source=readFileSync(join(root,normalized),'utf8');for(const m of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)){const next=resolveLocal(join(root,normalized),m[1]!);if(next)visit(next.slice(root.length+1));}}
for(const entry of entries)visit(entry);
const hashes=Object.fromEntries([...files].sort().map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));
const manifest={kind:'executed-predecessor-source-closure/1',capture:'scripts/rust-migration/r5/edit-extension/live-trace.json',runtime:{bun:Bun.version,platform:process.platform,arch:process.arch},entries,files:hashes};
writeFileSync('scripts/rust-migration/r5/edit-extension/executed-closure.json',`${JSON.stringify(manifest,null,2)}\n`);
console.log(JSON.stringify({ok:true,fileCount:Object.keys(hashes).length,output:'scripts/rust-migration/r5/edit-extension/executed-closure.json'}));
