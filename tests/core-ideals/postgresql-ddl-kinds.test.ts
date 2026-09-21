import {createValidator} from '../../src/validation/schema';
import declarationsSchema from '../../spec/extensions/postgresql/ddl-declarations.schema.json';
import {test,expect} from 'bun:test';
import {ddlKindCases} from '../../scripts/core-ideals/postgresql-ddl-kind-cases';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlSql,proposePostgresqlNodeEdit} from '../../src/adapters/postgresql';
import {getPostgresqlDdlDeclarations} from '../../src/adapters/postgresql/declarations';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {classifyPostgresqlDdlRecord,recoverPostgresqlDdlKinds} from '../../src/core-ideals/postgresql-ddl-kinds';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
test('declared records retain source SQL and distinguish unresolved namespace from catalog facts',async()=>{
 for(const c of ddlKindCases){const source=upgradeFieldEnvelope(await importPostgresqlSql(c.sql,backend,{id:c.id})).target;
 const declaration=getPostgresqlDdlDeclarations(source).declarations.find(d=>d.relation.kind==='object'&&d.relation.members.relname?.kind==='string'&&d.relation.members.relname.value===c.name)!;
 for(const mode of ['strict','report'] as const){const result=await classifyPostgresqlDdlRecord(source,{module:'declared',recordId:'record',declaration:declaration.path,mode},backend);
 const blocked=c.expansion||!c.nativeAccepted||c.namespace===''&&mode==='strict';expect(result.status).toBe(blocked?'blocked':'classified');expect(result.scope).toBe('declared-only');expect(result.source).toEqual(source);
 if(blocked){expect(Object.hasOwn(result,'target')).toBe(false);expect(result.residuals.length).toBeGreaterThan(0);continue;}
 const module=result.target!.modules.at(-1)!;expect(module.namespace).toBe(c.namespace);expect(module.elements.slice(1).map(e=>e.name)).toEqual(c.names);
 if(c.id==='domain-and-later-alter')expect(module.elements.slice(1).map(e=>e.scalarType)).toEqual([undefined,undefined]);
 if(c.namespace==='')expect(result.residuals).toHaveLength(1);
 for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(await recoverPostgresqlDdlKinds(receipt,receipt.target!,backend)).toBe(c.sql);}
 }
 }
},30000);
test('collisions, edited AST archives and stale receipts cannot silently publish new roles',async()=>{
 const c=ddlKindCases[0]!,source=upgradeFieldEnvelope(await importPostgresqlSql(c.sql,backend,{id:'guard'})).target,options={module:'declared',recordId:'record',declaration:'/stmts/0/stmt/CreateStmt',mode:'strict' as const};
 expect((await classifyPostgresqlDdlRecord(source,{...options,module:'schema'},backend)).status).toBe('blocked');
 const edited=proposePostgresqlNodeEdit(source,'/stmts/0/stmt/CreateStmt/relation/relname','"changed"').document;await expect(classifyPostgresqlDdlRecord(edited,options,backend)).rejects.toThrow('archive');
 const result=await classifyPostgresqlDdlRecord(source,options,backend);result.target!.modules.at(-1)!.elements[0]!.name='stale';await expect(recoverPostgresqlDdlKinds(result,result.target!,backend)).rejects.toThrow();
});
test('composite attributes preserve collations and unresolved nested types without scalar flattening',async()=>{
 for(const id of ['composite','nested-composite','empty-composite']){
  const c=ddlKindCases.find(c=>c.id===id)!,source=upgradeFieldEnvelope(await importPostgresqlSql(c.sql,backend,{id:c.id})).target;
  const inventory=getPostgresqlDdlDeclarations(source);expect(createValidator().compile(declarationsSchema)(inventory)).toBe(true);const declaration=inventory.declarations.find(d=>d.kind==='create-composite')!;
  expect(declaration.columns.map(c=>c.element.name)).toEqual(c.names);
  const result=await classifyPostgresqlDdlRecord(source,{module:'types',recordId:'type',declaration:declaration.path,mode:'strict'},backend);
  expect(result.binding.id).toBe('umf.postgresql.ddl.composite');expect(result.mappings[0]!.basis).toBe('checked-raw-composite-declaration');
  const members=result.target!.modules.at(-1)!.elements.slice(1);
  expect(members.map(e=>e.kind)).toEqual(c.names.map(()=>'field'));
  expect(members.map(e=>e.scalarType??null)).toEqual(id==='composite'?['string',null]:c.names.map(()=>null));
  if(id==='composite')expect(JSON.stringify(result.mappings[1]!.nativeFragment)).toContain('collClause');
  if(id==='nested-composite')expect(inventory.declarations.some(d=>d.kind==='alter-table'&&d.requiresCatalogExpansion)).toBe(true);
  expect(await recoverPostgresqlDdlKinds(result,result.target!,backend)).toBe(c.sql);
 }
});
