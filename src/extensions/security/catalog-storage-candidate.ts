// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private validation over already detached issued-program/owner sources. No authority. */
const id=(r:any)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
const fail=(message:string):never=>{throw Error('SECURITY_CATALOG_STORAGE: '+message);};
function shape(v:any,required:string[],optional:string[]=[]):void{if(!v||typeof v!=='object'||Array.isArray(v)||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))fail('Closed source shape required');}
function text(v:any):void{if(typeof v!=='string'||!v.length)fail('Exact source identity required');}
function ref(r:any):string{shape(r,['documentId','moduleId','elementId']);Object.values(r).forEach(text);return id(r);}
export function validateCandidateCatalogStorage(program:any,o:any,step:()=>void):Map<string,any> {
 const ont=program.ontology.ontology,c=program.catalog??{transforms:[]};
  shape(o,['version','id','revision','storage'],['disclosure']);text(o.id);text(o.revision);
  if(o.version!=='umf.security.logical-owner/0.1'||!Array.isArray(o.storage)||o.storage.length>4096)fail('Exact stored-query source profile required');
  if(Object.hasOwn(o,'disclosure')){shape(o.disclosure,['readAction']);text(o.disclosure.readAction);if(!ont.actionPurposes.some((p:any)=>p.action===o.disclosure.readAction&&p.purposes.includes('read')))fail('Exact owner read-purpose declaration required');}
  const fields=new Map<string,Set<string>>(ont.entities.map((e:any)=>[id(e.type),new Set<string>(e.fields.map((f:any)=>id(f.ref)))]));
  const storage=new Map<string,any>();
  for(const entry of o.storage){
   step();shape(entry,['type','field','storageEffect'],['storageTransform']);const type=ref(entry.type),field=ref(entry.field),key=JSON.stringify([type,field]);
   if(!fields.get(type)?.has(field)||storage.has(key))fail('Invalid or duplicate owner storage member');
   const stored=c.transforms.filter((t:any)=>{step();return t.custody?.storageEffect==='stored-transformed'&&id(t.outputDomain)===field;});
   if(entry.storageEffect==='canonical'){if(Object.hasOwn(entry,'storageTransform')||stored.length)fail('Canonical storage downgrade');}
   else if(entry.storageEffect==='stored-transformed'){
    shape(entry.storageTransform,['id','version']);text(entry.storageTransform.id);text(entry.storageTransform.version);
    if(!stored.some((t:any)=>t.id===entry.storageTransform.id&&t.version===entry.storageTransform.version&&['tokenize','encrypt'].includes(t.kind)))fail('Exact stored output transform required');
   }else fail('Unsupported storage effect');
   storage.set(key,entry);
  }
  for(const [type,members] of fields)for(const field of members){step();if(!storage.has(JSON.stringify([type,field])))fail('Incomplete owner storage map');}
 return storage;
}
