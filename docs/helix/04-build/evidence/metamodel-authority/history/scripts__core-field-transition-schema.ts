export {};
const legacy=await Bun.file('spec/core/schema.json').json();delete legacy.$id;delete legacy.$schema;
const field=await Bun.file('spec/core/field-document.schema.json').json();delete field.$id;delete field.$schema;
// Embedded schemas need their own local reference roots.
function rebase(value:any,prefix:string):void{if(!value||typeof value!=='object')return;if(typeof value.$ref==='string'&&value.$ref.startsWith('#/'))value.$ref=prefix+value.$ref.slice(1);for(const child of Object.values(value))rebase(child,prefix);}
rebase(legacy,'#/$defs/legacy');rebase(field,'#/$defs/field');
const schema={
 $schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:core:field-transition:1.0.0',
 title:'Explicit experimental Field envelope transition receipts',
 $defs:{legacy,field,residual:{type:'object',additionalProperties:false,required:['path','value','reason'],properties:{path:{type:'string',pattern:'^/modules/[0-9]+/elements/[0-9]+/kind$'},value:{},reason:{const:'Legacy kind is opaque; no core assertion inferred'}}},
 upgrade:{type:'object',additionalProperties:false,required:['operation','version','source','target','residuals'],properties:{operation:{const:'upgrade-field-envelope'},version:{const:'1.0.0'},source:{$ref:'#/$defs/legacy'},target:{$ref:'#/$defs/field'},residuals:{type:'array',items:{$ref:'#/$defs/residual'}}}},
 rollback:{type:'object',additionalProperties:false,required:['operation','version','source','target','receipt','reason'],properties:{operation:{const:'rollback-field-envelope'},version:{const:'1.0.0'},source:{$ref:'#/$defs/field'},target:{$ref:'#/$defs/legacy'},receipt:{$ref:'#/$defs/upgrade'},reason:{const:'Original envelope restored; all subsequent content retained in source, not applied to legacy target'}}}},
 oneOf:[{$ref:'#/$defs/upgrade'},{$ref:'#/$defs/rollback'}]
};
await Bun.write('spec/core/field-transition.schema.json',JSON.stringify(schema,null,2)+'\n');
