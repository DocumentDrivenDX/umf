// SPDX-License-Identifier: MIT OR Apache-2.0
// Additive freeze of the current TypeScript Document inspector predecessor.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import * as protobufAdapter from '../../../../../../src/adapters/protobuf';
const {inspectProtobuf,importProtobufDescriptorSet,exportProtobufDescriptorSet}=protobufAdapter;

const out=resolve('docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/inspector-predecessor.json');
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const hex=(v:Uint8Array)=>Buffer.from(v).toString('hex');
const varint=(n:number)=>{const b:number[]=[];let x=BigInt(n);while(x>127n){b.push(Number(x&127n)|128);x>>=7n;}b.push(Number(x));return b;};
const field=(n:number,w:number,v:number[])=>[...varint(n*8+w),...(w===2?[...varint(v.length),...v]:v)];
const typed=(binary:number[])=>importProtobufDescriptorSet(new Uint8Array(binary),{id:'inspector-predecessor'});
const observations:any[]=[];
function capture(label:string,fn:()=>unknown){try{observations.push({label,status:'ok',value:fn()});}catch(e){const x=e as Error&{code?:string;path?:string};observations.push({label,status:'error',name:x.name,code:x.code??null,path:x.path??null,message:x.message});}}
function json(value:unknown){return JSON.parse(JSON.stringify(value));}
function diagnostics(label:string,doc:ReturnType<typeof typed>){capture(label,()=>inspectProtobuf(doc).diagnostics.map(d=>({code:d.code,path:d.path,severity:d.severity,message:d.message})));}

const authored=new Uint8Array(await readFile('fixtures/protobuf/authored.pb'));
const authoredDoc=typed([...authored]);
diagnostics('authored-document-diagnostics',authoredDoc);
capture('authored-document-unknown-and-presence',()=>{
 const payload=(authoredDoc.modules[0]!.elements[0]!.extensions['umf.protobuf'] as any);
 const found:any[]=[];
 const walk=(node:any,path:string)=>{if(node.unknown.length)found.push({path,unknown:node.unknown});for(const [name,value] of Object.entries(node.fields)){for(const child of Array.isArray(value)?value:[value])if(child&&typeof child==='object'&&'type'in child)walk(child,`${path}/fields/${name}`);}};
 walk(payload.descriptorSet,'/descriptorSet');
 return {descriptorProfile:payload.descriptorProfile,unknown:found,rootFields:Object.keys(payload.descriptorSet.fields)};
});
diagnostics('empty-document-diagnostics',typed([]));
const explicitEmptyName=field(1,2,[...field(1,2,[])]);
const absentName=field(1,2,[]);
capture('explicit-empty-vs-absent-presence',()=>({explicit:((typed(explicitEmptyName).modules[0]!.elements[0]!.extensions['umf.protobuf'] as any).descriptorSet.fields.file[0].fields),absent:((typed(absentName).modules[0]!.elements[0]!.extensions['umf.protobuf'] as any).descriptorSet.fields.file[0].fields)}));
diagnostics('unknown-root-diagnostic-order',typed(field(50000,0,[0x96,0x01])));
diagnostics('unknown-nested-diagnostic-order',typed(field(1,2,[...field(1,2,[97]),...field(50000,0,[7])])));
capture('unknown-wire-byte-retention',()=>{
 const doc=typed(field(50000,2,[0,1,2,255]));
 const p=doc.modules[0]!.elements[0]!.extensions['umf.protobuf'] as any;
 return {tree:p.descriptorSet.unknown,exportHex:hex(exportProtobufDescriptorSet(doc))};
});
capture('empty-root-field-presence',()=>{
 const doc=typed(field(1,2,[...field(1,2,[])]));
 const p=doc.modules[0]!.elements[0]!.extensions['umf.protobuf'] as any;
 return {file:p.descriptorSet.fields.file[0].fields,exportHex:hex(exportProtobufDescriptorSet(doc))};
});

const schema=JSON.parse(await readFile('spec/extensions/protobuf/schema.json','utf8'));
const rust=await readFile('crates/umf-core/src/protobuf_descriptor_schema.rs','utf8');
const runtimeTypes=[...rust.matchAll(/MessageSpec \{ name: "([^"]+)"/g)].map(m=>m[1]);
const schemaTypes=Object.keys(schema.$defs).filter(k=>k.startsWith('google.protobuf.')).sort();
const runtimeOnly=runtimeTypes.filter(x=>!schemaTypes.includes(x)).sort();
capture('descriptor-graph-types-and-runtime-schema-gaps',()=>({runtimeGraphTypeCount:runtimeTypes.length,runtimeGraphTypes:runtimeTypes,schemaTypeCount:schemaTypes.length,schemaTypes,runtimeOnlyTypes:runtimeOnly,runtimeOnlyTypeCount:runtimeOnly.length}));
capture('source-operation-surface',()=>({sourceArchiveOnImportedDocument:Object.hasOwn((authoredDoc.modules[0]!.elements[0]!.extensions['umf.protobuf'] as any),'sourceArchive'),typescriptExports:['importProtobufSources','exportProtobufSources','exportProtobufBundle'].map(name=>({name,present:typeof protobufAdapter[name as keyof typeof protobufAdapter]==='function'})),rustCodecExposesDescriptorBinaryOnly:true,sourceCompilerAndEmitterRustOperations:'unsupported in this shard'}));

const prior=JSON.parse(await readFile('docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/predecessor.json','utf8'));
const paths=[...new Set([...Object.keys(prior.sources),'src/adapters/protobuf/source.ts','crates/umf-core/src/protobuf_descriptor.rs','crates/umf-core/src/protobuf_descriptor_schema.rs','docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/capture-inspector.ts'])].sort();
const sources=Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const report={capture:'R5 Protobuf descriptor TypeScript Document inspector predecessor (additive)',runtime:{bun:Bun.version,bufbuildProtobuf:prior.runtime.bufbuildProtobuf,bufPackageFiles:prior.runtime.bufPackageFiles,bufPackageClosureSha256:prior.runtime.bufPackageClosureSha256,protoc:prior.runtime.protoc},sourceClosure:{sources,sourceCount:paths.length,bufPackageClosureSha256:prior.runtime.bufPackageClosureSha256,bufPackageFiles:prior.runtime.bufPackageFiles},limits:prior.limits,observations};
const rendered=JSON.stringify(report,null,2)+'\n';
if(Bun.argv.includes('--check')) {
 const frozen=await readFile(out,'utf8');
 if(frozen!==rendered) throw new Error('Frozen inspector predecessor differs from current capture');
} else await writeFile(out,rendered);
console.log(JSON.stringify({out,sha256:hash(rendered),sourceCount:paths.length,observationCount:observations.length,mode:Bun.argv.includes('--check')?'check':'capture',graph:observations.find(x=>x.label==='descriptor-graph-types-and-runtime-schema-gaps')?.value},null,2));
