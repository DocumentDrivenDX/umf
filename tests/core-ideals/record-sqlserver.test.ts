import {test,expect} from 'bun:test';
import {classifySqlServerRecord,recoverSqlServerRecordCapture} from '../../src/core-ideals/sqlserver-record';
import {importSqlServerCatalog,getSqlServerColumnMetadata} from '../../src/adapters/sqlserver';import {upgradeFieldEnvelope} from '../../src/model/field-transition';import {declareCoreElementKind} from '../../src/model/field-kind';import {copyJson} from '../../src/model/json';import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const nativeSource=await Bun.file('fixtures/sqlserver/catalog.json').text(),capture=JSON.parse(nativeSource);
const source=()=>upgradeFieldEnvelope(importSqlServerCatalog(nativeSource,{id:'records'})).target;
const request={recordModule:'records',recordId:'record',mode:'strict' as const,nativeSource,relation:{schema:'sales',name:'Types'}};
test('whole captured tables become ordered records with exact source recovery',()=>{
 for(const table of capture.tables)for(const mode of ['strict','report'] as const){const document=source(),result=classifySqlServerRecord(document,{...request,mode,relation:{schema:table.schema,name:table.name}});expect(result.status).toBe('classified');const record=result.target!.modules.at(-1)!.elements[0]!;expect(record.kind).toBe('record');expect(record.references!.map(ref=>result.target!.modules[0]!.elements.find(e=>e.id===ref.element)!.name)).toEqual(table.columns.map((c:any)=>c.name));expect(result.source).toEqual(document);expect(result.target!.extensions).toEqual(document.extensions);
  for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(recoverSqlServerRecordCapture(receipt,receipt.target!)).toBe(nativeSource);}
 }
},30000);
test('one member conflict blocks the whole record and provenance cannot be silently replaced',()=>{
 const document=source(),member=getSqlServerColumnMetadata(document).find(c=>c.table.name==='Types'&&!c.element.scalarType)!,author=declareCoreElementKind(document,{module:'sqlserver.columns',element:member.path},'record');
 for(const mode of ['strict','report'] as const){const result=classifySqlServerRecord(author.target,{...request,mode,authors:[author]});expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();expect(result.source).toEqual(author.target);expect(result.diagnostics.length).toBeGreaterThan(0);}
 const good=declareCoreElementKind(document,{module:'sqlserver.columns',element:member.path},'field');expect(classifySqlServerRecord(good.target,{...request,authors:[good]}).status).toBe('classified');expect(classifySqlServerRecord(good.target,{...request,authors:[good,good]}).status).toBe('blocked');
 const stale=copyJson(good.target) as unknown as typeof document;stale.future=true;expect(classifySqlServerRecord(stale,{...request,authors:[good]}).status).toBe('blocked');
},30000);
test('collisions, missing identities, non-increasing ordinals and stale receipts fail safely',()=>{
 const document=source();expect(classifySqlServerRecord(document,{...request,recordModule:'sqlserver.columns'}).status).toBe('blocked');expect(()=>classifySqlServerRecord(document,{...request,relation:{schema:'absent',name:'Types'}})).toThrow('missing');
 const altered=JSON.parse(nativeSource);altered.tables.find((t:any)=>t.name==='Types').columns.reverse();const archive=JSON.stringify(altered),reordered=upgradeFieldEnvelope(importSqlServerCatalog(archive,{id:'order'})).target;
 for(const mode of ['strict','report'] as const){const result=classifySqlServerRecord(reordered,{...request,mode,nativeSource:archive});expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();}
 const result=classifySqlServerRecord(document,request);result.target!.modules.at(-1)!.elements[0]!.references!.reverse();expect(()=>recoverSqlServerRecordCapture(result,result.target!)).toThrow();
 expect(()=>classifySqlServerRecord(document,{...request,nativeSource:'{}'})).toThrow('archive');
},30000);
