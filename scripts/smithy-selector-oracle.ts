import {ensureSmithyRuntime} from './smithy-runtime';
import {importSmithySources,writeDocument,readDocument,selectSmithyShapes,createSmithyJavaScriptSelectionBackend,smithySelectionResultSchema,smithyAssemblyResultSchema,coreSchema} from '../src';
import {createValidator} from '../src/validation/schema';
const root='fixtures/smithy/selector-upstream/';const manifest=await Bun.file(root+'manifest.json').json();
for(const row of manifest.files){if(new Bun.CryptoHasher('sha256').update(await Bun.file(root+row.file).arrayBuffer()).digest('hex')!==row.sha256)throw new Error('Selector fixture checksum mismatch');}
const files=manifest.files.filter((x:any)=>x.file.endsWith('.smithy')).map((x:any)=>root+x.file);
const jars=await ensureSmithyRuntime();const run=Bun.spawn(['java','-cp','.cache/smithy/*','native/smithy/SelectorOracle.java',...files],{stdout:'pipe',stderr:'pipe'});
const [stdout,stderr,status]=await Promise.all([new Response(run.stdout).text(),new Response(run.stderr).text(),run.exited]);if(status)throw new Error(stderr);
const rows=stdout.trim().split('\n').map(line=>JSON.parse(line));
const modulePath='../native/smithy/browser/target/javascript/smithy.js';const backend=createSmithyJavaScriptSelectionBackend(await import(modulePath));
const validator=createValidator(false);validator.addSchema(coreSchema);validator.addSchema(smithyAssemblyResultSchema);const check=validator.compile(smithySelectionResultSchema);const cases=[];
for(const row of rows){
 const text=await Bun.file(row.file).text();const source=importSmithySources({files:{'model.smithy':text}},{id:'selector-source'});
 const result=await selectSmithyShapes(readDocument(writeDocument(source,'yaml'),'yaml'),backend,row.selector,{id:'selector-model'});
 const filter=(ids:string[])=>[...new Set(ids.filter(id=>!row.test.skipPreludeShapes||!id.split('#')[0]!.includes('smithy.api')))].sort();
 const expected=filter(row.test.matches);const agrees=result.status==='selected'&&JSON.stringify(result.shapeIds)===JSON.stringify(row.shapeIds)&&JSON.stringify(filter(row.shapeIds))===JSON.stringify(expected)&&check(result);
 cases.push({...row,agrees,actualStatus:result.status,issues:result.issues});
}
const text=await Bun.file(files[0]).text();const source=importSmithySources({files:{'model.smithy':text}},{id:'invalid-selector'});
const negatives=[];for(const selector of ['[',':missingFunction()',':is(']){const result=await selectSmithyShapes(source,backend,selector,{id:'model'});negatives.push({selector,blocked:result.status==='blocked'&&!result.shapeIds&&result.issues.length>0&&check(result)});}
const runtimeSha256=new Bun.CryptoHasher('sha256').update(await Bun.file('native/smithy/browser/target/javascript/smithy.js').arrayBuffer()).digest('hex');
await Bun.write('fixtures/smithy/selector-oracle-results.json',JSON.stringify({oracle:'software.amazon.smithy:smithy-model:1.73.0',jars,runtimeSha256,commit:manifest.commit,files:files.length,cases,negatives,scope:'Shape-set queries only; native complete IDs compared before upstream skipPrelude filtering. Upstream expected matches and unmodified JVM are both checked. Variable environments are not exposed.'},null,2)+'\n');
console.log(`Smithy selectors: ${cases.filter(c=>c.agrees).length}/${cases.length} upstream expected/JVM/public API agreement; ${negatives.filter(c=>c.blocked).length} invalid selectors blocked`);
for(const row of cases.filter(c=>!c.agrees))console.error(JSON.stringify(row));
if(cases.some(c=>!c.agrees)||negatives.some(c=>!c.blocked))process.exit(1);
