import {generateAccessPackage} from '../src/compilation/index';
import {profile,request} from '../tests/compilation/access-fixtures';
const out=process.argv[2];if(!out)throw new Error('explicit output directory required');
const modelArg=process.argv.indexOf('--model');
if(modelArg>=0&&!process.argv[modelArg+1])throw new Error('--model requires an explicit authored fixture');
const modelPath=modelArg>=0?process.argv[modelArg+1]!:process.argv.includes('--lakebase')?'fixtures/access/search/lakebase-model.json':'fixtures/access/search/model.json';
const req=request();req.sources=[{id:'logical',format:'json',text:await Bun.file(modelPath).text()}];req.records=[{module:'search',element:'Doc'}];req.actions=[];req.projections=[{name:'docSummary',record:req.records[0]!,fields:[{module:'search',element:'id'},{module:'search',element:'body'}]}];req.package='search_docs';
const bindingArg=process.argv.indexOf('--binding'),bindingIdArg=process.argv.indexOf('--binding-id');
if(bindingArg>=0||bindingIdArg>=0){if(bindingArg<0||bindingIdArg<0||!process.argv[bindingArg+1]||!process.argv[bindingIdArg+1])throw new Error('--binding and --binding-id require explicit values');const sourceId=process.argv[bindingIdArg+1]!;req.sources.push({id:sourceId,format:'json',text:await Bun.file(process.argv[bindingArg+1]!).text()});req.bindings=[sourceId];}
const pinned=profile();pinned.dependencies=pinned.dependencies.map(d=>d.distribution==='umf_access'?{...d,version:'0.1.0.dev0'}:d);
pinned.python.version='3.11.17';pinned.compilerVersion='local-search-0.1';
pinned.checkers=[{name:'mypy',version:'2.4.0',configuration:{check_untyped_defs:true,python_version:'3.11'}},{name:'pyright',version:'1.1.414',configuration:{typeCheckingMode:'basic',pythonVersion:'3.11',environment:'explicit-native-fixture'}},{name:'ty',version:'0.0.88',configuration:{pythonVersion:'3.11'}}];
const inputs:{path:string;sha256:string}[]=[];
for(const pattern of ['src/**/*.ts','spec/**/*.json'])for(const path of new Bun.Glob(pattern).scanSync({cwd:process.cwd(),onlyFiles:true}))inputs.push({path,sha256:new Bun.CryptoHasher('sha256').update(await Bun.file(path).arrayBuffer()).digest('hex')});
inputs.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);pinned.codeSha256=new Bun.CryptoHasher('sha256').update(JSON.stringify(inputs)).digest('hex');
const result=generateAccessPackage(req,pinned);if(result.outcome!=='candidate')throw new Error(JSON.stringify(result.diagnostics));
for(const file of result.files)await Bun.write(out+'/'+file.path,file.text);
await Bun.write(out+'/stage-one-request.json',JSON.stringify(req,null,2)+'\n');
