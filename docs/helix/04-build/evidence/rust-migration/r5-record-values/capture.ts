import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {validateCoreRecordValues,readDocument} from '../../../../../../src/index';
const root=new URL('../../../../../../',import.meta.url);
const bytes=(p:string)=>readFileSync(new URL(p,root));
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const source=readDocument(bytes('fixtures/core/record-values-current.umf.json').toString(),'json');
const identity={module:'fixture',element:'item'},label={module:'fixture',element:'label'},caption={module:'fixture',element:'caption'};
const good={field:label,state:'present' as const,value:{string:'雪🙂'}};
const cases:any[]=[
 {id:'valid-present',identity,values:[good]},
 {id:'required-absent',identity,values:[]},
 {id:'invalid-field-value',identity,values:[{field:label,state:'present',value:{integerToken:'9007199254740993123'}}]},
 {id:'duplicate',identity,values:[good,good]},
 {id:'undeclared',identity,values:[{field:{module:'fixture',element:'future'},state:'present',value:{string:'x'}}]},
 {id:'unknown-source',identity,source:{...source,'x-future-assertion':{meaning:'retained'}},values:[good]},
 {id:'invalid-source-version',identity,source:{...source,umf:'0.7.0'},values:[good]},
 {id:'malformed-value-state',identity,values:[null]},
];
const captured=cases.map(c=>{try{return {id:c.id,source:c.source??source,identity:c.identity,values:c.values,result:validateCoreRecordValues(c.source??source,c.identity,c.values)}}catch(e:any){return {id:c.id,source:c.source??source,identity:c.identity,values:c.values,thrown:{name:e.name,code:e.code??null,message:e.message,path:e.path??null}}}});
const paths=['src/model/record-values.ts','src/model/internal/record-body.ts','src/model/schema-properties.ts','tests/core-record-values.test.ts','fixtures/core/record-values-current.umf.json','docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md','docs/helix/02-design/contracts/CONTRACT-002-json-schema.md','docs/helix/02-design/contracts/CONTRACT-003-protobuf.md','docs/helix/02-design/contracts/CONTRACT-004-json-schema-protobuf-projection.md','docs/helix/02-design/contracts/CONTRACT-005-ddd-profile.md','docs/helix/02-design/contracts/CONTRACT-006-ddd-document-projection.md','docs/helix/02-design/contracts/CONTRACT-007-avro.md','docs/helix/02-design/contracts/CONTRACT-008-avro-document-projection.md','docs/helix/02-design/contracts/CONTRACT-009-graphql-sdl.md','docs/helix/02-design/contracts/CONTRACT-010-graphql-input-projection.md','docs/helix/02-design/contracts/CONTRACT-011-openapi.md','docs/helix/02-design/contracts/CONTRACT-049-schema-properties.md'];
const hashes=Object.fromEntries(paths.map(p=>[p,sha(bytes(p))]));
writeFileSync(new URL('frozen-typescript.json',import.meta.url),JSON.stringify({capture:{runtime:process.version,operation:'validateCoreRecordValues',capturedAt:new Date().toISOString(),sourceHashes:hashes},cases:captured},null,2)+'\n');
