/** Host-only full-commerce fixture builder; no native execution or release acceptance. */
import {generateAccessPackage} from "../../../../../src/compilation/index.ts";
import {request,profile} from "../../../../../tests/compilation/access-fixtures.ts";
import runtime from "../../../../../python/umf_access/compatibility-profile.json";
import {createHash} from "node:crypto";
import {readFileSync,readdirSync,mkdirSync,existsSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
const root=resolve(import.meta.dir,"../../../../..")+"/";
const destination=process.argv[2];
if(!destination)throw new Error("Supply an explicit empty output directory");
const dest=resolve(destination)+"/";
if(existsSync(dest)&&readdirSync(dest).length)throw new Error("Output directory must be empty");
function sources(path:string):string[]{return readdirSync(root+path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?sources(path+"/"+e.name):e.name.endsWith(".ts")?[path+"/"+e.name]:[]);}
const sourceHashes=Object.fromEntries(sources("src/compilation").sort().map(p=>[p,createHash("sha256").update(readFileSync(root+p)).digest("hex")]));
const q=request();q.package="commerce";q.records=[{module:"commerce",element:"Customer"},{module:"commerce",element:"Order"},{module:"commerce",element:"OrderLine"}];
q.projections=[
 {name:"orderSummary",record:{module:"commerce",element:"Order"},fields:[{module:"commerce",element:"orderId"},{module:"commerce",element:"amount"}]},
 {name:"orderIdentity",record:{module:"commerce",element:"Order"},fields:[{module:"commerce",element:"orderId"}]},
 {name:"customerSummary",record:{module:"commerce",element:"Customer"},fields:[{module:"commerce",element:"customerId"},{module:"commerce",element:"name"}]},
];q.names=[{sourceId:"logical",pointer:"/modules/0/elements/0",python:"order_id"},{sourceId:"logical",pointer:"/modules/0/elements/3",python:"placed_at"}];
q.actions=[{module:"commerce",action:"shipOrder"}];
const doc=JSON.parse(q.sources[0]!.text);doc.vocabularies["umf.actions"]={version:"0.1.0"};doc.modules[0].extensions["umf.actions"]={actions:[{id:"shipOrder",name:"Ship order",description:"Typed action fixture; no executor qualification",parameters:[{id:"order",kind:"entity",target:{module:"commerce",element:"Order",key:"order-key"},required:true},{id:"memo",kind:"value",field:{module:"commerce",element:"memo"},required:false}],outputs:[{id:"amount",kind:"value",field:{module:"commerce",element:"amount"},required:true}],preconditions:[],postconditions:[],reads:[],writes:[],binding:{kind:"handler",profile:{id:"test-handler-profile",version:"1"},handler:{id:"test-ship",version:"1"}},failures:[{code:"NOT_READY",message:"Not ready",retryable:false}],authorization:{kind:"roles",profile:{id:"umf.actions.roles",version:"1"},roles:["shipper"]},attribution:{subject:"person-required"},atomicity:"single-store",idempotency:"caller-key-optional",result:{identities:"created-and-changed",version:"store-opaque",receipt:"read-at-least"}}]};q.sources[0]!.text=JSON.stringify(doc);
const p=profile();p.python.version=runtime.python;p.dependencies=[{distribution:runtime.runtimeAbi.distribution,version:runtime.runtimeAbi.version},{distribution:"pydantic",version:runtime.runtimeDependencies.pydantic}];p.codeSha256=createHash("sha256").update(JSON.stringify(sourceHashes)).digest("hex");
const result=generateAccessPackage(q,p);if(result.outcome!=="candidate")throw new Error(JSON.stringify(result.diagnostics));
const after=Object.fromEntries(sources("src/compilation").sort().map(p=>[p,createHash("sha256").update(readFileSync(root+p)).digest("hex")]));
if(JSON.stringify(sourceHashes)!==JSON.stringify(after))throw new Error("Generator source changed during fixture generation");
mkdirSync(dest,{recursive:true});
for(const f of result.files){
 const target=resolve(dest,f.path);
 if(!target.startsWith(dest))throw new Error("Generated path escapes output root");
 mkdirSync(resolve(target,".."),{recursive:true});
 writeFileSync(target,f.text);
}
await Bun.write(dest+"probe-input.json",JSON.stringify({request:q,profile:p,sourceHashes}));await Bun.write(dest+"probe-result.json",JSON.stringify(result));console.log(JSON.stringify({outcome:result.outcome,runtimeAbi:result.runtimeAbi,inputDigest:result.inputDigest}));
