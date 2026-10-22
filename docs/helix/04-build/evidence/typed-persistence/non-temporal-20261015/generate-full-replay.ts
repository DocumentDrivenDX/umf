import {generateAccessPackage} from '/Users/erik/.codex/worktrees/typed-sdk-recovery/umf/src/compilation/index';
import {mkdirSync,writeFileSync,readdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='/Users/erik/.codex/worktrees/typed-sdk-recovery/umf';
const config=await Bun.file(root+'/docs/helix/04-build/evidence/typed-persistence/recovery-20261015/fresh-probe-input.json').json();
const authored=JSON.parse(config.request.sources[0].text);
for(const module of authored.modules)for(const view of module.extensions?.['umf.access']?.views??[]){const choices:Record<string,string>={Order:'order-key',Customer:'Customer-key',OrderLine:'OrderLine-key'};view.selectedKey={...view.record,key:choices[view.record.element]};}
config.request.sources[0].text=JSON.stringify(authored);
const sources=Object.fromEntries(readdirSync(root+'/src/compilation',{recursive:true}).map(String).filter(path=>path.endsWith('.ts')).sort().map(path=>[path,createHash('sha256').update(readFileSync(root+'/src/compilation/'+path)).digest('hex')]));
const digest=createHash('sha256').update(JSON.stringify(sources)).digest('hex');
config.profile.codeSha256=digest;config.profile.compilerVersion='local-generator-'+digest;
config.profile.python.version='3.11.17';
config.profile.checkers=[{name:'mypy',version:'2.4.0',configuration:{check_untyped_defs:true,python_version:'3.11'}},{name:'pyright',version:'1.1.414',configuration:{typeCheckingMode:'strict',pythonVersion:'3.11',environment:'isolated pinned wheel'}},{name:'ty',version:'0.0.88',configuration:{python_version:'3.11'}}];
const result=generateAccessPackage(config.request,config.profile);if(result.outcome!=='candidate')throw Error(JSON.stringify(result.diagnostics));
const dest='/private/tmp/umf-sdk-nontemporal/full';
for(const file of result.files){const path=dest+'/'+file.path;mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true});writeFileSync(path,file.text);}
writeFileSync(dest+'/request.json',JSON.stringify(config.request,null,2));writeFileSync(dest+'/profile.json',JSON.stringify(config.profile,null,2));
writeFileSync(dest+'/result.json',JSON.stringify(result,null,2));

writeFileSync(dest+'/generator-sources.json',JSON.stringify(sources,null,2));
