import {generateDomainPackSchema} from '../src/domain-packs/schema';
const schema=generateDomainPackSchema();
const manifest={id:'umf.domain-pack',version:'1.0.0',coreVersion:'0.1.0',
 description:'Portable sample-domain pack metadata with opaque implementation and schema references',
 schema,semantics:'References are data. No imports, fetching, generation, loading or ontology semantics are authorized.',
 scopes:['document'],capabilities:{validation:'structural',directions:[],evidence:['tests/domain-packs/schema.test.ts']}};
for(const [name,value] of [['schema',schema],['package',manifest]] as const){
 const path=`spec/extensions/domain-pack/${name}.json`,text=JSON.stringify(value,null,2)+'\n';
 if(process.argv.includes('--check')){if(!await Bun.file(path).exists()||await Bun.file(path).text()!==text)throw Error('Stale '+path);}
 else await Bun.write(path,text);
}

import {generateDatasetSourceSchema} from '../src/domain-packs/source-schema';
const sourceSchema=generateDatasetSourceSchema();
const sourcePackage={...manifest,id:'umf.dataset-source',description:'Dataset source references and provenance, without retrieval or authentication',schema:sourceSchema};
for(const [name,value] of [['schema',sourceSchema],['package',sourcePackage]] as const){
 const path=`spec/extensions/dataset-source/${name}.json`,text=JSON.stringify(value,null,2)+'\n';
 if(process.argv.includes('--check')){if(!await Bun.file(path).exists()||await Bun.file(path).text()!==text)throw Error('Stale '+path);}
 else await Bun.write(path,text);
}
