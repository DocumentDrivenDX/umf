import {parseNativeJson} from '../src/model/native-json';
import {ensureSmithyRuntime} from './smithy-runtime';
import {importSmithySources,projectSmithyToJsonSchema,createSmithyJavaScriptJsonSchemaBackend,smithyJsonSchemaProjectionSchema,smithyAssemblyResultSchema,coreSchema,readDocument,writeDocument,exportJsonSchema} from '../src';
import {createValidator} from '../src/validation/schema';
const serviceContext=process.argv.includes('--service-context');
const withRootDefinition=serviceContext||process.argv.includes('--root-definition');
const profile=serviceContext?'native-service-context-2020-12':withRootDefinition?'native-root-definition-2020-12':'native-defaults-2020-12';
const root='fixtures/smithy/jsonschema-upstream/';const manifest=await Bun.file(root+'manifest.json').json();
for(const row of manifest.files)if(new Bun.CryptoHasher('sha256').update(await Bun.file(root+row.file).arrayBuffer()).digest('hex')!==row.sha256)throw new Error('Emission fixture hash mismatch');
const paths=manifest.files.filter((r:any)=>r.file!=='LICENSE'&&!r.file.includes('.jsonschema.')).map((r:any)=>root+r.file);paths.push('fixtures/smithy/domain.json','fixtures/smithy/emission.smithy','fixtures/smithy/recursive-emission.smithy');
if(serviceContext)paths.push('fixtures/smithy/service-context.json');
const jars=await ensureSmithyRuntime();const child=Bun.spawn(['java','-cp','.cache/smithy/*',serviceContext?'native/smithy/ServiceJsonSchemaOracle.java':'native/smithy/JsonSchemaOracle.java',...(!serviceContext&&withRootDefinition?['--root-definition']:[]),...paths],{stdout:'pipe',stderr:'pipe'});
const [stdout,stderr,status]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(status)throw new Error(stderr);
const rows=stdout.trim().split('\n').map(line=>JSON.parse(line));const runtimePath='../native/smithy/browser/target/javascript/smithy.js';const backend=createSmithyJavaScriptJsonSchemaBackend(await import(runtimePath));
const validator=createValidator(false);validator.addSchema(coreSchema);validator.addSchema(smithyAssemblyResultSchema);const check=validator.compile(smithyJsonSchemaProjectionSchema);const cases=[];
for(const row of rows){
 if(row.assemblyError){cases.push({...row,agrees:false});continue;}
 const text=await Bun.file(row.file).text();const source=importSmithySources({files:{[row.file.endsWith('.smithy')?'model.smithy':'model.json']:text}},{id:'source'});
 const result=await projectSmithyToJsonSchema(readDocument(writeDocument(source,'yaml'),'yaml'),backend,{id:'target',baseUri:'https://umf.invalid/emitted.json',rootShape:row.rootShape,profile,...(serviceContext?{serviceContext:row.serviceContext}:{}),usage:'native-emission',lossPolicy:'allow-reported-loss'});
 const targetSchema=result.target?exportJsonSchema(readDocument(writeDocument(result.target,'yaml'),'yaml')):undefined;
 const targetRoundTrip=targetSchema?JSON.stringify(parseNativeJson(targetSchema))===JSON.stringify(parseNativeJson(withRootDefinition?result.adaptedSchema!:result.nativeSchema!)):null;
 const agrees=targetRoundTrip!==false&&check(result)&&(row.error?result.status==='blocked'&&result.issues.some(issue=>issue.code==='SMITHY_EMISSION_FAILED'&&issue.detail.includes(row.error.split(': ').slice(1).join(': '))):result.nativeSchema===row.schema&&(!withRootDefinition||result.adaptedSchema===row.adaptedSchema));
 cases.push({...row,agrees,targetSchema,targetRoundTrip,status:result.status,issues:result.issues});
}
const runtimeSha256=new Bun.CryptoHasher('sha256').update(await Bun.file('native/smithy/browser/target/javascript/smithy.js').arrayBuffer()).digest('hex');
await Bun.write(serviceContext?'fixtures/smithy/jsonschema-service-context-results.json':withRootDefinition?'fixtures/smithy/jsonschema-root-definition-results.json':'fixtures/smithy/jsonschema-oracle-results.json',JSON.stringify({jars,runtimeSha256,profile,cases,scope:'Every declared data-shape root in supplied upstream source resources plus authored domain; original expected-output files retained but use different converter configurations. Service-context mode compares every declared data root against every supplied service, including explicit out-of-closure rejections. JVM output equality is not a semantic equivalence claim.'},null,2)+'\n');
console.log(`Smithy JSON Schema (${profile}): ${cases.filter(c=>c.agrees).length}/${cases.length} JVM output comparisons; ${cases.filter(c=>c.status==='blocked').length} blocked projections`);
for(const row of cases.filter(c=>!c.agrees))console.error(JSON.stringify(row));
if(cases.some(c=>!c.agrees))throw new Error('Native emission disagreement');
