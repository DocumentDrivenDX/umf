// SPDX-License-Identifier: MIT OR Apache-2.0
/** Actual generated models against an installed wheel; no native target claim. */
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {generateAccessPackage} from '../src/compilation';
import {request,profile} from '../tests/compilation/access-fixtures';
const options=new Map<string,string>();for(let i=2;i<process.argv.length;i+=2)options.set(process.argv[i]!,process.argv[i+1]!);
const python=options.get('--python'),version=options.get('--pydantic'),wheel=options.get('--wheel'),report=options.get('--report');
if(!python||!version||!wheel||!report)throw Error('Required: --python PATH --pydantic VERSION --wheel PATH --report PATH');
const root=resolve(import.meta.dir,'..'),work=await mkdtemp(join(tmpdir(),'umf-p1-dependencies-'));
const q=request(),source=JSON.parse(q.sources[0]!.text),module=source.modules[0];
module.elements.find((e:any)=>e.id==='Order').members=module.elements.find((e:any)=>e.id==='Order').members.filter((f:any)=>f.element!=='placedAt');
const view=module.extensions['umf.access'].views.find((v:any)=>v.record.element==='Order');view.fields=view.fields.filter((f:any)=>f.field.element!=='placedAt');
q.sources[0]!.text=JSON.stringify(source);q.package='compat_shop';
q.projections=[{name:'orderSummary',record:q.records[0]!,fields:[{module:'commerce',element:'orderId'},{module:'commerce',element:'amount'}]}];
const identityProcess=Bun.spawnSync([python,'-I','-c',"import json,platform,importlib.metadata as m;print(json.dumps({'python':platform.python_version(),'runtime':m.version('umf_access')}))"]);
if(identityProcess.exitCode!==0)throw Error(identityProcess.stderr.toString());
const identity=JSON.parse(identityProcess.stdout.toString()) as {python:string;runtime:string};
const p=profile();p.python.version=identity.python;p.dependencies=[{distribution:'umf_access',version:identity.runtime},{distribution:'pydantic',version}];
p.subset='Installed model/codec/runtime compatibility only; no static or native qualification';
const generated=generateAccessPackage(q,p);if(generated.outcome!=='candidate')throw Error(JSON.stringify(generated.diagnostics));
for(const file of generated.files){const path=join(work,file.path);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,file.text);}
// The runtime suite's commerce import also comes from the real emitter.
q.package='commerce';q.sources[0]!.text=await Bun.file(join(root,'fixtures/access/commerce/relationships.json')).text();q.records.push({module:'commerce',element:'Customer'},{module:'commerce',element:'OrderLine'});
const commerce=generateAccessPackage(q,p);if(commerce.outcome!=='candidate')throw Error(JSON.stringify(commerce.diagnostics));
for(const file of commerce.files){const path=join(work,file.path);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,file.text);}
const command=[python,'-I',resolve('tests/unified/dependency_probe.py'),work,version,resolve(wheel),resolve('python/umf_access/tests')];
const processHandle=Bun.spawn(command,{cwd:work,stdout:'pipe',stderr:'pipe'});
const [exit,stdout,stderr]=await Promise.all([processHandle.exited,new Response(processHandle.stdout).text(),new Response(processHandle.stderr).text()]);
const receipt={scope:'Installed Python/Pydantic compatibility; non-temporal model subset; no native engine qualification',command,exit,stdout,stderr,wheelSha256:new Bun.CryptoHasher('sha256').update(await Bun.file(wheel).bytes()).digest('hex'),generated:[...generated.files,...commerce.files].map(f=>({path:f.path,sha256:f.sha256}))};
await Bun.write(report,JSON.stringify(receipt,null,2)+'\n');
if(exit!==0)throw Error(stderr);console.log(stdout.trim());
