// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../../src/model/types';
export const PARENT={module:'m',element:'parent'},CHILD={module:'m',element:'child'};
export function uuidModel(kind='words64',system='postgresql',domain='uuid',signed=true):{logical:Document;binding:Document}{
 const p={module:'m',element:'parentId'},c={module:'m',element:'childId'},fk={module:'m',element:'parentRef'};
 const field=(id:string,required:boolean)=>({id,kind:'field',scalarType:domain,cardinality:'one',nullability:required?'required':'absent-allowed',extensions:{}});
 const logical:Document={umf:'0.10.0',id:'uuid-model',vocabularies:{},modules:[{id:'m',namespace:'model',elements:[
  {id:'parent',kind:'record',members:[p],keys:[{id:'pk',name:'parent key',fields:[p],primary:true}],extensions:{}},
  {id:'child',kind:'record',members:[c,fk],keys:[{id:'pk',name:'child key',fields:[c],primary:true}],extensions:{}},
  field('parentId',true),field('childId',true),field('parentRef',false)],relationships:[{id:'parentLink',name:'parentLink',source:[CHILD],target:[{...PARENT,key:'pk'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'unspecified',directed:true}]}]};
 const carrier=(prefix:string)=>kind==='words64'?{kind,highColumn:prefix+'_hi',lowColumn:prefix+'_lo',signed}:{kind,column:prefix};
 const binding:Document={umf:'0.10.0',id:'uuid-model-binding',vocabularies:{'umf.binding':{version:'0.3.0'}},modules:[],extensions:{'umf.binding':{
  profile:'umf-binding-3',logical:{documentId:logical.id,coreVersion:'0.10.0'},target:{system,version:system==='postgresql'?'17':system==='sqlserver'?'2022':system==='avro'?'1.12.0':system==='parquet'?'2.11.0':'1.0',subset:'uuid-model1'},
  elements:[{...PARENT,table:'parents'},{...CHILD,table:'children'}],fields:[{...p,storage:'scalar-carrier',carrier:carrier('id')},{...c,storage:'scalar-carrier',carrier:carrier('id')},{...fk,storage:'scalar-carrier',carrier:carrier('parent')}],
  relationships:[{module:'m',id:'parentLink',storage:'foreign_key',fields:[fk]}],indexes:[{name:'parent_lookup',kind:'btree',on:[{field:fk}],unique:false}]
 }}};
 return {logical,binding};
}
