import {test,expect} from 'bun:test';
import {postgresqlKeyAuthors,postgresqlKeyProjectionCases} from '../../scripts/core-ideals/key-postgresql-projection-cases';
import {projectKeysToPostgresql,verifyKeysPostgresqlProjection,recoverKeysPostgresqlIdeal} from '../../src/core-ideals/key-postgresql-projection';
import {backend} from '../../native/postgresql/runtime';
import {getPostgresqlSource,importPostgresqlSql} from '../../src/adapters/postgresql';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
for(const row of postgresqlKeyProjectionCases())test('PostgreSQL authored keys: '+row.name,async()=>{
 const before=JSON.stringify(row),r=await projectKeysToPostgresql(row.source,row.authors,row.request,backend);expect(JSON.stringify(row)).toBe(before);expect(r.status).toBe(row.expected);expect(r.mappings.length).toBe(row.authors.length);expect(r.residuals.filter(x=>/\/keys\//.test(x.path)).length).toBe(row.authors.length);
 if(r.status==='blocked'){expect(r.nativeSql).toBeUndefined();expect(r.target).toBeUndefined();return;}
 expect(getPostgresqlSource(r.target!)).toBe(r.nativeSql!);expect(r.nativeSql).toContain('NOT DEFERRABLE');
 const imported=await importPostgresqlSql(r.nativeSql!,backend,{id:row.request.id});
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(await recoverKeysPostgresqlIdeal(saved,imported,backend)).toEqual(row.source);expect(getPostgresqlSource(saved.target!)).toBe(r.nativeSql!);}
});
test('stable identity, compound ordering and explicit native names remain independent',async()=>{
 const rows=postgresqlKeyProjectionCases(),c=rows.find(c=>c.name==='rename-and-reorder')!,r=await projectKeysToPostgresql(c.source,c.authors,c.request,backend);expect(r.mappings.map(m=>m.keyId)).toEqual(['stable-code','stable-id']);expect(r.mappings[1]!.keyName).toBe('Renamed identity');expect(r.mappings[1]!.constraintName).toBe('order_identity');
 const compound=rows.find(c=>c.name==='compound-ordered')!,p=await projectKeysToPostgresql(compound.source,compound.authors,compound.request,backend);expect(p.mappings[0]!.columns).toEqual(['external_code','order_id']);
});
test('missing, forged, stale and cross-record authors and column bindings refuse',async()=>{
 const c=postgresqlKeyAuthors();await expect(projectKeysToPostgresql(c.source,c.authors.slice(1),c.request,backend)).rejects.toThrow();
 const duplicate=[c.authors[0]!,c.authors[0]!];await expect(projectKeysToPostgresql(c.source,duplicate,c.request,backend)).rejects.toThrow();
 const stale=structuredClone(c.source);stale.modules[0]!.elements[1]!.description='changed';await expect(projectKeysToPostgresql(stale,c.authors,c.request,backend)).rejects.toThrow();
 const missing=structuredClone(c.source);delete missing.modules[0]!.elements[0]!.members;await expect(projectKeysToPostgresql(missing,c.authors,c.request,backend)).rejects.toThrow();
 const wrong=structuredClone(c.request);wrong.columns[0]!.field.module='other';await expect(projectKeysToPostgresql(c.source,c.authors,wrong,backend)).rejects.toThrow();
 const keys=structuredClone(c.request);keys.keyNames[0]!.keyId='absent';await expect(projectKeysToPostgresql(c.source,c.authors,keys,backend)).rejects.toThrow();
 const compound=postgresqlKeyProjectionCases().find(c=>c.name==='compound-ordered')!,changed=structuredClone(compound.source);(changed.modules[0]!.elements[0]!.keys as any[])[0].fields.reverse();await expect(projectKeysToPostgresql(changed,compound.authors,compound.request,backend)).rejects.toThrow();
});
test('unsafe names, getters and native constraint namespace collisions refuse',async()=>{
 const c=postgresqlKeyAuthors();for(const name of ['x'.repeat(64),'世'.repeat(22),'nul\0','\ud800'])await expect(projectKeysToPostgresql(c.source,c.authors,{...c.request,tableName:name},backend)).rejects.toThrow();
 for(const name of ['tableoid','xmin','cmin','xmax','cmax','ctid']){const invalid=structuredClone(c.request);invalid.columns[0]!.name=name;await expect(projectKeysToPostgresql(c.source,c.authors,invalid,backend)).rejects.toThrow();}
 const duplicate=structuredClone(c.request);duplicate.keyNames[1]!.name=duplicate.keyNames[0]!.name;await expect(projectKeysToPostgresql(c.source,c.authors,duplicate,backend)).rejects.toThrow();
 let reads=0;await expect(projectKeysToPostgresql(c.source,c.authors,{...c.request,get mode(){reads++;return 'report' as const;}},backend)).rejects.toThrow();expect(reads).toBe(0);
});
test('forged receipts, edited SQL and omitted per-key residuals cannot recover',async()=>{
 const c=postgresqlKeyAuthors(),r=await projectKeysToPostgresql(c.source,c.authors,c.request,backend),fake=structuredClone(r);fake.mappings[0]!.keyId='fake';await expect(verifyKeysPostgresqlProjection(fake,r.target!,backend)).rejects.toThrow();
 const lost=structuredClone(r);lost.residuals=lost.residuals.filter(x=>!x.path.includes('/keys/'));await expect(verifyKeysPostgresqlProjection(lost,r.target!,backend)).rejects.toThrow();
 const edited=await importPostgresqlSql(r.nativeSql!.replace('PRIMARY KEY','UNIQUE'),backend,{id:c.request.id});await expect(recoverKeysPostgresqlIdeal(r,edited,backend)).rejects.toThrow();
});
test('unknown key, membership and component qualifiers recover without becoming native semantics',async()=>{
 const {declareCoreKey}=await import('../../src/model/keys'),{keyRecord,keyId,keyCode}=await import('../../scripts/core-ideals/key-tablespec-projection-cases');
 const c=postgresqlKeyAuthors(),d=structuredClone(c.source),record=d.modules[0]!.elements[0]!;(record.members as any[])[0].future={owner:'opaque'};(record.keys as any[])[0].future={meaning:'not interpreted'};(record.keys as any[])[0].fields[0].future={component:'retained'};
 const a=declareCoreKey(d,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId]}),b=declareCoreKey(a.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]}),r=await projectKeysToPostgresql(b.target,[a,b],c.request,backend);
 expect((b.target.modules[0]!.elements[0]!.keys as any[])[0].future).toEqual({meaning:'not interpreted'});
 for(const format of ['json','yaml'] as const){const stored=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(await recoverKeysPostgresqlIdeal(stored,stored.target!,backend)).toEqual(b.target);}
});
test('oversized key tuple blocks atomically and preserves all components as residual',async()=>{
 const {declareCoreKey,declareCoreRecordMembers}=await import('../../src/model/keys'),c=postgresqlKeyAuthors(),d=structuredClone(c.authors[0]!.source),record=d.modules[0]!.elements[0]!;delete record.keys;delete record.members;d.modules[0]!.elements=d.modules[0]!.elements.slice(0,1);
 const refs=Array.from({length:33},(_,i)=>({module:'m',element:'c'+i}));for(const ref of refs)d.modules[0]!.elements.push({id:ref.element,kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}});
 const members=declareCoreRecordMembers(d,c.request.record,refs),author=declareCoreKey(members.target,c.request.record,{id:'wide',name:'Wide key',fields:refs});
 for(const mode of ['strict','report'] as const){const r=await projectKeysToPostgresql(author.target,[author],{...c.request,mode,columns:refs.map(field=>({field,name:field.element,nativeType:'integer'})),keyNames:[{keyId:'wide',name:'wide_identity'}]},backend);expect(r.status).toBe('blocked');expect(r.nativeSql).toBeUndefined();expect(r.residuals.some(l=>l.reason.includes('32 columns'))).toBe(true);}
});
