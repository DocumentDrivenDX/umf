import {generateAccessPackage} from '../src/compilation/index';
import {profile,request,mutateSource} from '../tests/compilation/access-fixtures';
const output=process.argv[2];if(!output)throw new Error('temporary output directory required');
const req=request();req.package='commerce';req.records.push({module:'commerce',element:'Customer'},{module:'commerce',element:'OrderLine'});
req.actions=[{module:'commerce',action:'shipOrder'}];
req.projections=[{name:'orderIdentity',record:req.records[0]!,fields:[{module:'commerce',element:'orderId'}]},{name:'orderSummary',record:req.records[0]!,fields:[{module:'commerce',element:'orderId'},{module:'commerce',element:'amount'}]},{name:'orderCustomer',record:req.records[0]!,fields:[{module:'commerce',element:'orderId'},{module:'commerce',element:'name'}]},{name:'customerSummary',record:req.records[1]!,fields:[{module:'commerce',element:'customerId'},{module:'commerce',element:'name'}]}];
mutateSource(req,d=>{for(const e of d.modules[0]!.elements)Object.assign(e,{name:e.id});Object.assign(d.vocabularies,{'umf.actions':{version:'0.1.0'}});Object.assign(d.modules[0]!.extensions,{'umf.actions':{actions:[{id:'shipOrder',name:'Ship order',description:'Reporting typing fixture; no executor qualification',parameters:[{id:'order',kind:'entity',target:{module:'commerce',element:'Order',key:'order-key'},required:true},{id:'memo',kind:'value',field:{module:'commerce',element:'memo'},required:false}],outputs:[{id:'amount',kind:'value',field:{module:'commerce',element:'amount'},required:true}],preconditions:[],postconditions:[],reads:[],writes:[],binding:{kind:'handler',profile:{id:'test-handler-profile',version:'1'},handler:{id:'test-ship',version:'1'}},failures:[{code:'NOT_READY',message:'Not ready',retryable:false}],authorization:{kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles:['shipper']},attribution:{subject:'person-required'},atomicity:'single-store',idempotency:'caller-key-optional',result:{identities:'created-and-changed',version:'store-opaque',receipt:'read-at-least'}}]}});Object.assign(d.modules[0]!,{relationships:[{id:'customer',name:'customer',source:[{module:'commerce',element:'Order'}],target:[{module:'commerce',element:'Customer',key:'Customer-key'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'independent',directed:true}]});});
if(process.argv.includes('--native-reviewed')){
 req.records=req.records.filter(r=>r.element!=='OrderLine');req.projections=req.projections.filter(p=>p.name!=='orderSummary');
 const bindingId='native-reviewed-binding';
 mutateSource(req,d=>{
  const m=d.modules[0]!;const access=m.extensions['umf.access'] as {views:any[];columns:any[]};
  const order=m.elements.find((e:any)=>e.id==='Order') as any;order.members=order.members.filter((f:any)=>f.element==='orderId');
  const orderView=access.views.find((v:any)=>v.record.element==='Order');orderView.fields=orderView.fields.filter((f:any)=>f.field.element==='orderId');
  for(const [record,id] of [['Order','orderOwnerRole'],['Customer','customerOwnerRole']]){
   m.elements.push({id,name:id,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}} as any);
   const r=m.elements.find((e:any)=>e.id===record) as any;r.members.push({module:'commerce',element:id});
   const v=access.views.find((v:any)=>v.record.element===record);v.fields.push({field:{module:'commerce',element:id},row:{missing:false,null:false},create:{missing:false,null:false},mutable:false,generated:false});
  }
  access.columns=[{binding:{sourceId:bindingId,module:'commerce'},target:{platform:'postgresql',majorVersion:'18'},columns:['orderId','orderOwnerRole','customerId','name','customerOwnerRole'].map(element=>({field:{module:'commerce',element},type:'text',notNull:true,generation:null,collation:{schema:'pg_catalog',name:'default'}}))}];
 });
 const logical=JSON.parse(req.sources[0]!.text);
 const physical={umf:'0.8.0',id:bindingId,vocabularies:{'umf.binding':{version:'0.2.0'}},modules:[],extensions:{'umf.binding':{profile:'umf-binding-2',logical:{documentId:logical.id,coreVersion:'0.8.0'},target:{system:'postgresql',version:'18',subset:'typed-access-columns/0.1'},elements:[{module:'commerce',element:'Order',table:'generated_orders'},{module:'commerce',element:'Customer',table:'generated_customers'}],fields:[['orderId','order_id'],['orderOwnerRole','owner_role'],['customerId','customer_id'],['name','name'],['customerOwnerRole','owner_role']].map(([element,column])=>({module:'commerce',element,storage:'column',column})),relationships:[],indexes:[]}}};
 req.bindings.push(bindingId);req.sources.push({id:bindingId,format:'json',text:JSON.stringify(physical)});
}
if(process.argv.includes('--reads-only'))req.actions=[];
const pinned=profile();pinned.python.version='3.11.17';pinned.compilerVersion='local-reporting-0.1';pinned.dependencies=pinned.dependencies.map(d=>d.distribution==='umf_access'?{...d,version:'0.1.0.dev0'}:d);pinned.checkers=[{name:'mypy',version:'2.4.0',configuration:{check_untyped_defs:true,explicit_package_bases:true,follow_imports:'silent',python_version:'3.11'}},{name:'pyright',version:'1.1.414',configuration:{typeCheckingMode:'basic',pythonVersion:'3.11',environment:'explicit-reporting-test-environment'}},{name:'ty',version:'0.0.88',configuration:{pythonVersion:'3.11'}}];pinned.subset='Local reporting fixture; see installed-wheel and native evidence; no release claim';
const codeInputs:{path:string;sha256:string}[]=[];
for(const pattern of ['src/**/*.ts','spec/**/*.json'])for(const path of new Bun.Glob(pattern).scanSync({cwd:process.cwd(),onlyFiles:true}))codeInputs.push({path,sha256:new Bun.CryptoHasher('sha256').update(await Bun.file(path).arrayBuffer()).digest('hex')});
codeInputs.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);pinned.codeSha256=new Bun.CryptoHasher('sha256').update(JSON.stringify(codeInputs)).digest('hex');
const out=generateAccessPackage(req,pinned);if(out.outcome!=='candidate')throw new Error(JSON.stringify(out.diagnostics));
for(const file of out.files)await Bun.write(output+'/'+file.path,file.text);

await Bun.write(output+'/stage-one-request.json',JSON.stringify(req,null,2)+'\n');
