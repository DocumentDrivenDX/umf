import {describe,expect,it} from 'bun:test';
import {UmfError,deltaRegistry,deltaTableRegistry,validateDocument,importDeltaSchema,proposeDeltaNodeEdit,exportDeltaSchema,captureDeltaLog,inspectDeltaLog,exportDeltaLog,importDeltaTable,getDeltaTableSchema,proposeDeltaTableNodeEdit,exportDeltaTable} from '../../src/index-node-v4';

describe('Delta native default source operations',()=>{
  it('imports, edits, and exports schema while retaining source and inspects captured log',()=>{
    const source='{"type":"struct","fields":[{"name":"old","type":"integer","nullable":true,"metadata":{}}]}';
    const original=importDeltaSchema(source,{id:'delta-schema'});
    expect(validateDocument(original,deltaRegistry()).valid).toBe(true);
    const edited=proposeDeltaNodeEdit(original,'/fields/0/name','"renamed"');
    expect(edited.document).not.toBe(original);
    expect(exportDeltaSchema(edited.document)).toContain('renamed');
    expect(exportDeltaSchema(original)).toBe(source);
    const schemaText=' { "type":"struct","fields":[{"name":"old","type":"integer","nullable":true,"metadata":{}}] } ';
    const tableText=JSON.stringify({protocol:{minReaderVersion:1,minWriterVersion:2},metaData:{id:'tbl',format:{provider:'parquet',options:{}},schemaString:schemaText,partitionColumns:[],configuration:{}}});
    const table=importDeltaTable(tableText,{id:'delta-table'});
    expect(validateDocument(table,deltaTableRegistry()).valid).toBe(true);
    const embedded=getDeltaTableSchema(table);
    const changedTable=proposeDeltaTableNodeEdit(table,'/metaData/id','"changed"');
    expect(exportDeltaTable(changedTable.document)).toContain('changed');
    expect(exportDeltaTable(table)).toBe(tableText);
    expect(embedded.id).toBe('delta-table/schema');
    expect(exportDeltaSchema(embedded)).toContain('old');
    expect(exportDeltaSchema(proposeDeltaNodeEdit(embedded,'/fields/0/name','"new"').document)).toContain('new');
    const logSource='{"commitInfo":{"timestamp":1}}\n';
    const log=captureDeltaLog(logSource,{id:'delta-log'});
    expect(exportDeltaLog(log)).toBe(logSource);
    expect(inspectDeltaLog(log).lines[0]?.status).toBe('parsed');
  },60_000);
  it('maps a malformed schema source to the public UMF error',()=>{
    try { importDeltaSchema('{bad',{id:'bad'}); throw new Error('expected refusal'); }
    catch(error) { expect(error).toBeInstanceOf(UmfError); expect((error as UmfError).code).toBe('JSON_SCHEMA_SYNTAX'); }
  },30_000);
});
