// SPDX-License-Identifier: MIT OR Apache-2.0
// Frozen cumulative normalized-text boundary for the V2 parameter budget.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateProtectionParameters} from '../../../src/extensions/security/protection/parameters';
import {domainFixture,domainRef} from '../../../tests/security/protection/domain-fixture';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'docs/helix/04-build/evidence/rust-migration/r8-security-protection-parameters/budget-boundary.json');
const sourceFiles=['src/extensions/security/protection/parameters.ts','src/extensions/security/protection/literals.ts','src/extensions/security/protection/domains.ts','src/extensions/security/protection/catalog.ts','src/extensions/security/protection/core-fields.ts','src/model/schema-literals.ts','src/validation/literal-kernel.ts','tests/security/protection/domain-fixture.ts','spec/extensions/security-protection/package.json','spec/extensions/security-protection/domain-resolution.schema.json','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md'];
const shaFile=async(path:string)=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value));
const f=domainFixture();
const catalog=structuredClone(f.catalog);
catalog.transforms[0].parameters=[
 {name:'large-a',field:domainRef('parameter'),value:{integerToken:'1e60000'}},
 {name:'large-b',field:domainRef('parameter'),value:{integerToken:'1e40000'}},
];
let outcome:unknown;
try{outcome={status:'returned',value:normalize(validateProtectionParameters(f.policy,catalog,f.closure))};}
catch(error){const e=error as Error&{code?:string;path?:string};outcome={status:'threw',name:e.name,code:e.code??null,path:e.path??null,message:e.message};}
const scriptPath='scripts/rust-migration/r8/security-parameters-budget-boundary.ts';
const bytes=JSON.stringify({format:'umf-r8-security-parameters-budget-boundary/1',runtime:{bun:Bun.version},sourceHashes:Object.fromEntries(await Promise.all(sourceFiles.map(async path=>[path,await shaFile(path)]))),captureScriptSha256:await shaFile(scriptPath),case:{id:'parameters.cumulative-normalized-text-bound',input:'two individually admitted integer tokens have normalized coefficient lengths 60001 and 40001; the second exceeds the shared 100000-unit text budget',sources:{policy:normalize(f.policy),catalog:normalize(catalog),closure:normalize(f.closure)},outcome}},null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==bytes)throw new Error('Frozen cumulative parameter budget boundary changed');}
else await writeFile(output,bytes);
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',output,packetSha256:createHash('sha256').update(bytes).digest('hex')}));
