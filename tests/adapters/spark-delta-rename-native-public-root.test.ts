import {expect,it} from 'bun:test';
import {
  UmfError, validateDocument, sparkRegistry, importSparkSchema, exportSparkSchema, renameSparkField,
  importDeltaTable, exportDeltaTable, renameDeltaMappedField,
} from '../../src/index-node-v4';

it('Spark public Node root imports, renames, preserves collation/unknown metadata, and exports',()=>{
  const source='{"type":"struct","fields":[{"name":"old","type":{"type":"array","elementType":"string","containsNull":true},"nullable":true,"metadata":{"__COLLATIONS":{"old.element":"spark.UTF8_LCASE"},"other":{"nameReference":"old"},"big":9007199254740993}}]}';
  const document=importSparkSchema(source,{id:'spark-public'});
  expect(validateDocument(document,sparkRegistry()).valid).toBe(true);
  const result=renameSparkField(document,{fieldPointer:'/fields/0',name:'new',uninterpretedMetadata:'preserve-and-report'});
  const output=JSON.parse(exportSparkSchema(result.document)).fields[0];
  expect(output.name).toBe('new');
  expect(output.metadata.__COLLATIONS).toEqual({'new.element':'spark.UTF8_LCASE'});
  expect(output.metadata.other.nameReference).toBe('old');
  expect(output.metadata.big).toBe(9007199254740993);
  expect(exportSparkSchema(document)).toBe(source);
},60_000);

it('Spark public Node root maps an invalid rename target to UmfError',()=>{
  const document=importSparkSchema('{"type":"struct","fields":[{"name":"old","type":"string","nullable":true}]}',{id:'spark-refusal'});
  let refusal:unknown;
  try{renameSparkField(document,{fieldPointer:'/fields/0/metadata',name:'new',uninterpretedMetadata:'preserve-and-report'});}catch(error){refusal=error;}
  expect(refusal).toBeInstanceOf(UmfError);
  expect(refusal).toMatchObject({code:'SPARK_RENAME_PATH'});
},30_000);

it('Delta mapped rename uses public Rust route and retains mapping identity/physical names',async()=>{
  const source=await Bun.file('fixtures/delta/mapped-data/name/context.json').text();
  const document=importDeltaTable(source,{id:'delta-rename-public'});
  const result=renameDeltaMappedField(document,{fieldPointer:'/fields/1',name:'area',uninterpretedReferences:'preserve-and-report'});
  const before=JSON.parse(source),after=JSON.parse(exportDeltaTable(result.document));
  expect(result.partitionUpdates).toEqual([{index:0,from:'region',to:'area'}]);
  expect(after.protocol).toEqual(before.protocol);
  expect(after.metaData.configuration).toEqual(before.metaData.configuration);
  const beforeFields=JSON.parse(before.metaData.schemaString).fields,afterFields=JSON.parse(after.metaData.schemaString).fields;
  expect(afterFields[1].metadata).toEqual(beforeFields[1].metadata);
  expect(exportDeltaTable(document)).toBe(source);
},60_000);

it('Delta mapped rename refuses a non-field pointer through the public UMF error',async()=>{
  const source=await Bun.file('fixtures/delta/mapped-data/name/context.json').text();
  const document=importDeltaTable(source,{id:'delta-rename-refusal'});
  let refusal:unknown;
  try{renameDeltaMappedField(document,{fieldPointer:'/fields/1/metadata',name:'area',uninterpretedReferences:'preserve-and-report'});}catch(error){refusal=error;}
  expect(refusal).toBeInstanceOf(UmfError);
  expect(refusal).toMatchObject({code:'DELTA_RENAME_PATH'});
},30_000);
