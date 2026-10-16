/** Host-only reproducible fresh qualification. No dependency installation or production deployment. */
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
if(process.argv.slice(2).some(arg=>arg!=='--verify-only'))throw Error('Only --verify-only is supported');
if(process.argv.includes('--verify-only')){
 const {verifyUuidConformance}=await import('./conformance');console.log(await verifyUuidConformance());
}else{
 const runDir=await mkdtemp(join(tmpdir(),'umf-uuid-qualification-'));
 const env={...process.env,UMF_UUID_QUALIFICATION_RUN_DIR:runDir};
 const bun=process.execPath,python=process.env.UMF_UUID_PYTHON??'python3',tablespecPython=process.env.UMF_TABLESPEC_PYTHON??'python3';
 const uuidTests=['tests/uuid-model.test.ts','tests/uuid-file-model.test.ts','tests/bit128.test.ts','tests/uuid.test.ts','tests/core-uuid.test.ts','tests/core-uuid-key.test.ts','tests/core-uuid-transition.test.ts','tests/binding-uuid.test.ts','tests/uuid-native-projection.test.ts'];
 const steps:{key:string;command:string[];log:string;extraEnv?:Record<string,string>}[]=[
  {key:'build',command:[bun,'run','build'],log:'uuid-model-build.log'},
  {key:'typecheck',command:[bun,'run','typecheck'],log:'uuid-model-typecheck.log'},
  {key:'schemas',command:[bun,'run','test:schemas'],log:'uuid-model-schemas.log'},
  {key:'tests',command:[bun,'scripts/run-tests.ts',...uuidTests],log:'uuid-model-tests.log'},
  {key:'bindingRegression',command:[bun,'scripts/run-tests.ts','tests/binding'],log:'uuid-model-binding-regression.log'},
  {key:'postgresql',command:[bun,'scripts/uuid/sql-model-oracle.ts','postgresql'],log:'uuid-pg-model.log'},
  {key:'sqlserver',command:[bun,'scripts/uuid/sql-model-oracle.ts','sqlserver'],log:'uuid-ms-model.log'},
  {key:'artifacts',command:[bun,'scripts/uuid/file-model-artifacts.ts'],log:'uuid-file-artifacts.log'},
  {key:'files',command:[python,'scripts/uuid/file-model-oracle.py'],log:'uuid-file-native.log'},
  {key:'tablespec',command:[tablespecPython,'scripts/uuid/tablespec-model-oracle.py'],log:'uuid-tablespec-model.log'},
  {key:'nativeAdapters',command:[bun,'scripts/uuid/native-adapter-roundtrips.ts'],log:'uuid-native-adapter-roundtrips.log'},
  {key:'returned',command:[bun,'scripts/uuid/verify-returned.ts'],log:'uuid-returned.log'},
  {key:'browser',command:[bun,'scripts/uuid/model-browser.ts'],log:'uuid-model-browser.log'},
  {key:'coreBrowser',command:[bun,'scripts/uuid-browser.ts'],log:'uuid-model-core-browser.log',extraEnv:{UMF_UUID_BROWSER_EVIDENCE:'fixtures/validation/uuid/model-core-browser.json'}},
  {key:'qualification',command:[bun,'scripts/uuid/model-gates.ts'],log:'uuid-model-gates.log'},
  {key:'conformance',command:[bun,'scripts/uuid/conformance.ts'],log:'uuid-conformance.log'},
  {key:'conformanceTests',command:[bun,'test','tests/uuid-conformance.test.ts'],log:'uuid-conformance-tests.log'},
 ];
 const exits:Record<string,number>={};
 console.log(JSON.stringify({runDir,scope:'Fresh owned-fixture UUID qualification; stops at first failed step'}));
 for(const [i,step] of steps.entries()){
  console.log(JSON.stringify({step:i+1,total:steps.length,key:step.key,command:step.command}));
  const child=Bun.spawn(step.command,{stdout:'pipe',stderr:'pipe',env:{...env,...step.extraEnv}});
  const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  await Bun.write(join(runDir,step.log),stdout+'\n'+stderr);exits[step.key]=code;
  await Bun.write(join(runDir,'uuid-model-exits.json'),JSON.stringify(exits)+'\n');
  if(code!==0)throw Error('Qualification failed at '+step.key+'; inspect '+join(runDir,step.log));
 }
 console.log(JSON.stringify({complete:true,runDir,commands:exits}));
}
