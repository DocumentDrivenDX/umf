// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed private archive replay of the frozen eleven-function Bit128/UUID packet.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const entry=process.env.UMF_R8_BIT128_ENTRY;
const receiptPath=process.env.UMF_R8_BIT128_RECEIPT;
if(!entry)throw new Error('UMF_R8_BIT128_ENTRY is required');
const packetPath='scripts/rust-migration/r5/bit128-default-route/predecessor.json';
const packet=JSON.parse(await readFile(packetPath,'utf8'));
const root=await import(pathToFileURL(entry).href);
const names=['parseBits128','parseUuid','bits128FromBytes','bits128ToBytes','uuidFromBits128','uuidToBits128','compareBits128','bits128ToWords','bits128FromWords','bits128ToInteger','bits128FromInteger'];
assert.deepEqual(packet.publicFunctions,names);
const hex='8000000000000000ffffffffffffffff', uuidText='80000000-0000-0000-ffff-ffffffffffff';
const bitValue=root.parseBits128(hex), uuidValue=root.parseUuid(uuidText);
const wordsUnsigned=root.bits128ToWords(bitValue,false),wordsSigned=root.bits128ToWords(bitValue,true);
const integerUnsigned=root.bits128ToInteger(bitValue,false),integerSigned=root.bits128ToInteger(bitValue,true);
const viewBacking=Uint8Array.from({length:20},(_,i)=>i),view=new Uint8Array(viewBacking.buffer,2,16),fromView=root.bits128FromBytes(view);view[0]=255;
const isolated=root.bits128ToBytes(fromView);
const shape=value=>({prototype:Object.getPrototypeOf(value)===Object.prototype?'Object.prototype':Object.getPrototypeOf(value)===null?'null':Object.getPrototypeOf(value)?.constructor?.name??'other',frozen:Object.isFrozen(value),keys:Object.keys(value),descriptors:Object.fromEntries(Object.keys(value).map(k=>[k,Object.getOwnPropertyDescriptor(value,k)?.writable===false?'readonly':'mutable']))});
function normalize(value){if(value instanceof Uint8Array)return {type:value.constructor.name,bytes:Array.from(value),shape:shape(value)};if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object')return {...Object.fromEntries(Object.keys(value).map(k=>[k,normalize(value[k])])),$shape:shape(value)};return value;}
function outcome(fn){try{return {ok:true,value:normalize(fn())}}catch(e){return {ok:false,error:{name:e?.name,code:e?.code,message:e?.message,...(Object.hasOwn(e,'path')?{path:e.path}:{})}}}}
const cases={
 parseBits128:outcome(()=>root.parseBits128(hex.toUpperCase())),
 parseUuid:outcome(()=>root.parseUuid(uuidText.toUpperCase())),
 bits128FromBytes:outcome(()=>fromView),
 bits128ToBytes:outcome(()=>root.bits128ToBytes(bitValue)),
 uuidFromBits128:outcome(()=>root.uuidFromBits128(bitValue)),
 uuidToBits128:outcome(()=>root.uuidToBits128(uuidValue)),
 compareBits128:outcome(()=>[root.compareBits128(root.parseBits128('0'.repeat(32)),bitValue),root.compareBits128(bitValue,bitValue),root.compareBits128(bitValue,root.parseBits128('f'.repeat(32)))]),
 bits128ToWords:outcome(()=>({unsigned:wordsUnsigned,signed:wordsSigned,unsignedShape:shape(wordsUnsigned),signedShape:shape(wordsSigned)})),
 bits128FromWords:outcome(()=>({unsigned:root.bits128FromWords(wordsUnsigned,false),signed:root.bits128FromWords(wordsSigned,true)})),
 bits128ToInteger:outcome(()=>({unsigned:integerUnsigned,signed:integerSigned,unsignedShape:shape(integerUnsigned),signedShape:shape(integerSigned)})),
 bits128FromInteger:outcome(()=>({zero:root.bits128FromInteger({integerToken:'0'},false),maxUnsigned:root.bits128FromInteger({integerToken:'340282366920938463463374607431768211455'},false),minSigned:root.bits128FromInteger({integerToken:'-170141183460469231731687303715884105728'},true)})),
};
for(const name of names)assert.deepEqual(cases[name],packet.cases[name],`${name} frozen predecessor mismatch`);
assert.equal(fromView.hex,'02030405060708090a0b0c0d0e0f1011');
assert.equal(isolated[0],2,'input view was not snapshotted');
isolated[0]=77;assert.equal(root.bits128ToBytes(fromView)[0],2,'returned bytes alias engine value');
class ByteSubclass extends Uint8Array {}
assert.equal(root.bits128FromBytes(new ByteSubclass(new Uint8Array(16))).hex,'0'.repeat(32));
const bufferInput=typeof Buffer==='undefined'?'unavailable':(()=>{const b=Buffer.alloc(16);b[0]=9;const value=root.bits128FromBytes(b);b[0]=0;assert.equal(root.bits128ToBytes(value)[0],9);return 'accepted-and-copied';})();
const errorEnvelope=error=>({name:error.name,code:error.code,message:error.message,...(Object.hasOwn(error,'path')?{path:error.path}:{})});
const invalidOutcome=outcome(()=>root.parseBits128(1));
assert.deepEqual(invalidOutcome,{ok:false,error:{name:'UmfError',code:'BIT128_TYPE',message:'Expected hexadecimal text',path:''}},'genuine engine refusal envelope or public error mapping changed');
assert(invalidOutcome.ok===false);
const accessorWords={low:'0'.repeat(16)};Object.defineProperty(accessorWords,'high',{enumerable:true,get(){throw new Error('getter must not execute')}});
let genuineAdmission;try{root.bits128FromWords(accessorWords,false)}catch(e){genuineAdmission=e}
assert(genuineAdmission instanceof root.UmfError,'genuine Bit128 admission refusal did not map to public UmfError');
assert.deepEqual(errorEnvelope(genuineAdmission),{name:'UmfError',code:'BIT128_TYPE',message:'Word accessors are forbidden',path:''});
function callerTrapError(name,code,path){let reads=0;const target=Object.assign(new Error('caller proxy failure'),{name,code,path});const sentinel=new Proxy(target,{get(t,k,r){reads++;return Reflect.get(t,k,r)}});const words=new Proxy({high:'0'.repeat(16),low:'0'.repeat(16)},{ownKeys(){throw sentinel}});let caught;try{root.bits128FromWords(words,false)}catch(e){caught=e}assert.strictEqual(caught,sentinel,`${name} caller error identity rewritten`);assert.equal(reads,0,`${name} caller error fields were read`);return {preservedIdentity:true,propertyReads:reads};}
const forged={admission:callerTrapError('AdmissionError','ACCESSOR_PROPERTY','/args/words/high'),umfCore:callerTrapError('UmfCoreError','BIT128_TYPE','/words')};
const receipt={status:'pass',runtime:typeof Bun==='undefined'?`Node ${process.version}`:`Bun ${Bun.version}`,entrySha256:createHash('sha256').update(await readFile(entry)).digest('hex'),packetSha256:createHash('sha256').update(await readFile(packetPath)).digest('hex'),sourceClosure:packet.sourceClosure??null,publicFunctions:names,caseCount:Object.keys(cases).length,exactFrozenPacketParity:true,hostChecks:{genuineEngineError:{publicInstance:true,envelope:invalidOutcome.error},genuineAdmissionError:{publicInstance:true,envelope:errorEnvelope(genuineAdmission)},forgedCallerErrors:forged,byteCarrier:{offsetViewCopied:true,outputCopied:true,typedArraySubclass:'accepted',nodeBuffer:bufferInput}},qualification:'Installed private archive route evidence for eleven Bit128/UUID operations on this host only; not whole-SDK or release qualification.'};
if(receiptPath)await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
