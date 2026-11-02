// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {decodeBit128FileRecord,encodeBit128FileRecord,projectBit128CarrierSchema,projectBit128Model,recoverBit128CarrierProjection,recoverBit128ModelProjection,UmfError} from '../../src/index-node-v4';
import {uuidModel,PARENT} from '../helpers/uuid-model-fixtures';
import {uuidBinding,uuidDocument,FIELD,UUID} from '../helpers/uuid-fixtures';

test('public Bit128 carrier, model and file routes preserve ordinary source and reject an unknown Record',()=>{
 const model=uuidModel('native-uuid','parquet');
 const modelProjection=projectBit128Model(model.binding,model.logical,'report');
 expect(modelProjection.status).toBe('reported');
 expect(recoverBit128ModelProjection(modelProjection,modelProjection.candidate!.text)).toEqual(model);
 const values=[{field:{module:'m',element:'parentId'},value:{uuid:UUID}}];
 const native=encodeBit128FileRecord(model.binding,model.logical,PARENT,values);
 expect(decodeBit128FileRecord(model.binding,model.logical,PARENT,native)).toEqual(values);
 expect(()=>decodeBit128FileRecord(model.binding,model.logical,{module:'m',element:'missing'},native)).toThrow(UmfError);

 const source=uuidDocument(),binding=uuidBinding('native-uuid');
 (binding.extensions!['umf.binding'] as any).target={system:'postgresql',version:'17.6',subset:'uuid-carrier1'};
 const carrier=projectBit128CarrierSchema(binding,source,FIELD,{lossPolicy:'strict',obligations:['bits']});
 expect(carrier.status).toBe('projected');
 expect(recoverBit128CarrierProjection(carrier,carrier.candidate!.text)).toEqual({logical:source,binding});
},120_000);
