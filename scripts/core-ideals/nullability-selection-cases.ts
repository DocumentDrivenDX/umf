import type {Document,CoreElementQuery} from '../../src';
export function nullabilitySelectionCases(){
 const source:Document={umf:'0.3.0',id:'availability-selection',vocabularies:{future:{version:'1.0.0'}},modules:[
  {id:'sales',namespace:'sales',elements:[
   {id:'Order',kind:'record',extensions:{},references:[{role:'member',module:'sales',element:'required'},{role:'member',module:'sales',element:'optional'}]},
   {id:'required',name:'value',kind:'field',nullability:'required',extensions:{future:{nativeNull:false}},references:[{role:'future-link',module:'support',element:'required',future:true}]},
   {id:'optional',name:'value',kind:'field',nullability:'absent-allowed',extensions:{future:{nativeNull:true}}},
   {id:'unspecified',kind:'field',nullability:'unspecified',extensions:{}},
   {id:'missing',kind:'field',extensions:{}},
   {id:'unknown',kind:'field',nullability:'future-availability',extensions:{future:{opaque:[null,'雪']}}},
  ]},
  {id:'support',namespace:'support',elements:[{id:'required',name:'value',kind:'field',nullability:'unspecified',extensions:{},references:[{role:'future-link',module:'sales',element:'required'}]}]}
 ]};
 const queries:CoreElementQuery[]=[
  {identities:[{module:'sales',element:'Order'}],references:'none'},
  {identities:[{module:'sales',element:'Order'}],references:'transitive'},
  {names:['value'],references:'none'},
  {modules:['sales'],references:'none'},
  {identities:[{module:'sales',element:'required'}],references:'transitive'},
 ];
 return queries.map(query=>({source,query}));
}
