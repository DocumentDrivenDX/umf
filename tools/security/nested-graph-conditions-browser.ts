/** Complete supplied logical scan browser correspondence; no compiler or native admission. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {resolve,relative,dirname,extname} from 'node:path';
import {runNestedGraphConditionsCorpus} from '../../tests/security/nested-graph-conditions-corpus';
const output=process.argv[2];if(!output||await Bun.file(output).exists())throw Error('Fresh explicit output path required');
const sourceBytes=new Map<string,string>();
async function capture(path:string):Promise<void>{path=resolve(path);const key=relative(process.cwd(),path);if(key==='..'||key.startsWith('../'))throw Error('Source escaped repository');if(sourceBytes.has(key))return;const text=await Bun.file(path).text();sourceBytes.set(key,text);if(!['.ts','.js'].includes(extname(path)))return;for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){const base=resolve(dirname(path),match[1]!);let found:string|undefined;for(const candidate of [base,base+'.ts',base+'.json',resolve(base,'index.ts')])if(await Bun.file(candidate).exists()){found=candidate;break;}if(!found)throw Error('Unresolved import');await capture(found);}}
await capture(import.meta.path);for(const path of ['tests/security/nested-graph-conditions.test.ts','package.json','bun.lock',Bun.resolveSync('ajv/package.json',process.cwd())])await capture(path);
const files=[...sourceBytes.keys()],snapshot=async()=>Object.fromEntries(await Promise.all(files.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
const before=await snapshot(),rows=runNestedGraphConditionsCorpus();if(rows.some(row=>!row.passed))throw Error('Bun correspondence refused');
const build=await Bun.build({entrypoints:['tests/security/nested-graph-conditions-corpus.ts'],target:'browser',format:'esm'});if(!build.success)throw Error('Browser build refused');
const js=await build.outputs[0]!.text();await Bun.write(output+'.bundle.js',js);const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/corpus.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Complete logical scan</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),pageErrors:string[]=[];let externalRequests=0;page.on('pageerror',error=>pageErrors.push(error.message));
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==server.url.origin){externalRequests++;return route.abort();}return route.continue();});await page.goto(server.url.href);
 const actual=await page.evaluate(async()=>{const url='/corpus.js',m=await import(url);return {rows:m.runNestedGraphConditionsCorpus(),globals:{Bun:typeof(globalThis as any).Bun,process:typeof(globalThis as any).process}};});
 if(JSON.stringify(rows)!==JSON.stringify(actual.rows)||pageErrors.length||externalRequests||actual.globals.Bun!=='undefined'||actual.globals.process!=='undefined')throw Error('Browser correspondence or boundary failed');
 const after=await snapshot();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Selected source drift');
 await Bun.write(output+'.source-snapshot.json',JSON.stringify({sources:Object.fromEntries(sourceBytes),externalClosureHermetic:false,ajvVersion:JSON.parse(sourceBytes.get(relative(process.cwd(),Bun.resolveSync('ajv/package.json',process.cwd())))!).version},null,2)+'\n');
 const result={status:'passed',bundleSha256:createHash('sha256').update(js).digest('hex'),controls:rows.length,browser:browser.version(),bun:Bun.version,selectedSourceDigests:after,sourcesUnchanged:true,globals:actual.globals,pageErrors,externalRequests,observations:rows,scope:'Actual nested graph condition fold, full dependency preflight and original V2 codec composition in Bun/Chromium. Relative source closure and emitted bundle are captured; external executable dependencies are non-hermetic. Supplied cut completeness is a premise. No native/current-cut/caller/source authority, compiler .4 execution, query operators or guarded-release/backend qualification.'};await Bun.write(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,controls:rows.length,browser:result.browser}));
}finally{await browser?.close();server.stop(true);}
