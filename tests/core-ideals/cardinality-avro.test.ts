import {expect,test} from 'bun:test';
import {classifyAvroCardinality,recoverAvroCardinalityBundle,type AvroCardinalityRequest} from '../../src/core-ideals/cardinality-avro';
import {avroAvailabilitySource} from '../../scripts/core-ideals/nullability-avro-cases';
import {upgradeCardinalityEnvelope} from '../../src/model/cardinality-transition';
import {exportAvroBundle} from '../../src/adapters/avro';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {validateDocument} from '../../src/validation/document';
import fixture from '../../fixtures/avro/cardinality-cases.json';
function prepare(schema:string,dependencies:{id:string;schema:string}[]=[]){const initial=avroAvailabilitySource(schema,dependencies,'cardinality.Example');return {source:upgradeCardinalityEnvelope(initial.source).target,request:{column:initial.column,nativeSource:schema,dependencies,identity:{module:'logical',element:'value'},profile:'present-non-null-schema',mode:'strict'} as AvroCardinalityRequest};}

test('schema shape classification publishes nested logical Fields and preserves exact native text through both receipt formats',()=>{
 for(const c of fixture.cases){
  const {source,request}=prepare(c.schema),native=exportAvroBundle(source);
  for(const mode of ['strict','report'] as const){
   const r=classifyAvroCardinality(source,{...request,mode});
   const mixed=c.id.startsWith('array-map-union');expect(r.status).toBe(mixed&&mode==='strict'?'blocked':'classified');
   expect(r.residuals.length>0).toBe(mixed);
   if(!r.target){expect(r).not.toHaveProperty('target');continue;}
   expect(validateDocument(r.target).valid).toBe(true);expect(exportAvroBundle(r.target).schema).toBe(native.schema);
   const logical=r.target.modules.find(m=>m.id==='logical')!;
   expect(logical.elements.length).toBe(r.mapping.nodes.length);
   for(const e of logical.elements){
    if(e.cardinality==='array'||e.cardinality==='map'){expect(e).not.toHaveProperty('scalarType');expect(e).toHaveProperty('itemType');}
    expect(e).not.toHaveProperty('nullability');
   }
   if(c.id==='ordered-duplicates')expect(logical.elements[1]!.scalarType).toBe('integer');
   if(c.id==='nested-arrays')expect(logical.elements.map(e=>e.cardinality)).toEqual(['array','array','one']);
   for(const format of ['json','yaml'] as const){
    const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;
    expect(recoverAvroCardinalityBundle(saved,saved.target!)).toEqual({schema:c.schema,dependencies:[]});
   }
   expect(source.modules).toHaveLength(r.target.modules.length-1);
  }
 }
},120000);

test('unknown profiles, unknown item shapes and existing identities never silently acquire meaning',()=>{
 const schema=JSON.stringify({type:'record',name:'cardinality.Example',fields:[{name:'value',type:{type:'array',items:['null',{type:'array',items:'long'},{type:'map',values:'long'}]}}]});
 const {source,request}=prepare(schema);
 const report=classifyAvroCardinality(source,{...request,mode:'report'});expect(report.mapping.nodes.map(n=>n.cardinality)).toEqual(['array','unspecified']);expect(report.residuals).toHaveLength(1);
 expect(classifyAvroCardinality(source,request).status).toBe('blocked');
 expect(classifyAvroCardinality(source,{...request,profile:'unresolved'}).status).toBe('blocked');
 const unknown=classifyAvroCardinality(source,{...request,profile:'unresolved',mode:'report'});expect(unknown.mapping.nodes).toHaveLength(1);expect(unknown.mapping.cardinality).toBe('unspecified');
 expect(classifyAvroCardinality(report.target!,{...request,mode:'report'}).status).toBe('blocked');
 expect(classifyAvroCardinality(source,{...request,identity:{module:'avro.fields',element:'new'},mode:'report'}).status).toBe('blocked');
 const incompatible=structuredClone(source);incompatible.vocabularies['umf.avro.cardinality']={version:'2.0.0'};
 expect(classifyAvroCardinality(incompatible,{...request,mode:'report'}).status).toBe('blocked');
 const forged=structuredClone(report);forged.mapping.nodes[0]!.cardinality='one';expect(()=>recoverAvroCardinalityBundle(forged,report.target!)).toThrow();
 const edited=structuredClone(report.target!);edited.modules.at(-1)!.elements[0]!.description='changed';expect(()=>recoverAvroCardinalityBundle(report,edited)).toThrow();
 expect(()=>classifyAvroCardinality(source,{...request,nativeSource:schema.replace('long','string')})).toThrow();
});

test('named dependencies retain exact text and qualified scalar item meaning without losing unknown metadata',()=>{
 const dependency=' {"type":"enum","name":"dep.Choice","symbols":["A","B"],"opaque":9007199254740993} ';const dependencies=[{id:'shared',schema:dependency}];
 const schema=JSON.stringify({type:'record',name:'cardinality.Example',fields:[{name:'value',type:{type:'array',items:'dep.Choice'}}]});
 const {source,request}=prepare(schema,dependencies),r=classifyAvroCardinality(source,request);expect(r.status).toBe('classified');
 expect(r.target!.modules.at(-1)!.elements[1]!.scalarType).toBe('string');
 expect(r.mapping.nodes[1]!.definitions).toEqual([{path:'',dependencyId:'shared'}]);
 expect(recoverAvroCardinalityBundle(r,r.target!)).toEqual({schema,dependencies});
 expect(()=>classifyAvroCardinality(source,{...request,dependencies:[]})).toThrow();
 const reformatted=structuredClone(r);reformatted.request.dependencies![0]!.schema+='\n';expect(recoverAvroCardinalityBundle(reformatted,r.target!).dependencies[0]!.schema).toBe(dependency+'\n'); // Consistency is not authentication.
 const forged=structuredClone(r);forged.request.dependencies![0]!.schema=dependency.replace('9007199254740993','9007199254740995');expect(()=>recoverAvroCardinalityBundle(forged,r.target!)).toThrow();
});
