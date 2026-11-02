// SPDX-License-Identifier: MIT OR Apache-2.0
/** Rebuild the current core-element selection result schema from core defs. */
type Schema=Record<string,any>;
const id='urn:umf:core:element-selection:0.10.0';
const obj=(properties:Schema,required=Object.keys(properties),extra=false):Schema=>({type:'object',required,additionalProperties:extra,properties});
const array=(items:Schema):Schema=>({type:'array',items});
const text:Schema={type:'string'},nonempty:Schema={type:'string',minLength:1};
const identity=obj({module:nonempty,element:nonempty});
const validation=obj({valid:{const:true},complete:{type:'boolean'},diagnostics:array(obj({code:text,path:text,message:text,severity:{enum:['error','warning']}}))});
const reference={type:'object',required:['role','module','element'],properties:{role:nonempty,module:nonempty,element:nonempty}};
const boundary=(properties:Schema,required=Object.keys(properties))=>array(obj(properties,required));

export function generateSelectionSchema(core:Schema):Schema {
 const query=obj({
  references:{enum:['none','transitive']},
  modules:array(text),namespaces:array(text),names:array(text),
  scalarTypes:array(nonempty),cardinalities:array(nonempty),identities:array(identity),
 },['references']);
 const selected=obj({module:nonempty,namespace:text,path:text,element:{$ref:'#/$defs/element'},includedBy:{enum:['match','reference']}});
 return {
  $schema:core.$schema,$id:id,type:'object',
  required:['scope','referenceScope','source','query','sourceValidation','selection','boundaryReferences','boundaryItemTypes','boundaryMembers','boundaryKeyFields'],
  additionalProperties:false,
  properties:{
   scope:{const:'core-elements'},referenceScope:{const:'explicit-core-references-item-types-members-and-keys'},
   source:{$ref:'urn:umf:core:0.10.0'},query,sourceValidation:validation,selection:array(selected),
   boundaryReferences:boundary({from:identity,reference,targetPath:text}),
   boundaryItemTypes:boundary({from:{$ref:'#/$defs/selectionIdentity'},reference:{$ref:'#/$defs/itemType'},path:text,targetPath:text}),
   boundaryMembers:boundary({from:{$ref:'#/$defs/selectionIdentity'},reference:{$ref:'#/$defs/itemType'},path:text,targetPath:text}),
   boundaryKeyFields:boundary({from:{$ref:'#/$defs/selectionIdentity'},key:nonempty,reference:{$ref:'#/$defs/itemType'},path:text,targetPath:text}),
  },
  $defs:{selectionIdentity:identity,...core.$defs},
 };
}

if(import.meta.main){
 const core=await Bun.file('spec/core/schema.json').json();
 const schema=generateSelectionSchema(core);
 await Bun.write('spec/core/element-selection.schema.json',JSON.stringify(schema,null,2)+'\n');
}
