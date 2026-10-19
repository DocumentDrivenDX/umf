export interface SelfModelCatalog {
 profile:'umf.metamodel/1';
 document:{umf:string;id:string;modules:{id:string;elements:Record<string,any>[]}[]};
 sources:{path:string;sha256:string;bytes:number}[];
 provenance:{modelSha256:string;compilerSha256:string};
}

/**
 * Project only relationships actually declared by the authored language model.
 * A Field is listed once under its owning Record; shape links add edges only
 * when their target resolves to another authored Record definition.
 */
export function selfModelGraph(catalog:SelfModelCatalog){
 if(catalog.profile!=='umf.metamodel/1'||catalog.document.umf!=='0.10.0')throw Error('SELF_MODEL_PROTOCOL');
 const elements:(Record<string,any>&{module:string})[]=catalog.document.modules.flatMap(m=>m.elements.map(e=>({...e,module:m.id}))),
  records=elements.filter(e=>e.kind==='record'),fields=elements.filter(e=>e.kind==='field');
 const qualified=(module:string,element:string)=>JSON.stringify([module,element]);
 const find=(module:string,element:string)=>elements.find(e=>e.module===module&&e.id===element);
 const recordByDefinition=new Map(records.map(r=>[r.extensions?.['umf.metamodel']?.definition??r.id,r]));
 const edges:{id:string;source:string;target:string;label:string;directed:boolean}[]=[];
 const targets=(shape:any,out:string[]=[]):string[]=>{
  if(!shape||typeof shape!=='object'||Array.isArray(shape))return out;
  if(shape.tag==='link'&&typeof shape.target==='string')out.push(shape.target);
  for(const [key,value]of Object.entries(shape))if(key!=='target'){
   if(Array.isArray(value))for(const item of value)targets(item,out);else targets(value,out);
  }
  return out;
 };
 for(const record of records){
  const source=qualified(record.module,record.id);
  for(const member of record.members??[]){
   const field=find(member.module,member.element);if(!field||field.kind!=='field')throw Error('SELF_MODEL_UNRESOLVED member '+JSON.stringify(member));
   const meta=field.extensions?.['umf.metamodel']??{};
   const declared=field.references?.filter((r:any)=>r.role==='record-type').map((r:any)=>r.element)??[];
   const shapeTargets=targets(meta.shape);
   for(const targetName of [...new Set([...declared,...shapeTargets])]){
    const target=recordByDefinition.get(targetName);if(!target)continue;
    const targetId=qualified(target.module,target.id),label=field.name+(field.cardinality==='array'?'[]':'');
    edges.push({id:JSON.stringify([source,label,targetId]),source,target:targetId,label,directed:true});
   }
  }
 }
 const ids=new Set<string>();for(const edge of edges){if(ids.has(edge.id))throw Error('SELF_MODEL_DUPLICATE_EDGE '+edge.id);ids.add(edge.id);}
 return {
  records:records.map(r=>({id:qualified(r.module,r.id),label:r.name??r.id,properties:r.members?.length??0})),
  fields:fields.map(f=>({id:qualified(f.module,f.id),label:f.name??f.id,owner:records.find(r=>(r.members??[]).some((m:any)=>m.module===f.module&&m.element===f.id))?.id??null})),
  edges,
 };
}
