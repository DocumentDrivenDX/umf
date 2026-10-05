import {test,expect} from 'bun:test';
import {Registry,validateDocument,selectCoreElements,validateCoreFieldValue,declareCoreSchemaProperties,verifyCoreSchemaPropertyDeclaration,resolveCoreDefault} from '../../src/index';
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

test('nullable numeric Fields reject null bounds without throwing',()=>{
 for(const scalarType of ['integer','decimal'])for(const end of ['min','max'])for(const paired of [false,true]){
  const wrapper=scalarType==='integer'?'integerToken':'decimalToken';
  const range:Record<string,unknown>={[end]:null};if(paired)range[end==='min'?'max':'min']={[wrapper]:'1'};
  const doc={umf:'0.8.0',id:'bounds',vocabularies:{},modules:[{id:'m',namespace:'n',elements:[{id:'f',kind:'field',scalarType,nullability:'absent-allowed',extensions:{},facets:{...(scalarType==='decimal'?{precision:20,scale:2}:{}),range}}]}]} as any;
  expect(validateDocument(doc).valid).toBe(false);
  expect(validateCoreFieldValue(doc,{module:'m',element:'f'},{[wrapper]:'1'} as any).valid).toBe(false);
 }
});

function numericDocument(scalarType='integer',range:Record<string,unknown>={min:{integerToken:'0'},max:{integerToken:'10'}}):any {
 return {umf:'0.8.0',id:'numeric',vocabularies:{},modules:[{id:'m',namespace:'n',elements:[{id:'f',kind:'field',scalarType,extensions:{},facets:{...(scalarType==='decimal'?{precision:20,scale:2}:{}),range}}]}]};
}
const numericIdentity={scope:'element' as const,module:'m',element:'f'};
test('unknown facets cannot bypass known range validation or receipt verification',()=>{
 for(const unknown of [{future:true},{integerWidth:{bits:8,signed:true,future:true}}]){
  const bad=numericDocument();Object.assign(bad.modules[0].elements[0].facets,unknown,{range:{min:{integerToken:'10'},max:{integerToken:'1'}}});
  expect(validateDocument(bad).valid).toBe(false);
  expect(()=>declareCoreSchemaProperties(bad,numericIdentity,{title:'Invalid'})).toThrow();
  const good=numericDocument();good.modules[0].elements[0].facets.future=true;
  const receipt=declareCoreSchemaProperties(good,numericIdentity,{title:'Good'});
  expect(receipt.target.modules[0]!.elements[0]!.facets!.future).toBe(true);
  const forged=structuredClone(receipt);Object.assign((forged.target.modules[0]!.elements[0]!.facets as any),unknown,{range:{min:{integerToken:'10'},max:{integerToken:'1'}}});
  expect(()=>verifyCoreSchemaPropertyDeclaration(forged,forged.target)).toThrow();
 }
});
