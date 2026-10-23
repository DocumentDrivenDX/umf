// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the TypeScript descriptor codec predecessor; run from repository root with Bun.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readDescriptorSet,writeDescriptorSet,descriptorRoot,type DescriptorNode} from '../../../../../../src/adapters/protobuf/descriptor';

const out=resolve('docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/predecessor.json');
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const hex=(bytes:Uint8Array)=>Buffer.from(bytes).toString('hex');
const varint=(input:number)=>{const out:number[]=[];let n=BigInt(input);while(n>127n){out.push(Number(n&127n)|128);n>>=7n;}out.push(Number(n));return out;};
const fieldBytes=(field:number,wire:number,payload:number[])=>[...varint(field*8+wire),...(wire===2?[...varint(payload.length),...payload]:payload)];
const bytes=(values:number[])=>new Uint8Array(values);
const empty:DescriptorNode={type:descriptorRoot.typeName,fields:{},unknown:[]};
const results:any[]=[];
function capture(label:string,work:()=>unknown):void {
 try {
  const value=work();
  if(value instanceof Uint8Array)results.push({label,status:'ok',byteLength:value.length,bytesHex:hex(value)});
  else results.push({label,status:'ok',value});
 } catch(error) {
  const e=error as Error&{code?:string;path?:string};
  results.push({label,status:'error',name:e.name,code:e.code??null,path:e.path??null,message:e.message});
 }
}
const read=(label:string,input:Uint8Array)=>capture(label,()=>readDescriptorSet(input));
const write=(label:string,input:DescriptorNode)=>capture(label,()=>writeDescriptorSet(input));

const authored=new Uint8Array(await readFile('fixtures/protobuf/authored.pb'));
read('authored.pb',authored);
const authoredTree=readDescriptorSet(authored);
const authoredOutput=writeDescriptorSet(authoredTree);
capture('authored.pb-roundtrip-read',()=>readDescriptorSet(authoredOutput));
capture('authored.pb-roundtrip-bytes',()=>authoredOutput);
read('empty-input',new Uint8Array());
write('empty-descriptor-set',empty);

// Unknown scalar/fixed/length/group wire values, including a closed enum field under FileOptions.
const unknownControl=bytes(fieldBytes(50000,0,[0x96,0x01]));
read('unknown-varint-field-50000',unknownControl);
read('unknown-fixed64-field-50000',bytes(fieldBytes(50000,1,[1,2,3,4,5,6,7,8])));
read('unknown-length-field-50000',bytes(fieldBytes(50000,2,[0,1,2,255])));
const unknownGroup=bytes([...varint(50000*8+3),...fieldBytes(1,0,[7]),...varint(50000*8+4)]);
read('unknown-group-field-50000',unknownGroup);
capture('unknown-group-roundtrip-bytes',()=>{const output=writeDescriptorSet(readDescriptorSet(unknownGroup));return {bytesHex:hex(output),bytesSha256:hash(output)};});
const overlongUnknownVarint=bytes([...varint(50000*8),0x80,0x00]);
read('overlong-unknown-varint-value',overlongUnknownVarint);
capture('overlong-unknown-varint-roundtrip-bytes',()=>{const output=writeDescriptorSet(readDescriptorSet(overlongUnknownVarint));return {bytesHex:hex(output),bytesSha256:hash(output)};});
read('eleven-byte-unknown-varint-value',bytes([...varint(50000*8),...new Array(10).fill(0x80),0x00]));
const closedEnum=bytes(fieldBytes(1,2,fieldBytes(8,2,fieldBytes(9,0,[99]))));
read('closed-enum-file-options-optimize-for-99',closedEnum);
capture('closed-enum-unknown-roundtrip-bytes',()=>{const output=writeDescriptorSet(readDescriptorSet(closedEnum));return {bytesHex:hex(output),bytesSha256:hash(output)};});
read('duplicate-singular-file-name',bytes(fieldBytes(1,2,[...fieldBytes(1,2,[97]),...fieldBytes(1,2,[98])])));
const overlongEmptyFile=bytes([0x0a,0x80,0x00]);
read('overlong-but-accepted-length-varint',overlongEmptyFile);
capture('overlong-length-canonicalized-on-write',()=>{const output=writeDescriptorSet(readDescriptorSet(overlongEmptyFile));return {inputHex:hex(overlongEmptyFile),outputHex:hex(output)};});

