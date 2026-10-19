import {chromium} from 'playwright';
const origin=process.env.UMF_REFERENCE_URL??'http://127.0.0.1:4178',checks:string[]=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.UMF_CHROMIUM_PATH});
try{
 const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const view of ['ontology','reference','catalog']){
  await page.goto(origin+'/reference/core.html#view='+view);
  await page.locator('#load-status').waitFor();
  await page.waitForFunction(()=>!document.querySelector('#load-status')?.textContent?.startsWith('Verifying'));
  if(view==='ontology')await page.getByRole('heading',{name:'UMF ontology'}).waitFor();
  if(view==='reference')await page.locator('#inspector h2').first().waitFor();
  if(view==='catalog'){
   const frame=page.frameLocator('iframe.umf-schema-browser-frame');
   await frame.locator('#catalog').waitFor();
   await frame.locator('#status').waitFor();
   await page.getByRole('link',{name:'Model catalog'}).waitFor();
  }
  const csp=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  if(!csp||csp.includes('unsafe-eval'))throw Error('Core reference does not preserve strict CSP.');
  checks.push('Single-host '+view+' view');
 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({origin,checks},null,2));
}finally{await browser.close();}
