// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {
  exportIcebergTable,
  validateDocument,
  UmfError,
  getIcebergTableNode,
  importIcebergTable,
  inspectIcebergTable,
  inspectIcebergTableContext,
  icebergTableRegistry,
  proposeIcebergTablePromotion,
  proposeIcebergTableRename,
} from '../../src/index-node-v4';

test('Iceberg table public Node root uses native import, rename/promotion, Registry inspection, and export',async()=>{
  const text=await Bun.file('fixtures/iceberg/upstream/core/src/test/resources/TableMetadataV2ValidMinimal.json').text();
  const raw=JSON.parse(text);
  const field=raw.schemas[0].fields.find((item:{id:number})=>item.id===1);
  field.type='int';
  const source=importIcebergTable(JSON.stringify(raw),{id:'native-iceberg-table'});
  expect(inspectIcebergTable(source).valid).toBe(true);
  expect(inspectIcebergTableContext(source).status).toBe('checked');
  expect(validateDocument(source,icebergTableRegistry()).valid).toBe(true);
  const name=getIcebergTableNode(source,'/schemas/0/fields/0/name');
  expect(name).toMatchObject({kind:'string'});
  const renamed=proposeIcebergTableRename(source,{fieldId:1,nextSchemaId:1,newName:'native_renamed'});
  expect(JSON.parse(exportIcebergTable(renamed.document)).schemas[1].fields[0].name).toBe('native_renamed');
  const promoted=proposeIcebergTablePromotion(source,{fieldId:1,nextSchemaId:1,targetType:'long'});
  expect(JSON.parse(exportIcebergTable(promoted.document)).schemas[1].fields[0].type).toBe('long');
  expect(exportIcebergTable(source)).toContain('"schema-id":0');
},60_000);

test('Iceberg table public Node root maps an unsupported promotion refusal',async()=>{
  const text=await Bun.file('fixtures/iceberg/upstream/core/src/test/resources/TableMetadataV2ValidMinimal.json').text();
  const raw=JSON.parse(text);
  const field=raw.schemas[0].fields.find((item:{id:number})=>item.id===1);
  field.type='int';
  const source=importIcebergTable(JSON.stringify(raw),{id:'native-iceberg-refusal'});
  let refusal:unknown;
  try{proposeIcebergTablePromotion(source,{fieldId:1,nextSchemaId:1,targetType:'string'});}catch(error){refusal=error;}
  expect(refusal).toBeInstanceOf(UmfError);
  expect(refusal).toMatchObject({code:'ICEBERG_TABLE_PROMOTION'});
  expect(exportIcebergTable(source)).toContain('"schema-id":0');
},30_000);
