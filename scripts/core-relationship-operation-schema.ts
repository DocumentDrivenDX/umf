export {};
const id={type:'string',minLength:1},shape=(required:string[],properties:any)=>({type:'object',required,additionalProperties:false,properties});
const identity=shape(['module'],{module:id}),lookupIdentity=shape(['module','id'],{module:id,id});
const endpoint=shape(['module','element'],{module:id,element:id}),target=shape(['module','element','key'],{module:id,element:id,key:id});
const bounds=shape(['min','max'],{min:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},max:{anyOf:[{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},{const:'*'}]}});
const request=shape(['id','name','source','target','sourceMultiplicity','targetMultiplicity','targetLifecycle','directed'],{id,name:id,source:{type:'array',minItems:1,items:endpoint},target:{type:'array',minItems:1,items:target},sourceMultiplicity:bounds,targetMultiplicity:bounds,targetLifecycle:{enum:['owned','independent','unspecified']},directed:{type:'boolean'},inverse:{anyOf:[id,{type:'null'}]},associationRecord:endpoint});
const core={$ref:'urn:umf:core:0.7.0'},source={oneOf:['0.1.0','0.2.0','0.3.0','0.4.0','0.5.0','0.6.0','0.7.0'].map(v=>({$ref:'urn:umf:core:'+v}))};
const paths={type:'array',items:{type:'string'}},relationship={$ref:'urn:umf:core:0.7.0#/$defs/relationship'};
const meaning=(state:string,extra:any={})=>shape(['state',...Object.keys(extra)],{state:{const:state},...extra});
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:core:relationship-operation:1.0.0',title:'Experimental relationship authoring and inspection receipts',$defs:{identity,lookupIdentity,request,
 declaration:shape(['operation','version','source','target','identity','request','provenance'],{operation:{const:'declare-core-relationship'},version:{const:'1.0.0'},source:core,target:core,identity,request,provenance:shape(['origin','idealPath','basis','nativePath'],{origin:{const:'authored'},idealPath:{type:'string'},basis:{const:'explicit-author-declaration'},nativePath:{type:'null'}})}),
 inspection:shape(['operation','version','source','identity','path','meaning','provenance'],{operation:{const:'inspect-core-relationships'},version:{const:'1.0.0'},source,identity,path:{type:'string'},provenance:{const:'unverified'},meaning:{oneOf:[meaning('missing'),meaning('legacy',{value:{}}),...['known','partial'].map(state=>meaning(state,{relationships:{type:'array',items:relationship},uninterpretedPaths:{...paths,...(state==='known'?{maxItems:0}:{minItems:1})}}))]}}),
 lookup:shape(['operation','version','source','identity','path','relationship','uninterpretedPaths','provenance'],{operation:{const:'lookup-core-relationship'},version:{const:'1.0.0'},source:core,identity:lookupIdentity,path:{type:'string'},relationship,uninterpretedPaths:paths,provenance:{const:'unverified'}}),
 },oneOf:['declaration','inspection','lookup'].map(n=>({$ref:'#/$defs/'+n})),description:'Structure only. Verify retained operation and current context by recomputation; do not infer native enforcement or authenticated authorship.'};
for(const name of ['declaration','inspection','lookup'] as const){
 const result=schema.$defs[name];result.required.push('diagnostics','residuals');
 result.properties.diagnostics={type:'array',items:shape(['code','path','message','severity'],{code:{type:'string'},path:{type:'string'},message:{type:'string'},severity:{enum:['error','warning']}})};
 result.properties.residuals={type:'array',maxItems:0,description:'Core authoring and read operations retain the complete source without projection loss; native binding residuals are separate.'};
}
await Bun.write('spec/core/relationship-operation.schema.json',JSON.stringify(schema,null,2)+'\n');
