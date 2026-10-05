import {test,expect} from 'bun:test';
import {Registry,validateDocument,selectCoreElements} from '../../src/index';
import {schemaPropertiesFixture} from '../../scripts/core-schema-properties-cases';
import type {ExtensionPackage} from '../../src/model/types';

test('extension validators receive complete isolated 0.8.0 context at every scope',()=>{
 const doc=schemaPropertiesFixture(),id='fixture.context';doc.vocabularies[id]={version:'1.0.0'};
 doc.extensions={[id]:{}};doc.modules[0]!.extensions={[id]:{}};doc.modules[0]!.elements[1]!.extensions={[id]:{}};
 const before=JSON.stringify(doc),scopes:string[]=[];
 const manifest:ExtensionPackage={id,version:'1.0.0',coreVersion:'0.1.0',description:'Context regression',schema:{type:'object'},semantics:'Synthetic context check',scopes:['document','module','element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
 const registry=new Registry().register(manifest,(_payload,context)=>{
  scopes.push(context.scope);expect(context.document.umf).toBe('0.8.0');
  expect(context.document.title).toBe('Orders');expect(context.document.modules[0]!.elements[1]!.facets).toEqual(doc.modules[0]!.elements[1]!.facets);
  context.document.title='mutated private copy';
  return [{code:'RANGE_POLICY',path:context.path,message:'Declared range refused',severity:'error'}];
 });
 const result=validateDocument(doc,registry);expect(result.valid).toBe(false);
 expect(result.diagnostics.filter(d=>d.code==='RANGE_POLICY')).toHaveLength(3);
 expect(scopes).toEqual(['document','module','element']);expect(JSON.stringify(doc)).toBe(before);
 expect(()=>selectCoreElements(doc,{references:'none',identities:[]},registry)).toThrow('RANGE_POLICY');
});
