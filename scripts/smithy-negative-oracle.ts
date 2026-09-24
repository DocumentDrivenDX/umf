import {ensureSmithyRuntime} from './smithy-runtime';
import {importSmithySources,exportSmithySources,readDocument,writeDocument,assembleSmithyDocument,createSmithyJavaScriptBackend} from '../src';
const root='fixtures/smithy/invalid-upstream/';
const manifest=await Bun.file(root+'manifest.json').json();
const entries=manifest.files.filter((x:any)=>/\.(smithy|json)$/.test(x.file));
const jars=await ensureSmithyRuntime();
for(const entry of manifest.files){const digest=new Bun.CryptoHasher('sha256').update(await Bun.file(root+entry.file).arrayBuffer()).digest('hex');if(digest!==entry.sha256)throw new Error('Fixture hash mismatch: '+entry.file);}
const native=Bun.spawn(['java','-cp','.cache/smithy/*','native/smithy/NegativeOracle.java',...entries.map((x:any)=>root+x.file)],{stdout:'pipe',stderr:'pipe'});
const [stdout,stderr,exit]=await Promise.all([new Response(native.stdout).text(),new Response(native.stderr).text(),native.exited]);if(exit)throw new Error(stderr);
const expected=stdout.trim().split('\n').map(line=>JSON.parse(line));if(expected.length!==entries.length)throw new Error('Native case count mismatch');
const runtimePath='../native/smithy/browser/target/javascript/smithy.js';const backend=createSmithyJavaScriptBackend(await import(runtimePath));
const cases=[];
for(const [i,entry]of entries.entries()){
 const file=root+entry.file;const text=await Bun.file(file).text();
 const source=importSmithySources({files:{[entry.file]:text}},{id:'negative-source'});
 const restored=readDocument(writeDocument(source,'yaml'),'yaml');
 if(exportSmithySources(restored).files[entry.file]!==text)throw new Error('Invalid source changed during archive round trip');
 const actual=await assembleSmithyDocument(restored,backend,{id:'negative-model'});const reference=expected[i]!;
 const events=actual.events.map(e=>e.severity+':'+e.id).sort();const nativeEvents=[...reference.events].sort();
 const modelSha256=actual.nativeModel?new Bun.CryptoHasher('sha256').update(actual.nativeModel).digest('hex'):null;
 const agrees=(actual.status==='assembled')===reference.valid&&modelSha256===(reference.modelSha256??null)&&JSON.stringify(events)===JSON.stringify(nativeEvents)&&(reference.exceptionMessage?actual.issues.some(issue=>issue.message.includes(reference.exceptionMessage)):actual.issues.length===0);
 cases.push({file,exceptionClass:reference.exceptionClass,exceptionMessage:reference.exceptionMessage,valid:reference.valid,events:nativeEvents,modelSha256:reference.modelSha256??null,agrees,actualStatus:actual.status,actualEvents:events,issues:actual.issues,sourcePreserved:JSON.stringify(actual.source)===JSON.stringify(restored),noPartialModel:actual.status==='assembled'||(!actual.model&&!actual.nativeModel)});
}
const runtimeSha256=new Bun.CryptoHasher('sha256').update(await Bun.file('native/smithy/browser/target/javascript/smithy.js').arrayBuffer()).digest('hex');
const report={oracle:'software.amazon.smithy:smithy-model:1.73.0',jars,commit:manifest.commit,runtimeSha256,cases,agreement:cases.filter(c=>c.agrees).length,total:cases.length,nativeRejected:cases.filter(c=>!c.valid).length,scope:'Every model file in the pinned upstream loader/invalid subtree assembled standalone, after exact UMF YAML source archive round trip. Native event severity/ID multisets compared. Directory naming is not an assumed rejection result; warnings may leave models valid. Same Smithy implementation on different VMs, not independent implementation evidence.'};
await Bun.write('fixtures/smithy/negative-oracle-results.json',JSON.stringify(report,null,2)+'\n');
console.log(`Smithy upstream negative corpus: ${report.agreement}/${report.total} JVM/public JavaScript agreement; ${report.nativeRejected} JVM rejected`);
for(const row of cases.filter(c=>!c.agrees))console.error(JSON.stringify(row));
if(cases.some(c=>!c.agrees||!c.sourcePreserved||!c.noPartialModel))process.exit(1);
