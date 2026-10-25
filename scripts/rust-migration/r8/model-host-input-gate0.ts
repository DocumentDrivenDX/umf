// SPDX-License-Identifier: MIT OR Apache-2.0
// Gate0 predecessor event capture for the Rust-owned host-json protocol.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {schemaPropertiesFixture} from '../../core-schema-properties-cases';
import {declareCoreSchemaProperties} from '../../../src/model/schema-properties';

type Trace = {events:string[]; outcome:unknown};
const rows:Record<string,Trace> = {};
function capture(name:string, work:(events:string[])=>unknown):void {
  const events:string[]=[];
  try { rows[name]={events,outcome:{ok:true,value:work(events)}}; }
  catch(error) { rows[name]={events,outcome:{ok:false,sameSentinel:error===sentinel,name:(error as Error)?.name,message:(error as Error)?.message}}; }
}
const sentinel=new Error('gate0 raw host exception');
function observed<T extends object>(value:T,label:string,events:string[]):T {
  return new Proxy(value,{getPrototypeOf(target){events.push(`${label}.getPrototypeOf`);return Reflect.getPrototypeOf(target);},
    ownKeys(target){events.push(`${label}.ownKeys`);return Reflect.ownKeys(target);},
    getOwnPropertyDescriptor(target,key){events.push(`${label}.descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key);},
    get(target,key,receiver){events.push(`${label}.get:${String(key)}`);return Reflect.get(target,key,receiver);}});
}

capture('patch-refusal-before-source',events=>{
  const source=observed(schemaPropertiesFixture(),'source',events);
  const patch=observed({unknown:true},'patch',events);
  try { declareCoreSchemaProperties(source,{scope:'document'},patch as any); }
  catch(error) { return {sameSentinel:error===sentinel,name:(error as Error)?.name,message:(error as Error)?.message}; }
  throw new Error('Expected unknown patch refusal');
});

capture('patch-copy-before-source-with-host-throw',events=>{
  const source=observed(schemaPropertiesFixture(),'source',events);
  const patch=observed(Object.defineProperty({},'title',{enumerable:true,get(){events.push('patch.getter:title');throw sentinel;}}),'patch',events);
  try { declareCoreSchemaProperties(source,{scope:'document'},patch as any); }
  catch(error) { return {sameSentinel:error===sentinel,name:(error as Error)?.name,message:(error as Error)?.message}; }
  throw new Error('Expected patch getter refusal');
});

capture('successful-source-then-identity-then-declare',events=>{
  const source=observed(schemaPropertiesFixture(),'source',events);
  const identity=observed({scope:'document'},'identity',events);
  const patch=observed({title:'Gate0'},'patch',events);
  const result=declareCoreSchemaProperties(source,identity as any,patch as any);
  return {title:result.title,sourceTitle:(source as any).title};
});

capture('array-length-read-coercion',events=>{
  const patch:any={aliases:[]};
  const aliases=new Proxy(['x'],{get(target,key,receiver){if(key==='length')events.push('aliases.get:length');return Reflect.get(target,key,receiver);},
    getPrototypeOf(target){events.push('aliases.getPrototypeOf');return Reflect.getPrototypeOf(target);},
    ownKeys(target){events.push('aliases.ownKeys');return Reflect.ownKeys(target);},
    getOwnPropertyDescriptor(target,key){events.push(`aliases.descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key);}});
  patch.aliases=aliases;
  const result=declareCoreSchemaProperties(schemaPropertiesFixture(),{scope:'document'},patch);
  return {aliases:result.aliases};
});

capture('array-isarray-repeated-after-descriptor-snapshot',events=>{
  const {proxy,revoke}=Proxy.revocable([],{ownKeys(){events.push('aliases.ownKeys');return ['length'];},
    getOwnPropertyDescriptor(target,key){events.push(`aliases.descriptor:${String(key)}`);const descriptor=Reflect.getOwnPropertyDescriptor(target,key);revoke();return descriptor;}});
  const patch={aliases:proxy};
  try { declareCoreSchemaProperties(schemaPropertiesFixture(),{scope:'document'},patch as any); }
  catch(error) { return {name:(error as Error)?.name,message:(error as Error)?.message}; }
  throw new Error('Expected revoked array proxy refusal');
});

const sourceFiles=['src/model/json.ts','src/model/schema-properties.ts'];
const predecessorSources=Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(readFileSync(resolve(import.meta.dir,'../../..',file))).digest('hex')]));
const packet={profile:'umf.model-host-input-gate0/1',operation:'declareCoreSchemaProperties',predecessorSources,rows};
const out=process.argv[2];
if(out)writeFileSync(out,JSON.stringify(packet,null,2)+'\n');
else process.stdout.write(JSON.stringify(packet,null,2)+'\n');
