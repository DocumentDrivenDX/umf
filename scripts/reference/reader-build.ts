import {join} from 'node:path';
import {identity,latestProfile,schemaNode,treeValue,type Entry,type ReaderCatalog} from '../../docs/helix/05-deploy/reference/model';
import {apiDocumentation} from './extract';
import {concepts,propertyText,scalarMeanings,examples} from './reader-content';
import {sha,json,config} from './io';
import {validateDocument,writeDocument,readDocument,type Document} from '../../src/index';
export async function buildReader(stage:string,entries:Entry[],profiles:any,validate:(name:string,value:unknown)=>Promise<void>){
 const latest=latestProfile<{version:string;schemaPath:string}>(profiles.coreProfiles),id=identity('schema',latest.schemaPath,''),source=entries.find(e=>e.id===id);
 if(!source)throw Error('REFERENCE_LINK missing latest core');
 for(const c of concepts)schemaNode(source.data.sourceData,c.pointer);
 for(const pointer of ['', '/$defs/module','/$defs/element','/$defs/itemType'])for(const key of Object.keys(treeValue(schemaNode(source.data.sourceData,pointer)).properties??{}))if(!propertyText[key])throw Error('REFERENCE_STRUCTURE missing property explanation '+key);
 for(const value of treeValue(schemaNode(source.data.sourceData,'/$defs/knownScalarType')).enum)if(!scalarMeanings[value])throw Error('REFERENCE_STRUCTURE missing scalar explanation '+value);
 const docs=examples(latest.version);for(const example of docs)if(!validateDocument(example).valid)throw Error('REFERENCE_STRUCTURE reader example');
 const yaml=writeDocument(docs[0] as unknown as Document,'yaml');
 if(JSON.stringify(readDocument(yaml,'yaml'))!==JSON.stringify(docs[0]))throw Error('REFERENCE_STRUCTURE YAML example changed values');
 if(yaml.length>4_000_000)throw Error('REFERENCE_LIMIT YAML example');
 await Bun.write(join(stage,'example.yaml'),yaml);
 const api=[];
 for(const e of entries.filter(e=>e.kind==='api')){
  const doc=apiDocumentation.get(e.id);if(!doc)throw Error('REFERENCE_LINK API documentation '+e.id);
  await validate('api-reader',doc);const bytes=json(doc);if(new TextEncoder().encode(bytes).length>8*1024*1024)throw Error('REFERENCE_LIMIT API documentation');
  const href='reader/'+sha(e.id)+'.json';await Bun.write(join(stage,href),bytes);
  api.push({id:e.id,title:e.title,kind:doc.kind,task:doc.task,summary:doc.purpose.slice(0,240),href});
 }
 const reader:ReaderCatalog={profile:'umf.reference.reader/1',latest:{id,version:latest.version},concepts,api,propertyText,scalarMeanings,examples:docs};
 reader.api=api;await validate('reader',reader);const bytes=json(reader);if(new TextEncoder().encode(bytes).length>2*1024*1024)throw Error('REFERENCE_LIMIT reader catalog');await Bun.write(join(stage,'reader.json'),bytes);
}
