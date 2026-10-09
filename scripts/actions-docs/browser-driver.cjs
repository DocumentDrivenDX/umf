const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(process.env.UMF_DOCS_SITE||'/work/docs/helix/05-deploy/microsite/dist'),out=process.env.UMF_DOCS_OUTPUT||'/out';
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname).replace(/^\/umf\//,'');let file=path.resolve(root,name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(file.endsWith(path.sep))file+='index.html';if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)){res.writeHead(404).end('Missing');return;}const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+server.address().port+'/umf/',base=process.env.UMF_DOCS_BASE||local;
 const browser=await chromium.launch({headless:true,executablePath:process.env.UMF_CHROMIUM_PATH}),errors=[],external=[],screenshots=[],checks=[];
 try{
 const pages=JSON.parse(fs.readFileSync(path.join(root,'actions/manifest.json'))).outputs;const routes=Object.keys(pages).filter(p=>p.endsWith('.html'));
 for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000}});
 const host=new URL(base).origin;
 await context.route('**/*',route=>{const url=route.request().url();if(new URL(url).origin!==host){external.push(url);return route.abort();}return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const name of routes){
 const response=await page.goto(base+'actions/'+name,{waitUntil:'networkidle'});if(!response||response.status()!==200)throw Error('Route not present '+name);if(crypto.createHash('sha256').update(await response.body()).digest('hex')!==pages[name])throw Error('Reviewed HTML differs '+name);
 if(await page.locator('h1').count()!==1)throw Error('Expected one H1 '+name);
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Horizontal overflow '+name+' '+width);
 const assets=await page.locator('#asset-integrity').textContent();for(const [file,expected]of Object.entries(JSON.parse(assets))){const r=await context.request.get(base+'actions/'+file);if(r.status()!==200||crypto.createHash('sha256').update(await r.body()).digest('hex')!==expected)throw Error('Asset integrity '+file);}
 const broken=await page.evaluate(()=>[...document.querySelectorAll('a[href^="#"]')].map(a=>a.getAttribute('href')).filter(h=>!document.getElementById(h.slice(1))));if(broken.length)throw Error('Missing anchors '+broken);
 const figures=await page.locator('figure svg').evaluateAll(nodes=>nodes.map(svg=>({title:svg.querySelector('title')?.textContent,desc:svg.querySelector('desc')?.textContent,text:[...svg.querySelectorAll('text')].map(t=>{const b=t.getBBox(),v=svg.viewBox.baseVal;return {text:t.textContent,overflow:b.x<0||b.x+b.width>v.width||b.y+b.height>v.height};})})));
 for(const f of figures){if(!f.title||!f.desc)throw Error('Missing diagram description');if(f.text.some(t=>t.overflow))throw Error('Clipped diagram '+JSON.stringify(f.text.filter(t=>t.overflow)));}
 if(name==='getting-started.html'){
 await page.getByRole('button',{name:'Inspect the approval declaration'}).click();const value=JSON.parse(await page.locator('#action-result').textContent());if(value.executionVerified!==false||value.businessWrites!==0||value.complete!==false||value.valid!==true)throw Error('Browser tutorial mismatch');
 await page.evaluate(()=>{document.activeElement?.blur();document.querySelector('#action-result').textContent='Keyboard probe pending';});let reached=false;for(let tab=0;tab<60;tab++){await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement?.id==='inspect-action')){reached=true;break;}}if(!reached)throw Error('Inspection unreachable by keyboard');await page.keyboard.press('Enter');if(JSON.parse(await page.locator('#action-result').textContent()).businessWrites!==0)throw Error('Keyboard inspection failed');
 }
 for(let n=0;n<await page.locator('figure').count();n++){const file=width+'-'+name.replace('.html','-figure-'+(n+1)+'.png');await page.locator('figure').nth(n).screenshot({path:path.join(out,file)});screenshots.push(file);}if(name==='index.html'||name==='getting-started.html'){const file=width+'-'+name.replace('.html','-viewport.png');await page.screenshot({path:path.join(out,file)});screenshots.push(file);}
 if(width===390||['index.html','execution.html','receipts-and-queries.html','formal-analysis.html'].includes(name)){const file=width+'-'+name.replace('.html','.png');await page.screenshot({path:path.join(out,file),fullPage:true});screenshots.push(file);}
 const glyphHeights=()=>Object.fromEntries(['main p','h1','header a','aside a','footer','button'].flatMap(selector=>{const element=document.querySelector(selector);if(!element)return [];const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){const i=node.textContent.search(/\S/);if(i<0)continue;const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);return [[selector,range.getBoundingClientRect().height]];}return [];}));
 const before=await page.evaluate(glyphHeights);await page.evaluate(()=>document.documentElement.style.zoom='2');const after=await page.evaluate(glyphHeights);
 for(const [selector,height]of Object.entries(before))if(!height||after[selector]<height*1.95)throw Error('Layout zoom failed '+selector+' '+name);
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('CSS layout zoom overflow '+name+' '+width);
 for(let n=0;n<await page.locator('figure').count();n++){const file=width+'-zoom200-'+name.replace('.html','-figure-'+(n+1)+'.png');await page.locator('figure').nth(n).screenshot({path:path.join(out,file)});screenshots.push(file);}
 await page.evaluate(()=>scrollTo(0,0));const zoomFile=width+'-zoom200-'+name.replace('.html','.png');await page.screenshot({path:path.join(out,zoomFile),fullPage:true});screenshots.push(zoomFile);const zoomViewport=width+'-zoom200-'+name.replace('.html','-viewport.png');await page.screenshot({path:path.join(out,zoomViewport)});screenshots.push(zoomViewport);await page.evaluate(()=>document.documentElement.style.zoom='');
 checks.push({route:name,width,oneH1:true,noOverflow:true,visibleLabelBoundsFit:true,assetIntegrity:true,reviewedHtmlIntegrity:true,cssLayoutZoom:{factor:2,beforeGlyphHeights:before,afterGlyphHeights:after,noOverflow:true,responsiveFigures:'shrink to fit; SVG glyph doubling is not asserted'}});
 }
 for(const name of routes){const links=await (await context.request.get(base+'actions/'+name)).text();for(const match of links.matchAll(/href="([^"#]+)"/g)){const url=new URL(match[1],base+'actions/'+name);if(url.origin!==host)continue;const r=await context.request.get(url.href);if(r.status()!==200)throw Error('Broken local link '+url);if(url.hash){const html=await r.text();if(!html.includes('id="'+decodeURIComponent(url.hash.slice(1))+'"'))throw Error('Broken cross-page anchor '+url);}}}
 await context.close();
 }
 if(errors.length||external.length)throw Error(JSON.stringify({errors,external}));
 const entryChecks=[],legacyExternal=[];
 for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000}}),host=new URL(base).origin;
 await context.route('**/*',route=>{const url=route.request().url();if(new URL(url).origin!==host){legacyExternal.push(url);return route.abort();}return route.continue();});
 const page=await context.newPage();
 for(const name of ['index.html','docs.html','demo.html','ecosystem.html','explorer.html']){
 const response=await page.goto(base+name,{waitUntil:'networkidle'});if(!response||response.status()!==200)throw Error('Missing site entry '+name);
 const link=page.locator('nav a[href="actions/index.html"]');if(await link.count()!==1||!await link.isVisible())throw Error('Missing visible Actions navigation '+name);
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Site entry overflow '+name+' '+width);
 const file=width+'-site-'+name.replace('.html','.png');await page.screenshot({path:path.join(out,file),fullPage:true});screenshots.push(file);
 await link.click();await page.waitForURL(base+'actions/index.html');if(await page.locator('h1').count()!==1)throw Error('Actions entry navigation failed');
 entryChecks.push({route:name,width,actionsNavigation:true,noOverflow:true});
 }
 await context.close();
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({profile:'umf.actions.documentation-browser/1',base,browser:browser.version(),checks,entryChecks,screenshots,externalRequests:external,pageErrors:errors,legacyEntryExternalRequests:legacyExternal},null,2)+'\n');
 console.log(JSON.stringify({routes:routes.length,widths:[1440,390],browser:browser.version(),externalRequests:external.length,pageErrors:errors.length}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
