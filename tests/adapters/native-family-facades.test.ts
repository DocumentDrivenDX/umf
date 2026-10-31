import {describe,expect,it} from 'bun:test';
import {UmfError} from '../../src/model/errors';
import {createLinkmlOdcsRustDefault} from '../../src/adapters/linkml-odcs-rust-default';
import {createTableSpecRustDefault} from '../../src/adapters/tablespec/rust-default';
import {createSqlServerRustDefault} from '../../src/adapters/sqlserver/rust-default';

const document={umf:'0.10.0',id:'fixture',vocabularies:{},modules:[]} as never;
const nativeError={code:'REQUEST',message:'wrong family',path:'/op'};
const isNative=(error:unknown)=>error===nativeError;
const refuses=()=>{throw nativeError;};

describe('closed native family public facades',()=>{
 it('keeps LinkML/ODCS synchronous import-get-edit-export shapes and maps native refusal',()=>{
  const calls:string[]=[];
  const engine={
   linkml:{import:()=>{calls.push('linkml.import');return document;},inspectPayload:()=>[{code:'LINKML_CONTEXT',path:'',severity:'warning',message:'native'}],inspect:()=>({valid:true}),export:()=>{calls.push('linkml.export');return 'linkml';},getNode:()=>({kind:'string',value:'x'}),editNode:()=>({document,validation:{valid:true}}),classSlots:()=>({}),slotValues:()=>({}),importContext:()=>({}),importMerge:()=>({})},
   odcs:{import:()=>{calls.push('odcs.import');return document;},inspectPayload:()=>[{code:'ODCS_CONTEXT',path:'',severity:'warning',message:'native'}],inspect:()=>({valid:true}),export:()=>{calls.push('odcs.export');return 'odcs';},getNode:()=>({kind:'string',value:'y'}),editNode:()=>({document,validation:{valid:true}}),resolveReference:()=>({}),relationships:()=>({}),renameElement:()=>({})},
  } as never;
  const api=createLinkmlOdcsRustDefault(engine,isNative);
  const linkml=api.importLinkmlDocument('{}',{id:'fixture',format:'json'});
  expect(api.getLinkmlDocumentNode(linkml,'/name')).toEqual({kind:'string',value:'x'});
  expect(api.proposeLinkmlDocumentNodeEdit(linkml,'/name','"z"').document).toBe(document);
  expect(api.exportLinkmlDocument(linkml)).toBe('linkml');
  const odcs=api.importOdcsDocument('{}',{id:'fixture',format:'json'});
  expect(api.getOdcsDocumentNode(odcs,'/name')).toEqual({kind:'string',value:'y'});
  expect(api.proposeOdcsDocumentNodeEdit(odcs,'/name','"z"').document).toBe(document);
  expect(api.exportOdcsDocument(odcs)).toBe('odcs');
  expect(api.linkmlRegistry().get('umf.linkml','0.1.0')?.semantics?.({} as never,{document,path:'',scope:{} as never})).toEqual([{code:'LINKML_CONTEXT',path:'',severity:'warning',message:'native'}]);
  expect(api.odcsRegistry().get('umf.odcs','0.1.0')?.semantics?.({} as never,{document,path:'',scope:{} as never})).toEqual([{code:'ODCS_CONTEXT',path:'',severity:'warning',message:'native'}]);
  expect(calls).toEqual(['linkml.import','linkml.export','odcs.import','odcs.export']);
  const refusing=createLinkmlOdcsRustDefault({linkml:{import:refuses},odcs:{import:refuses}} as never,isNative);
  expect(()=>refusing.importLinkmlDocument('{}',{id:'x',format:'json'})).toThrow(UmfError);
  expect(()=>refusing.importOdcsDocument('{}',{id:'x',format:'json'})).toThrow(UmfError);
 });

 it('keeps TableSpec sync import-get-edit-export shapes and maps native refusal',()=>{
  const calls:string[]=[];
  const engine={tablespec:{importTableSpec:()=>{calls.push('import');return document;},inspectTableSpec:()=>({valid:true}),exportTableSpec:()=>{calls.push('export');return '{}';},getTableSpecTable:()=>({kind:'object',members:{}}),getTableSpecColumn:()=>({kind:'object',members:{}}),editTableSpecTable:()=>document,editTableSpecColumn:()=>document,importTableSpecBundle:()=>document,exportTableSpecBundle:()=>({})}} as never;
  const api=createTableSpecRustDefault(engine,isNative);
  const table=api.importTableSpec('{}',{id:'fixture',format:'json'});
  expect(api.getTableSpecTable(table)).toMatchObject({kind:'object'});
  expect(api.editTableSpecTable(table,{})).toBe(document);
  expect(api.exportTableSpec(table)).toBe('{}');
  expect(calls).toEqual(['import','export']);
  const refusing=createTableSpecRustDefault({tablespec:{importTableSpec:refuses}} as never,isNative);
  expect(()=>refusing.importTableSpec('{}',{id:'x',format:'json'})).toThrow(UmfError);
 });

 it('keeps SQL Server sync import-metadata-edit-export shapes and maps native refusal',()=>{
  const calls:string[]=[];
  const engine={sqlserver:{import:()=>{calls.push('import');return document;},inspectPayload:()=>[{code:'SQLSERVER_CAPTURE_SCOPE',path:'',severity:'warning',message:'native'}],inspect:()=>({valid:true}),export:()=>{calls.push('export');return '{}';},columns:()=>[],constraints:()=>({}),indexes:()=>({}),edit:()=>document,facetType:()=>({}),facetPredicate:()=>({}),facetConstraints:()=>({})}} as never;
  const api=createSqlServerRustDefault(engine,isNative);
  const catalog=api.importSqlServerCatalog('{}',{id:'fixture'});
  expect(api.getSqlServerColumnMetadata(catalog)).toEqual([]);
  expect(api.proposeSqlServerCatalogEdit(catalog,'/tables/0','{}')).toBe(document);
  expect(api.exportSqlServerCatalog(catalog)).toBe('{}');
  expect(api.sqlserverRegistry().get('umf.sqlserver','0.1.0')?.semantics?.({} as never,{document,path:'',scope:{} as never})).toEqual([{code:'SQLSERVER_CAPTURE_SCOPE',path:'',severity:'warning',message:'native'}]);
  expect(calls).toEqual(['import','export']);
  const refusing=createSqlServerRustDefault({sqlserver:{import:refuses}} as never,isNative);
  expect(()=>refusing.importSqlServerCatalog('{}',{id:'x'})).toThrow(UmfError);
 });
});
