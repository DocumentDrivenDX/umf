import {test,expect} from 'bun:test';
import * as u from '../src/index';
import {uuidDocument,FIELD,UUID,HEX} from './helpers/uuid-fixtures';
test('version-scoped validation, copied authoring, allowed values, defaults and serialization',()=>{
 const doc=uuidDocument();expect(u.validateDocument(doc).complete).toBe(true);
 const authored=u.declareCoreSchemaProperties(doc,{scope:'element',...FIELD},{allowedValues:[{uuid:UUID}],default:{value:{uuid:UUID.toUpperCase()},on:'missing'},examples:[{uuid:UUID}]});
 expect(u.validateDocument(authored).complete).toBe(true);expect(doc.modules[0]!.elements[1]!.allowedValues).toBeUndefined();
 expect(u.validateCoreFieldValue(authored,FIELD,{uuid:UUID.toUpperCase()}).valid).toBe(true);
 expect(u.validateCoreFieldValue(authored,FIELD,{string:UUID}).valid).toBe(false);
 expect(u.validateCoreFieldValue(authored,FIELD,{uuid:'0'.repeat(8)+'-0000-0000-0000-000000000000'}).valid).toBe(false);
 expect(u.resolveCoreDefault(authored,FIELD,{state:'missing'}).applied).toBe(true);
 expect(()=>u.declareCoreSchemaProperties(doc,{scope:'element',...FIELD},{allowedValues:[{uuid:UUID},{uuid:UUID.toUpperCase()}]})).toThrow();
 for(const format of ['json','yaml'] as const)expect(u.readDocument(u.writeDocument(authored,format),format)).toEqual(authored);
 const older=uuidDocument();older.umf='0.8.0';delete older.modules[0]!.elements[0]!.keys;
 expect(u.validateDocument(older).complete).toBe(false);expect(u.validateCoreFieldValue(older,FIELD,{uuid:UUID}).valid).toBe(false);
 expect(u.inspectCoreScalarType(older,FIELD).meaning.state).toBe('unknown');
 const bits=uuidDocument('bits128');expect(u.validateCoreFieldValue(bits,FIELD,{bits128Hex:HEX}).valid).toBe(true);
 for(const facets of [{length:{max:16,unit:'byte'}},{integerWidth:{bits:128,signed:false}},{precision:38,scale:0},{range:{min:{integerToken:'0'}}}]){const invalid=uuidDocument();invalid.modules[0]!.elements[1]!.facets=facets;expect(u.validateDocument(invalid).valid).toBe(false);}
});
test('current metadata inspectors, selection, containers and unknown refinement boundaries',()=>{
 const d=uuidDocument(),record={module:'m',element:'record'};
 expect(u.inspectCoreScalarType(d,FIELD).meaning).toEqual({state:'known',scalarType:'uuid'});
 expect(u.inspectCoreElementKind(d,FIELD).meaning.state).toBe('known');expect(u.inspectCoreNullability(d,FIELD).meaning.state).toBe('known');expect(u.inspectCoreCardinality(d,FIELD).meaning.state).toBe('known');
 expect(u.inspectCoreFacets(d,FIELD).meaning.state).toBe('missing');expect(u.inspectCoreKeys(d,record).meaning.state).toBe('known');
 expect(u.inspectCoreRecordMembers(d,record).meaning.state).toBe('known');expect(u.inspectCoreReferenceLinks(d,FIELD).meaning.state).toBe('missing');
 expect(u.inspectCoreRelationships(d,{module:'m'}).meaning.state).toBe('missing');
 const selected=u.selectCoreElements(d,{references:'transitive',identities:[record]});expect(selected.selection.length).toBe(2);expect(selected.source).toEqual(d);
 const f=d.modules[0]!.elements[1]!;f.facets={futureRule:1};expect(u.validateDocument(d).complete).toBe(false);expect(u.validateCoreFieldValue(d,FIELD,{uuid:UUID}).valid).toBe(false);
 delete f.facets;d.modules[0]!.elements.push({id:'list',kind:'field',cardinality:'array',itemType:FIELD,nullability:'required',extensions:{}});
 expect(u.validateCoreFieldValue(d,{module:'m',element:'list'},{array:[{uuid:UUID}]}).valid).toBe(true);
});
test('explicit Field-domain authoring preserves the source and validates collisions',()=>{
 const original=uuidDocument('binary'),before=structuredClone(original);
 const declared=u.declareCoreBit128Field(original,FIELD,'uuid');expect(original).toEqual(before);expect(declared.modules[0]!.elements[1]!.scalarType).toBe('uuid');
 const unknown=uuidDocument('future');expect(()=>u.declareCoreBit128Field(unknown,FIELD,'uuid')).toThrow();
 const constrained=uuidDocument('binary');constrained.modules[0]!.elements[1]!.facets={length:{min:16,max:16,unit:'byte'}};expect(()=>u.declareCoreBit128Field(constrained,FIELD,'uuid')).toThrow();
});
test('extension validators receive actual0.9 UUID semantics, not the structural compatibility view',()=>{
 const d=uuidDocument();d.vocabularies['fixture.uuid']={version:'1.0.0'};d.modules[0]!.elements[1]!.extensions['fixture.uuid']={};
 let checks=0;const registry=new u.Registry().register({id:'fixture.uuid',version:'1.0.0',coreVersion:'0.1.0',description:'Synthetic context check',schema:{type:'object'},semantics:'Exact context',scopes:['element'],capabilities:{validation:'semantic',directions:[],evidence:[]}},(_payload,context)=>{expect(context.document.umf).toBe('0.9.0');expect(context.document.modules[0]!.elements[1]!.scalarType).toBe('uuid');checks++;return [];});
 expect(u.validateDocument(d,registry).complete).toBe(true);expect(checks).toBe(1);
 expect(u.selectCoreRelationships(uuidDocument(),{}).version).toBe('2.0.0');
});
test('caller-visible schema mutations do not change internal0.9 validators or codec inventory',()=>{
 const docSchema:any=u.coreBit128DocumentSchema,tupleSchema:any=u.coreBit128KeyTupleSchema;
 const originalVersion=docSchema.properties.umf.const,originalProfile=tupleSchema.properties.profile.enum[1];
 try{
  docSchema.properties.umf.const='caller-mutated';tupleSchema.properties.profile.enum[1]='caller-mutated';
  const d=uuidDocument();expect(u.validateDocument(d).valid).toBe(true);expect(u.inspectCoreElementKind(d,FIELD).meaning.state).toBe('known');
  expect(u.encodeCoreKeyTuple(d,{module:'m',element:'record',key:'id'},[{uuid:UUID}],{profile:'umf-key-tuple-v2'}).version).toBe('4.0.0');
  expect(()=>{(u.SCALAR_TYPES_V09 as any).push('caller-mutated');}).toThrow();
  expect(()=>{(u.SCALAR_TYPES as any).push('uuid');}).toThrow();
 }finally{docSchema.properties.umf.const=originalVersion;tupleSchema.properties.profile.enum[1]=originalProfile;}
});
test('signed and unsigned integer128 keep mathematical equality and lossless bigint context',()=>{
 for(const signed of [true,false]){
  const d=uuidDocument('integer');d.modules[0]!.elements[1]!.facets={integerWidth:{bits:128,signed}};
  const max=signed?(1n<<127n)-1n:(1n<<128n)-1n,context={document:d,field:FIELD};
  expect(u.integerToBigInt({integerToken:String(max)},context)).toBe(max);expect(u.validateCoreFieldValue(d,FIELD,{integerToken:String(max+1n)}).valid).toBe(false);
  expect(()=>u.numericToNumberLossless({integerToken:String(max)},context)).toThrow();
 }
});
