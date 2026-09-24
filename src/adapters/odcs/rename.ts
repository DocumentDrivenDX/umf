import {getOdcsDocumentNode,inspectOdcsDocument,proposeOdcsDocumentNodeEdit} from './index';
import {resolveOdcsReference} from './references';
import {inspectOdcsRelationships} from './relationships';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
export interface OdcsRenameResult {
 source:Document;status:'candidate'|'blocked';complete:false;candidate?:Document;
 changes:{path:string;before:string;after:string}[];diagnostics:Diagnostic[];
}
/** Rename an ID-selected element while preserving the currently resolved local foreign-key endpoints. */
export function proposeOdcsElementRename(document:Document,options:{reference:string;name:string}):OdcsRenameResult {
 if(!options||typeof options.name!=='string'||options.name.length>256||!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(options.name))throw new UmfError('ODCS_RENAME_OPTIONS','Expected a shorthand-compatible new name of at most 256 characters');
 const source=copyJson(document) as unknown as Document,target=resolveOdcsReference(source,{reference:options.reference,usage:'element'}),diagnostics=[...target.diagnostics];
 const result:OdcsRenameResult={source,status:'blocked',complete:false,changes:[],diagnostics};
 const block=(code:string,path:string,message:string)=>{diagnostics.push({code,path,message,severity:'error'});return result;};
 if(!target.target)return result;
 if(diagnostics.some(x=>x.code==='ODCS_NATIVE_SCHEMA'||x.code==='ODCS_REPRESENTATION'))return block('ODCS_RENAME_SOURCE','','Resolve native-shape or representation uncertainty before relationship-aware rename');
 const path=target.target.path,node=target.target.node,name=node.kind==='object'?node.members.name:undefined;
 if(name?.kind!=='string')return block('ODCS_RENAME_NAME',path,'Target must have an existing string name');
 const parentPath=path.slice(0,path.lastIndexOf('/')),siblings=getOdcsDocumentNode(source,parentPath),index=Number(path.slice(path.lastIndexOf('/')+1));
 if(siblings.kind!=='array')return block('ODCS_RENAME_SOURCE',parentPath,'Expected containing array');
 if(siblings.items.some((n,i)=>{const v=n.kind==='object'?n.members.name:undefined;return i!==index&&v?.kind==='string'&&v.value===options.name;}))return block('ODCS_RENAME_COLLISION',parentPath,'New name already belongs to a sibling');
 const before=inspectOdcsRelationships(source);
 if(before.status!=='checked'){diagnostics.push(...before.diagnostics,...before.relationships.flatMap(r=>r.diagnostics));return block('ODCS_RENAME_RELATIONSHIPS','','All known local relationships must pair before rename');}
 const changes:OdcsRenameResult['changes']=name.value===options.name?[]:[{path:path+'/name',before:name.value,after:options.name}];
 const segment=path.split('/').filter(k=>k==='properties').length;
 function referenceChange(n:NativeJson,p:string){
  if(n.kind==='array'){n.items.forEach((v,i)=>referenceChange(v,p+'/'+i));return;}
  if(n.kind!=='string')return;
  const r=resolveOdcsReference(source,{reference:n.value,usage:'foreignKey'}),t=r.target;
  if(!t||t.notation!=='name'||!(t.path===path||t.path.startsWith(path+'/properties/')))return;
  const prefix=n.value.startsWith('#/')?'#/':n.value.startsWith('#')?'#':n.value.startsWith('/')?'/':'';
  const parts=n.value.slice(prefix.length).split('.');parts[segment]=options.name;const after=prefix+parts.join('.');
  if(after!==n.value)changes.push({path:p,before:n.value,after});
 }
 for(const row of before.relationships){const rel=getOdcsDocumentNode(source,row.path);if(rel.kind!=='object')return block('ODCS_RENAME_SOURCE',row.path,'Expected relationship object');for(const key of ['from','to'])if(rel.members[key])referenceChange(rel.members[key],row.path+'/'+key);}
 let candidate=copyJson(source) as unknown as Document;
 for(const change of changes)candidate=proposeOdcsDocumentNodeEdit(candidate,change.path,JSON.stringify(change.after)).document;
 const after=inspectOdcsRelationships(candidate),pairs=(r:typeof before)=>r.relationships.map(x=>({path:x.path,pairs:x.pairs}));
 if(after.status!=='checked'||JSON.stringify(pairs(before))!==JSON.stringify(pairs(after)))return block('ODCS_RENAME_VERIFICATION','','Candidate did not preserve all ordered local endpoint pairs');
 if(inspectOdcsDocument(candidate).diagnostics.some(d=>d.code==='ODCS_NATIVE_SCHEMA'))return block('ODCS_RENAME_VERIFICATION','','Candidate fails pinned native shapes');
 result.status='candidate';result.candidate=candidate;result.changes=changes;
 diagnostics.push({code:'ODCS_RENAME_CONTEXT',path,severity:'warning',message:'Only known local foreign-key name references are rewritten. IDs and other source content remain unchanged; SQL/quality expressions, unknown metadata, external consumers and execution semantics require separate review.'});
 return result;
}
