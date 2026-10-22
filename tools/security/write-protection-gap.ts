/** Reproduce the existing missing original-read gate; never acceptance promotion. */
import {createHash} from 'node:crypto';
import {writeFixture} from '../../tests/security/write-fixture';
import {ref} from '../../tests/security/fixture';
import {evaluateSecurityAccess} from '../../src/extensions/security/evaluate';
import {evaluateSecurityWrite} from '../../src/extensions/security/write';
const rows=[];
for(const kind of ['withheld','mask-equal','mask-different','original'] as const){
 const f=writeFixture(),reader=f.policy.rules.find(r=>r.id==='reader')!;
 if(kind==='original')reader.disclosure=[{field:ref('salary'),disposition:{kind:'original'}}];
 if(kind.startsWith('mask'))reader.disclosure=[{field:ref('salary'),disposition:{kind:'transformed',transform:'constant',version:'0.1.0',field:ref('salary'),value:{integerToken:'0'}}}];
 if(kind==='mask-equal')f.proposed.resource.fields.find(x=>x.field.elementId==='salary')!.value={integerToken:'0'};
 const access=evaluateSecurityAccess(f.policy,f.resolution,f.original.cut,{action:'read',output:[ref('salary')]},f.original.resource);
 const write=evaluateSecurityWrite(f.policy,f.resolution,f.profile,{operation:'update',original:f.original,proposed:f.proposed});
 if(access.decision!=='permit'||write.decision!=='permit')throw Error('Baseline changed; re-audit counterexample');
 const disposition=access.output[0]?.disposition;if(disposition!==(kind==='original'?'original':kind==='withheld'?'withheld':'transformed'))throw Error('Read outcome differs');
 rows.push({id:kind,read:access,write,hasReadBinding:Object.hasOwn(f.profile,'readAction'),hasBlindWriteBinding:Object.hasOwn(f.profile,'blindWriteActions'),meetsNewWriteRule:kind==='original'});
}
const paths=['tools/security/write-protection-gap.ts','src/extensions/security/write.ts','src/extensions/security/evaluate.ts','src/extensions/security/policy.ts','tests/security/write-fixture.ts','tests/security/evaluation-fixture.ts','tests/security/fixture.ts','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md'];
const sourceDigests=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
const receipt={status:'baseline-gap-reproduced',baselineCommit:'323f4a04bb5820bad83415e2f899abdb3cbb8b9f',bun:Bun.version,sourceDigests,rows,scope:'Actual admitted legacy evaluator missing SEC15 original-read or field-bound blind-write gate; finite host-attested semantic counterexamples, not production bypass/native admission.',acceptanceCasesPromoted:[]};
await Bun.write('docs/helix/04-build/evidence/security/write-protection-20261015/baseline-gap.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,rows:rows.length,violations:rows.filter(r=>!r.meetsNewWriteRule).length}));
