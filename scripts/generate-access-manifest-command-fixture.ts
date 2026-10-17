import {generateAccessPackage} from '../src/compilation/index';
import {createUmfRegistry,prepareActionPlanModel} from '../src/index';
import {profile,request} from '../tests/compilation/access-fixtures';

const output=process.argv[2];
if(!output)throw new Error('explicit fresh output directory required');
const mixed=process.argv.includes('--mixed');
const fixture='fixtures/access/manifest-command-public/';
const original=await Bun.file(mixed?'fixtures/access/native-bulk-list/request.json':fixture+'request-base.json').json();
const model=mixed?{mediaType:'application/json',utf8:original.binding.modelJson,sha256:original.binding.modelSha256}:original.model;
const pin=mixed?{documentId:original.source.documentId,revision:model.sha256,umfVersion:'0.8.0',sha256:model.sha256}:original.modelPin;
const action=mixed?{identity:{module:'sales',action:'setStatus'},documentSha256:model.sha256,invocation:{id:'umf.actions.tx',version:'1'}}:original.action;
const req=request();req.logical='logical';req.sources=[{id:'logical',format:'json',text:model.utf8}];
req.records=[{module:'sales',element:mixed?'order':'customer'}];req.actions=[action.identity];req.package=mixed?'mixed_sales':'manifest_sales';req.projections=[];
if(mixed){
  for(const set of original.binding.nativeColumns.sets){
    const b=set.binding;req.bindings.push(b.sourceId);req.sources.push({id:b.sourceId,format:'json',text:b.documentJson});
  }
}else{
  req.names=[
    {sourceId:'logical',pointer:'/modules/0/elements/0',python:'id'},
    {sourceId:'logical',pointer:'/modules/0/elements/2',python:'last_seen'},
    {sourceId:'logical',pointer:'/modules/0/extensions/umf.actions/actions/0',python:'SetActive'},
    {sourceId:'logical',pointer:'/modules/0/extensions/umf.actions/actions/0/parameters/1',python:'active_value'},
  ];
}
const pinned=profile();pinned.dependencies=pinned.dependencies.map(d=>d.distribution==='umf_access'?{...d,version:'0.1.0.dev0'}:d);
const result=generateAccessPackage(req,pinned);
await Bun.write(output+'/stage-one-result.json',JSON.stringify(result,null,2)+'\n');
if(result.outcome!=='candidate')throw new Error(JSON.stringify(result.diagnostics));
for(const file of result.files)await Bun.write(output+'/'+file.path,file.text);
const preparation=prepareActionPlanModel(pin,action,{registry:createUmfRegistry(),models:[{pin,artifact:model}],actions:[{pin:action,artifact:model}],selections:[]});
await Bun.write(output+'/registry.json',JSON.stringify({actions:[{pin:action,snapshot:model,preparation}],selectionBackends:[]}));
await Bun.write(output+'/fixture-input.json',JSON.stringify({mixed,original,model,modelPin:pin,action},null,2)+'\n');
await Bun.write(output+'/manifest_declarations.py',await Bun.file(fixture+(mixed?'mixed-declarations.py':'declarations.py')).text());
await Bun.write(output+'/stage-one-request.json',JSON.stringify(req,null,2)+'\n');
