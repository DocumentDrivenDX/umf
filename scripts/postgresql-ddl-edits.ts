import {backend} from '../native/postgresql/runtime';
import {importPostgresqlSql,getPostgresqlNode,proposePostgresqlNodeEdit,exportPostgresqlSql,writeDocument,readDocument,getPostgresqlSource} from '../src';
import {renderTree} from '../src/model/native-json';
const base='fixtures/postgresql/edits/',source=await Bun.file(base+'source.sql').text(),expectedSource=await Bun.file(base+'expected.sql').text();
const document=await importPostgresqlSql(source,backend,{id:'ddl-edit-source'}),expected=await importPostgresqlSql(expectedSource,backend,{id:'authored-expectation'});
document.vocabularies['example.future']={version:'1.0.0'};document.extensions={'example.future':{intent:'retained source context'}};
const paths=[
 '/stmts/1/stmt/CreateStmt/tableElts/1/ColumnDef/typeName',
 '/stmts/1/stmt/CreateStmt/tableElts/1/ColumnDef/constraints/0/Constraint/raw_expr',
 '/stmts/1/stmt/CreateStmt/tableElts/2/ColumnDef',
 '/stmts/1/stmt/CreateStmt/tableElts/3/ColumnDef/constraints/0/Constraint/raw_expr',
 '/stmts/2/stmt/CommentStmt/comment',
 '/stmts/3/stmt/IndexStmt/whereClause',
];
let candidate=document;const edits=[];
for(const path of paths){const text=renderTree(getPostgresqlNode(expected,path));candidate=proposePostgresqlNodeEdit(candidate,path,text).document;edits.push({path,text});}
if(getPostgresqlSource(candidate)!==source)throw Error('Original source archive changed');
const nativeSql=await exportPostgresqlSql(candidate,backend),exports=[];
for(const format of ['json','yaml'] as const){const sql=await exportPostgresqlSql(readDocument(writeDocument(candidate,format),format),backend);if(sql!==nativeSql)throw Error('Recovered edit changed');exports.push({format,sql});}
await Bun.write(base+'candidate.sql',nativeSql+'\n');
await Bun.write(base+'candidates.json',JSON.stringify({source,expectedSource,document,candidate,edits,nativeSql,exports,scope:'Explicit raw-DDL edits; original source archive and unknown UMF content retained. This is not synchronization of catalog metadata edits.'},null,2)+'\n');
console.log({edits:edits.length,recoveries:exports.length});
