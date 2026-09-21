import {recordCase} from './record-tablespec-cases';
import {copyJson} from '../../src/model/json';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {type Document} from '../../src/model/types';
import {type RecordPostgresqlRequest} from '../../src/core-ideals/record-postgresql-projection';
export function postgresqlRecordCase(tableName='Orders',empty=false){
 const {source}=recordCase();source.modules[0]!.elements[0]!.name=tableName;
 if(empty){source.modules[0]!.elements[0]!.references=[];source.modules.pop();}
 const declare=(module:string,element:string,kind:'record'|'field')=>{const before=copyJson(source) as unknown as Document;delete before.modules.find(m=>m.id===module)!.elements.find(e=>e.id===element)!.kind;return declareCoreElementKind(before,{module,element},kind);};
 const author=declare('sales','Order','record');
 const request:RecordPostgresqlRequest={id:'native-'+tableName,namespace:'sales',tableName,mode:'strict',fields:empty?[]:[{author:declare('fields','active','field'),columnName:'active',nativeType:'boolean'},{author:declare('fields','label','field'),columnName:'label',nativeType:'text'},{author:declare('fields','id','field'),columnName:'id',nativeType:'bigint'}]};
 return {source,author,request};
}
export function postgresqlRecordProjectionCases(){
 const cases=[];
 for(const mode of ['strict','report'] as const)for(const variant of ['clean','mismatch','missing']){const c=postgresqlRecordCase('record_'+cases.length);c.request.mode=mode;if(variant==='mismatch')c.request.fields[0]!.nativeType='integer';if(variant==='missing')c.request.fields.pop();cases.push({...c,variant});}
 cases.push({...postgresqlRecordCase('empty_record',true),variant:'empty'});return cases;
}
