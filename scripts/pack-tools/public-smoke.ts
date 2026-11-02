// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
const origin=process.argv[2]??'https://documentdrivendx.github.io/umf/';
let browser;const errors:string[]=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.locator('a[href="pack-tools.html"]').first().click();
 await page.waitForFunction(()=>document.querySelector('#generation-status')?.textContent?.includes('28 domain packs'));
 await page.getByRole('button',{name:'Generate pack tools',exact:true}).click();await page.waitForSelector('.result-badge',{timeout:30000});
 if(!(await page.locator('#output-panel pre').textContent())?.includes('CREATE TABLE'))throw Error('Published DDL preview is missing');
 await page.getByRole('tab',{name:'SQLAlchemy models',exact:true}).click();if(!(await page.locator('#output-panel pre').textContent())?.includes('DeclarativeBase'))throw Error('Published ORM preview is missing');
 await page.getByRole('tab',{name:'Python CRUD',exact:true}).click();if(!(await page.locator('#output-panel pre').textContent())?.includes('session.flush()'))throw Error('Published CRUD preview is missing');
 if(errors.length)throw Error(errors.join('; '));console.log(JSON.stringify({profile:'umf.pack-tools.public-browser/1',url:page.url(),browser:browser.version(),homepageNavigation:true,ddl:true,orm:true,crud:true,pageErrors:errors,checkedAt:new Date().toISOString()},null,2));
}finally{await browser?.close();}
