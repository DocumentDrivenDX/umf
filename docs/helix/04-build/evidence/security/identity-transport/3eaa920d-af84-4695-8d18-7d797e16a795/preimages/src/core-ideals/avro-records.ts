import {getAvroNode,exportAvroBundle} from '../adapters/avro';
import {type Document} from '../model/types';import {type NativeJson} from '../model/native-json';
/** Declaration traversal only: never follow named references or inspect arbitrary annotations. */
export function avroRecords(source:Document){
 const records:{path:string;dependencyId?:string;namespace:string;name:string;fullname:string;native:NativeJson}[]=[];
 const string=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
 function visit(node:NativeJson,path:string,namespace:string,dependencyId?:string){
  if(node.kind==='array'){node.items.forEach((n,i)=>visit(n,path+'/'+i,namespace,dependencyId));return;}if(node.kind!=='object')return;
  const m=node.members,type=string(m.type);let ns=namespace;
  if(type==='record'||type==='error'){
   const name=string(m.name);if(!name)return;const declared=string(m.namespace)??namespace,fullname=name.includes('.')?name:declared?declared+'.'+name:name;ns=fullname.includes('.')?fullname.slice(0,fullname.lastIndexOf('.')):'';
   records.push({path,...(dependencyId!==undefined?{dependencyId}:{}),namespace:ns,name:fullname.slice(fullname.lastIndexOf('.')+1),fullname,native:node});
   if(m.fields?.kind==='array')m.fields.items.forEach((f,i)=>{if(f.kind==='object'&&f.members.type)visit(f.members.type,path+'/fields/'+i+'/type',ns,dependencyId);});
  }
  if(type==='array'&&m.items)visit(m.items,path+'/items',ns,dependencyId);if(type==='map'&&m.values)visit(m.values,path+'/values',ns,dependencyId);if(m.type&&m.type.kind!=='string')visit(m.type,path+'/type',ns,dependencyId);
 }
 for(const d of exportAvroBundle(source).dependencies)visit(getAvroNode(source,'',d.id),'','',d.id);visit(getAvroNode(source,''),'','');return records;
}
