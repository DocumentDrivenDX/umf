import {test,expect} from 'bun:test';
import {SemanticTypeRegistry,validateSemanticTypeValue,getSemanticTypes,setSemanticTypes,semanticTypesRegistry,SEMANTIC_TYPES_EXTENSION as id} from '../../src/extensions/semantic-types';
import {readDocument,writeDocument} from '../../src/model/document';
import {validateDocument} from '../../src/validation/document';
import type {Document,JsonObject,Json} from '../../src/model/types';
const ref={vocabulary:'example.contact',version:'1.0.0',term:'email'};
const doc=():Document=>({umf:'0.1.0',id:'semantic',vocabularies:{[id]:{version:'0.1.0'},future:{version:'9.0.0'}},modules:[{id:'m',namespace:'example',elements:[{id:'e',scalarType:'string',extensions:{[id]:{types:[ref],future:{opaque:true}},future:{domain_type:'email',recipe:{type:'native'}}}}]}]});
test('exact vocabulary and version identities never fall back',()=>{
 const registry=new SemanticTypeRegistry().register(ref,{description:'Publisher meaning'},()=>({status:'valid',complete:true,issues:[]}));
 expect(validateSemanticTypeValue(ref,'x',registry).status).toBe('valid');
 for(const other of [{...ref,version:'2.0.0'},{...ref,vocabulary:'other'},{...ref,term:'phone_number'}])expect(registry.check(other,'x')).toMatchObject({status:'unknown',complete:false});
 expect(()=>registry.register(ref,{})).toThrow('already registered');
 registry.register({...ref,version:'2.0.0'},{}).register({...ref,vocabulary:'other'},{});
 expect(registry.check({...ref,version:'2.0.0'},'x').status).toBe('unknown');
});
test('value checks keep null and explicit invalidity; definitions and values are isolated',()=>{
 const definition:JsonObject={nested:{meaning:'original'}};
 const value:JsonObject={email:'original'};
 const registry=new SemanticTypeRegistry().register(ref,definition,(v,d)=>{
  (d.nested as JsonObject).meaning='changed';
  if(v===null)return {status:'invalid',complete:true,issues:['Null excluded by this publisher']};
  (v as JsonObject).email='changed';return {status:'valid',complete:false,issues:['Partial scope']};
 });
 (definition.nested as JsonObject).meaning='outside';
 const lookup=registry.lookup(ref)!;(lookup.nested as JsonObject).meaning='outside';
 expect(registry.check(ref,value)).toMatchObject({status:'valid',complete:false});
 expect(value.email).toBe('original');
 expect(registry.lookup(ref)).toEqual({nested:{meaning:'original'}});
 expect(registry.check(ref,null)).toMatchObject({status:'invalid',complete:true});
});
test('unknown qualifiers prevent validator execution',()=>{
 let called=false;
 const registry=new SemanticTypeRegistry().register(ref,{},()=>{called=true;return {status:'valid',complete:true,issues:[]};});
 expect(registry.check({...ref,locale:'future'},'x')).toMatchObject({status:'unknown',complete:false,reference:{locale:'future'}});
 expect(called).toBe(false);
});
test('throwing and malformed validators cannot establish validity',()=>{
 for(const validator of [()=>{throw new Error('failure');},()=>({status:'unknown',complete:true,issues:[]}),()=>({status:'valid',complete:true,issues:[42]}),()=>({status:'valid',complete:true,issues:[],future:true})]){
  const registry=new SemanticTypeRegistry().register(ref,{},validator as any);
  expect(registry.check(ref,'x')).toMatchObject({status:'unknown',complete:false});
 }
});
test('a thrown validator error reports its message without establishing validity',()=>{
 const result=new SemanticTypeRegistry().register(ref,{},()=>{throw new Error('checksum table missing');}).check(ref,'x');
 expect(result).toMatchObject({status:'unknown',complete:false});expect(result.issues[0]).toContain('checksum table missing');
});
test('malformed identities and registration definitions reject',()=>{
 for(const bad of [{...ref,term:''},{...ref,version:42},null])expect(()=>new SemanticTypeRegistry().register(bad as any,{})).toThrow();
 expect(()=>new SemanticTypeRegistry().register(ref,[] as any)).toThrow();
 expect(()=>new SemanticTypeRegistry().register({...ref,future:true},{})).toThrow();
});
test('annotations preserve native and unknown content in both serializations and copied access',()=>{
 const source=doc();
 for(const format of ['json','yaml'] as const){
  const restored=readDocument(writeDocument(source,format),format);
  expect(restored).toEqual(source);
  const annotation=getSemanticTypes(restored,'m','e');annotation.types[0]!.term='changed';
  expect(getSemanticTypes(restored,'m','e').types[0]!.term).toBe('email');
  const result=validateDocument(restored,semanticTypesRegistry());
  expect(result.valid).toBe(true);expect(result.complete).toBe(false);
  expect(result.diagnostics.some(d=>d.code==='SEMANTIC_TYPE_UNKNOWN')).toBe(true);
 }
});
test('wrong scopes, malformed payloads and unavailable profile reject',()=>{
 const source=doc();source.extensions={[id]:{types:[ref]}};
 expect(validateDocument(source,semanticTypesRegistry()).diagnostics.some(d=>d.code==='EXTENSION_SCOPE')).toBe(true);
 const invalid=doc();invalid.modules[0]!.elements[0]!.extensions[id]={types:[]};
 expect(()=>getSemanticTypes(invalid,'m','e')).toThrow();
 const missing=doc();missing.vocabularies[id]!.version='2.0.0';expect(()=>getSemanticTypes(missing,'m','e')).toThrow();
 expect(()=>getSemanticTypes(doc(),'m','missing')).toThrow();
});

test('copy-on-write authoring preserves context and refuses profile overwrite',()=>{
 const source=doc();
 const candidate=setSemanticTypes(source,'m','e',{types:[{...ref,term:'phone_number'}]});
 expect(getSemanticTypes(source,'m','e').types[0]!.term).toBe('email');
 expect(getSemanticTypes(candidate,'m','e').types[0]!.term).toBe('phone_number');
 expect(candidate.modules[0]!.elements[0]!.extensions.future).toEqual(source.modules[0]!.elements[0]!.extensions.future);
 expect(()=>setSemanticTypes(source,'m','missing',{types:[ref]})).toThrow();
 source.vocabularies[id]!.version='2.0.0';
 expect(()=>setSemanticTypes(source,'m','e',{types:[ref]})).toThrow();
});
