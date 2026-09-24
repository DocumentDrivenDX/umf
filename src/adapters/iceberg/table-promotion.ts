import {exportIcebergTable,getIcebergTableNode,proposeIcebergTableNodeEdit} from './table';
import {inspectIcebergTableContext} from './table-context';
import {inspectIcebergTableTransforms,type IcebergTableTransforms} from './table-transforms';
import {inspectIcebergTransformType} from './transforms';
import {copyJson} from '../../model/json';
import {renderTree,type NativeJson} from '../../model/native-json';
import {UmfError,type Document} from '../../model/types';
export interface IcebergTablePromotionReport {
 complete:false;previousSchemaId:number;nextSchemaId:number;fieldId:number;
 sourceType:string;targetType:string;appendedSchemaPath:string;
 checkedPartitionFields:string[];bindings:IcebergTableTransforms;limitations:string[];
}
/** Metadata candidate for the v1/v2 primitive widening rules, carried in v2/v3 tables. */
export function proposeIcebergTablePromotion(document:Document,options:{fieldId:number;targetType:string;nextSchemaId:number}):{document:Document;report:IcebergTablePromotionReport}{
 const fail=(message:string):never=>{throw new UmfError('ICEBERG_TABLE_PROMOTION',message);};
 for(const id of [options.fieldId,options.nextSchemaId])if(!Number.isInteger(id)||id<0||id>2147483647)fail('Field and new schema IDs must be nonnegative int32');
 if(typeof options.targetType!=='string'||options.targetType.length>4096)fail('Expected bounded target type string');
 exportIcebergTable(document);
 const context=inspectIcebergTableContext(document);if(context.status!=='checked')fail('Current references must resolve');
 const root=getIcebergTableNode(document,'');if(root.kind!=='object')return fail('Expected table');
 const version=root.members['format-version'];if(version?.kind!=='number'||!['2','3'].includes(version.value))fail('Versioned candidate requires v2 or v3');
 const schemas=root.members.schemas,current=root.members['current-schema-id'];if(schemas?.kind!=='array'||current?.kind!=='number')return fail('Expected modern history');
 const member=(n:NativeJson|undefined,k:string)=>n?.kind==='object'?n.members[k]:undefined;
 const matches=(n:NativeJson|undefined)=>n?.kind==='number'&&BigInt(n.value)===BigInt(options.fieldId);
 if(schemas.items.some(s=>{const id=member(s,'schema-id');return id?.kind==='number'&&BigInt(id.value)===BigInt(options.nextSchemaId);}))fail('Schema ID already exists');
 const selected=schemas.items[Number(context.resolved['/current-schema-id']!.split('/').at(-1))],next=copyJson(selected) as unknown as NativeJson;
 if(next.kind!=='object')return fail('Expected current schema');
 let target:Extract<NativeJson,{kind:'object'}>|undefined;
 function walk(t:NativeJson,inMapKey:boolean){
  const tag=member(t,'type');if(tag?.kind!=='string')return;
  const fields=member(t,'fields');if(tag.value==='struct'&&fields?.kind==='array')for(const f of fields.items){
   if(matches(member(f,'id'))){if(inMapKey)fail('Map key evolution is outside this candidate profile');if(f.kind==='object')target=f;}
   const type=member(f,'type');if(type)walk(type,inMapKey);
  }
  if(tag.value==='list'){const e=member(t,'element');if(e)walk(e,inMapKey);}
  if(tag.value==='map'){const k=member(t,'key'),v=member(t,'value');if(k)walk(k,true);if(v)walk(v,inMapKey);}
 }
 walk(next,false);const source=target?.members.type;if(!target||source?.kind!=='string')return fail('Target must be a named primitive field');
 const decimal=(s:string)=>{const m=/^decimal\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(s);return m?[BigInt(m[1]!),BigInt(m[2]!)] as const:undefined;};
 const a=decimal(source.value),b=decimal(options.targetType);
 const allowed=source.value==='int'&&options.targetType==='long'||source.value==='float'&&options.targetType==='double'||a&&b&&b[0]>a[0]&&b[0]<=38n&&a[1]===b[1];
 if(!allowed)fail('Only int-to-long, float-to-double and same-scale decimal precision widening are implemented; other promotions require separate evidence');
 const checkedPartitionFields:string[]=[];
 const check=(fields:NativeJson|undefined,path:string)=>{if(fields?.kind!=='array')return;fields.items.forEach((f,i)=>{
  const ids=member(f,'source-ids');if(ids?.kind==='array'&&ids.items.some(matches))fail('Dependent multi-source partition transform has unverified promotion semantics');
  if(!matches(member(f,'source-id')))return;
  const transform=member(f,'transform');if(transform?.kind!=='string')return fail('Unknown dependent transform');
  for(const type of [source.value,options.targetType])if(inspectIcebergTransformType(type,transform.value).status!=='compatible')fail('Dependent partition transform is incompatible or uninterpreted');
  checkedPartitionFields.push(path+'/'+i);
 });};
 check(root.members['partition-spec'],'/partition-spec');const specs=root.members['partition-specs'];if(specs?.kind==='array')specs.items.forEach((s,i)=>check(member(s,'fields'),'/partition-specs/'+i+'/fields'));
 target.members.type={kind:'string',value:options.targetType};next.members['schema-id']={kind:'number',value:String(options.nextSchemaId)};
 const appendedSchemaPath='/schemas/'+schemas.items.length;schemas.items.push(next);root.members['current-schema-id']={kind:'number',value:String(options.nextSchemaId)};
 const candidate=proposeIcebergTableNodeEdit(document,'',renderTree(root)).document;
 return {document:candidate,report:{complete:false,previousSchemaId:Number(current.value),nextSchemaId:options.nextSchemaId,fieldId:options.fieldId,sourceType:source.value,targetType:options.targetType,appendedSchemaPath,checkedPartitionFields,bindings:inspectIcebergTableTransforms(candidate),limitations:['Metadata candidate only; no commit, concurrency check, timestamp update or file rewrite','Historical bounds retain their original byte encodings; reader decoding and value execution are not verified','Unknown type-dependent metadata and defaults remain unchanged and require review; v3 date/unknown promotions are not implemented']}};
}
