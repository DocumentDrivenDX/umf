import {test,expect} from 'bun:test';
import {declareCoreCardinality,exportParquetCapture,readJsonValue,writeJsonValue,type Document,type Cardinality} from '../../src';
import {projectCardinalityToParquet,recoverCardinalityFromParquet,type CardinalityParquetRequest,type ParquetCardinalityCarrier} from '../../src/core-ideals/cardinality-parquet-projection';
const scalar:ParquetCardinalityCarrier={kind:'scalar',nativeType:'int64',nullable:false};
const base:CardinalityParquetRequest={id:'projection',recordName:'Example',fieldName:'value',nativeType:scalar,availability:'definition-level',requireExactValues:false,mode:'strict'};
const doc=():Document=>({umf:'0.4.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]});
const author=(shape:Cardinality)=>declareCoreCardinality(doc(),{module:'m',element:'f'},{cardinality:shape});
test('Parquet projection reports shape mismatch and unasserted item meaning, recovering every emitted ideal',()=>{
 const carriers:ParquetCardinalityCarrier[]=[scalar,{kind:'array',nullable:false,item:scalar},{kind:'map',nullable:false,keyType:'string',value:scalar}];
 for(const cardinality of ['one','array','map','unspecified'] as const)for(const nativeType of carriers)for(const mode of ['strict','report'] as const){
  const a=author(cardinality),r=projectCardinalityToParquet(a,{...base,nativeType,mode});
  expect(r.status).toBe(mode==='strict'&&!(cardinality==='one'&&nativeType.kind==='scalar')?'blocked':'projected');
  if(!r.target){expect(r).not.toHaveProperty('target');continue;}
  const bytes=exportParquetCapture(r.target);
  for(const format of ['json','yaml'] as const){
   const back=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;
   expect(recoverCardinalityFromParquet(back,bytes)).toEqual(a.target);
  }
 }
},120000);
test('nested item Fields retain independent availability; MAP uniqueness and exactness block strict lowering',()=>{
 const source=doc();source.modules[0]!.elements[0]!.nullability='required';
 source.modules[0]!.elements.push({id:'inner',kind:'field',cardinality:'array',nullability:'absent-allowed',itemType:{module:'m',element:'leaf'},extensions:{}},{id:'leaf',kind:'field',cardinality:'one',scalarType:'integer',nullability:'required',extensions:{}});
 const a=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:'array',itemType:{module:'m',element:'inner'}});
 const nativeType:ParquetCardinalityCarrier={kind:'array',nullable:false,item:{kind:'array',nullable:true,item:scalar}};
 const r=projectCardinalityToParquet(a,{...base,nativeType});expect(r.status).toBe('projected');expect(r.residuals).toEqual([]);expect(r.mapping.items.map(i=>i.nativeIndex)).toEqual([1,3,5]);
 expect(recoverCardinalityFromParquet(r,exportParquetCapture(r.target!))).toEqual(a.target);
 expect(projectCardinalityToParquet(a,{...base,nativeType,availability:'unresolved'}).status).toBe('blocked');
 expect(projectCardinalityToParquet(a,{...base,nativeType,requireExactValues:true}).residuals.some(r=>r.reason.includes('1.0000000000000002'))).toBe(true);
 const mismatched=structuredClone(nativeType);mismatched.item.nullable=false;
 expect(projectCardinalityToParquet(a,{...base,nativeType:mismatched}).status).toBe('blocked');
 source.modules[0]!.elements[1]!.cardinality='map';const mapAuthor=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:'array',itemType:{module:'m',element:'inner'}});
 const mapType:ParquetCardinalityCarrier={kind:'array',nullable:false,item:{kind:'map',nullable:true,keyType:'int32',value:scalar}};
 const report=projectCardinalityToParquet(mapAuthor,{...base,nativeType:mapType,mode:'report'});
 expect(report.residuals.some(r=>r.reason.includes('unique keys'))).toBe(true);expect(report.residuals.some(r=>r.reason.includes('string carrier'))).toBe(true);
 expect(projectCardinalityToParquet(mapAuthor,{...base,nativeType:mapType}).status).toBe('blocked');
 expect(recoverCardinalityFromParquet(report,exportParquetCapture(report.target!))).toEqual(mapAuthor.target);
});
test('cycles, metadata, unknown native carrier content and altered receipts cannot be silently normalized',()=>{
 const source=doc();source.vocabularies.future={version:'1.0.0'};source.extensions={future:{opaque:'preserve'}};source.modules[0]!.elements[0]!.nullability='unspecified';
 const a=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:'array',itemType:{module:'m',element:'f',future:'keep'}});
 const r=projectCardinalityToParquet(a,{...base,mode:'report',nativeType:{kind:'array',nullable:true,item:scalar}});
 expect(r.residuals.some(x=>x.path.endsWith('/itemType/future'))).toBe(true);expect(r.residuals.some(x=>x.path==='/vocabularies')).toBe(true);
 const bytes=exportParquetCapture(r.target!);expect(recoverCardinalityFromParquet(r,bytes)).toEqual(a.target);
 const changed=bytes.slice();changed[0]=0;expect(()=>recoverCardinalityFromParquet(r,changed)).toThrow();
 const forged=structuredClone(r);forged.mapping.items[0]!.nativeIndex=999;expect(()=>recoverCardinalityFromParquet(forged,bytes)).toThrow();
 const stale=structuredClone(a);stale.target.id='changed';expect(()=>projectCardinalityToParquet(stale,base)).toThrow();
 for(const nativeType of [{...scalar,unknown:1},{kind:'array',nullable:false},{...scalar,nullable:'false'}])expect(()=>projectCardinalityToParquet(author('one'),{...base,nativeType:nativeType as any})).toThrow();
 for(const fieldName of ['', '\u0000','\ud800'])expect(()=>projectCardinalityToParquet(author('one'),{...base,fieldName})).toThrow();
});
