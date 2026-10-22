/** Real stage-one generator corpus, not handwritten generated modules. No catalog
 * or queries.py stand-in: stage-two call-site acceptance remains untested. */
import {generateAccessPackage, diffAccessPackages} from '../../../../../src/compilation/index';
import {writeAccessPackage} from '../../../../../scripts/umf-access-generate';
import {request, profile} from '../../../../../tests/compilation/access-fixtures';
import {mkdir,readdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const destination=process.argv[2];
if(!destination?.startsWith('/private/tmp/umf-b005-'))throw Error('explicit B005 temporary destination required');
const hash=(text:string|Uint8Array)=>createHash('sha256').update(text).digest('hex');
const codeInputs:{path:string;sha256:string}[]=[];
async function scan(directory:string){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())await scan(path);else if(entry.isFile()&&(path.endsWith('.ts')||path.endsWith('.json')))codeInputs.push({path,sha256:hash(await readFile(path))});}}
await scan('src');await scan('spec');codeInputs.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
const codeDigest=hash(JSON.stringify(codeInputs));
const mypyConfig=await readFile(new URL('./dsl-typing-spike/compatibility/mypy.ini',import.meta.url),'utf8');
const pyrightConfig=await readFile(new URL('./dsl-typing-spike/compatibility/pyrightconfig.json',import.meta.url),'utf8');
const runtimeCheckpoint=JSON.parse(await readFile(process.env.UMF_ACCESS_INSTALLED_SNAPSHOT??new URL('./production-packaging/stable-runtime-checkpoint.json',import.meta.url),'utf8'));
const outcomes=[];
let baseline:ReturnType<typeof generateAccessPackage>|undefined;
for(const variant of ['base','memo-rename','amount-retype','memo-remove','memo-rename-with-names-override']){
 const req=request(), p=profile();req.package='commerce';
 req.records=[{module:'commerce',element:'Order'},{module:'commerce',element:'Customer'}];
 req.projections=[{name:'orderSummary',record:req.records[0]!,fields:[{module:'commerce',element:'orderId'},{module:'commerce',element:'amount'}]},
                 {name:'customerSummary',record:req.records[1]!,fields:[{module:'commerce',element:'name'}]}];
 p.python.version=runtimeCheckpoint.pythonVersion??p.python.version;p.dependencies=p.dependencies.map(d=>d.distribution==='umf_access'?{...d,version:runtimeCheckpoint.version??d.version}:d.distribution==='pydantic'&&runtimeCheckpoint.pydanticVersion?{...d,version:runtimeCheckpoint.pydanticVersion}:d);
 p.subset='B005 selected commerce integration, runtime wheel '+runtimeCheckpoint.wheelSha256+'; no release/catalog/native acceptance';
 p.codeSha256=codeDigest;p.compilerVersion='local-source-'+codeDigest.slice(0,16);
 p.checkers=[{name:'mypy',version:'2.4.0',configuration:{check_untyped_defs:true,configText:mypyConfig,configSha256:hash(mypyConfig)}},{name:'pyright',version:'1.1.414',configuration:{...JSON.parse(pyrightConfig),environment:'installed-runtime-wheel-'+runtimeCheckpoint.wheelSha256,configSha256:hash(pyrightConfig)}}];
 const doc=JSON.parse(req.sources[0]!.text), module=doc.modules[0];
 // Explicit authored names, deliberately distinct from IDs and Python overrides.
 const authored:Record<string,string>={orderId:'Order ID',amount:'Amount',memo:'Memo',placedAt:'Placed at',revision:'Revision',Order:'Orders',customerId:'Customer ID',name:'Customer name',Customer:'Customers'};
 for(const element of module.elements)if(authored[element.id])element.name=authored[element.id];
 module.namespace='commerce.logical';
 module.relationships=[{id:'customer',name:'Customer relation',source:[{module:'commerce',element:'Order'}],target:[{module:'commerce',element:'Customer',key:'Customer-key'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'independent',directed:true}];
 if(variant==='amount-retype'){
  const field=module.elements.find((e:{id:string})=>e.id==='amount');field.scalarType='string';delete field.facets;
 }
 if(variant.startsWith('memo-rename')){
  const walk=(value:unknown)=>{if(value&&typeof value==='object'){for(const [key,child] of Object.entries(value)){if((key==='element'||key==='id')&&child==='memo')(value as Record<string,unknown>)[key]='memoRenamed';else walk(child);}}};walk(doc);
 }
 if(variant==='memo-remove'){
  module.elements=module.elements.filter((e:{id:string})=>e.id!=='memo');
  module.elements.find((e:{id:string})=>e.id==='Order').members=module.elements.find((e:{id:string})=>e.id==='Order').members.filter((r:{element:string})=>r.element!=='memo');
  for(const view of module.extensions['umf.access'].views)view.fields=view.fields.filter((f:{field:{element:string}})=>f.field.element!=='memo');
 }
 for(const [id,python] of [['orderId','order_id'],['placedAt','placed_at'],['customerId','customer_id'],...(variant==='memo-rename-with-names-override'?[['memoRenamed','memo']]:[])]){
  const index=module.elements.findIndex((e:{id:string})=>e.id===id);req.names.push({sourceId:'logical',pointer:`/modules/0/elements/${index}`,python:python!});
 }
 req.sources[0]!.text=JSON.stringify(doc);
 const result=generateAccessPackage(req,p);
 if(!baseline)baseline=result;
 const changes=result.outcome==='candidate'&&baseline.outcome==='candidate'?diffAccessPackages(baseline,result):[];
 const snapshotIdentity=hash(JSON.stringify({generatorSourceDigest:codeDigest,inputDigest:result.inputDigest,wheelSha256:runtimeCheckpoint.wheelSha256}));
 const snapshot=new URL('./b-tp-005-generated-snapshots/'+snapshotIdentity+'.json',import.meta.url);
 await mkdir(new URL('./b-tp-005-generated-snapshots/',import.meta.url),{recursive:true});
 const snapshotText=JSON.stringify({wheelSha256:runtimeCheckpoint.wheelSha256,generatorSourceDigest:codeDigest,inputDigest:result.inputDigest,request:req,profile:p,result},null,2)+'\n';
 let snapshotState='created';
 try{await writeFile(snapshot,snapshotText,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;if(await readFile(snapshot,'utf8')!==snapshotText)throw Error('Immutable generated snapshot identity has different bytes');snapshotState='reused-identical';}
 const output=join(destination,variant);
 if(result.outcome==='candidate')await writeAccessPackage(output,result);
 outcomes.push({variant,output,outcome:result.outcome,snapshotIdentity,snapshotPath:snapshot.pathname,snapshotState,inputDigest:result.inputDigest,diagnostics:result.diagnostics,changes,manifest:result.files.find(f=>f.path==='commerce/_umf/manifest.json')?.text});
}
const evidence=new URL('./b-tp-005-generated-corpus.json',import.meta.url);
await writeFile(evidence,JSON.stringify({scope:'real stage-one generator integration; current source snapshot only, not ordered slice acceptance',destination,codeDigest,codeInputs,runtimeWheelSha256:runtimeCheckpoint.wheelSha256,outcomes},null,2)+'\n');
for(const outcome of outcomes)console.log(outcome.variant,outcome.outcome,outcome.diagnostics);
if(outcomes.some(o=>o.outcome!=='candidate'))process.exitCode=1;
