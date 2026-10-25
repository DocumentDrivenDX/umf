// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {encodeCoreKeyTuple,verifyCoreKeyTuple,readCoreKeyTupleBytes,prepareCoreKeyTuples} from '../../../src/model/key-tuple';
import {tupleCases,tupleDocument,tupleIdentity} from '../../../scripts/core-key-tuple-cases';
import {uuidDocument,UUID,KEY} from '../../../tests/helpers/uuid-fixtures';

const root=resolve(import.meta.dir,'../../..');
const names=['src/model/key-tuple.ts','src/model/bit128.ts','src/model/uuid.ts','src/model/json.ts','src/model/schema-literals.ts','src/validation/document.ts','src/validation/literal-kernel.ts','scripts/core-key-tuple-cases.ts','tests/core/key-tuple.test.ts','tests/helpers/uuid-fixtures.ts','spec/core/key-tuple-operation-v4.schema.json','spec/core/schema.json','fixtures/key/tuple-encoding-v1.json','docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md'];
const hashes=Object.fromEntries(await Promise.all(names.map(async name=>[name,createHash('sha256').update(await Bun.file(resolve(root,name)).text()).digest('hex')])));
const cases:any={};const predecessorRows=tupleCases();
for(const row of predecessorRows)cases[row.id]={source:row.document,identity:tupleIdentity,values:row.id==='integer-host-number'?[{integerToken:'<unsafe-host-number>'}]:row.values,...(row.id==='integer-host-number'?{rustBoundary:'TypeScript number is rejected during copyJson; Rust Value cannot represent this out-of-profile number'}:{})};
const d=uuidDocument();cases['profile-v2-uuid']={source:d,identity:KEY,values:[{uuid:UUID}],profile:'umf-key-tuple-v2'};
cases['malformed-v2-uuid']={source:d,identity:KEY,values:[{uuid:'00112233--5566-7788-99aa-bbccddeeff'}],profile:'umf-key-tuple-v2'};
const bitsSource=tupleDocument([{id:'v',scalarType:'bits128'}]);cases['profile-v2-bits128']={source:bitsSource,identity:tupleIdentity,values:[{bits128Hex:'00112233445566778899aabbccddeeff'}],profile:'umf-key-tuple-v2'};
cases['malformed-v2-bits128']={source:bitsSource,identity:tupleIdentity,values:[{bits128Hex:'00112233445566778899aabbccddeefg'}],profile:'umf-key-tuple-v2'};
cases['identity-before-source']={source:{umf:'bad'},identity:{module:'m',element:'record'},values:[{integerToken:'1'}]};
cases['source-before-profile']={source:{umf:'bad'},identity:tupleIdentity,values:[{integerToken:'1'}],profile:'invalid-profile'};
cases['invalid-profile']={source:tupleCases()[0].document,identity:tupleIdentity,values:tupleCases()[0].values,profile:'invalid-profile'};
for(const where of ['key','reference','member','facet']){const doc=tupleDocument([{id:'x',scalarType:'integer'}]);const record=doc.modules[0].elements[0];if(where==='key')record.keys[0].future=true;if(where==='reference')record.keys[0].fields[0].future=true;if(where==='member')record.members[0].future=true;if(where==='facet')doc.modules[0].elements[1].facets={future:true};cases[`unknown-${where}`]={source:doc,identity:tupleIdentity,values:[{integerToken:'1'}]};}
const isolated='\ud800';const surrogateDoc=tupleDocument([{id:'x',scalarType:'integer'}]);surrogateDoc.modules[0].id=isolated;surrogateDoc.modules[0].elements[0].keys[0].id=isolated;surrogateDoc.modules[0].elements[0].keys[0].fields[0].module=isolated;surrogateDoc.modules[0].elements[0].members[0].module=isolated;cases['surrogate-stable-identities']={source:surrogateDoc,identity:{module:isolated,element:'record',key:isolated},values:[{integerToken:'1'}]};
const unknownSurrogate=tupleDocument([{id:'x',scalarType:'integer'}]);unknownSurrogate.modules[0].elements[1].facets={[`future${isolated}`]:true};cases['surrogate-unknown-path']={source:unknownSurrogate,identity:tupleIdentity,values:[{integerToken:'1'}]};
const integerTokenSource=tupleDocument([{id:'x',scalarType:'integer'}]);
cases['integer-zero-padded-exponent']={source:integerTokenSource,identity:tupleIdentity,values:[{integerToken:`1e${'0'.repeat(42)}`}]};
cases['integer-negative-signed-32-digit-exponent']={source:integerTokenSource,identity:tupleIdentity,values:[{integerToken:`1e-${'1'.repeat(32)}`}]};
cases['integer-positive-signed-32-digit-exponent']={source:integerTokenSource,identity:tupleIdentity,values:[{integerToken:`1e+${'1'.repeat(32)}`}]};
cases['integer-leading-zero-crossed-negative-exponent']={source:integerTokenSource,identity:tupleIdentity,values:[{integerToken:`01e-${'1'.repeat(32)}`}]};
cases['integer-invalid-prefix-crossed-negative-exponent']={source:integerTokenSource,identity:tupleIdentity,values:[{integerToken:`x1e-${'1'.repeat(32)}`}]};
cases['integer-negative-zero-signed-32-digit-exponent']={source:integerTokenSource,identity:tupleIdentity,values:[{integerToken:`-0e-${'1'.repeat(32)}`}]};
cases['integer-surrogate-token']={source:integerTokenSource,identity:tupleIdentity,values:[{integerToken:isolated}]};
cases['uuid-surrogate-token']={source:d,identity:KEY,values:[{uuid:isolated}],profile:'umf-key-tuple-v2'};
const outcomes=Object.fromEntries(Object.entries(cases).map(([id,c]:[string,any])=>{try{const original=predecessorRows.find((row:any)=>row.id===id);return[id,{ok:true,value:encodeCoreKeyTuple(c.source,c.identity,original?.values??c.values,c.profile?{profile:c.profile}:undefined)}]}catch(error){const e=error as any;return[id,{ok:false,error:{code:e.code??'',message:e.message??String(error),path:e.path??''}}]}}));
const first=tupleCases().find((row:any)=>!row.error)!;const base=encodeCoreKeyTuple(first.document,tupleIdentity,first.values);
const verificationCases:any={malformed_profile:{receipt:{...base,profile:'forged'},current:first.document},malformed_version:{receipt:{...base,version:'3.0.0'},current:first.document},nonminimal_bytes:{receipt:{...base,bytesHex:'554d464b318100020137'},current:first.document},malformed_identity:{receipt:{...base,identity:{module:'m',element:'record'}},current:first.document},stale_source:{receipt:base,current:{...first.document,id:'other'}}};
const verificationOutcomes=Object.fromEntries(Object.entries(verificationCases).map(([id,c]:[string,any])=>{try{return[id,{ok:true,value:verifyCoreKeyTuple(c.receipt,c.current)}]}catch(error){const e=error as any;return[id,{ok:false,error:{code:e.code??'',message:e.message??String(error),path:e.path??''}}]}}));
const packet={profile:'core-key-tuple-encoding/2.0.0+4.0.0',predecessor:'src/model/key-tuple.ts',sourceClosureSha256:hashes,cases,outcomes,verificationCases,verificationOutcomes};
const path='docs/helix/04-build/evidence/rust-migration/r5-core-key-tuple/frozen-typescript.json';await mkdir(dirname(resolve(root,path)),{recursive:true});await Bun.write(resolve(root,path),JSON.stringify(packet,null,2)+'\n');console.log(path);