for(const [name,input] of Object.entries({
 'zero-tag':[0], 'overlong-tag':[0x80,0], 'overlong-length':[0x0a,0x80,0], 'truncated-varint':[0x0a,0x01,0x80], 'truncated-length':[0x0a,0x05,0x01],
 'unmatched-end-group':[...varint(50000*8+4)], 'mismatched-group-end':[...varint(50000*8+3),...varint(50001*8+4)], 'unterminated-group':[...varint(50000*8+3)], 'invalid-wire-type':[...varint(50000*8+6)],
})) read(`malformed-${name}`,bytes(input));

for(const [label,node] of [
 ['wrong-root-type',{...empty,type:'google.protobuf.FileDescriptorProto'}],
 ['unknown-root-property',{...empty,future:true}],
 ['unknown-node-property',{...empty,unknown:[{number:1,wireType:0,data:'01',future:true}] as any}],
 ['bad-unknown-number',{...empty,unknown:[{number:0,wireType:0,data:'00'}]}],
 ['bad-unknown-wire-type',{...empty,unknown:[{number:1,wireType:6,data:'00'}]}],
 ['bad-unknown-hex',{...empty,unknown:[{number:1,wireType:0,data:'0A'}]}],
 ['malformed-unknown-varint',{...empty,unknown:[{number:50000,wireType:0,data:'80'}]}],
 ['unknown-end-group',{...empty,unknown:[{number:50000,wireType:4,data:''}]}],
 ['unknown-unclosed-group',{...empty,unknown:[{number:50000,wireType:3,data:''}]}],
 ['unknown-enum-tree',{...empty,fields:{file:[{type:'google.protobuf.FileDescriptorProto',fields:{options:{type:'google.protobuf.FileOptions',fields:{optimize_for:99},unknown:[]}},unknown:[]}]}}],
] as any[]) write(`write-${label}`,node as DescriptorNode);

// Exercise depth, binary byte bounds, and expanded hexadecimal representation size.
for(const depth of [1,20,30,35,40,41,42,43,44,45,48,50,52,54,56,58,60,70,75,80,84,85,86,87,88,89,90,94,95,96,97,98,99,100,101,127,128,129]) {
 let nested:number[]=[];
 for(let i=0;i<depth;i++)nested=fieldBytes(3,2,nested);
 const input=bytes(fieldBytes(1,2,fieldBytes(4,2,nested)));
 capture(`nested-descriptor-depth-${depth}`,()=>{const node=readDescriptorSet(input);const output=writeDescriptorSet(node);return {inputBytes:input.length,outputBytes:output.length,outputSha256:hash(output)};});
}
for(const payloadSize of [1_999_996,1_999_997,3_999_990,3_999_991,3_999_993,3_999_994]) {
 const data=bytes(fieldBytes(50000,2,new Array(payloadSize).fill(0)));
 capture(`large-unknown-length-${payloadSize}`,()=>{
  const node=readDescriptorSet(data);
  const raw=(node.unknown[0]?.data??'');
  return {inputBytes:data.length,hexCharacters:raw.length,hexSha256:hash(raw),prefix:raw.slice(0,32),suffix:raw.slice(-32)};
 });
 capture(`large-unknown-read-write-${payloadSize}`,()=>{const node=readDescriptorSet(data);const output=writeDescriptorSet(node);return {inputBytes:data.length,treeHexCharacters:node.unknown[0]!.data.length,outputBytes:output.length,outputSha256:hash(output)};});
 const node:DescriptorNode={type:descriptorRoot.typeName,fields:{},unknown:[{number:50000,wireType:2,data:hex(bytes([...varint(payloadSize),...new Array(payloadSize).fill(0)]))}]};
 capture(`large-unknown-write-${payloadSize}`,()=>{const output=writeDescriptorSet(node);return {inputHexCharacters:node.unknown[0]!.data.length,outputBytes:output.length,outputSha256:hash(output)};});
}

