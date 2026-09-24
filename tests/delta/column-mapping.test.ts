import {test,expect} from 'bun:test';
import {importDeltaTable,exportDeltaTable,inspectDeltaTable} from '../../src';
const field=(name:string,id:number,physical:string,type:any='string')=>({name,type,nullable:true,metadata:{'delta.columnMapping.id':id,'delta.columnMapping.physicalName':physical}});
const context=(fields:any[])=>({protocol:{minReaderVersion:2,minWriterVersion:5},metaData:{id:'mapped',format:{provider:'parquet'},schemaString:JSON.stringify({type:'struct',fields}),partitionColumns:[],configuration:{'delta.columnMapping.mode':'name','delta.columnMapping.maxColumnId':'5'}}});
const codes=(c:any)=>inspectDeltaTable(importDeltaTable(JSON.stringify(c),{id:'mapping'})).diagnostics.filter(d=>d.code.startsWith('DELTA_MAPPING_')).map(d=>d.code);
test('US-018-AC6: mapped nested field IDs and physical paths are checked independently',()=>{
 const c=context([field('a',1,'physical.a',{type:'array',elementType:{type:'struct',fields:[field('child',2,'p')]},containsNull:true}),field('b',3,'physical',{type:'struct',fields:[field('a',4,'a',{type:'struct',fields:[field('child',5,'p')]})]})]);expect(codes(c)).toEqual(['DELTA_MAPPING_HISTORY_UNVERIFIED']);c.metaData.configuration['delta.columnMapping.maxColumnId']='0000000000005';expect(codes(c)).toEqual(['DELTA_MAPPING_HISTORY_UNVERIFIED']);
 const dup=context([field('a',1,'same'),field('b',1,'same')]);expect(codes(dup)).toContain('DELTA_MAPPING_DUPLICATE_ID');expect(codes(dup)).toContain('DELTA_MAPPING_DUPLICATE_PATH');
});
test('US-018-AC6: missing mapping context and exact out-of-range IDs are diagnosed without source loss',()=>{
 const c:any=context([field('a',8,'p')]);c.protocol={minReaderVersion:1,minWriterVersion:2};const found=codes(c);for(const code of ['DELTA_MAPPING_READER_PROTOCOL','DELTA_MAPPING_WRITER_PROTOCOL','DELTA_MAPPING_MAX_ID_BELOW_FIELD'])expect(found).toContain(code);
 c.metaData.schemaString='{"type":"struct","fields":[{"name":"a","type":"long","nullable":true,"metadata":{"delta.columnMapping.id":9007199254740993}}]}';const text=JSON.stringify(c),doc=importDeltaTable(text,{id:'exact'});expect(exportDeltaTable(doc)).toBe(text);expect(codes(c)).toContain('DELTA_MAPPING_ID');expect(codes(c)).toContain('DELTA_MAPPING_PHYSICAL_NAME');
});
test('US-018-AC6: feature-era mapping requires both feature lists; none mode stays separate',()=>{
 const c:any=context([field('a',1,'p')]);c.protocol={minReaderVersion:3,minWriterVersion:7,readerFeatures:['columnMapping'],writerFeatures:['columnMapping']};expect(codes(c)).toEqual(['DELTA_MAPPING_HISTORY_UNVERIFIED']);c.metaData.configuration['delta.columnMapping.mode']='none';expect(codes(c)).toEqual([]);c.metaData.configuration['delta.columnMapping.mode']='future';expect(codes(c)).toEqual(['DELTA_MAPPING_MODE']);
});
