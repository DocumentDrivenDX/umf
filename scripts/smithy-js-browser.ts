import {chromium} from 'playwright';
const corpora=[await Bun.file('fixtures/smithy/oracle-results.json').json(),await Bun.file('fixtures/smithy/idl/oracle-results.json').json(),await Bun.file('fixtures/smithy/negative-oracle-results.json').json()];
const inputs:{file:string;text:string;expected:any}[]=[];
for(const [i,corpus]of corpora.entries())for(const row of corpus.cases){const file=i===1?'fixtures/smithy/idl-upstream/'+row.file:row.file;inputs.push({file,text:await Bun.file(file).text(),expected:row});}
const selectorReport=await Bun.file('fixtures/smithy/selector-oracle-results.json').json();
const selectorInputs=await Promise.all(selectorReport.cases.map(async(row:any)=>({...row,text:await Bun.file(row.file).text()})));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/runtime.js')return new Response(Bun.file('native/smithy/browser/target/javascript/smithy.js'),{headers:{'content-type':'text/javascript'}});if(path==='/selectors.json')return Response.json(selectorInputs);if(path==='/cases.json')return Response.json(inputs);return new Response('<!doctype html><title>Smithy port experiment</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 const result=await page.evaluate(async()=>{
  const path='/runtime.js';const {assemble,select}=await import(path);const inputs=await (await fetch('/cases.json')).json();const cases=[];
  for(const input of inputs){
   try{
    const actual=JSON.parse(assemble(JSON.stringify({[input.file]:input.text})));const digest=actual.modelJson?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(actual.modelJson)))).map(x=>x.toString(16).padStart(2,'0')).join(''):null;
    const events=actual.events.map((x:any)=>x.severity+':'+x.id).sort();const agrees=!input.expected.exceptionMessage&&actual.valid===input.expected.valid&&digest===(input.expected.modelSha256??null)&&JSON.stringify(events)===JSON.stringify([...input.expected.events].sort());
    cases.push({file:input.file,agrees});
   }catch(error){cases.push({file:input.file,agrees:!!input.expected.exceptionMessage&&String(error).includes(input.expected.exceptionMessage),error:String(error),expectedException:input.expected.exceptionClass});}
  }
  const selectorCases=[];
  for(const row of await (await fetch('/selectors.json')).json()){
   try{const model=JSON.parse(assemble(JSON.stringify({'model.smithy':row.text})));const selected=JSON.parse(select(model.modelJson,row.selector));selectorCases.push({file:row.file,selector:row.selector,agrees:JSON.stringify(selected.shapeIds)===JSON.stringify(row.shapeIds)});}
   catch(error){selectorCases.push({file:row.file,selector:row.selector,agrees:false,error:String(error)});}
  }
  const negatives=['$version: "2"\nnamespace test\nstructure X { a: Missing }','$version: "2"\nnamespace test\n@length(min: 1) integer X','$version: "2"\nnamespace test\nstructure X {'];
  const rejections=negatives.map(text=>JSON.parse(assemble(JSON.stringify({'main.smithy':text}))).valid===false);
  const exact=assemble(JSON.stringify({'main.smithy':'$version: "2"\nmetadata n = 9007199254740993\nnamespace test\nstring X'})).includes('9007199254740993');
  return {cases,selectorCases,rejections,exact,hostGlobalsAbsent:typeof (globalThis as any).Bun==='undefined'&&typeof (globalThis as any).process==='undefined'};
 });
 const runtimeSha256=new Bun.CryptoHasher('sha256').update(await Bun.file('native/smithy/browser/target/javascript/smithy.js').arrayBuffer()).digest('hex');
 const report={runtimeSha256,browser:browser.version(),smithy:'1.73.0',teaVM:'0.15.0',...result};await Bun.write('native/smithy/browser/browser-findings.json',JSON.stringify(report,null,2)+'\n');
 if(result.selectorCases.some(c=>!c.agrees)||result.cases.some(c=>!c.agrees)||result.rejections.some(x=>!x)||!result.exact||!result.hostGlobalsAbsent)throw new Error('Browser port conformance mismatch');
 console.log(`Smithy experimental Chromium: ${result.cases.length} JVM corpus comparisons, ${result.selectorCases.length} selector comparisons, three invalid models rejected, exact numeric metadata retained, no host globals`);
}finally{await browser?.close();server.stop(true);}
