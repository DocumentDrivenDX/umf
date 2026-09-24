import {test,expect} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlSql,proposePostgresqlNodeEdit,getPostgresqlNode,importPostgresqlCatalogCapture,proposePostgresqlCatalogEdit,getPostgresqlCatalogNode,exportPostgresqlCatalogCapture,readDocument,writeDocument} from '../../src';

test('CONTRACT-015 candidate edits cannot erase unknown tagged representation content',async()=>{
 const ast=await importPostgresqlSql('CREATE TABLE original (id integer);',backend,{id:'ast-guard'});
 const catalog=importPostgresqlCatalogCapture(await Bun.file('fixtures/postgresql/catalog-capture.json').text(),{id:'catalog-guard'});
 let rejected=0;
 for(const mode of ['ast','catalog'] as const){
  const original=mode==='ast'?ast:catalog,key=mode==='ast'?'umf.postgresql':'umf.postgresql.catalog';
  const edit=mode==='ast'?proposePostgresqlNodeEdit:proposePostgresqlCatalogEdit;
  const native=mode==='ast'?getPostgresqlNode(original,''):getPostgresqlCatalogNode(original,'');
  const render=(await import('../../src/model/native-json')).renderTree;
  for(const location of ['payload','root','leaf','state'] as const){
   if(mode==='ast'&&location==='state')continue;
   const document=structuredClone(original),p=document.modules[0]!.elements[0]!.extensions[key] as any;
   const leaf=mode==='ast'?p.root.members.version:p.root.members.serverVersion;
   (location==='payload'?p:location==='root'?p.root:location==='state'?p.root.members.state:leaf).future={meaning:'not understood'};
   const before=structuredClone(document);
   // Root replacement, leaf replacement and even a disjoint edit must keep the guard.
   const disjoint=mode==='ast'?'/stmts/0/stmt/CreateStmt/relation/relname':'/snapshot/types/0/name';
   for(const [path,replacement] of [['',render(native)],[mode==='ast'?'/version':'/serverVersion','170004'],[disjoint,'"changed"']]){
    expect(()=>edit(document,path!,replacement!)).toThrow('Unknown representation');rejected++;
    expect(document).toEqual(before);
   }
   for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(document,format),format)).toEqual(before);
  }
 }
 const capture=JSON.parse(exportPostgresqlCatalogCapture(catalog).json);capture.future={exact:'preserve'};
 const extended=importPostgresqlCatalogCapture(JSON.stringify(capture),{id:'native-unknown'});
 const candidate=proposePostgresqlCatalogEdit(extended,'/snapshot/types/0/name','"changed"');
 expect(JSON.parse(exportPostgresqlCatalogCapture(candidate.document).json).future).toEqual(capture.future);
 expect(exportPostgresqlCatalogCapture(candidate.document).state).toBe('modified');
 const render=(await import('../../src/model/native-json')).renderTree;
 await Bun.write('fixtures/postgresql/edit-preservation.json',JSON.stringify({ast,catalog,native:{ast:render(getPostgresqlNode(ast,'')),catalog:exportPostgresqlCatalogCapture(catalog).json},rejected,scope:'Unknown tagged encoding blocks candidate replacement; native capture metadata remains preserved.'},null,2)+'\n');
},30000);
