import {importSmithyJson,importSmithySources,assembleSmithyDocument,createSmithyJavaScriptBackend,exportSmithyJson,readDocument,writeDocument,smithyAssemblyResultSchema,coreSchema} from '../src';
import {createValidator} from '../src/validation/schema';
const modulePath='../native/smithy/browser/target/javascript/smithy.js';const module=await import(modulePath);const backend=createSmithyJavaScriptBackend(module);
const check=createValidator(false);check.addSchema(coreSchema);const resultValid=check.compile(smithyAssemblyResultSchema);
const corpora=[await Bun.file('fixtures/smithy/oracle-results.json').json(),await Bun.file('fixtures/smithy/idl/oracle-results.json').json()];const cases=[];
const nativePaths=corpora.flatMap((corpus,i)=>corpus.cases.map((row:any)=>i===0?row.file:'fixtures/smithy/idl-upstream/'+row.file));
const nativeRun=Bun.spawn(['java','-cp','.cache/smithy/*','native/smithy/ReassemblyOracle.java',...nativePaths],{stdout:'pipe',stderr:'pipe'});
const [nativeOut,nativeErr,nativeStatus]=await Promise.all([new Response(nativeRun.stdout).text(),new Response(nativeRun.stderr).text(),nativeRun.exited]);if(nativeStatus)throw new Error(nativeErr);
const nativeRows=nativeOut.trim().split('\n').map(line=>JSON.parse(line));if(nativeRows.length!==nativePaths.length)throw new Error('Missing native reassembly evidence');
const reassembly=new Map(nativeRows.map(row=>[row.path,row]));
await Bun.write('fixtures/smithy/reassembly-oracle-results.json',JSON.stringify({oracle:'smithy-model@1.73.0',cases:nativeRows,scope:'Native serialization/reassembly and flattened effective model comparison; original mixin/source provenance remains separately retained'},null,2)+'\n');
for(const [i,corpus]of corpora.entries())for(const expected of corpus.cases){
 const file=i===0?expected.file:'fixtures/smithy/idl-upstream/'+expected.file;const text=await Bun.file(file).text();const doc=i===0?importSmithyJson(text,{id:'input'}):importSmithySources({files:{'model.smithy':text}},{id:'input'});
 const result=await assembleSmithyDocument(doc,backend,{id:'assembled'});if(!resultValid(result))throw new Error('Invalid result schema: '+JSON.stringify(resultValid.errors));
 const hash=result.nativeModel?new Bun.CryptoHasher('sha256').update(result.nativeModel).digest('hex'):null;
 const events=result.events.map(e=>e.severity+':'+e.id).sort();if((result.status==='assembled')!==expected.valid||hash!==(expected.modelSha256??null)||JSON.stringify(events)!==JSON.stringify([...expected.events].sort()))throw new Error('Public assembly mismatch '+file+': '+JSON.stringify(result.issues));
 if(result.model){const native=exportSmithyJson(result.model);const restored=exportSmithyJson(readDocument(writeDocument(result.model,'yaml'),'yaml'));if(native!==restored)throw new Error('Assembled model round-trip mismatch');
  const reassembled=await assembleSmithyDocument(readDocument(writeDocument(result.model,'yaml'),'yaml'),backend,{id:'reassembled'});
  if(reassembled.status!=='assembled'||new Bun.CryptoHasher('sha256').update(reassembled.nativeModel!).digest('hex')!==reassembly.get(file).reassembledSha256||!reassembly.get(file).flattenedModelStable)throw new Error('Native normalized model reassembly mismatch: '+file);}
 cases.push({file,status:result.status,modelSha256:hash,serializationStable:reassembly.get(file).serializationStable??null,flattenedModelStable:reassembly.get(file).flattenedModelStable??null});
}
const runtimeSha256=new Bun.CryptoHasher('sha256').update(await Bun.file('native/smithy/browser/target/javascript/smithy.js').arrayBuffer()).digest('hex');
await Bun.write('fixtures/smithy/assembly-oracle-results.json',JSON.stringify({compiler:backend.identity,runtimeSha256,cases,scope:'Public API/schema, exact native model hash and diagnostic IDs agree with JVM across AST/IDL corpus; assembled UMF models survive YAML. Remaining reflection/protocol/projection limits remain explicit.'},null,2)+'\n');
console.log('Smithy public assembly: '+cases.length+' JVM comparisons, result schemas and assembled model round trips passed');
