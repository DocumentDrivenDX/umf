// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {importAvroSchema,projectAvroToTableSpec,projectTableSpecToAvro,type AvroTableSpecPolicy,type TableSpecAvroPolicy,UmfError} from '../../src/index-node-v4';

test('Avro ↔ TableSpec public Node projections use the native family route with explicit loss and refusal',()=>{
 const source=importAvroSchema(JSON.stringify({type:'record',name:'Order',namespace:'example',fields:[{name:'id',type:'string'},{name:'count',type:'int'},{name:'optional',type:['null','string']}]}),{id:'orders'});
 const forwardPolicy:AvroTableSpecPolicy={id:'orders-table',tableName:'Orders',lossPolicy:'allow-reported-loss',fields:{id:{name:'id',representation:'string'},count:{name:'count',representation:'integer32'},optional:{name:'optional',representation:'string'}}};
 const forward=projectAvroToTableSpec(source,forwardPolicy);
 expect(forward.status).toBe('projected');expect(forward.source).toEqual(source);expect(forward.target).toBeDefined();expect(forward.issues.some(issue=>issue.code==='SCHEMA_ONLY')).toBe(true);expect(JSON.parse(forward.nativeSchema!).columns[2].nullable).toBe(true);
 const reversePolicy:TableSpecAvroPolicy={id:'orders-avro',recordName:'Order',namespace:'example',lossPolicy:'allow-reported-loss',fields:{id:{name:'id',representation:'string',nullable:'source'},count:{name:'count',representation:'int32',nullable:'source'},optional:{name:'optional',representation:'string',nullable:'source'}}};
 const reverse=projectTableSpecToAvro(forward.target!,reversePolicy);
 expect(reverse.status).toBe('projected');expect(reverse.source).toEqual(forward.target);expect(reverse.target).toBeDefined();expect(reverse.issues.some(issue=>issue.code==='TABLESPEC_EXECUTION')).toBe(true);expect(JSON.parse(reverse.nativeSchema!).fields.map((field:any)=>field.name)).toEqual(['id','count','optional']);
 const strict=projectAvroToTableSpec(source,{...forwardPolicy,lossPolicy:'strict'});expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
 const unsupported=projectTableSpecToAvro(forward.target!,{...reversePolicy,fields:{count:{name:'count',representation:'date',nullable:'source'}}});expect(unsupported.status).toBe('blocked');expect(unsupported.target).toBeUndefined();
 expect(()=>projectAvroToTableSpec(source,{...forwardPolicy,tableName:'_invalid'})).toThrow(UmfError);
},60_000);
