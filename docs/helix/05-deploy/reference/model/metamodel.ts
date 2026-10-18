export interface SelfModelCatalog {profile:'umf.metamodel/1';document:{modules:{id:string;elements:Record<string,any>[]}[]};sources:{path:string;sha256:string;bytes:number}[]}
export function selfModelGraph(catalog:SelfModelCatalog){
 if(catalog.profile!=='umf.metamodel/1')throw Error('SELF_MODEL_PROTOCOL');
 const elements:(Record<string,any>&{module:string})[]=catalog.document.modules.flatMap(m=>m.elements.map(e=>({...e,module:m.id}))),records=elements.filter(e=>e.kind==='record');
 const qualified=(e:{module:string;element:string})=>JSON.stringify([e.module,e.element]);
 const find=(r:{module:string;element:string})=>elements.find(e=>e.module===r.module&&e.id===r.element);
 const edges:{id:string;source:string;target:string;label:string;directed:boolean}[]=[];
 for(const record of records){const source=qualified({module:record.module,element:record.id});
  const add=(ref:any,label:string)=>{if(!find(ref)||find(ref)!.kind!=='record')throw Error('SELF_MODEL_UNRESOLVED '+JSON.stringify(ref));edges.push({id:JSON.stringify([source,label,qualified(ref)]),source,target:qualified(ref),label,directed:true});};
  for(const member of record.members??[]){const field=find(member);if(!field)throw Error('SELF_MODEL_UNRESOLVED member');const value=field.itemType?find(field.itemType):field;for(const ref of value?.references??[])if(ref.role==='record-type')add(ref,field.name+(field.itemType?'[]':''));}
  for(const connection of record.extensions?.['umf.metamodel']?.connections??[])add(connection.target,connection.label);
 }
 return {records:records.map(r=>({id:qualified({module:r.module,element:r.id}),label:r.name,properties:r.members?.length??0})),edges};
}
