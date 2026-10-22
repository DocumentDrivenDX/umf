// SPDX-License-Identifier: MIT OR Apache-2.0
import {generateAccessPackage} from '../src/compilation/index';
import {profile,request} from '../tests/compilation/access-fixtures';
if(!process.argv[2])throw new Error('explicit output directory required');
const original=await Bun.file('fixtures/access/native-actions/request.json').json();
const req=request();req.sources=[{id:'logical',format:'json',text:original.binding.modelJson}];req.records=[{module:'sales',element:'order'}];req.actions=JSON.parse(original.binding.modelJson).modules[0].extensions['umf.actions'].actions.map((a:{id:string})=>({module:'sales',action:a.id}));req.projections=[];req.package='native_sales';
const originalColumns=await Bun.file('fixtures/access/native-actions/physical-binding.json').text();
if(original.binding.modelJson!==await Bun.file('fixtures/access/native-actions/model.json').text()||original.binding.nativeColumns.sets[0].binding.documentJson!==originalColumns)throw new Error('original action fixture source custody differs');
req.sources.push({id:'native-action-original-columns',format:'json',text:originalColumns});req.bindings=['native-action-original-columns'];
if(process.argv.includes('--reads-only'))req.actions=[];
const pinned=profile();pinned.dependencies=pinned.dependencies.map(d=>d.distribution==='umf_access'?{...d,version:'0.1.0.dev0'}:d);
pinned.python.version='3.11.17';pinned.compilerVersion='local-native-actions-0.1';
pinned.checkers=[{name:'mypy',version:'2.4.0',configuration:{check_untyped_defs:true,python_version:'3.11'}},{name:'pyright',version:'1.1.414',configuration:{typeCheckingMode:'basic',pythonVersion:'3.11',environment:'explicit-native-fixture'}},{name:'ty',version:'0.0.88',configuration:{pythonVersion:'3.11'}}];
const inputs:{path:string;sha256:string}[]=[];
for(const pattern of ['src/**/*.ts','spec/**/*.json'])for(const path of new Bun.Glob(pattern).scanSync({cwd:process.cwd(),onlyFiles:true}))inputs.push({path,sha256:new Bun.CryptoHasher('sha256').update(await Bun.file(path).arrayBuffer()).digest('hex')});
inputs.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);pinned.codeSha256=new Bun.CryptoHasher('sha256').update(JSON.stringify(inputs)).digest('hex');
const result=generateAccessPackage(req,pinned);if(result.outcome!=='candidate')throw new Error(JSON.stringify(result.diagnostics));
for(const file of result.files)await Bun.write(process.argv[2]+'/'+file.path,file.text);

await Bun.write(process.argv[2]+'/stage-one-request.json',JSON.stringify(req,null,2)+'\n');
