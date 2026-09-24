import {test,expect} from 'bun:test';
import {importAvroSchema,proposeAvroNodeEdit,editAvroNode,exportAvroBundle,exportAvroSchema,getAvroFieldMetadata,writeDocument,readDocument,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/avro/node-edit-proposal.schema.json';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema);
test('US-007-AC9 explicit Avro candidates preserve logical annotations, unknown metadata and exact defaults',async()=>{
 const native={type:'record',name:'Invoice',fields:[{name:'amount',type:{type:'bytes',logicalType:'decimal',precision:8,scale:2},'future.field':{unit:'money'}},{name:'created',type:{type:'long',logicalType:'timestamp-micros'}},{name:'count',type:'long',default:0}]};
 const source=importAvroSchema(JSON.stringify(native),{id:'invoice'});source.extensions={'example.future':{opaque:['preserve']}};source.vocabularies['example.future']={version:'7.0.0'};
 source.modules[1]!.elements[0]!['future.consumer']={label:'Amount'};
 const cases=[];
 for(const [id,path,text] of [['scale','/fields/0/type/scale','3'],['local','/fields/1/type/logicalType','"local-timestamp-micros"'],['unknown','/fields/1/type/logicalType','"timestamp-micros\\n"'],['exact-default','/fields/2/default','9223372036854775807']] as const){
  expect(()=>editAvroNode(source,path,text)).toThrow('All present semantics');
  const result=proposeAvroNodeEdit(source,path,text);expect(check(result)).toBe(true);expect(result.status).toBe('candidate');expect(result.validation.complete).toBe(false);
  expect(result.source).toEqual(source);expect(result.document.extensions).toEqual(source.extensions);expect(result.document.modules[1]!.elements[0]!['future.consumer']).toEqual({label:'Amount'});
  const exports=[];for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(result.document,format),format);expect(back).toEqual(result.document);const bundle=exportAvroBundle(back);exports.push({format,schema:bundle.schema,dependencies:bundle.dependencies});}
  if(id==='unknown')expect(getAvroFieldMetadata(result.document)[1]!.element.scalarType).toBeUndefined();
  if(id==='exact-default'){expect(exportAvroSchema(result.document)).toContain('9223372036854775807');expect(result.validation.diagnostics.some(d=>d.code==='AVRO_NUMERIC')).toBe(true);}
  cases.push({id,editText:text,result,exports});
 }
 expect(JSON.parse(exportAvroSchema(source))).toEqual(native);
 const dependency=importAvroSchema('{"type":"record","name":"R","fields":[{"name":"amount","type":"money.Amount"}]}',{id:'dependent',dependencies:[{id:'money.avsc',schema:'{"type":"fixed","name":"money.Amount","size":4,"logicalType":"decimal","precision":8,"scale":2}'}]});
 const result=proposeAvroNodeEdit(dependency,'/scale','3','money.avsc');expect(check(result)).toBe(true);expect(getAvroFieldMetadata(result.document)[0]!.element.scalarType).toBe('decimal');expect(exportAvroBundle(dependency).dependencies[0]!.schema).toContain('"scale":2');
 cases.push({id:'dependency',editText:'3',result,exports:(['json','yaml'] as const).map(format=>{const bundle=exportAvroBundle(readDocument(writeDocument(result.document,format),format));return {format,schema:bundle.schema,dependencies:bundle.dependencies};})});
 await Bun.write('fixtures/avro/candidate-edits.json',JSON.stringify({cases},null,2)+'\n');
},30000);

test('US-007-AC9 candidates cannot erase representation content or attached field identity',()=>{
 const source=importAvroSchema('{"type":"record","name":"R","fields":[{"name":"a","type":"int"}]}',{id:'guards'});source.modules[1]!.elements[0]!['future.metadata']={keep:true};
 expect(()=>proposeAvroNodeEdit(source,'/fields/0/name','"b"')).toThrow('reassociation');expect(()=>proposeAvroNodeEdit(source,'/fields','[]')).toThrow('discard');
 expect(()=>proposeAvroNodeEdit(source,'/absent','0')).toThrow();expect(()=>proposeAvroNodeEdit(source,'/type','"int"','absent')).toThrow();expect(()=>proposeAvroNodeEdit(source,'','42')).toThrow();
 const unknown=structuredClone(source),payload=unknown.modules[0]!.elements[0]!.extensions['umf.avro'] as any;payload.root.future={keep:true};
 expect(()=>proposeAvroNodeEdit(unknown,'',JSON.stringify('int'))).toThrow('Unknown representation');
 const stale=structuredClone(source);stale.modules[1]!.elements[0]!.scalarType='string';expect(()=>proposeAvroNodeEdit(stale,'/fields/0/type','"long"')).toThrow('disagree');
 const result=proposeAvroNodeEdit(source,'/fields/0/type','"long"');result.document.modules[1]!.elements[0]!['future.metadata']={changed:true};expect(source.modules[1]!.elements[0]!['future.metadata']).toEqual({keep:true});expect(result.source).toEqual(source);
 const unresolved=proposeAvroNodeEdit(source,'/fields/0/type','"Undefined"');expect(unresolved.validation.complete).toBe(false);expect(unresolved.validation.diagnostics.some(d=>d.code==='AVRO_VALIDATOR_LIMIT')).toBe(true);expect(check(unresolved)).toBe(true);
});
