import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {version as graphqlJs} from 'graphql';
import {relationshipExtraCases} from './relationship-extras-cases';
import {projectRelationshipToExtra,classifyRelationshipExtra,importRelationshipExtraArchive} from '../../src';
if(graphqlJs!=='17.0.2')throw Error('Unpinned GraphQL.js');
const cases=[];
for(const c of relationshipExtraCases()){
 const r=projectRelationshipToExtra(c.source,c.author,c.request);if(r.status!==c.expected)throw Error(c.name);
 if(r.status==='blocked')continue;
 const classified=classifyRelationshipExtra(importRelationshipExtraArchive(r.nativeArchive!,'native-oracle'),{system:c.request.system,mode:'report',archive:r.nativeArchive!});
 if(classified.target!.modules.some(m=>Object.hasOwn(m,'relationships')))throw Error('Native inference created authored relationship');
 cases.push({name:c.name,request:c.request,relationship:c.author.request,archive:r.nativeArchive,observations:classified.observations});
}
const base='fixtures/validation/relationship-extras';await Bun.write(base+'/corpus.json',JSON.stringify({graphqlJs,cases},null,2)+'\n');
const native=[];
for(const [system,python] of [['graphql','.venv/bin/python'],['rdf','.cache/rdf-venv/bin/python'],['linkml','.cache/linkml-venv/bin/python']] as const){
 const child=Bun.spawn([python,'scripts/core-ideals/relationship-extras-native.py',system],{stdout:'inherit',stderr:'inherit'});if(await child.exited)throw Error('Native '+system+' oracle failed');
 native.push(await Bun.file(base+'/native-'+system+'.json').json());
}
await Bun.write(base+'/native.json',JSON.stringify({versions:Object.assign({},...native.map(n=>n.versions)),environments:native.map(n=>({versions:n.versions,python:n.python,interpreter:n.interpreter})),cases:native.flatMap(n=>n.cases)},null,2)+'\n');
const paths=['src/core-ideals/relationship-extras.ts','spec/core/relationship-extras.schema.json','scripts/core-ideals/relationship-extras-cases.ts','scripts/core-ideals/relationship-extras-oracle.ts','scripts/core-ideals/relationship-extras-native.py','fixtures/relationship/authored/corpus.json','native/linkml/sources/linkml_model/meta.py','native/linkml/sources/linkml_model/annotations.py','native/linkml/sources/linkml_model/extensions.py',base+'/corpus.json',base+'/native.json',base+'/native-graphql.json',base+'/native-rdf.json',base+'/native-linkml.json'];
await Bun.write(base+'/oracle.json',JSON.stringify({scope:'Native schema/graph acceptance of explicit generic Record relationship carriers; no instance validation, resolver, query execution, relationship admission or priority-gate substitution',cases:cases.length,versions:{graphqlJs,graphqlCore:'3.2.12',rdflib:'7.6.0',linkmlMetamodel:'1.11.0',linkmlRuntime:'1.11.0rc2'},sha256:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))},null,2)+'\n');
