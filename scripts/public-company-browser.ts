/** @covers US-078-AC3 @covers US-078-AC8 Local library and real explorer in Chromium. */
import {chromium} from 'playwright';
import {resolve} from 'node:path';
const site=resolve('docs/helix/05-deploy/microsite/dist');
const payload={pack:await Bun.file('spec/domain-packs/public-company-intelligence/pack.json').json(),ontology:await Bun.file('spec/domain-packs/public-company-intelligence/ontology.json').text()};
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const pathname=new URL(request.url).pathname;
 if(pathname==='/payload')return Response.json(payload);
 if(pathname==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 const file=resolve(site,'.'+pathname);if(file!==site&&!file.startsWith(site+'/'))return new Response('Refused',{status:403});
 return new Response(Bun.file(file));
}});
const browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const origin=`http://127.0.0.1:${server.port}`;await page.goto(origin+'/explorer.html#schema=pack%3Apublic-company-intelligence%401.0.0');
 await page.getByRole('heading',{name:'Schemas in this pack',exact:true}).waitFor({timeout:15000});
 const result=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),{pack,ontology}=await(await fetch('/payload')).json();let checks=0;
  const check=(v:boolean)=>{checks++;if(!v)throw Error('Public-company browser check '+checks);};
  check(u.inspectDomainPack(pack).valid);check(u.validateDocument(u.readDocument(ontology,'json')).valid);
  const document={umf:'0.8.0',id:'public-company-browser',modules:[],vocabularies:{'umf.domain-pack':{version:'1.0.0'}},extensions:{'umf.domain-pack':pack}};
  check(u.validateDocument(document,new u.Registry().register(u.domainPackPackage)).valid);
  for(const format of ['json','yaml'])check(JSON.stringify(u.readDocument(u.writeDocument(document,format),format))===JSON.stringify(document));
  const input='{"cik":320193,"facts":{"us-gaap":{"Cash":{"units":{"USD":[{"val":9007199254740993.0100},{"val":null},{}, {"val":0}]}}}}}';
  const r=u.projectSecCompanyFacts(input,'browser');check(r[0].value==='9007199254740993.0100');check(r.map((x:any)=>x.value_state).join(',')==='present,null,absent,present');
  check(typeof(globalThis as any).Bun==='undefined'&&typeof(globalThis as any).process==='undefined');return {checks};
 });
 const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download source',exact:true}).click();const download=await downloadPromise;
 const text=await Bun.file((await download.path())!).text();if(text!==await Bun.file('spec/domain-packs/public-company-intelligence/pack.json').text())throw Error('Manifest download differs');
 await page.locator('#inspector').getByRole('link',{name:'Filings',exact:true}).click();await page.getByRole('heading',{name:'Fields',exact:true}).waitFor();
 await page.goto(origin+'/explorer.html#schema=schema%3Apublic-company-intelligence%401.0.0%3Aontology');
 await page.getByRole('heading',{name:'Public company intelligence ontology',exact:true}).waitFor();
 await page.getByRole('group',{name:'Full record relationship map',exact:true}).waitFor();
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({browser:browser.version(),...result,ui_checks:3,page_errors:errors}));
}finally{await browser.close();server.stop(true);}
