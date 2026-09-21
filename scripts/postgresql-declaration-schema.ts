export {};
const core=await Bun.file('spec/core/schema.json').json(),tree=await Bun.file('spec/core/native-json.schema.json').json(),s={type:'string'},node={$ref:'#/$defs/node'};
const object=(properties:Record<string,unknown>)=>({type:'object',required:Object.keys(properties),additionalProperties:false,properties}),array=(items:unknown)=>({type:'array',items});
const column=object({path:s,element:{$ref:'#/$defs/element'},typeResolution:{enum:['builtin-syntax','unresolved']},nativeColumn:node});
const declaration=object({path:s,statementIndex:{type:'integer',minimum:0},kind:{enum:['create-table','create-foreign-table','alter-table','create-composite']},schemaContext:{type:['string','null']},requiresCatalogExpansion:{type:'boolean'},relation:node,columns:array(column),nativeStatement:node});
const schema={$schema:core.$schema,$id:'urn:umf:postgresql:ddl-declarations:0.1.0',...object({status:{enum:['observed','blocked']},complete:{const:false},declarations:array(declaration),unhandled:array(object({path:s,nativeStatement:node})),diagnostics:array(object({code:s,path:s,severity:{enum:['warning','error']},message:s}))}),$defs:{...core.$defs,...tree.$defs}};
await Bun.write('spec/extensions/postgresql/ddl-declarations.schema.json',JSON.stringify(schema,null,2)+'\n');
