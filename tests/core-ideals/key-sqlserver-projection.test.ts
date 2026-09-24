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
 expect(proof.serverVersion).toBe('16.0.4295.3');expect(proof.projected).toBe(17);expect(proof.blocked).toBe(6);expect(proof.verifiedConstraints).toBe(35);expect(proof.rows.length).toBe(63);expect(proof.recoveryCount).toBe(19);
 for(const row of proof.rows)expect(row.actual.error).toBe(row.error);
 for(const [path,hash] of Object.entries(proof.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(hash as string);
});
