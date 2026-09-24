import {describe,expect,test} from 'bun:test';
import {classifyTableSpecKeys,verifyTableSpecKeyClassification,recoverTableSpecKeySource,tableSpecKeysPackage,TABLESPEC_KEYS_EXTENSION} from '../../src/core-ideals/key-tablespec';
import {importTableSpec,importTableSpecBundle} from '../../src/adapters/tablespec';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
import {Registry} from '../../src/registry/registry';
import {validateDocument} from '../../src/validation/document';
import type {Document} from '../../src/model/types';
import discovery from '../../fixtures/validation/key-tablespec-discovery-native.json';
const request={mode:'report',profile:'declared-metadata'} as const;
const source=(extra:Record<string,unknown>={})=>JSON.stringify({version:'1.0',table_name:'Keys',columns:[{name:'id',data_type:'INTEGER'},{name:'tenant',data_type:'INTEGER'}],...extra});
const imported=(extra:Record<string,unknown>={})=>importTableSpec(source(extra),{id:'native',format:'json'});
describe('TableSpec Key native declarations',()=>{
 for(const row of discovery.cases)test(row.case+' retains native declaration without author intent',()=>{
  const text=JSON.stringify(row.source),doc=importTableSpec(text,{id:'native',format:'json'}),before=copyJson(doc) as unknown as Document,r=classifyTableSpecKeys(doc,request);
  expect(doc).toEqual(before);expect(r.status).toBe('classified');expect(r.target!.modules).toEqual(doc.modules);expect(r.target!.umf).toBe(doc.umf);
  expect(validateDocument(r.target!,new Registry().register(tableSpecKeysPackage)).valid).toBe(true);
  expect(r.observations.every(o=>o.authorIntent==='unknown'&&o.enforcement==='unknown')).toBe(true);
  for(const format of ['json','yaml'] as const){const restored=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverTableSpecKeySource(restored,restored.target!)).toBe(text);}
  const strict=classifyTableSpecKeys(doc,{...request,mode:'strict'});expect(strict.status).toBe(r.residuals.length?'blocked':'classified');if(strict.status==='blocked')expect(strict.target).toBeUndefined();
 });
 test('resolves native ordered tuples without declaring core ownership or keys',()=>{
  const r=classifyTableSpecKeys(imported({primary_key:['tenant','id'],unique_constraints:[['id']]}),request);
  expect(r.observations[0]!.resolvedFields).toEqual([{module:'table',element:'column:1'},{module:'table',element:'column:0'}]);
  expect(r.observations[1]!.nativePath).toEndWith('/unique_constraints/items/0');expect(r.residuals).toHaveLength(2);
  expect(r.target!.modules[0]!.elements.every(e=>!Object.hasOwn(e,'keys')&&!Object.hasOwn(e,'members'))).toBe(true);
 });
 test('malformed alternate tuples and unresolved implicit columns remain residual',()=>{
  for(const unique_constraints of [[null],[7],['id'],[['missing']],[[]]]){
   const r=classifyTableSpecKeys(imported({unique_constraints}),request);expect(r.outcome).toBe('not-expressible');expect(r.residuals.length).toBeGreaterThan(0);
  }
  const r=classifyTableSpecKeys(imported({primary_key:['meta_missing']}),request);expect(r.observations[0]!.resolvedFields).toEqual([]);expect(r.outcome).toBe('not-expressible');
 });
 test('unknown text, exact numeric lexemes and split sidecars recover unchanged',()=>{
  const text=source({primary_key:['id']}).replace('"version"','"future":{"n":9007199254740993,"negative":-0,"decimal":1.2300},"version"');
  const doc=importTableSpec(text,{id:'native',format:'json'}),r=classifyTableSpecKeys(doc,request);expect(recoverTableSpecKeySource(r,r.target!)).toBe(text);
  const files={'table.yaml':'version: "1.0"\ntable_name: Keys\nprimary_key: [id]\ncolumns: [{name: shadowed, data_type: TEXT}]\n','columns/id.yaml':'column: {name: id, data_type: INTEGER}\n','notes.txt':'Uninterpreted sidecar\n'};
  const split=classifyTableSpecKeys(importTableSpecBundle(files,{id:'split'}),request);expect(recoverTableSpecKeySource(split,split.target!)).toEqual(files);
 });
 test('authored keys and unknown qualifiers in core 0.6 stay untouched',()=>{
  const doc=imported({primary_key:['id']});doc.umf='0.6.0';const field=doc.modules[0]!.elements[0]!;Object.assign(field,{kind:'field',nullability:'required',cardinality:'one'});
  doc.modules.push({id:'authored',namespace:'authored',elements:[{id:'record',kind:'record',members:[{module:'table',element:'column:0',future:'opaque'}],keys:[{id:'author-key',name:'Authored',fields:[{module:'table',element:'column:0'}],future:{x:true}}],extensions:{}}]});
  const r=classifyTableSpecKeys(doc,request);expect(r.target!.modules).toEqual(doc.modules);expect(recoverTableSpecKeySource(r,r.target!)).toBe(source({primary_key:['id']}));
 });
 test('forged and stale receipts fail; observations cannot overwrite existing content',()=>{
  const r=classifyTableSpecKeys(imported({primary_key:['id']}),request);
  const fake=structuredClone(r);fake.observations[0]!.columns=['tenant'];expect(()=>verifyTableSpecKeyClassification(fake,r.target!)).toThrow();
  const stale=structuredClone(r.target!);stale.id='different';expect(()=>verifyTableSpecKeyClassification(r,stale)).toThrow();
  const twice=classifyTableSpecKeys(r.target!,request);expect(twice.status).toBe('blocked');expect(twice.target).toBeUndefined();
  const old=imported();old.vocabularies[TABLESPEC_KEYS_EXTENSION]={version:'2.0.0'};expect(classifyTableSpecKeys(old,request).status).toBe('blocked');
 });
 test('rejects unsupported requests and accessors without executing code',()=>{
  let reads=0;expect(()=>classifyTableSpecKeys(imported(),{...request,get mode(){reads++;return 'report' as const;}})).toThrow();expect(reads).toBe(0);
  expect(()=>classifyTableSpecKeys(imported(),{...request,profile:'pipeline'} as never)).toThrow();
  expect(()=>classifyTableSpecKeys({get umf(){reads++;return '0.1.0';}} as Document,request)).toThrow();expect(reads).toBe(0);
 });
});
