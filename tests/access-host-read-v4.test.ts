import {describe,expect,it} from 'bun:test';
import {createPythonClientHostReadV4} from '../src/access/rust-host-reads-v4';
// @ts-expect-error The JavaScript binding deliberately has no generated declaration.
import {createHostReadResponseFrames} from '../bindings/core/node/src/wire.js';

const source='{"umf":"0.10.0"}';

describe('Python client host-read V4',()=>{
 it('treats only nullish selections as absent and preserves invalid-selection TypeErrors',()=>{
  for(const key of ['records','actions'] as const){
   const absent=createPythonClientHostReadV4({text:source,package:'shop',[key]:null} as any);
   expect(absent.read(key==='records'?'SelectRecordsStart':'SelectActionsStart')).toBe(null);
   for(const value of [false,0,'']){
    const host=createPythonClientHostReadV4({text:source,package:'shop',[key]:value} as any);
    expect(host.read(key==='records'?'SelectRecordsStart':'SelectActionsStart')).toEqual({kind:'umf.host-abort/3'});
    let caught:unknown;try{host.rethrowIfAborted();}catch(error){caught=error;}
    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as Error).message).toBe('Selection must be an array');
   }
  }
 });
 it('resource refusal transport accepts only the closed enumerable V4 descriptor',()=>{
  const encode=(value:unknown)=>createHostReadResponseFrames(()=>value).dispatcher('test');
  expect(encode({kind:'umf.host-resource-limit/4',path:'records'})).toBe('UMF-HOST-READ-V4|resource|records');
  const hidden=Object.defineProperties({}, {
   kind:{value:'umf.host-resource-limit/4',enumerable:false},
   path:{value:'records',enumerable:true},
  });
  expect(()=>encode(hidden)).toThrow('Host-read value is outside the closed V3 response set');
  expect(()=>encode({kind:'umf.host-resource-limit/4',path:'unknown'})).toThrow('Host-read value is outside the closed V3 response set');
 });
 it('refuses raw record positions before indexing and counts sparse slots',()=>{
  let reads=0,lengthReads=0;
  const records=new Proxy(new Array(10_001),{get(target,key,receiver){if(key==='length'){lengthReads++;return Reflect.get(target,key,receiver);}if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key,receiver);}});
  const host=createPythonClientHostReadV4({text:source,package:'shop',records} as any);
  expect(host.read('SelectRecordsStart')).toBe('10001');
  expect(lengthReads).toBe(1);
  expect(reads).toBe(0);
 });

 it('uses captured length, sees unread mutations, and ignores appends',()=>{
  const records:any[]=[{module:'m',element:'a'},{module:'m',element:'b'}];
  Object.defineProperty(records,'0',{configurable:true,enumerable:true,get(){records[1]={module:'m',element:'changed'};records.push({module:'m',element:'late'});return {module:'m',element:'first'};}});
  const host=createPythonClientHostReadV4({text:source,package:'shop',records} as any);
  expect(host.read('SelectRecordsStart')).toBe('2');
  expect(host.read('SelectRecordAt','0:4000000')).toBe('m.first');
  expect(host.read('SelectRecordAt','1:3999993')).toBe('m.changed');
 });

 it('returns duplicates as bounded per-position strings for Rust metering before deduplication',()=>{
  const identity={module:'x'.repeat(1_000_000),element:''};
  const host=createPythonClientHostReadV4({text:source,package:'shop',records:[identity,identity,identity,identity]} as any);
  expect(host.read('SelectRecordsStart')).toBe('4');
  for(let i=0;i<3;i++)expect(host.read('SelectRecordAt',`${i}:${4_000_000-i*1_000_001}`)).toBe(`${identity.module}.`);
  expect(host.read('SelectRecordAt','3:999997')).toEqual({kind:'umf.host-resource-limit/4',path:'records'});
 });

 it('refuses one oversized selected identity before returning it to Rust',()=>{
  const host=createPythonClientHostReadV4({text:source,package:'shop',records:[{module:'x'.repeat(4_000_001),element:''}]} as any);
  expect(host.read('SelectRecordsStart')).toBe('1');
  expect(host.read('SelectRecordAt','0:4000000')).toEqual({kind:'umf.host-resource-limit/4',path:'records'});
 });

 it('carries selected UTF-16 text usage from records into actions',()=>{
  const host=createPythonClientHostReadV4({text:source,package:'shop',records:Array.from({length:3},()=>({module:'x'.repeat(1_300_000),element:''})),actions:[{module:'y'.repeat(200_000),action:''}]} as any);
  expect(host.read('SelectRecordsStart')).toBe('3');
  expect(host.read('SelectRecordAt','0:4000000')).toBe('x'.repeat(1_300_000)+'.');
  expect(host.read('SelectRecordAt','1:2699999')).toBe('x'.repeat(1_300_000)+'.');
  expect(host.read('SelectRecordAt','2:1399998')).toBe('x'.repeat(1_300_000)+'.');
  expect(host.read('SelectActionsStart')).toBe('1');
  expect(host.read('SelectActionAt','0:99997')).toEqual({kind:'umf.host-resource-limit/4',path:'actions'});
 });

 it('ignores caller map/iterator behavior and uses the captured array index path',()=>{
  const records:any[]=[{module:'m',element:'x'}];
  Object.defineProperty(records,'map',{get(){throw new Error('map must not run');}});
  records[Symbol.iterator]=()=>{throw new Error('iterator must not run');};
  const host=createPythonClientHostReadV4({text:source,package:'shop',records} as any);
  expect(host.read('SelectRecordsStart')).toBe('1');
  expect(host.read('SelectRecordAt','0:4000000')).toBe('m.x');
 });

 it('does not depend on mutable Array.prototype.push after module initialization',()=>{
  const original=Array.prototype.push;
  try{
   Array.prototype.push=(()=>{throw new Error('poisoned push');}) as any;
   const host=createPythonClientHostReadV4({text:source,package:'shop',records:[{module:'m',element:'x'}]} as any);
   expect(host.read('SelectRecordsStart')).toBe('1');
   expect(host.read('SelectRecordAt','0:4000000')).toBe('m.x');
  }finally{Array.prototype.push=original;}
 });

 it('preserves the identity of an indexed getter exception',()=>{
  const thrown={};
  const records:any[]=[];
  Object.defineProperty(records,'0',{get(){throw thrown;}});
  Object.defineProperty(records,'length',{value:1});
  const host=createPythonClientHostReadV4({text:source,package:'shop',records} as any);
  expect(host.read('SelectRecordsStart')).toBe('1');
  expect(host.read('SelectRecordAt','0:4000000')).toEqual({kind:'umf.host-abort/3'});
  let caught:unknown;try{host.rethrowIfAborted();}catch(error){caught=error;}
  expect(caught).toBe(thrown);
 });
});
