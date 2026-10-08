import {expect,test} from 'bun:test';
import {generateDomainPackSchema} from '../../src/domain-packs/schema';
import schema from '../../spec/extensions/domain-pack/schema.json';
import manifest from '../../spec/extensions/domain-pack/package.json';
import {Registry} from '../../src/registry/registry';
import {validateDocument} from '../../src/validation/document';
import {readDocument,writeDocument} from '../../src/index';
import type {Document,ExtensionPackage} from '../../src/model/types';

test('canonical pack schema is reproducible and registered without executable generators',()=>{
 expect(JSON.stringify(generateDomainPackSchema())).toBe(JSON.stringify(schema));
 const registry=new Registry().register(manifest as ExtensionPackage);
 const pack={id:'legal',version:'1.0.0',generator:{id:'tablespec.legal',version:'1.0.0'},
 domain_types:{client_name:{description:'Fabricated client',sample_generation:{method:'generate_client_name'},future:{retained:true}}},
 schemas:[{id:'clients',format:'tablespec',reference:'clients.json'}],future:{retained:true}};
 const document:Document={umf:'0.8.0',id:'sample-pack',vocabularies:{'umf.domain-pack':{version:'1.0.0'}},modules:[],extensions:{'umf.domain-pack':pack}};
 expect(validateDocument(document,registry).valid).toBe(true);
 for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(document,format),format)).toEqual(document);
 for(const invalid of [{...pack,version:'latest'},{...pack,generator:{id:'x'}},{...pack,domain_types:{'invalid/name':{}}}]){
  expect(validateDocument({...document,extensions:{'umf.domain-pack':invalid}},registry).valid).toBe(false);
 }
});

test('external, published synthetic and mixed source metadata remain distinct',()=>{
 const registry=new Registry().register(manifest as ExtensionPackage);
 const document:Document={umf:'0.8.0',id:'external-pack',vocabularies:{'umf.domain-pack':{version:'1.0.0'}},modules:[],extensions:{'umf.domain-pack':{
  id:'ecology',version:'1.0.0',domain_types:{observation:{}},
  sources:{measurements:{kind:'external',data_kind:'observed',reference:'https://example.invalid/observations.csv',format:'csv',revision:'release-1',license:{redistribution:'unknown'},future:{retained:true}},
   official_fixture:{kind:'external',data_kind:'fabricated',reference:'official-fixture.csv',format:'csv',license:{redistribution:'restricted'}},
   fabricated:{kind:'synthetic',data_kind:'fabricated',generator:{id:'consumer.ecology',version:'1.0.0'}}},
  schemas:[{id:'observations',format:'tablespec',reference:'observations.json'}],
  source_bindings:[{schema_id:'observations',source_id:'measurements',role:'rows'}],
 }}};
 expect(validateDocument(document,registry).valid).toBe(true);
 for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(document,format),format)).toEqual(document);
 const broken={umf:'0.8.0',id:'broken',vocabularies:document.vocabularies,modules:[],extensions:{'umf.domain-pack':{id:'x',version:'1.0.0',domain_types:{observation:{}},sources:{x:{kind:'external',data_kind:'unknown'}}}}};
 expect(validateDocument(broken,registry).valid).toBe(false);
});
