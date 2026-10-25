import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const packetPath=new URL('frozen-typescript.json',import.meta.url);
const packet=JSON.parse(readFileSync(packetPath,'utf8'));
const oraclePath='/private/tmp/umf-record-review-cases.json';
const oracleBytes=readFileSync(oraclePath);
const vectors=JSON.parse(oracleBytes.toString());
packet.cases=packet.cases.filter((c:any)=>c.id!=='sol-deep-output-limit');
for (const v of vectors) {
  if (v.name==='deep-output-limit') {
    let node=v.source['x-deep'],depth=0;
    while (node && typeof node==='object' && !Array.isArray(node) && Object.hasOwn(node,'x')) {depth++;node=node.x;}
    packet.depthCase={id:'sol-deep-output-limit',depth,expectedError:v.error};
    continue;
  }
  if (packet.cases.some((c:any)=>c.id===`sol-${v.name}`)) continue;
  packet.cases.push(v.error
    ? {id:`sol-${v.name}`,source:v.source,identity:v.identity,values:v.values,thrown:{code:v.error.code,path:v.error.path,message:v.error.message}}
    : {id:`sol-${v.name}`,source:v.source,identity:v.identity,values:v.values,result:v.expected});
}
const fixtureCase=vectors.find((v:any)=>v.name==='null-record-identity');
const addOnce=(name:string,identity:any,values:any,code:string,path:string,message:string)=>{
  const id=`sol-${name}`;
  if (!packet.cases.some((c:any)=>c.id===id)) packet.cases.push({id,source:fixtureCase.source,identity,values,thrown:{code,path,message}});
};
addOnce('array-record-identity',[],[],'CORE_SCHEMA_PROPERTIES','/identity','Expected object');
addOnce('raw-identity-tilde',{module:'fixture',element:'item','x~y':true},[],'CORE_SCHEMA_PROPERTY_UNKNOWN','/identity/x~y','Unknown relevant qualifier: x~y');
addOnce('raw-state-slash',{module:'fixture',element:'item'},[{field:{module:'fixture',element:'label'},state:'absent','x/y':true}],'CORE_SCHEMA_PROPERTY_UNKNOWN','/values/0/x/y','Unknown relevant qualifier: x/y');
packet.capture.solReviewCasesSha256=createHash('sha256').update(oracleBytes).digest('hex');
packet.largeCase={id:'sol-large-duplicate-absent',count:15000,expectedError:{code:'LIMIT',path:'/validation/diagnostics/4989/message',message:'JSON structural limit exceeded'}};
writeFileSync(packetPath,JSON.stringify(packet,null,2)+'\n');
