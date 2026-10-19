// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host-only packaging probe using the actual generator, never a stand-in emitter. */
import {generateAccessPackage} from '../../../../src/compilation/index';
import {profile,request} from '../../../../tests/compilation/access-fixtures';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const destination=process.argv[2];
if(!destination)throw new Error('An explicit temporary output directory is required');
const output=resolve(destination);
const runtime=JSON.parse(readFileSync(resolve(import.meta.dir,'../../compatibility-profile.json'),'utf8'));
const generatorRoot=resolve(import.meta.dir,'../../../../src/compilation');
const generatorSources=Object.fromEntries(readdirSync(generatorRoot,{recursive:true}).map(String).filter(path=>path.endsWith('.ts')).sort().map(path=>[path,createHash('sha256').update(readFileSync(resolve(generatorRoot,path))).digest('hex')]));
const selected=profile();
selected.compilerVersion='local-generator-'+createHash('sha256').update(JSON.stringify(generatorSources)).digest('hex');
selected.python.version=runtime.python;
selected.dependencies=[{distribution:'umf_access',version:runtime.runtimeAbi.version},{distribution:'pydantic',version:runtime.runtimeDependencies.pydantic}];
selected.checkers=[{name:'mypy',version:runtime.checkers.mypy,configuration:{check_untyped_defs:true,python_version:'3.12'}},{name:'pyright',version:runtime.checkers.pyright,configuration:{typeCheckingMode:'strict',pythonVersion:'3.12',environment:'isolated installed local prerelease wheel'}}];
selected.subset='local production-wheel probe over current engine-only Order fixture; not complete SDK qualification';
selected.codeSha256=createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex');
const input=request();
const result=generateAccessPackage(input,selected);
if(result.outcome!=='candidate')throw new Error(JSON.stringify(result.diagnostics));
if(JSON.stringify(result)!==JSON.stringify(generateAccessPackage(input,selected)))throw new Error('Generator probe is nondeterministic');
for(const file of result.files){const target=resolve(output,file.path);if(!target.startsWith(output+'/'))throw new Error('Unsafe generated path');mkdirSync(dirname(target),{recursive:true});writeFileSync(target,file.text);}
writeFileSync(resolve(output,'probe-generator-sources.json'),JSON.stringify(generatorSources,null,2)+'\n');
writeFileSync(resolve(output,'probe-request.json'),JSON.stringify({request:input,profile:selected},null,2)+'\n');
writeFileSync(resolve(output,'probe-result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({outcome:result.outcome,package:input.package,manifest:resolve(output,input.package,'_umf/manifest.json'),runtimeAbi:result.runtimeAbi}));
