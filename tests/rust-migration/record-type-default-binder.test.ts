import {test,expect} from 'bun:test';
import {bindCoreRecordTypeRust} from '../../src/access/rust-record-type-default';

test('Record Type verification prepares receipt before admitting current and discards on current admission failure',()=>{
 const calls:string[]=[];let discarded=0;
 const engine={
  declareCoreRecordType:()=>({}),
  prepareCoreRecordTypeVerification:(receipt:unknown)=>{calls.push('prepare');expect(receipt).toEqual({receipt:true});return Object.freeze({});},
  finishCoreRecordTypeVerification:()=>{calls.push('finish');return {};},
  discardCoreRecordTypeVerification:()=>{discarded++;calls.push('discard');},
 };
 const api=bindCoreRecordTypeRust(engine as any);
 const current=new Proxy({}, {ownKeys(){calls.push('current-admit');throw new Error('copy failed');}});
 expect(()=>api.verifyCoreRecordTypeDeclaration({receipt:true} as any,current as any)).toThrow('copy failed');
 expect(calls).toEqual(['prepare','current-admit','discard']);
 expect(discarded).toBe(1);
});

test('Record Type declaration admits Field author before Record author',()=>{
 const calls:string[]=[];
 const engine={
  declareCoreRecordType:()=>{calls.push('declare');return {};},
  prepareCoreRecordTypeVerification:()=>Object.freeze({}),
  finishCoreRecordTypeVerification:()=>({}),
 };
 const api=bindCoreRecordTypeRust(engine as any);
 const field=new Proxy({}, {ownKeys(){calls.push('field-admit');throw new Error('bad field');}});
 const record=new Proxy({}, {ownKeys(){calls.push('record-admit');return [];}});
 expect(()=>api.declareCoreRecordType(field as any,record as any)).toThrow('bad field');
 expect(calls).toEqual(['field-admit']);
});
