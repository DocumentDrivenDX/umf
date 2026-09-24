import {test,expect} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {proposePostgresqlNodeEdit,exportPostgresqlSql,getPostgresqlSource,getPostgresqlCatalogNode,getPostgresqlColumnMetadata,writeDocument,readDocument} from '../../src';
const base='fixtures/postgresql/edits/';
test('US-015-AC12 edited native DDL evidence binds current proposals and fresh catalog recovery',async()=>{
 const text=await Bun.file(base+'candidates.json').text(),fixture=JSON.parse(text),oracle=await Bun.file(base+'oracle.json').json();
 const hash=(text:string)=>new Bun.CryptoHasher('sha256').update(text).digest('hex');
 expect(oracle.inputSha256).toBe(hash(text));expect(oracle.snapshotQuerySha256).toBe(hash(await Bun.file('native/postgresql/catalog/snapshot.sql').text()));
 expect(fixture.source).toBe(await Bun.file(base+'source.sql').text());expect(fixture.expectedSource).toBe(await Bun.file(base+'expected.sql').text());
 const original=structuredClone(fixture.document);let candidate=fixture.document;
 for(const edit of fixture.edits)candidate=proposePostgresqlNodeEdit(candidate,edit.path,edit.text).document;
 expect(candidate).toEqual(fixture.candidate);expect(fixture.document).toEqual(original);expect(candidate.extensions).toEqual(original.extensions);expect(getPostgresqlSource(candidate)).toBe(fixture.source);
 const sql=await exportPostgresqlSql(candidate,backend);expect(sql).toBe(fixture.nativeSql);expect(hash(sql)).toBe(oracle.candidateSqlSha256);
 for(const output of fixture.exports)expect(await exportPostgresqlSql(readDocument(writeDocument(candidate,output.format),output.format),backend)).toBe(output.sql);
 expect(oracle.serverVersion).toBe(170004);expect(oracle.behavior).toHaveLength(32);expect(oracle.captures).toHaveLength(4);
 const expected=oracle.captures.find((c:any)=>c.database==='expected');
 for(const capture of oracle.captures){
  for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(capture.document,format),format);expect(back).toEqual(capture.document);expect(getPostgresqlColumnMetadata(back)).toEqual(capture.columns);}
  if(capture.database==='candidate'||capture.database==='restored')expect(getPostgresqlCatalogNode(capture.document,'/snapshot')).toEqual(getPostgresqlCatalogNode(expected.document,'/snapshot'));
 }
 const columns=getPostgresqlColumnMetadata(expected.document).filter(c=>c.relation.name==='edits');expect(columns.map(c=>c.element.scalarType)).toEqual(['integer','decimal','string','integer']);expect(columns.find(c=>c.element.name==='label')!.element.description).toBe("Edited customer's label — 注文");
},30000);
