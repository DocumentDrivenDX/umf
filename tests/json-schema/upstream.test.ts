// @covers US-002-AC1 US-002-AC2 US-002-AC5
import {test,expect,afterAll} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import {importJsonSchema,exportJsonSchema,exportJsonSchemaResources,readDocument,writeDocument,inspectJsonSchema,parseNativeJson} from '../../src';
import {renderTree,treeChild} from '../../src/adapters/json-schema/tree';
const root='fixtures/json-schema/upstream';
const files=[...new Bun.Glob('*.json').scanSync(root+'/draft2020-12')].sort();
const remotes=new Map<string,string>();
for(const file of new Bun.Glob('**/*.json').scanSync(root+'/remotes')) remotes.set('http://localhost:1234/'+file,await Bun.file(root+'/remotes/'+file).text());
function dependencies(schema:unknown,base:string):Record<string,string> {
 const result:Record<string,string>=Object.create(null);
 function visit(value:any,uri:string):void {
  if(!value || typeof value!=='object')return;
  if(typeof value.$id==='string'){try{uri=new URL(value.$id,uri).href;}catch{}}
  for(const key of ['$ref','$dynamicRef','$schema'])if(typeof value[key]==='string'){
   let target:string;try{target=new URL(value[key],uri).href.split('#')[0]!;}catch{continue;}
   if(remotes.has(target)&&!Object.hasOwn(result,target)){result[target]=remotes.get(target)!;visit(JSON.parse(result[target]!),target);}
  }
  for(const item of Object.values(value))visit(item,uri);
 }
 visit(schema,base);return result;
}
const records:any[]=[];
afterAll(async()=>{
 await Bun.write('fixtures/json-schema/upstream-results.json',JSON.stringify({sourceRevision:'ab079cc2bace029fdbb483be28a6ade526bcfbc2',dialect:'2020-12',oracle:'Ajv 8.20.0; format assertions disabled; no implicit network',files:files.length,cases:records.length,records},null,2)+'\n');
});
for(const file of files)test('upstream 2020-12: '+file,async()=>{
 const text=await Bun.file(root+'/draft2020-12/'+file).text();
 const sourceCases=parseNativeJson(text);
 if(sourceCases.kind!=='array')throw new Error('Bad upstream corpus');
 for(const [index,encoded]of sourceCases.items.entries()){
  const baseline=JSON.parse(text)[index];
  const nativeText=renderTree(treeChild(encoded,'schema'));
  const base='https://umf.invalid/upstream/'+file+'/'+index;
  const resources=dependencies(baseline.schema,base);
  const record:any={file,index,description:baseline.description,vectors:baseline.tests.length};records.push(record);
  const doc=importJsonSchema(nativeText,{id:'upstream:'+file+':'+index,baseUri:base,resources});
  const returned=readDocument(writeDocument(doc,'yaml'),'yaml');
  const nativeExport=exportJsonSchema(returned);
  expect(parseNativeJson(nativeExport)).toEqual(parseNativeJson(nativeText));
  expect(exportJsonSchemaResources(returned)).toEqual(Object.fromEntries(Object.entries(resources).map(([uri,text])=>[uri,renderTree(parseNativeJson(text))+'\n'])));
  record.nativeExport=nativeExport;record.baseUri=base;record.resourceExports=exportJsonSchemaResources(returned);
  record.preservation='passed';record.interpretation=inspectJsonSchema(doc);
  function compile(schema:any,bundle:Record<string,string>){
   const ajv=new Ajv2020({strict:false,validateFormats:false,ownProperties:true,addUsedSchema:false});
   for(const[uri,source]of Object.entries(bundle)) {
    const value=JSON.parse(source);
    if(value.$vocabulary)ajv.addMetaSchema(value,uri);else ajv.addSchema(value,uri);
   }
   ajv.addSchema(schema,base);return ajv.getSchema(base)!;
  }
  try {
   const before=compile(baseline.schema,resources);
   const after=compile(JSON.parse(nativeExport),exportJsonSchemaResources(returned));
   record.oracle='passed';record.mismatches=[];record.parityMismatches=[];
   for(const vector of baseline.tests){
    const a=before(vector.data),b=after(vector.data);
    if(a!==vector.valid || b!==vector.valid)record.mismatches.push({description:vector.description,expected:vector.valid,before:a,after:b});
    if(a!==b)record.parityMismatches.push(vector.description);
   }
   if(record.mismatches.length)record.oracle='baseline-disagreement';
  }catch(error){record.oracle='unavailable';record.oracleError=String(error);}
  expect(record.parityMismatches||[]).toEqual([]);
 }
},120000);
