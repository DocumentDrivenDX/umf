// SPDX-License-Identifier: MIT OR Apache-2.0
import '../../../../../../../scripts/codegen/entry';
import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const out=import.meta.dir+'/frozen.json';if(await Bun.file(out).exists())throw Error('Refusing to refresh frozen expectations');
const baseline=JSON.parse(await readFile(import.meta.dir+'/../baseline/operations.json','utf8'));const seed=baseline.cases.find((v:any)=>v.id==='client/original-json').request;
const cases=[];
for(const [id,literal] of [['controls','a\b\f\n\r\t\u2028\u2029'],['lone-surrogate','a\ud800'],['large-metadata','x'.repeat(32768)]]){const q=structuredClone(seed);const d=JSON.parse(q.text);d.modules[0].elements.find((f:any)=>f.id==='customerName').allowedValues=[{string:literal}];q.text=JSON.stringify(d);const expected=JSON.parse((globalThis as any).__umf_codegen(JSON.stringify(q)));cases.push({id,operation:'generatePythonClient',request:q,expected});}
const frozen=JSON.stringify({format:'umf-r3-generation-unified-review/1',cases},null,2)+'\n';await writeFile(out,frozen);await writeFile(import.meta.dir+'/receipt.json',JSON.stringify({frozenSha256:createHash('sha256').update(frozen).digest('hex'),scope:'Original unified client literal/code-unit metadata output before renderer fixes'},null,2)+'\n');console.log(cases.map((v:any)=>[v.id,v.expected.ok]));
