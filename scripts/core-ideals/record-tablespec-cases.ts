import {copyJson} from '../../src/model/json';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {type Document} from '../../src/model/types';
import {type RecordTableSpecRequest} from '../../src/core-ideals/record-tablespec-projection';
export function recordCase(){
 const source:Document={umf:'0.2.0',id:'orders',vocabularies:{},modules:[{id:'sales',namespace:'sales',elements:[{id:'Order',name:'Orders',description:'Order record',kind:'record',extensions:{},references:[{role:'member',module:'fields',element:'id'},{role:'member',module:'fields',element:'label'},{role:'member',module:'fields',element:'active'}]}]},{id:'fields',namespace:'sales',elements:[{id:'id',name:'id',kind:'field',scalarType:'integer',extensions:{}},{id:'label',name:'label',kind:'field',scalarType:'string',extensions:{}},{id:'active',name:'active',kind:'field',scalarType:'boolean',extensions:{}}]}]};
 const declare=(module:string,element:string,kind:'field'|'record')=>{const before=copyJson(source) as unknown as Document;delete before.modules.find(m=>m.id===module)!.elements.find(e=>e.id===element)!.kind;return declareCoreElementKind(before,{module,element},kind);};
 const author=declare('sales','Order','record');
 const request:RecordTableSpecRequest={id:'native-orders',tableName:'Orders',mode:'strict',fields:[{author:declare('fields','active','field'),columnName:'active',nativeType:'BOOLEAN'},{author:declare('fields','label','field'),columnName:'label',nativeType:'TEXT'},{author:declare('fields','id','field'),columnName:'id',nativeType:'INTEGER'}]};
 return {source,author,request};
}
