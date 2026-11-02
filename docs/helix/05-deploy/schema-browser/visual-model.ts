// SPDX-License-Identifier: MIT OR Apache-2.0
/** Source identity and display identity are separate; labels never become keys. */
export type ChangeStatus='created'|'changed'|'removed'|'unchanged';
export interface ComponentModel {
 records:{id:string;label?:string;properties?:number;status?:ChangeStatus}[];
 edges:{id:string;source:string;target:string;label?:string;directed?:boolean;status?:ChangeStatus}[];
}
export interface MapAnnotation {badge:string;tooltip?:string;tone?:string}

/** A display projection retains the whole supplied model, including unknown
 * content and unresolved relationships. It never rewrites the schema source. */
export function recordMapProjection<T extends ComponentModel>(input:T,focus='',annotations:Record<string,MapAnnotation[]>={}){
 const source=structuredClone(input);
 const retainedAnnotations=structuredClone(annotations);
 const recordIds=new Set<string>(),edgeIds=new Set<string>();
 for(const record of source.records){
  if(recordIds.has(record.id))throw Error('Duplicate record identity: '+record.id);
  recordIds.add(record.id);
 }
 for(const edge of source.edges){
  if(edgeIds.has(edge.id))throw Error('Duplicate relationship identity: '+edge.id);
  edgeIds.add(edge.id);
 }
 if(focus&&!recordIds.has(focus))throw Error('Unknown focus record: '+focus);
 const edges=focus?source.edges.filter(edge=>edge.source===focus||edge.target===focus):source.edges;
 const neighborhood=new Set([focus,...edges.flatMap(edge=>[edge.source,edge.target])]);
 const records=focus?source.records.filter(record=>neighborhood.has(record.id)):source.records;
 // Index in the complete source keeps identity stable when focus changes.
 const identities=new Map(source.records.map((record,index)=>[record.id,'record-'+(index+1)]));
 const relationships=new Map(source.edges.map((edge,index)=>[edge.id,'relationship-'+(index+1)]));
 const unresolved=edges.filter(edge=>!recordIds.has(edge.source)||!recordIds.has(edge.target));
 const drawable=edges.filter(edge=>recordIds.has(edge.source)&&recordIds.has(edge.target));
 const notes=(id:string)=>(Object.hasOwn(retainedAnnotations,id)?retainedAnnotations[id]!:[]).map(note=>note.badge+(note.tone?' ['+note.tone+']':'')+(note.tooltip?' · '+note.tooltip:''));
 const visual={
  id:'schema-record-map',kind:'flow' as const,form:'network' as const,
  question:focus?'Which declared records connect to this record?':'Which relationships are declared between these records?',
  omissions:['This display projection draws record labels, property counts, status/annotations and resolved binary relationship labels, endpoints and direction. Other source metadata and unresolved declarations remain in the source snapshot; no storage or enforcement semantics are inferred.'],
  nodes:records.map(record=>({id:identities.get(record.id)!,label:record.label??record.id,
   detail:[`${record.properties??0} ${record.properties===1?'property':'properties'}`,record.status&&record.status!=='unchanged'?record.status:undefined,...notes(record.id)].filter(Boolean).join(' · '),
   ...(record.id===focus?{emphasis:'focus' as const}:{}),
  })),
  edges:drawable.map(edge=>({id:relationships.get(edge.id)!,from:identities.get(edge.source)!,to:identities.get(edge.target)!,
   directed:edge.directed===true,
   label:[edge.label??edge.id,edge.status&&edge.status!=='unchanged'?edge.status:undefined,...notes(edge.id)].filter(Boolean).join(' · '),
  })),
 };
 return {source,annotations:retainedAnnotations,visual,records,edges,drawable,unresolved,
  recordIds:new Map(records.map(record=>[identities.get(record.id)!,record.id])),
  edgeIds:new Map(drawable.map(edge=>[relationships.get(edge.id)!,edge.id])),
 };
}
