import {test,expect} from 'bun:test';
import {Registry,editExtension,validateDocument,selectCoreElements,validateCoreFieldValue,declareCoreSchemaProperties,resolveCoreDefault} from '../../src/index';
import {schemaPropertiesFixture} from '../../scripts/core-schema-properties-cases';
import type {ExtensionPackage} from '../../src/model/types';
import type {CoreLiteral} from '../../src/model/schema-literals';

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
 const referenced=schemaPropertiesFixture();const item=referenced.modules[0]!.elements[4]!;item.nullability='absent-allowed';item.facets={range:{min:null}};
 expect(validateDocument(referenced).valid).toBe(false);
});

function numericDocument(scalarType='integer',range:Record<string,unknown>={min:{integerToken:'0'},max:{integerToken:'10'}}):any {
 return {umf:'0.8.0',id:'numeric',vocabularies:{},modules:[{id:'m',namespace:'n',elements:[{id:'f',kind:'field',scalarType,extensions:{},facets:{...(scalarType==='decimal'?{precision:20,scale:2}:{}),range}}]}]};
}
const numericIdentity={scope:'element' as const,module:'m',element:'f'};
test('unknown facets cannot bypass known range validation',()=>{
 for(const unknown of [{future:true},{integerWidth:{bits:8,signed:true,future:true}}]){
  const bad=numericDocument();Object.assign(bad.modules[0].elements[0].facets,unknown,{range:{min:{integerToken:'10'},max:{integerToken:'1'}}});
  expect(validateDocument(bad).valid).toBe(false);
  expect(()=>declareCoreSchemaProperties(bad,numericIdentity,{title:'Invalid'})).toThrow();
  const good=numericDocument();good.modules[0].elements[0].facets.future=true;
  const authored=declareCoreSchemaProperties(good,numericIdentity,{title:'Good'});
  expect((authored.modules[0]!.elements[0]!.facets as any).future).toBe(true);
  const invalid=structuredClone(authored);Object.assign((invalid.modules[0]!.elements[0]!.facets as any),unknown,{range:{min:{integerToken:'10'},max:{integerToken:'1'}}});
  expect(validateDocument(invalid).valid).toBe(false);
 }
});

test('integer and fixed-scale ranges reject empty discrete intervals',()=>{
 for(const scalarType of ['integer','decimal'])for(const start of [-1,0,1])for(const gap of [0,1,2])for(const minInclusive of [false,true])for(const maxInclusive of [false,true]){
  const token=(n:number)=>scalarType==='integer'?{integerToken:String(n)}:{decimalToken:(n/100).toFixed(2)};
  const doc=numericDocument(scalarType,{min:token(start),max:token(start+gap),minInclusive,maxInclusive});
  const valid=start+(minInclusive?0:1)<=start+gap-(maxInclusive?0:1);
  expect(validateDocument(doc).valid).toBe(valid);
 }
});

test('single exclusive bounds reject integer and decimal domain extrema',()=>{
 const domains:{scalarType:string;facets:Record<string,unknown>;min:bigint;max:bigint;scale:number}[]=[];
 for(const bits of [1,2,8,64])for(const signed of [false,true]){
  const magnitude=1n<<BigInt(bits-(signed?1:0));
  domains.push({scalarType:'integer',facets:{integerWidth:{bits,signed}},min:signed?-magnitude:0n,max:magnitude-1n,scale:0});
 }
 for(const [precision,scale] of [[1,0],[2,0],[2,2],[20,2]] as const){
  const max=10n**BigInt(precision)-1n;
  domains.push({scalarType:'decimal',facets:{precision,scale},min:-max,max,scale});
 }
 for(const domain of domains)for(const end of ['min','max'] as const){
  const wrapper=domain.scalarType==='integer'?'integerToken':'decimalToken';
  const token=(coefficient:bigint)=>({[wrapper]:`${coefficient}e-${domain.scale}`} as CoreLiteral);
  const extreme=end==='min'?domain.max:domain.min,flag=end+'Inclusive';
  const source=numericDocument(domain.scalarType);source.modules[0].elements[0].facets=domain.facets;
  const before=JSON.stringify(source),emptyRange={[end]:token(extreme),[flag]:false};
  const invalid=structuredClone(source);invalid.modules[0].elements[0].facets.range=emptyRange;
  expect(validateDocument(invalid).valid).toBe(false);
  expect(()=>declareCoreSchemaProperties(source,numericIdentity,{facets:{range:emptyRange}})).toThrow();
  expect(JSON.stringify(source)).toBe(before);
  for(const range of [{[end]:token(extreme),[flag]:true},{[end]:token(extreme+(end==='min'?-1n:1n)),[flag]:false}]){
   const receipt=declareCoreSchemaProperties(source,numericIdentity,{facets:{range}});
   expect(validateDocument(receipt).valid).toBe(true);
   expect(validateCoreFieldValue(receipt,{module:'m',element:'f'},token(extreme) as any).valid).toBe(true);
  }
 }
});

