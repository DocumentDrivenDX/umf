import {exportSparkSchema,getSparkNode,proposeSparkNodeEdit} from './index';
import {copyJson} from '../../model/json';
import {renderTree,nativePointer,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Diagnostic} from '../../model/types';
export function renameSparkField(document:Document,options:{fieldPointer:string;name:string;uninterpretedMetadata:'preserve-and-report'}){
 if(options.uninterpretedMetadata!=='preserve-and-report'||typeof options.name!=='string')throw new UmfError('SPARK_RENAME_POLICY','Expected string name and explicit preserve-and-report metadata policy');
 exportSparkSchema(document);const root=getSparkNode(document,''),target=nativePointer(options.fieldPointer).map(k=>'/'+pointer(k)).join('');let field:NativeJson|undefined;
 function visit(type:NativeJson,path:string){if(type.kind!=='object')return;const tag=type.members.type;if(tag?.kind!=='string')return;
  if(tag.value==='struct'){const fields=type.members.fields;if(fields?.kind!=='array')return;fields.items.forEach((f,i)=>{const at=path+'/fields/'+i;if(at===target)field=f;if(f.kind==='object'&&f.members.type)visit(f.members.type,at+'/type');});}
  if(tag.value==='array'&&type.members.elementType)visit(type.members.elementType,path+'/elementType');
  if(tag.value==='map'){if(type.members.keyType)visit(type.members.keyType,path+'/keyType');if(type.members.valueType)visit(type.members.valueType,path+'/valueType');}
 }
 visit(root,'');if(!field||field.kind!=='object'||field.members.name?.kind!=='string')throw new UmfError('SPARK_RENAME_PATH','Pointer must select an actual StructField in known struct/array/map structure');
 const selected=field,oldName=selected.members.name!.kind==='string'?selected.members.name!.value:'';const eligible=new Map<string,string>();
 function paths(type:NativeJson,suffix:string){if(type.kind==='string'){if(type.value==='string')eligible.set(oldName+suffix,options.name+suffix);return;}if(type.kind!=='object'||type.members.type?.kind!=='string')return;
  if(type.members.type.value==='array'&&type.members.elementType)paths(type.members.elementType,suffix+'.element');
  if(type.members.type.value==='map'){if(type.members.keyType)paths(type.members.keyType,suffix+'.key');if(type.members.valueType)paths(type.members.valueType,suffix+'.value');}
  // Child structs own their collation maps. Never rewrite their field-local names.
 }
 paths(selected.members.type!,'');const metadata=selected.members.metadata,collations=metadata?.kind==='object'?metadata.members.__COLLATIONS:undefined;const renamedCollationPaths:{from:string;to:string}[]=[];
 if(collations){if(collations.kind!=='object')throw new UmfError('SPARK_COLLATION_PATH','Expected a collation path map');if(options.name===''&&Object.keys(collations.members).length)throw new UmfError('SPARK_COLLATION_EMPTY_NAME','Empty collated field names are blocked: Spark may drop nested collation paths');const members:Record<string,NativeJson>=Object.create(null);
  for(const [from,value] of Object.entries(collations.members)){const to=eligible.get(from);if(to===undefined||value.kind!=='string')throw new UmfError('SPARK_COLLATION_PATH','Collation annotation does not resolve to a string in the selected field: '+from);if(Object.hasOwn(members,to))throw new UmfError('SPARK_COLLATION_PATH','Renamed collation path collision');members[to]=value;renamedCollationPaths.push({from,to});}
  collations.members=members;
 }
 selected.members.name={kind:'string',value:options.name};const edited=proposeSparkNodeEdit(document,target,renderTree(selected));
 const diagnostics:Diagnostic[]=[{code:'SPARK_NAME_REFERENCES_UNVERIFIED',path:target,severity:'warning',message:'Known field-local collation paths were updated; other metadata/external references remain uninterpreted and may retain the old name'}];
 return {source:copyJson(document) as unknown as Document,document:edited.document,validation:edited.validation,complete:false as const,renamedCollationPaths,diagnostics};
}
