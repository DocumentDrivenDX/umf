// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {classifyBit128NativeType,declareCoreBit128Field,encodeBit128Record,decodeBit128Record,UmfError} from '../../src/index-node-v4';
import {uuidDocument,uuidBinding,FIELD} from '../helpers/uuid-fixtures';

test('public native Bit128 type classification requires catalog identity and retains source',()=>{
 const source={system:'postgresql' as const,version:'17.6',definition:{schema:'pg_catalog',name:'uuid',kind:'b'}};
 expect(classifyBit128NativeType(source)).toEqual({source,scalarType:'uuid',basis:'native-type-identity'});
 expect(classifyBit128NativeType({system:'postgresql',version:'17.6',definition:{schema:'app',name:'uuid',kind:'b'}})).toEqual({source:{system:'postgresql',version:'17.6',definition:{schema:'app',name:'uuid',kind:'b'}},basis:'unclassified'});
 expect(()=>classifyBit128NativeType({system:'unknown',version:'1',definition:null} as never)).toThrow(UmfError);
});

test('public Bit128 Field declaration uses the Rust model route and refuses unsupported source',()=>{
 const source=uuidDocument('binary');
 const declared=declareCoreBit128Field(source,FIELD,'uuid');
 expect(declared).not.toBe(source);expect(declared.modules[0]!.elements[1]!.scalarType).toBe('uuid');
 const retired=uuidDocument('binary');(retired as {umf:string}).umf='0.9.0';
 expect(()=>declareCoreBit128Field(retired,FIELD,'uuid')).toThrow(UmfError);
});


test('public native Bit128 full-row route encodes, decodes and refuses in Rust',()=>{
 const logical=uuidDocument('uuid'),binding=uuidBinding('native-uuid');
 (binding.extensions!['umf.binding'] as any).target={system:'postgresql',version:'17.6',subset:'uuid-model1'};
 const identity={module:'m',element:'record'},values=[{field:FIELD,value:{uuid:'00112233-4455-6677-8899-aabbccddeeff'}}];
 const slots=encodeBit128Record(binding,logical,identity,values);
 expect(slots).toEqual({id:'00112233-4455-6677-8899-aabbccddeeff'});
 expect(decodeBit128Record(binding,logical,identity,slots)).toEqual(values);
 expect(()=>decodeBit128Record(binding,logical,identity,{...slots,extra:'x'})).toThrow(UmfError);
},60_000);
