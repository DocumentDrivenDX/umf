import {test,expect} from 'bun:test';
import {sqlserverKeyAuthors,sqlserverKeyProjectionCases} from '../../scripts/core-ideals/key-sqlserver-projection-cases';
import {projectKeysToSqlServer,verifyKeysSqlServerProjection,recoverKeysSqlServerIdeal} from '../../src/core-ideals/key-sqlserver-projection';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
for(const row of sqlserverKeyProjectionCases())test('SQL Server authored keys: '+row.name,()=>{
 const before=JSON.stringify(row),r=projectKeysToSqlServer(row.source,row.authors,row.request);expect(JSON.stringify(row)).toBe(before);expect(r.status).toBe(row.expected);expect(r.mappings.length).toBe(row.authors.length);expect(r.residuals.filter(x=>/\/keys\//.test(x.path)).length).toBeGreaterThanOrEqual(row.authors.length);if(row.expectedEquality)expect(r.mappings[0]!.equality).toBe(row.expectedEquality);
 if(r.status==='blocked'){expect(r.nativeSql).toBeUndefined();expect(r.target).toBeUndefined();return;}
 expect(r.target!.sql).toBe(r.nativeSql!);expect(r.nativeSql).toContain('WITH (IGNORE_DUP_KEY=OFF)');expect(r.nativeSql).toContain('PERSISTED NOT NULL');
 expect(r.requiredSessionOptions.NUMERIC_ROUNDABORT).toBe('OFF');
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverKeysSqlServerIdeal(saved,r.target!)).toEqual(row.source);expect(saved.target!.sql).toBe(r.nativeSql!);}
});
test('stable identity and ordered expanded physical components remain distinct',()=>{
 const rows=sqlserverKeyProjectionCases(),c=rows.find(c=>c.name==='rename-and-reorder')!,r=projectKeysToSqlServer(c.source,c.authors,c.request);expect(r.mappings.map(m=>m.keyId)).toEqual(['stable-code','stable-id']);expect(r.mappings[1]!.keyName).toBe('Renamed identity');
 const compound=rows.find(c=>c.name==='compound-ordered')!,p=projectKeysToSqlServer(compound.source,compound.authors,compound.request);expect(p.mappings[0]!.columns).toEqual(['external_code','order_id']);expect(p.mappings[0]!.nativeColumns).toEqual(['code_bytes','code_length','order_id']);
});
test('missing, duplicated and stale author declarations refuse',()=>{
 const c=sqlserverKeyAuthors();expect(()=>projectKeysToSqlServer(c.source,c.authors.slice(1),c.request)).toThrow();expect(()=>projectKeysToSqlServer(c.source,[c.authors[0]!,c.authors[0]!],c.request)).toThrow();
 const changed=structuredClone(c.source);changed.modules[0]!.elements[1]!.description='changed';expect(()=>projectKeysToSqlServer(changed,c.authors,c.request)).toThrow();
 const compound=sqlserverKeyProjectionCases().find(c=>c.name==='compound-ordered')!,reordered=structuredClone(compound.source);(reordered.modules[0]!.elements[0]!.keys as any[])[0].fields.reverse();expect(()=>projectKeysToSqlServer(reordered,compound.authors,compound.request)).toThrow();
});
test('physical name collisions, malformed binding and getters refuse atomically',()=>{
 const c=sqlserverKeyAuthors();
 for(const name of ['x'.repeat(129),'nul\0','\ud800','#temporary'])expect(()=>projectKeysToSqlServer(c.source,c.authors,{...c.request,tableName:name})).toThrow();
 for(const name of ['ORDER_ID','order_id','ｏｒｄｅｒ＿ｉｄ']){const request=structuredClone(c.request);request.columns[1]!.encoding!.bytesColumn=name;expect(()=>projectKeysToSqlServer(c.source,c.authors,request)).toThrow();}
 const wrong=structuredClone(c.request);wrong.columns[0]!.field.module='other';expect(()=>projectKeysToSqlServer(c.source,c.authors,wrong)).toThrow();
 const duplicate=structuredClone(c.request);duplicate.keyNames[1]!.name=duplicate.keyNames[0]!.name;expect(()=>projectKeysToSqlServer(c.source,c.authors,duplicate)).toThrow();
 let reads=0;expect(()=>projectKeysToSqlServer(c.source,c.authors,{...c.request,get mode(){reads++;return 'report' as const;}})).toThrow();expect(reads).toBe(0);
});
test('forged receipts, altered SQL, session settings and missing residuals refuse recovery',()=>{
 const c=sqlserverKeyAuthors(),r=projectKeysToSqlServer(c.source,c.authors,c.request);
 for(const mutate of [(x:typeof r)=>{x.mappings[0]!.keyId='fake';},(x:typeof r)=>{x.residuals=x.residuals.filter(x=>!x.path.includes('/keys/'));},(x:typeof r)=>{(x.requiredSessionOptions as any).NUMERIC_ROUNDABORT='ON';}]){const fake=structuredClone(r);mutate(fake);expect(()=>verifyKeysSqlServerProjection(fake,r.target!)).toThrow();}
 expect(()=>recoverKeysSqlServerIdeal(r,{format:'sqlserver-ddl',sql:r.nativeSql!.replace('PRIMARY KEY','UNIQUE')})).toThrow();
});
test('generated native evidence records actual enforcement and source fingerprints',async()=>{
 const {createHash}=await import('node:crypto'),proof=await Bun.file('fixtures/validation/key-sqlserver-projection-native.json').json();
 expect(proof.serverVersion).toBe('16.0.4295.3');expect(proof.projected).toBe(19);expect(proof.blocked).toBe(7);expect(proof.verifiedConstraints).toBe(39);expect(proof.rows.length).toBe(73);expect(proof.recoveryCount).toBe(21);
 for(const row of proof.rows)expect(row.actual.error).toBe(row.error);
 for(const [path,hash] of Object.entries(proof.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(hash as string);
});
test('expanded key column limit includes encoding helpers and preserves blocked source',async()=>{
 const {declareCoreKey,declareCoreRecordMembers}=await import('../../src/model/keys'),c=sqlserverKeyAuthors();
 for(const count of [32,33]){
  const d=structuredClone(c.authors[0]!.source),record=d.modules[0]!.elements[0]!;delete record.keys;delete record.members;d.modules[0]!.elements=[record];
  const refs=Array.from({length:count},(_,i)=>({module:'m',element:'c'+i}));for(const ref of refs)d.modules[0]!.elements.push({id:ref.element,kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}});
  const members=declareCoreRecordMembers(d,c.request.record,refs),author=declareCoreKey(members.target,c.request.record,{id:'wide',name:'Wide',fields:refs});
  const r=projectKeysToSqlServer(author.target,[author],{...c.request,columns:refs.map(field=>({field,name:field.element,nativeType:'int'})),keyNames:[{keyId:'wide',name:'wide_identity'}]});
  expect(r.status).toBe(count===32?'projected':'blocked');expect(r.mappings[0]!.nativeColumns.length).toBe(count);expect(r.source).toEqual(author.target);if(count===33)expect(r.target).toBeUndefined();
 }
});
test('missing and cross-record membership never establishes key ownership',()=>{
 const c=sqlserverKeyAuthors(),missing=structuredClone(c.source);delete missing.modules[0]!.elements[0]!.members;expect(()=>projectKeysToSqlServer(missing,c.authors,c.request)).toThrow();
 const cross=structuredClone(c.source);cross.modules[0]!.elements.push({id:'other-record',kind:'record',members:[{module:'m',element:c.request.columns[0]!.field.element}],extensions:{}});expect(()=>projectKeysToSqlServer(cross,c.authors,c.request)).toThrow();
 const wrong=structuredClone(c.request);wrong.keyNames[0]!.keyId='missing-key';expect(()=>projectKeysToSqlServer(c.source,c.authors,wrong)).toThrow();
});
test('unknown component qualifiers block an exact equality claim independently of other keys',async()=>{
 const {declareCoreKey}=await import('../../src/model/keys'),c=sqlserverKeyAuthors(),d=structuredClone(c.source),key=(d.modules[0]!.elements[0]!.keys as any[])[0];key.fields[0].future={comparison:'uninterpreted'};
 const a=declareCoreKey(d,c.request.record,{id:'stable-id',name:'Order identity',fields:[c.request.columns[0]!.field]}),b=declareCoreKey(a.target,c.request.record,{id:'stable-code',name:'External code',fields:[c.request.columns[1]!.field]});
 const r=projectKeysToSqlServer(b.target,[a,b],c.request);expect(r.mappings[0]!.equality).toBe('unknown');expect(r.mappings[1]!.equality).toBe('exact-on-representable-values');expect(recoverKeysSqlServerIdeal(r,r.target!)).toEqual(b.target);
});
