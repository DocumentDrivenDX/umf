import {expect,test} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {exportPostgresqlSql,getPostgresqlDdlDeclarations,getPostgresqlSource,importPostgresqlSql,readDocument,writeDocument} from '../../src';

const directory='fixtures/relationship/postgresql-native';
const source=await Bun.file(`${directory}/constraints.sql`).text();
const oracle=await Bun.file(`${directory}/oracle.json`).json();

test('@covers US-045-AC5 @covers US-045-AC7: native FK refinements remain observations with exact source recovery',async()=>{
  const archive=await importPostgresqlSql(source,backend,{id:'relationship-native-observation'});
  expect(getPostgresqlSource(archive)).toBe(source);
  expect((await exportPostgresqlSql(archive,backend)).match(/FOREIGN KEY/g)).toHaveLength(2);
  expect(getPostgresqlDdlDeclarations(archive).declarations.filter(row=>row.kind==='alter-table')).toHaveLength(2);
  for(const format of ['json','yaml'] as const)
    expect(getPostgresqlSource(readDocument(writeDocument(archive,format),format))).toBe(source);
  expect(archive.modules.some(module=>'relationships'in module)).toBe(false);
});

test('@covers US-045-AC5: pinned catalog distinguishes validation, MATCH SIMPLE and alternate UNIQUE target',()=>{
  expect(oracle.serverVersion).toBe(170004);
  expect(oracle.foreignKeys.map((row:any)=>[row.name,row.validated,row.match_type])).toEqual([['fk_alt',false,'s'],['fk_pair',true,'s']]);
  expect(oracle.foreignKeys[0].referenced_index.endsWith('parent_alt_key')).toBe(true);
  expect(oracle.foreignKeys[1].referenced_index.endsWith('uq_parent_pair')).toBe(true);
  expect(oracle.foreignKeys[1].target_columns).toEqual(['part_a','part_b']);
});
