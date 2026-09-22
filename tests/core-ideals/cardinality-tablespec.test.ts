import {test,expect} from 'bun:test';
import * as u from '../../src';
import {cardinalityTableSpecCases,tableSpecCardinalitySource} from '../../scripts/core-ideals/cardinality-tablespec-cases';
const text=JSON.stringify({version:'1.0',table_name:'Vectors',columns:[{name:'value',data_type:'EMBEDDING',dimension:3,future_shape:{unknown:9007199254740991}}]});
const request={column:0,mode:'strict',profile:'runtime-model'} as const;
test('native declaration profiles classify shape with explicit refusals and retain source text through both formats',()=>{
 const rows=cardinalityTableSpecCases();expect(rows).toHaveLength(336);
 for(const row of rows){
  const before=u.copyJson(row.source) as unknown as u.Document,r=u.classifyTableSpecCardinality(row.source,row.request);
  expect(r.status).toBe(row.status);expect(r.mapping.cardinality).toBe(row.expected);expect(row.source).toEqual(before);
  if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.residuals.length).toBeGreaterThan(0);continue;}
  const field=r.target!.modules[0]!.elements[0]!;
  expect(field.cardinality).toBe(row.expected);expect(field.itemType).toBeUndefined();
  if(row.expected==='array')expect(field.scalarType).toBeUndefined();
  expect(r.target!.extensions).toEqual(row.source.extensions);
  for(const format of ['json','yaml'] as const){
   const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as u.TableSpecCardinalityClassification;
   expect(u.recoverTableSpecCardinalitySource(receipt,receipt.target!)).toBe(row.text);
  }
 }
},60000);
test('authored intent, item references and opaque assertions cannot be overwritten by native observations',()=>{
 const source=tableSpecCardinalitySource(text),id={module:'table',element:'column:0'};
 const author=u.declareCoreCardinality(source,id,{cardinality:'array'});
 expect(u.classifyTableSpecCardinality(author.target,request).status).toBe('blocked');
 const same=u.classifyTableSpecCardinality(author.target,{...request,author});expect(same.status).toBe('classified');
 const conflict=u.declareCoreCardinality(source,id,{cardinality:'map'});
 expect(u.classifyTableSpecCardinality(conflict.target,{...request,mode:'report',author:conflict}).status).toBe('blocked');
 const items=u.copyJson(source) as unknown as u.Document;items.modules.push({id:'items',namespace:'items',elements:[{id:'nested',kind:'field',cardinality:'array',itemType:{module:'items',element:'nested'},extensions:{}}]});
 const nested=u.declareCoreCardinality(items,id,{cardinality:'array',itemType:{module:'items',element:'nested',future:'retained'}});
 expect(u.classifyTableSpecCardinality(nested.target,{...request,author:nested}).status).toBe('blocked');
 const report=u.classifyTableSpecCardinality(nested.target,{...request,mode:'report',author:nested});
 expect(report.target!.modules[0]!.elements[0]!.itemType).toEqual(nested.target.modules[0]!.elements[0]!.itemType);
 expect(report.residuals[0]!.path).toEndWith('/itemType');expect(u.recoverTableSpecCardinalitySource(report,report.target!)).toBe(text);
 const unknown=u.copyJson(source) as unknown as u.Document;unknown.modules[0]!.elements[0]!.cardinality='future';
 expect(u.classifyTableSpecCardinality(unknown,{...request,mode:'report'}).status).toBe('blocked');
});
test('tampered and stale receipts, malformed requests and legacy source versions refuse',()=>{
 const source=tableSpecCardinalitySource(text),r=u.classifyTableSpecCardinality(source,request);
 const tampered=u.copyJson(r) as unknown as u.TableSpecCardinalityClassification;tampered.mapping.cardinality='one';
 expect(()=>u.verifyTableSpecCardinalityClassification(tampered,tampered.target!)).toThrow('Receipt disagrees');
 const stale=u.copyJson(r.target!) as unknown as u.Document;stale.modules[0]!.elements[0]!.description='changed';
 expect(()=>u.recoverTableSpecCardinalitySource(r,stale)).toThrow('Target changed');
 expect(()=>u.classifyTableSpecCardinality(source,{...request,column:-1})).toThrow();
 expect(()=>u.classifyTableSpecCardinality(u.importTableSpec(text,{id:'old',format:'json'}),request)).toThrow('0.4.0');
 let getters=0;const unsafe={...request};Object.defineProperty(unsafe,'profile',{get(){getters++;return 'runtime-model';},enumerable:true});
 expect(()=>u.classifyTableSpecCardinality(source,unsafe)).toThrow();expect(getters).toBe(0);
 const existing=u.copyJson(source) as unknown as u.Document;existing.vocabularies[u.TABLESPEC_CARDINALITY_EXTENSION]={version:'2.0.0'};
 expect(u.classifyTableSpecCardinality(existing,{...request,mode:'report'}).status).toBe('blocked');
});
test('unsafe numeric coercion stays residual while exact large integer tokens remain native',()=>{
 for(const token of ['"3"','true','3.0','3e0','0','-1']){
  const raw=text.replace('"dimension":3','"dimension":'+token),source=tableSpecCardinalitySource(raw);
  expect(u.classifyTableSpecCardinality(source,request).status).toBe('blocked');
  const report=u.classifyTableSpecCardinality(source,{...request,mode:'report'});expect(u.recoverTableSpecCardinalitySource(report,report.target!)).toBe(raw);
 }
 const raw=text.replace('"dimension":3','"dimension":9007199254740993');const r=u.classifyTableSpecCardinality(tableSpecCardinalitySource(raw),request);
 expect(r.mapping.cardinality).toBe('array');expect(u.recoverTableSpecCardinalitySource(r,r.target!)).toBe(raw);
});

test('split archives preserve comments, unknown siblings and opaque files after classification',()=>{
 const files={'table.yaml':'version: "1.0"\ntable_name: vectors\nfuture: 9007199254740993\n','columns/value.yaml':'# retained\ncolumn: {name: value, data_type: EMBEDDING, dimension: 3, future_shape: [a, b]}\nunknownSibling: true\n','notes.txt':'opaque future file\n'};
 const imported=u.importTableSpecBundle(files,{id:'split'});
 const fields=u.classifyTableSpecField(u.upgradeFieldEnvelope(imported).target,{column:0,mode:'strict'}).target!;
 const source=u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(fields).target).target;
 const result=u.classifyTableSpecCardinality(source,request);expect(result.mapping.cardinality).toBe('array');
 for(const format of ['json','yaml'] as const){
  const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(result),format),format) as unknown as u.TableSpecCardinalityClassification;
  expect(u.recoverTableSpecCardinalitySource(receipt,receipt.target!)).toEqual(files);
 }
});
