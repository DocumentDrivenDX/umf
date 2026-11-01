import {expect,test} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {classifyPostgresqlDdlRecord,getPostgresqlDdlDeclarations,importPostgresqlSql,recoverPostgresqlDdlKinds} from '../../src/index-node-v4';

test('Rust PostgreSQL declaration inventory and DDL record classification retain and recover the native source',async()=>{
 const c={id:'qualified',sql:'-- retained comment\nCREATE TABLE sales.simple (id pg_catalog.int8, payload pg_catalog.text);\n',names:['id','payload']};
 const source=await importPostgresqlSql(c.sql,backend,{id:c.id});
 const inventory=getPostgresqlDdlDeclarations(source);
 expect(inventory.status).toBe('observed');
 const declaration=inventory.declarations.find(item=>item.kind==='create-table');
 expect(declaration).toBeDefined();
 const request={module:'ddl',recordId:'record',declaration:declaration!.path,mode:'strict' as const};
 const result=await classifyPostgresqlDdlRecord(source,request,backend);
 expect(result.status).toBe('classified');
 expect(result.target!.modules.at(-1)!.elements[0]!.kind).toBe('record');
 expect(result.target!.modules.at(-1)!.elements.slice(1).map(element=>element.name)).toEqual(c.names);
 expect(await recoverPostgresqlDdlKinds(result,result.target!,backend)).toBe(c.sql);
});

test('Rust PostgreSQL DDL classification refuses an existing output module',async()=>{
 const c={id:'qualified',sql:'-- retained comment\nCREATE TABLE sales.simple (id pg_catalog.int8, payload pg_catalog.text);\n',names:['id','payload']};
 const source=await importPostgresqlSql(c.sql,backend,{id:c.id});
 const declaration=getPostgresqlDdlDeclarations(source).declarations.find(item=>item.kind==='create-table')!;
 const result=await classifyPostgresqlDdlRecord(source,{module:'schema',recordId:'record',declaration:declaration.path,mode:'strict'},backend);
 expect(result.status).toBe('blocked');
 expect(result.residuals.some(item=>item.reason.includes('module already exists'))).toBe(true);
});
