import {avroAvailabilitySource} from '../../../../../../scripts/core-ideals/nullability-avro-cases';
import {classifyAvroCardinality,verifyAvroCardinalityClassification,recoverAvroCardinalityBundle} from '../../../../../../src/core-ideals/cardinality-avro';
import packet from './typescript-predecessor.json';
const base=(packet.outcomes as any)['empty-array/present-non-null-schema/strict'];
const clone=structuredClone;
const cases:any[]=[];
function add(id:string,op:string,args:any){try{let result:any;if(op==='classifyAvroCardinality')result=classifyAvroCardinality(args.source,args.request);else if(op==='verifyAvroCardinalityClassification')result=verifyAvroCardinalityClassification(args.receipt,args.current);else result=recoverAvroCardinalityBundle(args.receipt,args.current);cases.push({id,op,args,result});}catch(e){cases.push({id,op,args,error:{...Object.fromEntries(Object.keys(e as object).map(k=>[k,(e as any)[k]])),code:(e as any).code,message:(e as Error).message}})}}
const c=(id:string,source:any,request:any)=>add(id,'classifyAvroCardinality',{source,request});
c('missing-column',base.source,{...base.request,column:undefined});
const {column:_missingColumn,...wireMissingColumn}=base.request;
c('missing-column-wire',base.source,wireMissingColumn);
c('wrong-mode',base.source,{...base.request,mode:'future'});
c('extra-member',base.source,{...base.request,future:1});
c('extra-members',base.source,{...base.request,future:1,later:2});
c('combined-request-errors',base.source,{...wireMissingColumn,identity:{...base.request.identity,extraIdentity:true},dependencies:[{id:'d',schema:'{}',futureDependency:true,laterDependency:false}],mode:'future',future:1,later:2});
c('many-extra-members',base.source,{...base.request,...Object.fromEntries(Array.from({length:64},(_,i)=>['future'+i,i]))});
c('archive-mismatch',base.source,{...base.request,nativeSource:base.request.nativeSource.replace('long','string')});
c('column-missing',base.source,{...base.request,column:'no-such-field'});
c('source-version',{...base.source,umf:'0.11.0'},base.request);
c('module-conflict',base.source,{...base.request,identity:{module:'schema',element:'other'},mode:'report'});
c('identity-collision',base.result.target,base.request);
c('unresolved-report',base.source,{...base.request,profile:'unresolved',mode:'report'});
const forged=clone(base.result);forged.mapping.nodes[0].cardinality='one';add('forged-receipt','verifyAvroCardinalityClassification',{receipt:forged,current:base.result.target});
const stale=clone(base.result.target);stale.modules.at(-1).elements[0].description='changed';add('stale-target','verifyAvroCardinalityClassification',{receipt:base.result,current:stale});
add('blocked-receipt','verifyAvroCardinalityClassification',{receipt:classifyAvroCardinality(base.source,{...base.request,profile:'unresolved',mode:'strict'}),current:base.result.target});
add('recover-base','recoverAvroCardinalityBundle',{receipt:base.result,current:base.result.target});
const dependency=' {"type":"enum","name":"dep.Choice","symbols":["A","B"],"opaque":9007199254740993} ';
const dependencies=[{id:'shared',schema:dependency}];const schema=JSON.stringify({type:'record',name:'cardinality.Example',fields:[{name:'value',type:{type:'array',items:'dep.Choice'}}]});
const dep=avroAvailabilitySource(schema,dependencies,'cardinality.Example');const request={column:dep.column,nativeSource:schema,dependencies,identity:{module:'logical',element:'value'},profile:'present-non-null-schema',mode:'strict'};
c('dependency-enum',dep.source,request);
const depResult=classifyAvroCardinality(dep.source,request);add('recover-dependency','recoverAvroCardinalityBundle',{receipt:depResult,current:depResult.target});
const reformatted=clone(depResult);reformatted.request.dependencies[0].schema+='\n';add('recover-dependency-reformatted','recoverAvroCardinalityBundle',{receipt:reformatted,current:depResult.target});
const depForged=clone(depResult);depForged.request.dependencies[0].schema=dependency.replace('9007199254740993','9007199254740995');add('recover-dependency-forged','recoverAvroCardinalityBundle',{receipt:depForged,current:depResult.target});
const versioned=clone(base.result);versioned.version='2.0.0';add('receipt-version','verifyAvroCardinalityClassification',{receipt:versioned,current:base.result.target});
const futureSchema=JSON.stringify({type:'record',name:'cardinality.Example',aliases:['Legacy'],fields:[{name:'value',type:{type:'array',items:'long',future:'\ud800'}}],opaque:9007199254740993});
const future=avroAvailabilitySource(futureSchema,[],'cardinality.Example');c('utf16-alias-lexeme',future.source,{column:future.column,nativeSource:futureSchema,dependencies:[],identity:{module:'logical',element:'value'},profile:'present-non-null-schema',mode:'strict'});
for(const [id,type] of [['duplicate-long',['long','long']],['unresolved-name','Missing'],['fixed-zero',{type:'fixed',name:'F',size:0}],['duplicate-null',['null','null']]] as const){
 const invalidSchema=JSON.stringify({type:'record',name:'cardinality.Example',fields:[{name:'value',type}]});
 const invalid=avroAvailabilitySource(invalidSchema,[],'cardinality.Example');
 c(id,invalid.source,{column:invalid.column,nativeSource:invalidSchema,dependencies:[],identity:{module:'logical',element:'value'},profile:'present-non-null-schema',mode:'report'});
}
for(const [id,type] of [
 ['duplicate-named',[{type:'enum',name:'E',symbols:['A']},'E']],
 ['duplicate-qualified-named',[{type:'enum',name:'cardinality.E',symbols:['A']},'cardinality.E']],
 ['duplicate-array',[{type:'array',items:'long'},{type:'array',items:'string'}]],
 ['duplicate-map',[{type:'map',values:'long'},{type:'map',values:'string'}]],
 ['invalid-record-name',{type:'record',name:'bad-name',fields:[]}],
 ['invalid-enum-symbol',{type:'enum',name:'E',symbols:['bad-name']}],
 ['duplicate-enum-symbol',{type:'enum',name:'E',symbols:['A','A']}],
 ['empty-enum',{type:'enum',name:'E',symbols:[]}],
 ['nested-union',['long',['int']]],
 ['fixed-negative',{type:'fixed',name:'F',size:-1}],
 ['fixed-fraction',{type:'fixed',name:'F',size:1.5}],
 ['fixed-avsc-max',{type:'fixed',name:'F',size:2147483647}],
 ['fixed-avsc-over',{type:'fixed',name:'F',size:2147483648}],
 ['fixed-safe-max',{type:'fixed',name:'F',size:9007199254740991}],
 ['fixed-unsafe-exact',{type:'fixed',name:'F',size:9007199254740992}],
] as const){
 const invalidSchema=JSON.stringify({type:'record',name:'cardinality.Example',fields:[{name:'value',type}]});
 const invalid=avroAvailabilitySource(invalidSchema,[],'cardinality.Example');
 c(id,invalid.source,{column:invalid.column,nativeSource:invalidSchema,dependencies:[],identity:{module:'logical',element:'value'},profile:'present-non-null-schema',mode:'report'});
}
for(const [id,size] of [['fixed-unsafe-token','9007199254740993'],['fixed-exponent','1e0'],['fixed-integer-fraction','1.0']] as const){
 const numericSchema=`{"type":"record","name":"cardinality.Example","fields":[{"name":"value","type":{"type":"fixed","name":"F","size":${size}}}]}`;
 const numeric=avroAvailabilitySource(numericSchema,[],'cardinality.Example');
 c(id,numeric.source,{column:numeric.column,nativeSource:numericSchema,dependencies:[],identity:{module:'logical',element:'value'},profile:'present-non-null-schema',mode:'report'});
}
for(const id of ['duplicate-named','fixed-unsafe-token','fixed-exponent']){
 const receipt=cases.find(row=>row.id===id)?.result;
 if(!receipt||receipt.status!=='classified'||!receipt.target)throw Error(`Expected classified report receipt: ${id}`);
 add(`verify-${id}`,'verifyAvroCardinalityClassification',{receipt,current:receipt.target});
 add(`recover-${id}`,'recoverAvroCardinalityBundle',{receipt,current:receipt.target});
}
console.log(JSON.stringify({cases}));
