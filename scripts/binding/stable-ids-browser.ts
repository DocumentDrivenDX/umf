import {chromium} from 'playwright';
import {bindingMigrationCase} from './stable-ids-cases';
import {migrateBindingRelationships} from '../../src';
const fixture=bindingMigrationCase(),expected=migrateBindingRelationships(fixture.binding,fixture.logical);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/case')return Response.json({...fixture,expected});
 return new Response('<!doctype html><html>Stable binding IDs</html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try {
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const result=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),f=await(await fetch('/case')).json();
  const same=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Browser parity/recovery mismatch');};
  const r=u.migrateBindingRelationships(f.binding,f.logical);same(r,f.expected);
  for(const format of ['json','yaml'])same(u.readBindingDocument(u.writeBindingDocument(r.document,f.logical,format),f.logical,format),r.document);
  f.logical.modules[0].relationships[0].name='renamed';
  if(!u.inspectBinding(r.document,f.logical).valid)throw Error('Rename changed stable identity');
  same(u.rollbackBindingRelationships(r.document,f.logical,r.receipt),{document:f.binding,residuals:[]});
  const p=r.document.extensions['umf.binding'];p.relationships.push({...p.relationships[0]});
  if(u.inspectBinding(r.document,f.logical).valid)throw Error('Duplicate accepted');p.relationships.pop();
  p.relationships[0].id='missing';if(u.inspectBinding(r.document,f.logical).valid)throw Error('Missing ID accepted');p.relationships[0].id='order-customer';
  f.logical.modules[0].relationships.push({...f.logical.modules[0].relationships[0],id:'second',name:'second',inverse:'secondInverse'});
  p.relationships.push({module:'m',id:'second',storage:'junction'});
  const rollback=u.rollbackBindingRelationships(r.document,f.logical,r.receipt);same(rollback.document,f.binding);
  if(rollback.residuals.length!==2)throw Error('Lost new ID choice');
  let refused=false;try{u.migrateBindingRelationships(f.binding,f.logical);}catch{refused=true;}if(!refused)throw Error('Missing name migrated');
  r.receipt.mappings[0].stable.id='tampered';refused=false;try{u.rollbackBindingRelationships(r.document,f.logical,r.receipt);}catch{refused=true;}if(!refused)throw Error('Tampered receipt accepted');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host global in browser');
  return {migrationParity:true,renameLookup:true,formatRecoveries:2,originalRecovery:true,idOnlyResiduals:true,duplicateMissingAndTamperedReceiptRefusals:true};
 });
 if(external.length)throw Error('External requests');
 await Bun.write('fixtures/binding/stable-ids/browser.json',JSON.stringify({scope:'umf.binding 0.2.0 ID validation and receipt migration/rollback only; no physical storage generation or native enforcement claim',browser:browser.version(),result,externalRequests:external},null,2)+'\n');
 console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}
