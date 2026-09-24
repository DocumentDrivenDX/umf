export {};
// Experimental port audit: record every mismatch; never treat compile success as conformance.
const modulePath='../native/smithy/browser/target/javascript/smithy.js';
const {assemble}=await import(modulePath);
const reports=[await Bun.file('fixtures/smithy/oracle-results.json').json(),await Bun.file('fixtures/smithy/idl/oracle-results.json').json()];
const cases=[];
for(const [index,report]of reports.entries())for(const expected of report.cases){
 const path=index===0?expected.file:'fixtures/smithy/idl-upstream/'+expected.file;const text=await Bun.file(path).text();
 try{
  const actual=JSON.parse(assemble(JSON.stringify({[path]:text})));
  const events=actual.events.map((e:any)=>e.severity+':'+e.id).sort();const nativeEvents=[...expected.events].sort();
  const hash=actual.modelJson?new Bun.CryptoHasher('sha256').update(actual.modelJson).digest('hex'):null;
  const agrees=actual.valid===expected.valid&&hash===(expected.modelSha256??null)&&JSON.stringify(events)===JSON.stringify(nativeEvents);
  cases.push({file:path,agrees,valid:actual.valid,nativeValid:expected.valid,modelSha256:hash,nativeModelSha256:expected.modelSha256??null,events,nativeEvents});
 }catch(error){cases.push({file:path,agrees:false,error:String(error)});}
}
const runtimeSha256=new Bun.CryptoHasher('sha256').update(await Bun.file('native/smithy/browser/target/javascript/smithy.js').arrayBuffer()).digest('hex');
const result={runtimeSha256,smithy:'1.73.0',teavm:'0.15.0',cases,agreement:cases.filter(c=>c.agrees).length,total:cases.length,scope:'Experimental patched JavaScript runtime versus pinned unmodified JVM assembler. Mismatches remain evidence against a support claim.'};
await Bun.write('native/smithy/browser/corpus-findings.json',JSON.stringify(result,null,2)+'\n');
console.log('Smithy JavaScript experimental native agreement:',result.agreement,'/',result.total);
for(const row of cases.filter(c=>!c.agrees).slice(0,8))console.log(row);
