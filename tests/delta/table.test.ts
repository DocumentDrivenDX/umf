import {test,expect} from 'bun:test';
import {importDeltaTable,exportDeltaTable,inspectDeltaTable,getDeltaTableSchema,exportDeltaSchema,proposeDeltaTableNodeEdit,readDocument,writeDocument} from '../../src';
const schema='{ "type": "struct", "fields": [{"name":"at","type":"timestamp_ntz","nullable":true,"metadata":{}}] }';
const context=()=>({protocol:{minReaderVersion:3,minWriterVersion:7,readerFeatures:['timestampNtz'],writerFeatures:['timestampNtz']},metaData:{id:'table',format:{provider:'parquet',options:{}},schemaString:schema,partitionColumns:[],configuration:{}}});
test('US-018-AC4: context preserves embedded spelling, exact integers and future declarations',()=>{
 const c:any=context();c.protocol.readerFeatures.push('futureFeature');c.protocol.writerFeatures.push('futureFeature');c.metaData.future={keep:true};const text=JSON.stringify(c).replace('"id":"table"','"id":"table","createdTime":9223372036854775807'),doc=importDeltaTable(text,{id:'context'});
 for(const f of ['json','yaml'] as const)expect(exportDeltaTable(readDocument(writeDocument(doc,f),f))).toBe(text);expect(exportDeltaTable(doc)).toContain(JSON.stringify(schema));expect(JSON.parse(exportDeltaSchema(getDeltaTableSchema(doc))).fields[0].type).toBe('timestamp_ntz');expect(inspectDeltaTable(doc).complete).toBe(false);expect(inspectDeltaTable(doc).diagnostics.some(d=>d.code==='DELTA_FEATURE_UNVERIFIED'&&d.message.includes('futureFeature'))).toBe(true);
});
test('US-018-AC4: feature/partition inconsistencies and malformed schema remain visible and preserved',()=>{
 const c:any=context();c.protocol.minReaderVersion=1;c.protocol.writerFeatures=[];c.metaData.partitionColumns=['missing','missing'];const doc=importDeltaTable(JSON.stringify(c),{id:'bad'});const codes=inspectDeltaTable(doc).diagnostics.map(d=>d.code);for(const code of ['DELTA_FEATURE_VERSION','DELTA_READER_FEATURE_WRITER','DELTA_TIMESTAMP_NTZ_FEATURE','DELTA_PARTITION_UNRESOLVED','DELTA_PARTITION_DUPLICATE'])expect(codes).toContain(code);
 c.metaData.schemaString='not JSON';const opaque=importDeltaTable(JSON.stringify(c),{id:'opaque'});expect(exportDeltaTable(opaque)).toContain('not JSON');expect(inspectDeltaTable(opaque).diagnostics.some(d=>d.code==='DELTA_EMBEDDED_SCHEMA')).toBe(true);expect(()=>getDeltaTableSchema(opaque)).toThrow();
});
test('US-018-AC5: generic context edits are atomic and do not imply safe table evolution',()=>{
 const text=JSON.stringify(context()),doc=importDeltaTable(text,{id:'edit'}),changed=proposeDeltaTableNodeEdit(doc,'/metaData/id','"other"');expect(JSON.parse(exportDeltaTable(changed.document)).metaData.id).toBe('other');expect(exportDeltaTable(doc)).toBe(text);expect(changed.validation.complete).toBe(false);expect(()=>proposeDeltaTableNodeEdit(doc,'/protocol/minReaderVersion','"3"')).toThrow();
 (doc.modules[0]!.elements[0]!.extensions['umf.delta.table'] as any).future=1;expect(()=>exportDeltaTable(doc)).toThrow();expect(readDocument(writeDocument(doc,'yaml'),'yaml')).toEqual(doc);
});