test('range emptiness checks do not expand enormous numeric domains',()=>{
 const enormous=Number.MAX_SAFE_INTEGER;
 for(const signed of [false,true])for(const end of ['min','max'] as const){
  const bound=end==='min'?'127':signed?'-128':'1';
  const doc=numericDocument('integer',{[end]:{integerToken:bound},[end+'Inclusive']:false});
  doc.modules[0].elements[0].facets.integerWidth={bits:enormous,signed};
  expect(validateDocument(doc).valid).toBe(true);
 }
 const unsigned=numericDocument('integer',{max:{integerToken:'0'},maxInclusive:false});
 unsigned.modules[0].elements[0].facets.integerWidth={bits:enormous,signed:false};
 expect(validateDocument(unsigned).valid).toBe(false);
 for(const scale of [0,enormous])for(const end of ['min','max'] as const){
  const doc=numericDocument('decimal',{[end]:{decimalToken:scale===0?(end==='min'?'99':'-99'):'0'},[end+'Inclusive']:false});
  Object.assign(doc.modules[0].elements[0].facets,{precision:enormous,scale});
  expect(validateDocument(doc).valid).toBe(true);
 }
});

test('value and default APIs reject identity accessors without invoking them',()=>{
 for(const property of ['module','element'])for(const enumerable of [true,false]){
  let calls=0;const identity={module:'m',element:'quantity'};
  Object.defineProperty(identity,property,{enumerable,get(){calls++;return property==='module'?'m':'quantity';}});
  const result=validateCoreFieldValue(schemaPropertiesFixture(),identity,{integerToken:'1'});
  expect(result.valid).toBe(false);expect(calls).toBe(0);
  expect(()=>resolveCoreDefault(schemaPropertiesFixture(),identity,{state:'missing'})).toThrow();expect(calls).toBe(0);
 }
});

test('explicit malformed facet patches reject atomically',()=>{
 const doc=schemaPropertiesFixture(),before=JSON.stringify(doc);
 for(const facets of [null,false,0,'',[],true,'text']){
  expect(()=>declareCoreSchemaProperties(doc,{scope:'element',module:'m',element:'quantity'},{title:'Must not apply',facets} as any)).toThrow();
  expect(JSON.stringify(doc)).toBe(before);
 }
 const receipt=declareCoreSchemaProperties(doc,{scope:'element',module:'m',element:'quantity'},{facets:{range:{min:{integerToken:'1'},max:{integerToken:'2'}}}});
 expect(validateDocument(receipt).valid).toBe(true);
});


test('unknown length units remain incomplete and block extension edits for every bound shape',()=>{
 const id='fixture.length-unit';
 const registry=new Registry().register({id,version:'1.0.0',coreVersion:'0.1.0',description:'Length unit regression',schema:{type:'object'},semantics:'Accept extension payload',scopes:['element'],capabilities:{validation:'semantic',directions:[],evidence:[]}},()=>[]);
 for(const bounds of [{min:1},{max:0},{min:0,max:0},{max:1}]){
  const doc={umf:'0.8.0',id:'unknown-unit',vocabularies:{[id]:{version:'1.0.0'}},modules:[{id:'m',namespace:'n',elements:[{id:'f',kind:'field',scalarType:'string',extensions:{[id]:{}},facets:{length:{...bounds,unit:'future-unit'}}}]}]} as any;
  const before=JSON.stringify(doc),result=validateDocument(doc,registry);
  expect(result.valid).toBe(true);expect(result.complete).toBe(false);
  expect(result.diagnostics.filter(d=>d.code==='UNKNOWN_FACET_UNIT')).toEqual([{code:'UNKNOWN_FACET_UNIT',path:'/modules/0/elements/0/facets/length/unit',message:'Length unit retained without interpretation',severity:'warning'}]);
  expect(()=>editExtension(doc,registry,'m','f',id,()=>({changed:true}))).toThrow('All present semantics must be validated before editing');
  expect(JSON.stringify(doc)).toBe(before);
  doc.modules[0].elements[0].facets.length.unit='unicode-scalar';
  expect(validateDocument(doc,registry).complete).toBe(true);
  expect(editExtension(doc,registry,'m','f',id,()=>({changed:true})).modules[0]!.elements[0]!.extensions[id]).toEqual({changed:true});
 }
});
