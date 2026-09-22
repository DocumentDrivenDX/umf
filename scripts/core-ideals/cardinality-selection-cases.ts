import type {Document,CoreElementQuery} from '../../src';
export function cardinalitySelectionCases(){
 const source:Document={umf:'0.4.0',id:'container-selection',vocabularies:{future:{version:'1.0.0'}},modules:[
  {id:'sales',namespace:'shared',elements:[
   {id:'Order',kind:'record',extensions:{},references:[{role:'member',module:'sales',element:'rows'},{role:'member',module:'sales',element:'tags'}]},
   {id:'rows',name:'value',kind:'field',cardinality:'array',nullability:'required',itemType:{module:'sales',element:'row',future:{native:'retained'}},extensions:{future:{physical:'repeated'}}},
   {id:'row',kind:'field',cardinality:'one',nullability:'absent-allowed',extensions:{},references:[{role:'record-type',module:'sales',element:'Order',future:true}]},
   {id:'tags',name:'value',kind:'field',cardinality:'map',itemType:{module:'support',element:'value'},extensions:{future:{duplicateKeys:'native-only'}}},
   {id:'value',name:'value',kind:'field',cardinality:'one',scalarType:'integer',extensions:{}},
   {id:'unknown',kind:'field',cardinality:'future-container',extensions:{future:{opaque:[null,'雪']}}},
   {id:'missing',kind:'field',extensions:{}},
   {id:'unspecified',kind:'field',cardinality:'unspecified',extensions:{}},
   {id:'loop',kind:'field',cardinality:'array',itemType:{module:'sales',element:'loop'},extensions:{}},
  ]},
  {id:'support',namespace:'shared',elements:[
   {id:'value',name:'value',kind:'field',cardinality:'one',scalarType:'string',extensions:{}},
   {id:'chain',kind:'field',cardinality:'array',itemType:{module:'sales',element:'rows'},extensions:{}},
  ]}
 ]};
 const rows:Array<{query:CoreElementQuery;expected:string[];genericBoundary:number;itemBoundary:number}>=[
  {query:{identities:[{module:'sales',element:'Order'}],references:'none'},expected:['sales.Order'],genericBoundary:2,itemBoundary:0},
  {query:{identities:[{module:'sales',element:'rows'}],references:'none'},expected:['sales.rows'],genericBoundary:0,itemBoundary:1},
  {query:{identities:[{module:'sales',element:'rows'}],references:'transitive'},expected:['sales.Order','sales.rows','sales.row','sales.tags','support.value'],genericBoundary:0,itemBoundary:0},
  {query:{identities:[{module:'support',element:'chain'}],references:'transitive'},expected:['sales.Order','sales.rows','sales.row','sales.tags','support.value','support.chain'],genericBoundary:0,itemBoundary:0},
  {query:{identities:[{module:'sales',element:'loop'}],references:'transitive'},expected:['sales.loop'],genericBoundary:0,itemBoundary:0},
  {query:{cardinalities:['one'],references:'none'},expected:['sales.row','sales.value','support.value'],genericBoundary:1,itemBoundary:0},
  {query:{cardinalities:['array','map'],modules:['sales'],references:'none'},expected:['sales.rows','sales.tags','sales.loop'],genericBoundary:0,itemBoundary:2},
  {query:{scalarTypes:['integer'],references:'transitive'},expected:['sales.value'],genericBoundary:0,itemBoundary:0},
  {query:{names:['value'],namespaces:['shared'],references:'none'},expected:['sales.rows','sales.tags','sales.value','support.value'],genericBoundary:0,itemBoundary:1},
  {query:{cardinalities:[],references:'transitive'},expected:[],genericBoundary:0,itemBoundary:0},
  {query:{cardinalities:['future-container'],references:'none'},expected:['sales.unknown'],genericBoundary:0,itemBoundary:0},
  {query:{cardinalities:['unspecified'],references:'none'},expected:['sales.unspecified'],genericBoundary:0,itemBoundary:0},
 ];
 return rows.map(row=>({...row,source}));
}
