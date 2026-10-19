import {checkCoreDistribution} from './check-core-authority';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'umf-sdk-install-'));
async function run(command:string[]){const child=Bun.spawn(command,{cwd:directory,stdout:'inherit',stderr:'inherit'});if(await child.exited)throw Error('Installed SDK check failed: '+command[0]);}
try{
 await Bun.write(join(directory,'package.json'),JSON.stringify({name:'umf-sdk-consumer-check',private:true,type:'module'}));
 await run([process.execPath,'install','--ignore-scripts',resolve('.cache/sdk-distribution/umf-sdk.tgz')]);
 const expectedVersion=(await Bun.file('package.json').json()).version;
 const installedMetadata=await Bun.file(join(directory,'node_modules/@umf/core/package.json')).json();
 if(installedMetadata.version!==expectedVersion)throw Error('Installed SDK release version differs from source package');
 const distribution=await checkCoreDistribution(join(directory,'node_modules/@umf/core'));console.log(JSON.stringify({installedCoreDistribution:distribution}));
 await Bun.write(join(directory,'current-conformance.json'),await Bun.file('fixtures/metamodel/current-conformance.json').text());
 await Bun.write(join(directory,'approve.json'),await Bun.file('fixtures/actions/approve.json').text());
 await Bun.write(join(directory,'commerce.json'),await Bun.file('tests/unified/commerce.json').text());
 await Bun.write(join(directory,'probe.ts'),`import {createUmfRegistry,inspectActions,readDocument,Registry,validateDocument,CURRENT_CORE_VERSION,generatePythonClient} from '@umf/core';
import {createValidator} from '@umf/core/loader-contract';
const registry=createUmfRegistry();
if(!registry.get('umf.actions','0.1.0')?.semantics||typeof createValidator!=='function')throw Error('Missing installed SDK entrypoint');
const source=readDocument(await Bun.file('approve.json').text(),'json');const result=inspectActions(source,registry);
if(!result.validation.valid||result.validation.complete||result.actions[0]?.action.id!=='approve')throw Error('Installed action behavior differs');
const corpus=await Bun.file('current-conformance.json').json();if(corpus.currentVersion!==CURRENT_CORE_VERSION)throw Error('Installed generated current marker differs');
for(const item of corpus.cases){const r=new Registry();if(item.registry)r.register({id:item.registry.id,version:item.registry.version,coreVersion:CURRENT_CORE_VERSION,description:'Frozen callback probe',schema:true,semantics:'Trusted callback probe',scopes:[item.registry.scope],capabilities:{validation:'semantic',directions:[],evidence:[]}},(payload,context)=>[{code:'BASELINE_CALLBACK',path:context.path,message:context.document.id+':'+context.scope+':'+payload.kind,severity:'warning'}]);if(!Bun.deepEquals(validateDocument(item.document,r),{valid:item.valid,complete:item.complete,diagnostics:item.diagnostics}))throw Error('Installed conformance '+item.id);}
const client=generatePythonClient({text:await Bun.file('commerce.json').text(),package:'shop'});
if(client.description.umf!==CURRENT_CORE_VERSION||client.files.length!==7||!client.files.some(f=>f.path==='shop/models.py'&&f.text.includes('class Actions:')))throw Error('Installed unified generator missing');
console.log(JSON.stringify({unifiedGenerator:true,conformanceCases:corpus.cases.length,singleInstall:true,bundledActions:true,loaderEntrypoint:true,opaqueMeaningRemainsUnchecked:true}));
`);
 await run([process.execPath,'probe.ts']);
}finally{await rm(directory,{recursive:true,force:true});}
