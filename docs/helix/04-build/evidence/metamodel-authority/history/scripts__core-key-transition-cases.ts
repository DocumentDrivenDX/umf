import type {Document} from '../src/model/types';
const collisions=[null,false,0,'',[],{},'future',{fields:[{module:'m',element:'id'}]},[{id:'old',name:'Looks valid',fields:[{module:'m',element:'id'}]}],{unknown:{raw:'9007199254740993',key:['retained']}}];
export function keyTransitionSource(value:unknown):Document{
 return {umf:'0.5.0',id:'transition',vocabularies:{future:{version:'1.0.0'}},extensions:{future:{keys:{native:true},members:[null,false]}},keys:{root:'opaque'},modules:[{id:'m',namespace:'sales',members:{module:'opaque'},elements:[
  {id:'record',kind:'record',key:value,keys:value,members:value,references:[{role:'contains',module:'m',element:'id'}],extensions:{future:{key:value as any}}},
  {id:'id',kind:'field',scalarType:'integer',nullability:'required',cardinality:'one',facets:{integerWidth:{bits:64,signed:true}},key:value,keys:value,members:value,extensions:{}},
  {id:'group',kind:'group',key:value,keys:value,members:value,extensions:{}},
 ]}]};
}
export function keyTransitionCases(){return collisions.map((value,index)=>({id:'collision-'+index,source:keyTransitionSource(value),value}));}
