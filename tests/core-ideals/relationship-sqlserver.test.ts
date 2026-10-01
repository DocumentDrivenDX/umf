import {test,expect} from 'bun:test';
import {relationshipSqlServerCases,relationshipSqlServerCase} from '../../scripts/core-ideals/relationship-sqlserver-cases';
import {projectRelationshipToSqlServer,recoverRelationshipSqlServerIdeal,recoverRelationshipSqlServerBinding,recoverRelationshipSqlServerNative,verifyRelationshipSqlServerProjection} from '../../src/core-ideals/relationship-sqlserver-projection';
import {classifySqlServerRelationships,recoverSqlServerRelationshipSource} from '../../src/core-ideals/relationship-sqlserver';
import {importSqlServerCatalog} from '../../src/adapters/sqlserver';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
for(const c of relationshipSqlServerCases())test('SQL Server relationship '+c.name,()=>{
 const before=JSON.stringify(c),r=projectRelationshipToSqlServer(c.source,c.author,c.binding,c.request);expect(JSON.stringify(c)).toBe(before);expect(r.status).toBe(c.expected);if(r.status==='blocked'){expect(r.target).toBeUndefined();return;}
 expect(r.target!.sql).toContain('FOREIGN KEY');expect(r.residuals.length).toBeGreaterThan(5);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverRelationshipSqlServerIdeal(saved,saved.target!)).toEqual(c.source);expect(recoverRelationshipSqlServerBinding(saved,saved.target!)).toEqual(c.binding);expect(recoverRelationshipSqlServerNative(saved,saved.target!)).toBe(r.target!.sql);}
 const forged=structuredClone(r);forged.residuals.pop();expect(()=>verifyRelationshipSqlServerProjection(forged,r.target!)).toThrow();expect(()=>verifyRelationshipSqlServerProjection(r,{...r.target!,sql:r.target!.sql+'-- changed'})).toThrow();
});
test('stable IDs, altered binding/author, unknown content, hostile accessors and naming refusal',()=>{
 const c=relationshipSqlServerCase();let reads=0;expect(()=>projectRelationshipToSqlServer(c.source,c.author,c.binding,{...c.request,get namespace(){reads++;return 'dbo';}})).toThrow();expect(reads).toBe(0);
 const stale=structuredClone(c.source);stale.modules[0]!.elements.find(x=>x.id==='Customer.id')!.scalarType='string';expect(()=>projectRelationshipToSqlServer(stale,c.author,c.binding,c.request)).toThrow();
 for(const end of ['\n','\r','\u2028','\u2029'])expect(()=>projectRelationshipToSqlServer(c.source,c.author,c.binding,{...c.request,namespace:'dbo'+end})).toThrow();
 const bad=structuredClone(c.binding);(bad.extensions!['umf.binding'] as any).relationships[0].id='missing';expect(()=>projectRelationshipToSqlServer(c.source,c.author,bad,c.request)).toThrow();
});
test('native captured trust/actions/Keys and unknown source recover exactly',async()=>{
 const proof=await Bun.file('fixtures/validation/relationship-sqlserver-native.json').json(),nativeSource=proof.sourceText as string,source=importSqlServerCatalog(nativeSource,{id:'native'});source.vocabularies.future={version:'1.0.0'};source.extensions!.future={opaque:['9007199254740993']};
 const request={nativeSource,mode:'report',profile:'captured-foreign-keys'} as const,r=classifySqlServerRelationships(source,request);expect(r.status).toBe('classified');expect(r.observations.some(o=>o.enforcement==='disabled')).toBe(true);expect(r.observations.some(o=>o.enforcement==='enabled-untrusted')).toBe(true);expect(r.observations.some(o=>o.deleteAction==='CASCADE')).toBe(true);expect(r.observations.every(o=>o.authorIntent==='unknown')).toBe(true);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverSqlServerRelationshipSource(saved,saved.target!)).toBe(nativeSource);}
 expect(classifySqlServerRelationships(source,{...request,mode:'strict'}).status).toBe('blocked');const fake=structuredClone(r);fake.observations.pop();expect(()=>recoverSqlServerRelationshipSource(fake,r.target!)).toThrow();const changed=structuredClone(source);changed.modules[0]!.elements[0]!.name='stale';expect(()=>classifySqlServerRelationships(changed,request)).toThrow();
});
test('schema object and generated index naming collisions refuse; binding indexes stay residual',()=>{
 const c=relationshipSqlServerCase('one-to-one');
 expect(projectRelationshipToSqlServer(c.source,c.author,c.binding,{...c.request,constraintName:'Source'}).status).toBe('blocked');
 expect(projectRelationshipToSqlServer(c.source,c.author,c.binding,{...c.request,constraintName:'sourcekey'}).status).toBe('blocked');
 expect(()=>projectRelationshipToSqlServer(c.source,c.author,c.binding,{...c.request,constraintName:'x'.repeat(125)})).toThrow();
 expect(projectRelationshipToSqlServer(c.source,c.author,c.binding,{...c.request,sourceKey:{...c.request.sourceKey,constraintName:'RelationFk_reverse'}}).status).toBe('blocked');
 const physical=c.binding.extensions!['umf.binding'] as any;physical.indexes=[{name:'extra',kind:'btree',on:[{field:{module:'m',element:'Order.id'}}],unique:false}];physical.elements.push({module:'m',element:'Order.id',table:'Source'});
 const r=projectRelationshipToSqlServer(c.source,c.author,c.binding,c.request);expect(r.residuals.some(x=>x.path.endsWith('/indexes/0'))).toBe(true);expect(recoverRelationshipSqlServerBinding(r,r.target!)).toEqual(c.binding);
});
test('synthetic type/collation contradictions retain refinements without compatible-enforcement claim',async()=>{
 const proof=await Bun.file('fixtures/validation/relationship-sqlserver-native.json').json();
 for(const change of [{system_type_id:167,user_type_id:167,type_name:'varchar',base_type_name:'varchar',max_length:20,collation_name:'Latin1_General_100_BIN2'},{collation_name:'invented-collation'}]){
  const capture=JSON.parse(proof.sourceText),table=capture.tables.find((t:any)=>t.name==='Untrusted');Object.assign(table.columns.find((c:any)=>c.name==='parent'),change);const nativeSource=JSON.stringify(capture)+'\n',source=importSqlServerCatalog(nativeSource,{id:'synthetic'}),r=classifySqlServerRelationships(source,{nativeSource,mode:'report',profile:'captured-foreign-keys'}),observation=r.observations.find(o=>o.name==='UntrustedFK')!;
  expect(observation.enforcement).toBe('unknown');expect(observation.resolution).toBe('unresolved');expect(recoverSqlServerRelationshipSource(r,r.target!)).toBe(nativeSource);
 }
});
