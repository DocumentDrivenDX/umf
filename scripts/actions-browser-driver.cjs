const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const directory=process.argv[2],fixtures=JSON.parse(fs.readFileSync(directory+'/fixtures.json','utf8')),expected=JSON.parse(fs.readFileSync(directory+'/expected.json','utf8'));
 const server=http.createServer((request,response)=>{
  const path=request.url;
  if(path==='/umf.js'){response.setHeader('content-type','text/javascript');response.end(fs.readFileSync('/work/dist/umf.js'));}
  else if(path==='/probe.js'){response.setHeader('content-type','text/javascript');response.end(fs.readFileSync(directory+'/probe.js'));}
  else {response.setHeader('content-type','text/html');response.end('<!doctype html><title>UMF actions qualification</title>');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;const externalRequests=[];
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.UMF_CHROMIUM_PATH});
  const page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(origin);const result=await page.evaluate(async fixtures=>{
   const api=await import('/umf.js'),probe=await import('/probe.js');
   if(typeof globalThis.Bun!=='undefined'||typeof globalThis.process!=='undefined')throw Error('Host global leaked into browser');
   return probe.runActionsCorpus(api,fixtures);
  },fixtures);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result)),expected,'Bun source and public browser ESM disagree');
  assert.deepStrictEqual(externalRequests,[]);assert.equal(result.evaluated,true);assert.equal(result.getterCalls,0);assert.equal(result.refused,true);assert.equal(result.assessment.executionVerified,false);
  fs.writeFileSync(directory+'/browser.json',JSON.stringify({profile:'umf-actions-browser-1',browser:browser.version(),externalRequests,publicBundle:true,bunParity:true,fixtures:fixtures.length,result},null,2)+'\n');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
