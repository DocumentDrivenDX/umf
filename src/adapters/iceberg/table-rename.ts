import {exportIcebergTable,getIcebergTableNode,proposeIcebergTableNodeEdit} from './table';
import {inspectIcebergTableContext} from './table-context';
import {inspectIcebergTableTransforms,type IcebergTableTransforms} from './table-transforms';
import {copyJson} from '../../model/json';
import {renderTree,type NativeJson} from '../../model/native-json';
import {UmfError,type Document} from '../../model/types';
export interface IcebergTableRenameReport {
 complete:false;
 previousSchemaId:number;
 nextSchemaId:number;
 fieldId:number;
 oldName:string;
 newName:string;
 appendedSchemaPath:string;
 bindings:IcebergTableTransforms;
 limitations:string[];
}
/** Appends a reviewable schema version, never commits or rewrites historical schemas. */
export function proposeIcebergTableRename(document:Document,options:{fieldId:number;newName:string;nextSchemaId:number}):{document:Document;report:IcebergTableRenameReport}{
 const fail=(message:string):never=>{throw new UmfError('ICEBERG_TABLE_RENAME',message);};
 for(const id of [options.fieldId,options.nextSchemaId])if(!Number.isInteger(id)||id<0||id>2147483647)fail('Field and new schema IDs must be nonnegative signed int32 values');
 if(typeof options.newName!=='string'||!options.newName.length||options.newName.length>4096)fail('Name must contain 1–4096 characters');
 exportIcebergTable(document); // Enforce representation preservation before tree rendering.
 const context=inspectIcebergTableContext(document);if(context.status!=='checked')fail('Current references must resolve before proposing schema evolution');
 const root=getIcebergTableNode(document,'');if(root.kind!=='object')return fail('Expected table object');
 const version=root.members['format-version'];if(version?.kind!=='number'||!['2','3'].includes(version.value))fail('Schema-version append currently requires v2 or v3');
 const schemas=root.members.schemas,current=root.members['current-schema-id'];if(schemas?.kind!=='array'||current?.kind!=='number')return fail('Expected modern schema history');
 if(schemas.items.some(s=>s.kind==='object'&&s.members['schema-id']?.kind==='number'&&BigInt(s.members['schema-id'].value)===BigInt(options.nextSchemaId)))fail('New schema ID already exists');
 const selected=context.resolved['/current-schema-id'],index=Number(selected?.split('/').at(-1)),original=schemas.items[index];if(original?.kind!=='object')return fail('Expected selected schema');
 const next=copyJson(original) as unknown as NativeJson;if(next.kind!=='object')return fail('Expected schema object');
 let found=false,oldName='';
 function walk(t:NativeJson){
  if(t.kind!=='object')return;
  const tag=t.members.type;
  if(tag?.kind!=='string')return;
  if(tag.value==='struct'){
   const fields=t.members.fields;if(fields?.kind!=='array')return;
   for(const f of fields.items){if(f.kind!=='object')continue;const id=f.members.id,name=f.members.name;
    if(id?.kind==='number'&&BigInt(id.value)===BigInt(options.fieldId)&&name?.kind==='string'){
     if(name.value===options.newName)fail('Rename must change the field name');
     if(fields.items.some(other=>other!==f&&other.kind==='object'&&other.members.name?.kind==='string'&&other.members.name.value===options.newName))fail('A sibling already has that name');
     oldName=name.value;f.members.name={kind:'string',value:options.newName};found=true;
    }
    if(f.members.type)walk(f.members.type);
   }
  }else if(tag.value==='list'){if(t.members.element)walk(t.members.element);}
  else if(tag.value==='map'){if(t.members.key)walk(t.members.key);if(t.members.value)walk(t.members.value);}
 }
 walk(next);if(!found)fail('Field ID does not identify a named field in the current schema');
 next.members['schema-id']={kind:'number',value:String(options.nextSchemaId)};
 const appendedSchemaPath='/schemas/'+schemas.items.length;schemas.items.push(next);root.members['current-schema-id']={kind:'number',value:String(options.nextSchemaId)};
 const candidate=proposeIcebergTableNodeEdit(document,'',renderTree(root)).document;
 return {document:candidate,report:{complete:false,previousSchemaId:Number(current.value),nextSchemaId:options.nextSchemaId,fieldId:options.fieldId,oldName,newName:options.newName,appendedSchemaPath,bindings:inspectIcebergTableTransforms(candidate),limitations:['Candidate metadata only: no commit, timestamp advancement, optimistic concurrency check or file rewrite','Unknown/native name-dependent metadata is retained without rewriting; review dependencies before applying','Historical schemas and field IDs remain unchanged; full evolution and version-feature validity are not established']}};
}
