// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCoreDatasetValues,validateCoreFieldValue} from '../src/index-node-v4';
import {dataset} from './typed-access-shared-dataset';
const root='fixtures/umf-typed-access/';
const models=JSON.parse(readFileSync(root+'models.json','utf8')),corpus=JSON.parse(readFileSync(root+'corpus.json','utf8'));
const name=process.argv[2]!;assert.ok(Object.hasOwn(corpus.datasets,name));
const rows=corpus.datasets[name],model=models[name==='truth'||name==='missing'?'propertyStore':'relational'];
let assertions=0,fields=0;
const equal=(actual:unknown,expected:unknown)=>{assert.equal(actual,expected,name);assertions++;};
const original=dataset(model,rows),receipt=validateCoreDatasetValues(model,original as any);
const hasTemporal=rows.some((row:any)=>['day','instant','local'].some(field=>row[field]!=null));
equal(receipt.datasetValidation.valid,!hasTemporal);
const errors=receipt.datasetValidation.diagnostics.filter(d=>d.severity==='error');
equal(errors.every(d=>d.code==='CORE_SCHEMA_PROPERTIES'&&d.message.includes('temporal')),true);
for(const row of original.records)for(const value of row.values)if(value.state==='present'){
 const result=validateCoreFieldValue(model,value.field,(value as any).value);
 const temporal=['day','instant','local'].includes(value.field.element)&&(value as any).value!==null;
 equal(result.valid,!temporal);fields++;
}
equal(receipt.datasetValidation.complete,false);
const bad=dataset(model,rows) as any;bad.records[0].values.find((value:any)=>value.field.element==='id').value={integerToken:'1'};
equal(validateCoreDatasetValues(model,bad).datasetValidation.valid,false);
const duplicate=dataset(model,rows) as any;duplicate.records.push({...structuredClone(duplicate.records[0]),instanceId:'duplicate-key'});
equal(validateCoreDatasetValues(model,duplicate).datasetValidation.diagnostics.some(d=>d.code.includes('KEY')),true);
console.log(JSON.stringify({name,records:rows.length,fields,assertions}));
