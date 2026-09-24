import {test,expect} from 'bun:test';
import {importSqlServerCatalog} from '../../src/adapters/sqlserver';
import {classifySqlServerKeys,verifySqlServerKeyClassification,recoverSqlServerKeySource,sqlserverKeysPackage} from '../../src/core-ideals/key-sqlserver';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {validateDocument} from '../../src/validation/document';
import {Registry} from '../../src/registry/registry';
import proof from '../../fixtures/validation/key-sqlserver-discovery-native.json';
const text=proof.sourceText,source=(native=text)=>importSqlServerCatalog(native,{id:'key-native'}),request={nativeSource:text,mode:'report',profile:'captured-stored-values'} as const;
test('captured enforcement never invents identity; native padding prevents exact byte/string claims',()=>{
 const doc=source(),before=JSON.stringify(doc),r=classifySqlServerKeys(doc,request);expect(r.status).toBe('classified');expect(r.observations).toHaveLength(25);expect(JSON.stringify(doc)).toBe(before);expect(r.target!.modules).toEqual(doc.modules);expect(validateDocument(r.target!,new Registry().register(sqlserverKeysPackage)).valid).toBe(true);
 const row=(table:string)=>r.observations.find(o=>o.identity.table===table&&o.identity.indexId>0)!;
 expect(r.observations.every(o=>o.authorIntent==='unknown')).toBe(true);
 for(const table of ['enforced','compound','included','ignore_duplicates','boolean_value','rounded'])expect(row(table).enforcement).toBe('immediate-unique-nonnull');
 expect(row('partial').enforcement).toBe('conditional');expect(row('disabled').enforcement).toBe('unavailable');expect(row('nullable').enforcement).toBe('nullable');expect(row('encoded_text').enforcement).toBe('unknown');
 for(const table of ['binary_text','folded_text','binary_value'])expect(row(table).equality).toBe('incompatible');
 for(const table of ['enforced','compound','boolean_value','rounded'])expect(row(table).equality).toBe('exact-on-representable-values');
 expect(row('ignore_duplicates').ignoreDuplicateKey).toBe(true);expect(row('included').fields).toHaveLength(1);expect(row('compound').fields).toHaveLength(2);
 expect(r.observations.filter(o=>o.identity.indexId===0).every(o=>o.enforcement==='not-unique')).toBe(true);
});
test('strict blocks atomically and report recovers original catalog text through both serializations',()=>{
 const strict=classifySqlServerKeys(source(),{...request,mode:'strict'});expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
 const r=classifySqlServerKeys(source(),request);for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverSqlServerKeySource(saved,saved.target!)).toBe(text);}
});
test('unknown native numeric lexemes and core extensions remain untouched',()=>{
 const unknown=text.replace('"profile"','"future/~":{"n":9007199254740993,"fraction":1.2300,"zero":-0},"profile"'),doc=source(unknown);doc.vocabularies.future={version:'1.0.0'};doc.extensions!.future={opaque:'retained'};
 const r=classifySqlServerKeys(doc,{...request,nativeSource:unknown});expect(r.target!.extensions!.future).toEqual(doc.extensions!.future);expect(recoverSqlServerKeySource(r,r.target!)).toBe(unknown);
});
test('forged exactness, stale targets, conflicting extension and accessors refuse',()=>{
 const r=classifySqlServerKeys(source(),request),forged=structuredClone(r);forged.observations.find(o=>o.identity.table==='binary_value'&&o.identity.indexId>0)!.equality='exact-on-representable-values';expect(()=>verifySqlServerKeyClassification(forged,r.target!)).toThrow();
 const stale=structuredClone(r.target!);stale.id='other';expect(()=>verifySqlServerKeyClassification(r,stale)).toThrow();expect(classifySqlServerKeys(r.target!,request).status).toBe('blocked');
 let reads=0;expect(()=>classifySqlServerKeys(source(),{...request,get mode(){reads++;return 'report' as const;}})).toThrow();expect(reads).toBe(0);
 expect(()=>classifySqlServerKeys(source(),{...request,nativeSource:text.replace('16.0.4295.3','16.0.1.1')})).toThrow();
});
const mutate=(change:(c:any)=>void)=>{const c=JSON.parse(text);change(c);const s=JSON.stringify(c);return ()=>classifySqlServerKeys(source(s),{...request,nativeSource:s});};
const table=(c:any,name='enforced')=>c.tables.find((t:any)=>t.name===name);
for(const [name,change] of [
 ['disabled disagreement',(c:any)=>table(c).keys[0].is_disabled=true],
 ['constraint kind disagreement',(c:any)=>table(c).keys[0].kind='UQ'],
 ['tuple disagreement',(c:any)=>table(c).keys[0].columns[0].name='external_id'],
 ['omitted constraint',(c:any)=>table(c).keys.pop()],
 ['missing component',(c:any)=>table(c).indexes[0].columns[0].column_id=999],
 ['ordinal gap',(c:any)=>table(c,'compound').indexes[0].columns[1].key_ordinal=3],
 ['included key',(c:any)=>table(c,'included').indexes.find((i:any)=>i.name==='UQ_included').columns[0].is_included_column=true],
 ['wrong version',(c:any)=>c.serverVersion='17.0.1'],
 ['modified snapshot',(c:any)=>c.state='modified']
] as const)test('SQL Server key refuses '+name,()=>expect(mutate(change)).toThrow());
