/** Host-only fresh five-adapter composition qualification. Uses existing pinned environments. */
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
if(process.argv.slice(2).some(x=>x!=='--verify-only'))throw Error('Only --verify-only is supported');
if(process.argv.includes('--verify-only')){const {verifyCompositionQualification}=await import('./composition-gates');console.log(await verifyCompositionQualification());}
else{
 const runDir=await mkdtemp(join(tmpdir(),'umf-uuid-composition-')),env={...process.env,UMF_UUID_COMPOSITION_RUN_DIR:runDir},bun=process.execPath,exits:Record<string,number>={};
 const steps:[string,string[]][]=[['build',[bun,'run','build']],['testPrerequisites',[bun,'scripts/build-test-prerequisites.ts']],['typecheck',[bun,'run','typecheck']],['schemas',[bun,'run','test:schemas']],['tests',[bun,'scripts/run-tests.ts','tests/uuid-mixed-model.test.ts','tests/uuid-model.test.ts','tests/uuid-file-model.test.ts']],['artifacts',[bun,'scripts/uuid/composition-artifacts.ts']],['postgresql',[bun,'scripts/uuid/composition-sql.ts','postgresql']],['sqlserver',[bun,'scripts/uuid/composition-sql.ts','sqlserver']],['files',[process.env.UMF_UUID_PYTHON??'python3','scripts/uuid/composition-files.py']],['tablespec',[process.env.UMF_TABLESPEC_PYTHON??'python3','scripts/uuid/composition-tablespec.py']],['recovery',[bun,'scripts/uuid/composition-recovery.ts']],['returned',[bun,'scripts/uuid/composition-verify.ts']],['browser',[bun,'scripts/uuid/composition-browser.ts']],['gates',[bun,'scripts/uuid/composition-gates.ts']],['gateTests',[bun,'test','tests/uuid-composition-gates.test.ts']]];
 console.log({runDir});
 for(const [step,command] of steps){console.log({step,command});const child=Bun.spawn(command,{env,stdout:'pipe',stderr:'pipe'}),[out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);const log=(out+'\n'+err).split(/\r?\n/).map(x=>x.trimEnd()).join('\n').trimEnd()+'\n';await Bun.write(join(runDir,step+'.log'),log);exits[step]=code;await Bun.write(join(runDir,'exits.json'),JSON.stringify(exits)+'\n');if(code!==0)throw Error('Failed '+step+'; see '+join(runDir,step+'.log'));}
 for(const step of ['gates','gateTests'])await Bun.write('fixtures/validation/uuid/composition-runs/'+step+'.log',await Bun.file(join(runDir,step+'.log')).text());console.log({complete:true,runDir,exits});
}
