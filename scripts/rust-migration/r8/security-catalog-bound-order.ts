// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze catalog-source diagnostic order across literal bounds and later unknowns.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateProtectionParameters} from '../../../src/extensions/security/protection/parameters';
import {domainFixture} from '../../../tests/security/protection/domain-fixture';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'docs/helix/04-build/evidence/rust-migration/r8-security-protection-parameters/diagnostic-order.json');
const f=domainFixture();
const catalog=structuredClone(f.catalog);
catalog.transforms[0].parameters[0].value={string:'x'.repeat(4097)};
const later=structuredClone(catalog.transforms[0]);
later.id='transform-later';
later.parameters=[];
later.disclosureProfile=[];
later.futureTransform={retained:true};
catalog.transforms.push(later);
const result=validateProtectionParameters(f.policy,catalog,f.closure);
const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value));
const packet={cases:[{id:'catalog.bound-before-later-transform-unknown',sources:{policy:normalize(f.policy),catalog:normalize(catalog),closure:normalize(f.closure)},outcome:{status:'returned',value:normalize(result)}}]};
const serialized=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==serialized)throw new Error('Frozen security catalog bound-order predecessor changed; review before refresh');}
else{await mkdir(dirname(output),{recursive:true});await writeFile(output,serialized);}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',output,caseCount:1,packetSha256:createHash('sha256').update(serialized).digest('hex')}));
