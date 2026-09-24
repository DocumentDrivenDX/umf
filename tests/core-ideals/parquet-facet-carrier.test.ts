import {test,expect} from 'bun:test';
import {parquetFacetFile,type ParquetFacetFileRequest} from '../../src/core-ideals/parquet-facet-carrier';
import {importParquetSchema,getParquetFieldMetadata,inspectParquetMetadata} from '../../src';
import corpus from '../../fixtures/validation/facets-parquet-carrier-corpus.json';
const base:ParquetFacetFileRequest={recordName:'R',fieldName:'v',nullable:false,carrier:{kind:'integer',bits:8,signed:false}};
test('emitted native corpus is deterministic and retains field identity and opaque metadata',async()=>{
 for(const row of corpus.rows){
  const bytes=parquetFacetFile(row.request as ParquetFacetFileRequest);
  expect(bytes).toEqual(new Uint8Array(await Bun.file(row.path).arrayBuffer()));
  const d=importParquetSchema(bytes,{id:'test'}),f=getParquetFieldMetadata(d).fields[0]!;
  expect((f.nativeField as any).field_id).toBe('37');expect(f.definitionLevel).toBe(Number(row.request.nullable));
  const metadata=inspectParquetMetadata(d).metadata as any;
  expect(metadata.key_value_metadata).toEqual([{key:'future.meaning',value:'unclassified'},{key:'umf.maxLength',value:'1'}]);
 }
},30000);
test('invalid capacities, ambiguous members and unsupported exact values refuse before emission',()=>{
 const bad=[{kind:'integer',bits:7,signed:true},{kind:'integer',bits:8,signed:1},{kind:'fixed',bytes:0},{kind:'fixed',bytes:4097},{kind:'fixed',bytes:1.5},
 {kind:'decimal',carrier:'int32',precision:10,scale:0},{kind:'decimal',carrier:'int64',precision:19,scale:0},
 {kind:'decimal',carrier:'fixed',precision:3,scale:0,bytes:1},{kind:'decimal',carrier:'fixed',precision:1,scale:0},
 {kind:'decimal',carrier:'bytes',precision:3,scale:-1},{kind:'decimal',carrier:'bytes',precision:3,scale:4},
 {kind:'decimal',carrier:'bytes',precision:3,scale:0,bytes:2},{kind:'decimal',carrier:'bytes',precision:2147483648,scale:0},
 {kind:'primitive',nativeType:'invented'},{kind:'primitive',nativeType:'int32',future:'unknown'}];
 for(const carrier of bad)expect(()=>parquetFacetFile({...base,carrier} as never)).toThrow();
 for(const fieldId of [2147483648,-2147483649,1.5])expect(()=>parquetFacetFile({...base,fieldId})).toThrow();
 for(const fieldName of ['', 'a\0b','\ud800'])expect(()=>parquetFacetFile({...base,fieldName})).toThrow();
 expect(()=>parquetFacetFile({...base,metadata:{x:1}} as never)).toThrow();
 expect(()=>parquetFacetFile({...base,future:1} as never)).toThrow();
 let calls=0;expect(()=>parquetFacetFile({...base,get metadata(){calls++;return {};}})).toThrow();expect(calls).toBe(0);
});
test('large valid decimal declaration is distinct from reader representability',()=>{
 const bytes=parquetFacetFile({...base,carrier:{kind:'decimal',carrier:'bytes',precision:77,scale:0}});
 const d=importParquetSchema(bytes,{id:'wide-decimal'}),native=getParquetFieldMetadata(d).fields[0]!.nativeField as any;
 expect(native.precision).toBe('77');expect(native.logicalType.DECIMAL.precision).toBe('77');
 expect(()=>parquetFacetFile({...base,carrier:{kind:'decimal',carrier:'fixed',precision:76,scale:0,bytes:32}})).not.toThrow();
});
