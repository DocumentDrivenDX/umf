import {test,expect} from 'bun:test';
import {classifyPostgresqlComposite,recoverPostgresqlCompositeCapture} from '../../src/core-ideals/postgresql-composite';
import {importPostgresqlCatalogCapture} from '../../src/adapters/postgresql/catalog';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const fixture=await Bun.file('fixtures/validation/field-postgresql-native.json').json();
const source=()=>upgradeFieldEnvelope(importPostgresqlCatalogCapture(fixture.nativeSource,{id:'composites'})).target;
const request={recordModule:'composites',recordId:'record',mode:'strict' as const,nativeSource:fixture.nativeSource,relation:{schema:'sales',name:'address'}};
test('catalog composites expose ordered fields without formatted-type guessing and recover exact source',()=>{
 for(const row of fixture.composites)for(const mode of ['strict','report'] as const){const document=source(),result=classifyPostgresqlComposite(document,{...request,relation:row.relation,mode});expect(result.status).toBe('classified');expect(result.source).toEqual(document);
  const module=result.target!.modules.at(-1)!;expect(module.namespace).toBe(row.relation.schema);expect(module.elements[0]!.kind).toBe('record');expect(module.elements.slice(1).map(e=>e.name)).toEqual(row.members.map((m:any)=>m.name));expect(module.elements.slice(1).every(e=>e.kind==='field'&&!('scalarType'in e))).toBe(true);expect(result.mappings).toHaveLength(row.members.length+1);
  for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(recoverPostgresqlCompositeCapture(receipt,receipt.target!)).toBe(fixture.nativeSource);}
 }
});
test('collisions, duplicate names/order, ambiguity and stale archives cannot publish false roles',()=>{
 for(const mode of ['strict','report'] as const){const document=source();document.modules.push({id:'composites',namespace:'authored',elements:[{id:'record',kind:'group',extensions:{}}]});const result=classifyPostgresqlComposite(document,{...request,mode});expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();expect(result.source).toEqual(document);}
 for(const mutate of [(t:any)=>{t.attributes[1].name=t.attributes[0].name;},(t:any)=>{t.attributes[1].position=t.attributes[0].position;}]){
  const capture=JSON.parse(fixture.nativeSource);mutate(capture.snapshot.compositeTypes.find((t:any)=>t.schema==='sales'&&t.name==='address'));const nativeSource=JSON.stringify(capture),document=upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'invalid-members'})).target;
  for(const mode of ['strict','report'] as const){const result=classifyPostgresqlComposite(document,{...request,nativeSource,mode});expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();}
 }
 const capture=JSON.parse(fixture.nativeSource);capture.snapshot.compositeTypes.push(capture.snapshot.compositeTypes.find((t:any)=>t.schema==='sales'&&t.name==='address'));const nativeSource=JSON.stringify(capture);expect(()=>classifyPostgresqlComposite(upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'ambiguous'})).target,{...request,nativeSource})).toThrow('ambiguous');
 expect(()=>classifyPostgresqlComposite(source(),{...request,nativeSource:'{}'})).toThrow();expect(()=>classifyPostgresqlComposite(source(),{...request,relation:{schema:'sales',name:'scalar_types'}})).toThrow('missing');
 const result=classifyPostgresqlComposite(source(),request),current=copyJson(result.target!) as unknown as NonNullable<typeof result.target>;current.modules.at(-1)!.elements[0]!.name='changed';expect(()=>recoverPostgresqlCompositeCapture(result,current)).toThrow('changed');result.mappings[0]!.nativePath='/wrong';expect(()=>recoverPostgresqlCompositeCapture(result,result.target!)).toThrow('recomputation');
});
test('unknown composite refinements remain recoverable and future server versions are refused',()=>{
 const capture=JSON.parse(fixture.nativeSource);capture.snapshot.compositeTypes[0].futureMeaning={op:'opaque',values:['retain']};const nativeSource=' \n'+JSON.stringify(capture,null,2)+'\n',document=upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'future-detail'})).target;
 const result=classifyPostgresqlComposite(document,{...request,nativeSource});expect(recoverPostgresqlCompositeCapture(result,result.target!)).toBe(nativeSource);
 capture.serverVersion=180000;const future=JSON.stringify(capture);expect(()=>classifyPostgresqlComposite(upgradeFieldEnvelope(importPostgresqlCatalogCapture(future,{id:'future'})).target,{...request,nativeSource:future})).toThrow('17.4');
});
