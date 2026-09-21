import {test,expect} from 'bun:test';
import {classifySqlServerField,recoverSqlServerFieldCapture} from '../../src/core-ideals/sqlserver-field';
import {importSqlServerCatalog,getSqlServerColumnMetadata} from '../../src/adapters/sqlserver';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';import {declareCoreElementKind} from '../../src/model/field-kind';import {copyJson} from '../../src/model/json';import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const nativeSource=await Bun.file('fixtures/sqlserver/catalog.json').text();const source=()=>upgradeFieldEnvelope(importSqlServerCatalog(nativeSource,{id:'sqlserver'})).target;
test('SQL Server captured members classify independently of scalar/alias/index semantics',()=>{
 const document=source();for(const c of getSqlServerColumnMetadata(document)){const result=classifySqlServerField(document,{column:c.path,nativeSource,mode:'strict'});expect(result.status).toBe('classified');expect(result.mapping.nativeFragment).toEqual(c.nativeColumn);expect(result.target!.modules[0]!.elements.find(e=>e.id===c.path)!.kind).toBe('field');expect(result.source).toEqual(document);
 for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(recoverSqlServerFieldCapture(receipt,receipt.target!)).toBe(nativeSource);}}
},30000);
test('authored conflicts block both policies, while matching authored fields remain explicit',()=>{
 const document=source(),column=getSqlServerColumnMetadata(document).find(c=>c.element.scalarType===undefined)!;for(const kind of ['field','record','group'] as const){const author=declareCoreElementKind(document,{module:'sqlserver.columns',element:column.path},kind);for(const mode of ['strict','report'] as const){const result=classifySqlServerField(author.target,{column:column.path,nativeSource,mode,author});expect(result.status).toBe(kind==='field'?'classified':'blocked');if(kind!=='field'){expect(result.target).toBeUndefined();expect(result.diagnostics[0]!.severity).toBe('error');}}}
 const unknown=copyJson(document) as unknown as typeof document;unknown.modules[0]!.elements.find(e=>e.id===column.path)!.kind='future';expect(classifySqlServerField(unknown,{column:column.path,nativeSource,mode:'report'}).status).toBe('blocked');
});
test('capture formatting, unknown numeric detail and index constraints survive without identity promotion',async()=>{
 const text=await Bun.file('fixtures/sqlserver/indexes-catalog.json').text();const retained=' \n'+text.trim().slice(0,-1)+',"future":9007199254740993.123456789}\n';const document=upgradeFieldEnvelope(importSqlServerCatalog(retained,{id:'indexes'})).target,column=getSqlServerColumnMetadata(document)[0]!;
 const result=classifySqlServerField(document,{column:column.path,nativeSource:retained,mode:'report'});expect(result.target!.extensions).toEqual(document.extensions);expect(result.target!.modules[0]!.elements.some(e=>Object.hasOwn(e,'identity'))).toBe(false);expect(recoverSqlServerFieldCapture(result,result.target!)).toBe(retained);
});
test('stale metadata, archives, author receipts and unsupported versions cannot claim recovery',()=>{
 const document=source(),column=getSqlServerColumnMetadata(document)[0]!,request={column:column.path,nativeSource,mode:'strict' as const};
 expect(()=>classifySqlServerField(document,{...request,nativeSource:'{}'})).toThrow('archive');const stale=copyJson(document) as unknown as typeof document;stale.modules[0]!.elements[0]!.name='changed';expect(()=>classifySqlServerField(stale,request)).toThrow('disagree');
 const author=declareCoreElementKind(document,{module:'sqlserver.columns',element:column.path},'field'),changed=copyJson(author.target) as unknown as typeof document;changed.future=true;expect(classifySqlServerField(changed,{...request,author}).status).toBe('blocked');
 const result=classifySqlServerField(document,request);result.target!.future=true;expect(()=>recoverSqlServerFieldCapture(result,result.target!)).toThrow();
 const capture=JSON.parse(nativeSource);capture.serverVersion='17.0.1.0';const future=JSON.stringify(capture);expect(()=>classifySqlServerField(upgradeFieldEnvelope(importSqlServerCatalog(future,{id:'future'})).target,{...request,nativeSource:future})).toThrow('16.0.4295.3');
});
