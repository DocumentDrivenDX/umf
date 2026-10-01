import assert from 'node:assert/strict';
import {relationshipRefreshCommands,relationshipProofs,relationshipSourceHashes,digest,readEvidence} from './relationship-gate-inputs';
export interface RelationshipIntegratedReplay {complete:boolean;commands:string[][];runs:{command:string[];exitCode:number;log:string;logSha256:string}[];sha256:Record<string,string>;relationshipSourceHashes:Record<string,string>}
export async function publishRelationshipGateFromReplay(input:RelationshipIntegratedReplay){
 assert.equal(input.complete,true,'Incomplete integrated replay');
 assert.deepEqual(input.relationshipSourceHashes,await relationshipSourceHashes(),'Integrated replay sources changed');
 const commands=[];
 for(const command of relationshipRefreshCommands){
  assert(input.commands.some(c=>JSON.stringify(c)===JSON.stringify(command)),'Missing integrated command '+command.join(' '));
  const runs=input.runs.filter(r=>JSON.stringify(r.command)===JSON.stringify(command));assert.equal(runs.length,1,'Missing or ambiguous integrated execution');
  const run=runs[0]!;assert.equal(run.exitCode,0,'Failed integrated execution');assert.equal(digest(await readEvidence(run.log)),run.logSha256,'Changed integrated execution log');
  commands.push({command,exitCode:run.exitCode,log:run.log,sha256:run.logSha256});
 }
 // Integrated runner must capture these proofs after their execution, not simply republish earlier artifacts.
 const proofHashes:Record<string,string>={};for(const p of relationshipProofs){assert.match(input.sha256[p]??'',/^[a-f0-9]{64}$/,'Missing integrated proof digest');proofHashes[p]=digest(await readEvidence(p));assert.equal(proofHashes[p],input.sha256[p],'Changed integrated proof');}
 const record={complete:true,nativeEquivalence:false,sourceHashes:input.relationshipSourceHashes,proofHashes,commands};
 await Bun.write('fixtures/validation/relationship-gate-refresh.json',JSON.stringify(record,null,2)+'\n');return record;
}
export async function refreshRelationshipGate(){
 const path='fixtures/validation/relationship-gate-refresh.json',before=await relationshipSourceHashes();
 await Bun.write(path,JSON.stringify({complete:false,nativeEquivalence:false,sourceHashes:before})+'\n');
 const commands=[];
 for(const [index,command] of relationshipRefreshCommands.entries()){
  const child=Bun.spawn(command,{stdout:'pipe',stderr:'pipe'});
  const [stdout,stderr,exitCode]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  const log=`fixtures/validation/relationship-gate/command-${index}.txt`;await Bun.write(log,stdout+stderr);
  commands.push({command,exitCode,log,sha256:digest(stdout+stderr)});console.log(JSON.stringify({command,exitCode}));
  assert.equal(exitCode,0,`Relationship refresh failed: ${command.join(' ')}; ${log}`);
 }
 assert.deepEqual(await relationshipSourceHashes(),before,'Sources changed during relationship refresh');
 const proofHashes=Object.fromEntries(await Promise.all(relationshipProofs.map(async p=>[p,digest(await readEvidence(p))])));
 const record={complete:true,nativeEquivalence:false,sourceHashes:before,proofHashes,commands};
 await Bun.write(path,JSON.stringify(record,null,2)+'\n');return record;
}
if(import.meta.main)await refreshRelationshipGate();
