// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host-only generation probe; source files remain inert inputs to the facade. */
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {readdirSync,readFileSync} from 'node:fs';
import {generateAccessPackage} from '../src/compilation/index';
import {profile,request} from '../tests/compilation/access-fixtures';
const destination=process.argv[2];if(!destination)throw Error('Explicit temporary output directory required');
const runtime=await Bun.file('python/umf_access/compatibility-profile.json').json();
const p=profile();p.python.version=runtime.python;p.dependencies=[{distribution:'umf_access',version:runtime.runtimeAbi.version},{distribution:'pydantic',version:runtime.runtimeDependencies.pydantic}];p.importedNames=['datetime','decimal','typing','types','pydantic','umf_access'];p.codeSha256=createHash('sha256').update(await Bun.file(import.meta.filename).text()).digest('hex');const compilerSources=Object.fromEntries(readdirSync('src/compilation',{recursive:true}).map(String).filter(f=>f.endsWith('.ts')).sort().map(f=>[f,createHash('sha256').update(readFileSync(join('src/compilation',f))).digest('hex')]));p.compilerVersion='experimental-access-generator-'+createHash('sha256').update(JSON.stringify(compilerSources)).digest('hex');p.subset='actual source-runtime probe, not complete profile/native qualification';
const observations=[];
for(const name of ['engine','containers','actions','relationships','projections','named','cross-module']){
 const q=request();
 if(['containers','actions','relationships','named','cross-module'].includes(name))q.sources[0]!.text=await Bun.file('fixtures/access/commerce/'+(name==='cross-module'?'named':name)+'.json').text();
 if(name==='engine'||name==='named'||name==='cross-module')q.records.push({module:'commerce',element:'Customer'},{module:'commerce',element:'OrderLine'});
 if(name==='actions')q.actions=[{module:'commerce',action:'shipOrder'}];
 if(name==='projections')q.projections=[{name:'orderSummary',record:q.records[0]!,fields:[{module:'commerce',element:'orderId'},{module:'commerce',element:'amount'}]},{name:'orderDetails',record:q.records[0]!,fields:[{module:'commerce',element:'memo'}]}];
 if(name==='cross-module'){
  const document=JSON.parse(q.sources[0]!.text),m=document.modules[0],index=m.elements.findIndex((e:{id:string})=>e.id==='amount'),field=m.elements.splice(index,1)[0];
  const walk=(v:unknown)=>{if(v&&typeof v==='object'){if((v as {module?:unknown}).module==='commerce'&&(v as {element?:unknown}).element==='amount')(v as {module:string}).module='shared';for(const child of Object.values(v))walk(child);}};walk(document);document.modules.push({id:'shared',namespace:'shared.logical',elements:[field],extensions:{}});q.sources[0]!.text=JSON.stringify(document);
 }
 const r=generateAccessPackage(q,p);if(r.outcome!=='candidate')throw Error(name+': '+JSON.stringify(r.diagnostics));
 for(const f of r.files)await Bun.write(join(resolve(destination),name,f.path),f.text);
 observations.push({name,inputDigest:r.inputDigest,files:r.files.map(({path,sha256})=>({path,sha256})),runtimeAbi:r.runtimeAbi});
}
await Bun.write(join(resolve(destination),'generation.json'),JSON.stringify({profile:p,observations},null,2)+'\n');console.log(JSON.stringify({cases:observations.map(o=>o.name),runtimeAbi:runtime.runtimeAbi}));
