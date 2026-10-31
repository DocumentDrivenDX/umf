import {expect,test} from 'bun:test';
import {
 importLinkmlDocument,getLinkmlDocumentNode,proposeLinkmlDocumentNodeEdit,exportLinkmlDocument,
 importOdcsDocument,getOdcsDocumentNode,proposeOdcsDocumentNodeEdit,exportOdcsDocument,
 importTableSpec,getTableSpecTable,editTableSpecColumn,exportTableSpec,
 importSqlServerCatalog,getSqlServerColumnMetadata,proposeSqlServerCatalogEdit,exportSqlServerCatalog,
} from '../../src/index-node-v4';

const s=(node:unknown)=>expect(node).toMatchObject({kind:'string'});

test('native Node public roots route LinkML, ODCS, TableSpec and SQL Server through the addon',async()=>{
 const linkmlText='id: https://example.test/schema\nname: original\n';
 const linkml=importLinkmlDocument(linkmlText,{id:'native-linkml',format:'yaml'});
 s(getLinkmlDocumentNode(linkml,'/name'));
 const linkmlEdit=proposeLinkmlDocumentNodeEdit(linkml,'/name','"edited"');
 expect(exportLinkmlDocument(linkmlEdit.document,'yaml')).toContain('edited');

 const odcsText=await Bun.file('native/odcs/sources/docs/examples/references/relationships.odcs.yaml').text();
 const odcs=importOdcsDocument(odcsText,{id:'native-odcs',format:'yaml'});
 s(getOdcsDocumentNode(odcs,'/apiVersion'));
 const odcsEdit=proposeOdcsDocumentNodeEdit(odcs,'/apiVersion','"v3.2.0"');
 expect(exportOdcsDocument(odcsEdit.document,'yaml')).toContain('v3.2.0');

 const tableText='{"version":"1.0","table_name":"orders","columns":[{"name":"id","data_type":"INTEGER"}]}';
 const table=importTableSpec(tableText,{id:'native-tablespec',format:'json'});
 expect(getTableSpecTable(table)).toMatchObject({kind:'object'});
 const tableEdit=editTableSpecColumn(table,0,{description:{kind:'string',value:'identifier'}});
 expect(exportTableSpec(tableEdit)).toContain('identifier');

 const sqlText=await Bun.file('fixtures/sqlserver/catalog.json').text();
 const sql=importSqlServerCatalog(sqlText,{id:'native-sqlserver'});
 const columns=getSqlServerColumnMetadata(sql);
 expect(columns.length).toBeGreaterThan(0);
 const sqlEdit=proposeSqlServerCatalogEdit(sql,`${columns[0]!.path}/description`,'"identifier"');
 expect(exportSqlServerCatalog(sqlEdit)).toContain('identifier');

 expect(()=>importLinkmlDocument('[]',{id:'bad',format:'json'})).toThrow();
 expect(()=>importOdcsDocument('[]',{id:'bad',format:'json'})).toThrow();
 expect(()=>importTableSpec('{"version":"99","table_name":"bad","columns":[]}',{id:'bad',format:'json'})).toThrow();
 expect(()=>importSqlServerCatalog('[]',{id:'bad'})).toThrow();
});