const fixtureManifest=JSON.parse(await readFile('fixtures/protobuf/upstream/manifest.json','utf8'));
const sourcePaths=[...new Set(['package.json','bun.lock','src/adapters/protobuf/descriptor.ts','src/adapters/protobuf/index.ts','tests/protobuf/descriptor.test.ts','tests/protobuf/behavior.test.ts','fixtures/protobuf/authored.pb','fixtures/protobuf/descriptor-results.json','fixtures/protobuf/behavior-results.json','fixtures/protobuf/upstream/manifest.json',...Object.keys(fixtureManifest.sha256).map(path=>'fixtures/protobuf/upstream/'+path),'scripts/protobuf-behavior-oracle.py','scripts/protobuf-schema.ts','spec/extensions/protobuf/schema.json','spec/extensions/protobuf/package.json','docs/helix/02-design/contracts/CONTRACT-003-protobuf.md','docs/helix/02-design/technical-designs/TD-003-protobuf-descriptors.md','docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/capture.ts'])].sort();
const sources=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(path))])));
const bufFiles=[...new Bun.Glob('**/*').scanSync('node_modules/@bufbuild/protobuf')].filter(path=>!path.endsWith('/')).sort();
const bufPackageClosure=Object.fromEntries(await Promise.all(bufFiles.map(async path=>[path,hash(await readFile('node_modules/@bufbuild/protobuf/'+path))])));
const runtimePackage=JSON.parse(await readFile('node_modules/@bufbuild/protobuf/package.json','utf8'));
const protocVersion=spawnSync('protoc',['--version'],{encoding:'utf8'});
const protocControl=(label:string,input:Uint8Array)=>{
 const result=spawnSync('protoc',['--decode_raw'],{input,encoding:'utf8'});
 return {label,inputHex:hex(input),inputSha256:hash(input),status:result.status,stdout:result.stdout,stderr:result.stderr,error:result.error?.message??null};
};
const nativeOracleControls=[
 protocControl('unknown-varint-field',unknownControl),
 protocControl('closed-enum-as-unknown-at-wire-level',closedEnum),
 protocControl('overlong-known-length-varint',overlongEmptyFile),
 protocControl('overlong-unknown-varint-11-byte',bytes([...varint(50000*8),...new Array(10).fill(0x80),0x00])),
];
const pythonOracle=spawnSync('python/.venv/bin/python',['scripts/protobuf-behavior-oracle.py','fixtures/protobuf/authored.pb','fixtures/protobuf/authored.pb'],{encoding:'utf8'});
const pythonOracleResult={command:'python/.venv/bin/python scripts/protobuf-behavior-oracle.py fixtures/protobuf/authored.pb fixtures/protobuf/authored.pb',status:pythonOracle.status,stdout:pythonOracle.stdout,stderr:pythonOracle.stderr,error:pythonOracle.error?.message??null};
const report={capture:'R5 Protobuf descriptor codec TypeScript predecessor',runtime:{bun:Bun.version,bufbuildProtobuf:runtimePackage.version,bufPackageFiles:bufFiles.length,bufPackageClosureSha256:hash(JSON.stringify(bufPackageClosure)),protoc:protocVersion.stdout.trim()},limits:{binaryMaxBytes:4_000_000,coreDepth:128,coreValues:100_000,coreMaxTextUnits:4_000_000},sources,bufPackageClosure,authoredInput:{byteLength:authored.length,sha256:hash(authored)},nativeOracleControls,pythonOracle:pythonOracleResult,operations:results};
await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,sha256:hash(await readFile(out)),sourceCount:Object.keys(sources).length,operationCount:results.length,protoc:nativeOracleControls.map(c=>({label:c.label,status:c.status,error:c.error,stderr:c.stderr})),pythonOracle:pythonOracleResult.stderr,errors:results.filter(r=>r.status==='error').map(r=>({label:r.label,code:r.code,message:r.message})),large:results.filter(r=>r.label.startsWith('large-unknown')).map(r=>({label:r.label,status:r.status,value:r.value}))},null,2));
