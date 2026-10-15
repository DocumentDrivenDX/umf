import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {preparationSourcesFixture} from '/Users/erik/.codex/worktrees/security-action-source-custody/umf/tests/security/preparation-sources-fixture';
import {compilePreparationSourceObligations as compile,preparationSourceArtifact as artifact} from '/Users/erik/.codex/worktrees/security-action-source-custody/umf/tools/security/protection-preparation-sources';
const root='/Users/erik/.codex/worktrees/security-action-source-custody/umf',source=root+'/tools/security/protection-preparation-sources.ts',hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex'),sourceSha256=hash(readFileSync(source));
const p=preparationSourcesFixture(),raw=readFileSync(root+'/tests/security/preparation-program-original/program-binding.json','utf8');
const r=compile(p);if(r.original.bindingEnvelope.utf8!==raw||r.original.bindingEnvelope.sha256!==hash(raw)||r.original.bindingEnvelope===p.bindingEnvelope||!Object.isFrozen(r.original.bindingEnvelope))throw Error('Original bytes/copy/freeze mismatch');
const results:any[]=[{name:'original-wrapper-bytes',expected:'retain-exact',passed:true}];
let getterCalls=0;
const mutations:[string,(v:any)=>void][]=[
 ['missing',v=>delete v.bindingEnvelope],['null',v=>v.bindingEnvelope=null],
 ['different-contained-binding',v=>v.bindingEnvelope=artifact({...v.binding,sha256:'0'.repeat(64)})],
 ['bad-wrapper-hash',v=>v.bindingEnvelope.sha256='0'.repeat(64)],
 ['unknown-wrapper-member',v=>v.bindingEnvelope.future=true],
 ['getter',v=>v.bindingEnvelope={...v.bindingEnvelope,get utf8(){getterCalls++;return raw;}}],
];
for(const [name,mutate] of mutations){const v=preparationSourcesFixture();mutate(v);let error:string|null=null;try{compile(v);}catch(e){error=String(e);}if(!error)throw Error('Accepted '+name);results.push({name,expected:'refuse',error,passed:true});}
if(getterCalls!==0)throw Error('Getter executed');
const other=preparationSourcesFixture(),reserialized=JSON.stringify(other.binding,null,2)+'\n';if(reserialized===raw)throw Error('Probe must change wrapper serialization');other.bindingEnvelope={mediaType:'application/json',utf8:reserialized,sha256:hash(reserialized)};
const replacement=compile(other);if(replacement.original.bindingEnvelope.utf8!==reserialized||replacement.original.bindingEnvelope.sha256!==hash(reserialized)||replacement.authority!==false)throw Error('Serialized bytes lost');
results.push({name:'equal-contents-different-wrapper-bytes',expected:'retain-new-bytes-without-authority',passed:true,requiresOriginalNativeEnrollmentComparison:true});
if(hash(readFileSync(source))!==sourceSha256)throw Error('Source drift');
console.log(JSON.stringify({passed:true,sourceSha256,probeSha256:hash(readFileSync(import.meta.path)),runtime:'Bun '+Bun.version,browserExecution:false,nativeExecution:false,count:results.length,getterCalls,results},null,2));
