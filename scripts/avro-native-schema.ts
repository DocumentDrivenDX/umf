export {};
const end='(?![\\s\\S])',simple='[A-Za-z_][A-Za-z0-9_]*',full=simple+'(?:\\.'+simple+')*';
const ref=(name:string)=>({$ref:'#/$defs/'+name});
const primitive=['null','boolean','int','long','float','double','bytes','string'];
const aliases={type:'array',items:{type:'string'}},named={name:ref('fullname'),namespace:ref('namespace'),aliases,doc:{type:'string'}};
const object=(required:string[],properties:Record<string,unknown>)=>({type:'object',required,properties,additionalProperties:true});
const defs:Record<string,unknown>={
 name:{type:'string',pattern:'^'+simple+end},fullname:{type:'string',pattern:'^'+full+end},namespace:{type:'string',pattern:'^(?:'+full+')?'+end},
 field:object(['name','type'],{name:ref('name'),type:ref('schema'),doc:{type:'string'},aliases,order:{enum:['ascending','descending','ignore']},default:{$comment:'Reader-default type/value compatibility requires native validation.'}}),
 record:object(['type','name','fields'],{type:{enum:['record','error']},...named,fields:{type:'array',items:ref('field')}}),
 enum:object(['type','name','symbols'],{type:{const:'enum'},...named,symbols:{type:'array',uniqueItems:true,items:ref('name')},default:{type:'string',$comment:'Membership in symbols requires semantic validation.'}}),
 fixed:object(['type','name','size'],{type:{const:'fixed'},...named,size:{type:'integer',minimum:0}}),
 array:object(['type','items'],{type:{const:'array'},items:ref('schema')}),
 map:object(['type','values'],{type:{const:'map'},values:ref('schema')}),
 reference:object(['type'],{type:{allOf:[ref('fullname'),{not:{enum:['record','error','enum','fixed','array','map']}}]}}),
};
defs.nonUnion={anyOf:[ref('fullname'),...['record','enum','fixed','array','map','reference'].map(ref)]};
defs.union={type:'array',uniqueItems:true,items:ref('nonUnion'),allOf:[...primitive,'array','map'].map(type=>({contains:{anyOf:[...(primitive.includes(type)?[{const:type}]:[]),object(['type'],{type:{const:type}})]},minContains:0,maxContains:1}))};
defs.schema={anyOf:[ref('nonUnion'),ref('union')]};
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'urn:umf:avro:native-schema:1.12.0',title:'Avro 1.12.0 native schema syntax',description:'Structural schema syntax, including error records and unknown metadata. Not a native semantic validator or protocol/IDL schema. Name resolution, declaration/field-name uniqueness, defaults, logical annotations and exact numeric token handling require separate checks. Invalid or unknown logical annotations remain available for native fallback.', $comment:'Source: https://avro.apache.org/docs/1.12.0/specification/. Applied separately from preservation-oriented UMF payload validation. Empty unions/enums and zero-size fixed shapes are not prohibited here beyond the stated syntax; native implementations may reject them.',...ref('schema'),$defs:defs};
await Bun.write('spec/extensions/avro/native-schema.schema.json',JSON.stringify(schema,null,2)+'\n');
