// Python/browser parity for the explicitly qualified structural/identity subset.
import {chromium} from 'playwright';

const python=process.argv[2]??'python3';
const processResult=Bun.spawn([python,'python/conformance.py'],{stdout:'pipe',stderr:'inherit'});
const cases=JSON.parse(await new Response(processResult.stdout).text());
if(await processResult.exited)throw new Error('Python conformance emitter failed');
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 return new Response('<html><body>Python UMF conformance</body></html>',{headers:{'content-type':'text/html'}});
}});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 const results=await page.evaluate(async cases=>{
  const path='/umf.js';const umf=await import(path);const results=[];
  for(const test of cases){
   const validation=umf.validateDocument(test.document);
   if(validation.valid!==test.python.valid||test.compareComplete!==false&&validation.complete!==test.python.complete)
    throw new Error('Admission mismatch: '+test.name+JSON.stringify(validation));
   let recoveries=0;
   for(const [format,text] of Object.entries(test.texts)){
    const recovered=umf.readJsonValue(text,format);
    // JSON object member order is not part of UMF semantics.
    const normalize=(value:any):any=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalize(value[k])])):value;
    if(JSON.stringify(normalize(recovered))!==JSON.stringify(normalize(test.document)))throw new Error('Recovery mismatch: '+test.name+'/'+format);
    recoveries++;
   }
   results.push({name:test.name,valid:validation.valid,complete:validation.complete,comparison:test.compareComplete===false?'preservation-only':'qualified-subset',recoveries});
  }
  return results;
 },cases);
 const versionProcess=Bun.spawn([python,'-c',"import json,platform,importlib.metadata as m; print(json.dumps({'python':platform.python_version(),'pydantic':m.version('pydantic'),'jsonschema':m.version('jsonschema'),'ruamel.yaml':m.version('ruamel.yaml'),'umf-core':m.version('umf-core')}))"],{stdout:'pipe',stderr:'inherit'});
 const versions=JSON.parse(await new Response(versionProcess.stdout).text());if(await versionProcess.exited)throw new Error('Version capture failed');
 const fingerprints:Record<string,string>={};
 for(const glob of ['python/src/umf/*.py','fixtures/python/core-conformance.json','fixtures/core/schema-properties.json'])for await(const path of new Bun.Glob(glob).scan('.'))fingerprints[path]=new Bun.CryptoHasher('sha256').update(await Bun.file(path).arrayBuffer()).digest('hex');
 const evidence={profile:'python-core-structure-identity-references-1',versions,bun:Bun.version,chromium:browser.version(),fingerprints,results};
 await Bun.write('fixtures/validation/python-browser-conformance.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
}finally{await browser.close();server.stop(true);}
