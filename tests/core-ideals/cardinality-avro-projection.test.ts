import {expect,test} from 'bun:test';
import {declareCoreCardinality} from '../../src/model/cardinality';
import type {Document,Cardinality} from '../../src/model/types';
import {projectCardinalityToAvro,recoverCardinalityFromAvro,type CardinalityAvroRequest} from '../../src/core-ideals/cardinality-avro-projection';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const base:CardinalityAvroRequest={id:'projection',recordName:'Example',namespace:'',fieldName:'value',nativeType:'"long"',dependencies:[],availability:'avro-null-value',requireExactValues:false,mode:'strict'};
function doc():Document{return {umf:'0.4.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]};}
const author=(shape:Cardinality)=>declareCoreCardinality(doc(),{module:'m',element:'f'},{cardinality:shape});
test('explicit native shape mismatches and absent item meaning are residuals with exact ideal recovery',()=>{
 for(const cardinality of ['one','array','map','unspecified'] as const)for(const nativeType of ['"long"','{"type":"array","items":"long"}','{"type":"map","values":"long"}'])for(const mode of ['strict','report'] as const){
  const a=author(cardinality),r=projectCardinalityToAvro(a,{...base,nativeType,mode});const exact=cardinality==='one'&&nativeType==='"long"';
  expect(r.status).toBe(mode==='strict'&&!exact?'blocked':'projected');
  if(!r.target){expect(r.nativeBundle).toBeUndefined();continue;}
  for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverCardinalityFromAvro(back,back.nativeBundle!)).toEqual(a.target);}
 }
},120000);
test('nested item and value types map recursively with independent availability and qualified scalar families',()=>{
 const source=doc(),root=source.modules[0]!.elements[0]!;root.nullability='required';
 source.modules[0]!.elements.push({id:'map',kind:'field',cardinality:'map',itemType:{module:'m',element:'leaf'},nullability:'absent-allowed',extensions:{}},{id:'leaf',kind:'field',cardinality:'one',scalarType:'integer',nullability:'required',extensions:{}});
 const a=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:'array',itemType:{module:'m',element:'map'}});
 const nativeType=JSON.stringify({type:'array',items:['null',{type:'map',values:'long'}]});
 const r=projectCardinalityToAvro(a,{...base,nativeType});expect(r.status).toBe('projected');expect(r.residuals).toEqual([]);expect(r.mapping.items.map(i=>i.nativeLocation.path)).toEqual(['/fields/0/type','/fields/0/type/items','/fields/0/type/items/1/values']);expect(recoverCardinalityFromAvro(r,r.nativeBundle!)).toEqual(a.target);
 expect(projectCardinalityToAvro(a,{...base,nativeType,availability:'unresolved'}).status).toBe('blocked');
 expect(projectCardinalityToAvro(a,{...base,nativeType:nativeType.replace('["null",','[')}).status).toBe('blocked');
 const narrowed=projectCardinalityToAvro(a,{...base,nativeType,requireExactValues:true});expect(narrowed.status).toBe('blocked');expect(narrowed.residuals.some(x=>x.reason.includes('1.0000000000000002'))).toBe(true);
});
test('cycles, unknown metadata, native diagnostics and target edits remain explicit and recoverable',()=>{
 const source=doc();source.vocabularies.future={version:'1.0.0'};source.extensions={future:{opaque:'preserve'}};
 const root=source.modules[0]!.elements[0]!;root.extensions.future={opaque:1};root.nullability='unspecified';
 const a=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:'array',itemType:{module:'m',element:'f',future:'keep'}});
 const r=projectCardinalityToAvro(a,{...base,mode:'report',nativeType:'{"type":"array","items":{"type":"long","logicalType":"future"}}'});
 expect(r.status).toBe('projected');expect(r.residuals.some(x=>x.path.endsWith('/itemType/future'))).toBe(true);expect(r.residuals.some(x=>x.path==='/request/nativeType')).toBe(true);expect(r.residuals.some(x=>x.path==='/vocabularies')).toBe(true);expect(recoverCardinalityFromAvro(r,r.nativeBundle!)).toEqual(a.target);
 const changed=structuredClone(r.nativeBundle!);changed.schema+=' ';expect(()=>recoverCardinalityFromAvro(r,changed)).toThrow();
 const forged=structuredClone(r);forged.mapping.items[0]!.nativeLocation.path='/wrong';expect(()=>recoverCardinalityFromAvro(forged,r.nativeBundle!)).toThrow();
 for(const nativeType of ['{"type":"array"}','"Missing"','["long","long"]'])expect(()=>projectCardinalityToAvro(author('one'),{...base,nativeType})).toThrow();
 for(const fieldName of ['bad-name','value\n',''])expect(()=>projectCardinalityToAvro(author('one'),{...base,fieldName})).toThrow();
});

test('dependency changes and large uninterpreted native tokens cannot be hidden by ideal recovery',()=>{
 const source=doc();source.modules[0]!.elements[0]!.scalarType='string';const a=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:'one'});
 const r=projectCardinalityToAvro(a,{...base,nativeType:'"dep.Choice"',dependencies:[{id:'types',schema:' {"type":"enum","name":"dep.Choice","symbols":["A","B"]} '}]});
 expect(r.status).toBe('projected');expect(recoverCardinalityFromAvro(r,r.nativeBundle!)).toEqual(a.target);
 const changed=structuredClone(r.nativeBundle!);changed.dependencies[0]!.schema=changed.dependencies[0]!.schema.replace('"B"','"C"');expect(()=>recoverCardinalityFromAvro(r,changed)).toThrow();
 const renamed=structuredClone(r.nativeBundle!);renamed.dependencies[0]!.id='other';expect(()=>recoverCardinalityFromAvro(r,renamed)).toThrow();
 const unknown=projectCardinalityToAvro(author('one'),{...base,mode:'report',nativeType:'{"type":"long","future":9007199254740993}'});
 expect(unknown.nativeBundle!.schema).toContain('9007199254740993');expect(unknown.residuals.some(x=>x.path==='/request/nativeType')).toBe(true);
 expect(projectCardinalityToAvro(author('one'),{...base,nativeType:'{"type":"long","future":9007199254740993}'}).status).toBe('blocked');
});

test('fresh native ingestion composes with retained ideal recovery without inventing original author intent',async()=>{
 const {avroCardinalityProjectionCases}=await import('../../scripts/core-ideals/cardinality-avro-projection-cases');
 const {verifyAvroCardinalityComposition}=await import('../../scripts/core-ideals/cardinality-avro-composition');
 let emitted=0,differentNativeShape=0;
 for(const c of avroCardinalityProjectionCases()){
  const r=projectCardinalityToAvro(c.author,c.request);if(!r.nativeBundle)continue;
  const checked=verifyAvroCardinalityComposition(r);emitted++;
  expect(checked.nativeRecoveries).toBe(2);expect(checked.idealRecoveries).toBe(2);
  if(checked.nativeCardinality!==checked.authoredCardinality){differentNativeShape++;expect(r.mapping.outcome).not.toBe('exact');}
 }
 expect(emitted).toBe(52);expect(differentNativeShape).toBeGreaterThan(0);
},120000);
