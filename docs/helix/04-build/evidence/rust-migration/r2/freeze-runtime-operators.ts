// SPDX-License-Identifier: MIT OR Apache-2.0
// Independent retained-TypeScript interpreter oracle. Never loads Rust candidate code.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {executeConstraints} from '../../../../../../src/validation/constraint-kernel';
import {Registry} from '../../../../../../src/registry/registry';
const root=resolve(import.meta.dir,'../../../../../..'),sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const v=(name:string)=>({var:name}),op=(name:string,...args:any[])=>({op:name,args}),col=(name:string,input:any,value:any)=>({...op(name,input),as:'item',value});
const manifest={id:'sol.matrix',version:'1.0.0',coreVersion:'0.10.0',description:'Independent ordinary constraint-operator reference',schema:true,semantics:'Return fixed ordinary diagnostics',scopes:['document'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
const callbackDiagnostics=[{code:'U',path:'/a',message:'\uD800\uDC00',severity:'error'},{code:'A',path:'/b',message:'\uD800x',severity:'warning'}];
const registry=new Registry().register(manifest as any,()=>structuredClone(callbackDiagnostics) as any);
const document={vocabularies:{'sol.matrix':{version:'1.0.0'}}};
const external=(payloads:any)=>op('extension-errors',v('doc'),payloads,'document','',{undeclared:{code:'UNDECLARED',message:'undeclared',severity:'error'}});
const setup:any[]=[
 {op:'let',name:'ds',value:external({'sol.matrix':{}})},
 {op:'let',name:'d',value:op('get',v('ds'),[0])},
 {op:'let',name:'t',value:op('get',v('d'),['message'])},
 {op:'let',name:'empty',value:external({})},
 {op:'let',name:'mapped',value:col('map',v('ds'),v('item'))},
 {op:'let',name:'filtered',value:col('filter',v('ds'),true)},
 {op:'let',name:'texts',value:col('map',v('ds'),op('get',v('item'),['code']))},
 {op:'let',name:'indexed',value:col('index',v('ds'),op('get',v('item'),['code']))},
 {op:'let',name:'emptyMap',value:op('set')},
 {op:'let',name:'filledMap',value:op('set')},
 {op:'remember',set:v('filledMap'),key:'U',value:v('d')},
];
const inputs:[string,any][]=[['null',null],['false',false],['true',true],['zero',0],['one',1],['negative',-1],['emptyText',''],['zeroText','0'],['twoText','2'],['tenText','10'],['ordinaryText','U'],['bmpText','\uE000'],['astralText','\uD800\uDC00'],['isolatedText','\uD800'],['emptyArray',[]],['mixedArray',[null,1,'x']],['nestedArray',[[1],[2,null]]],['emptyObject',{}],['object',{'2':'two','1':'one',a:1}],['diagnostics',v('ds')],['diagnostic',v('d')],['originText',v('t')],['emptyDiagnostics',v('empty')],['mappedDiagnostics',v('mapped')],['filteredDiagnostics',v('filtered')],['mappedTexts',v('texts')],['indexed',v('indexed')],['emptyMap',v('emptyMap')],['filledMap',v('filledMap')]];
const arrays=inputs.filter(([name])=>['emptyArray','mixedArray','nestedArray','diagnostics','emptyDiagnostics','mappedDiagnostics','filteredDiagnostics','mappedTexts'].includes(name));
const cases:any[]=[];
function add(id:string,expression:any){
 const program={profile:'umf.constraints/1',steps:[...structuredClone(setup),{op:'let',name:'result',value:structuredClone(expression)},{op:'emit',diagnostic:{code:'CANONICAL',path:'',message:op('canonical',op('tuple',v('result'))),severity:'error'}},{op:'emit',diagnostic:{code:'STRING',path:'',message:op('concat',v('result')),severity:'error'}},{op:'emit',diagnostic:{code:'TRUTH',path:'',message:op('concat',op('not',v('result'))),severity:'error'}}]};
 let expected:any;try{expected={status:'diagnostics',diagnostics:executeConstraints(document as any,program,{},registry)}}catch(error:any){expected={status:'error',code:typeof error.code==='string'?error.code:null,name:error.name,message:String(error.message)}}
 cases.push({id,expression,expected});
}
for(const [name,x] of inputs){
 for(const operator of ['length','keys','values','entries','not','canonical','pointer'])add(operator+'/'+name,op(operator,x));
 add('concat/'+name,op('concat','prefix:',x,':suffix'));add('tuple/'+name,op('tuple',x,null,'end'));
 for(const path of [[],['length'],['code'],['message'],[0],[0,'code'],['missing'],['a']]){add('get/'+name+'/'+JSON.stringify(path),op('get',x,path));if(path.length)add('has/'+name+'/'+JSON.stringify(path),op('has',x,path));}
 if(name.endsWith('Object')||['object','diagnostic'].includes(name))add('without/'+name,op('without',x,['message','1']));
}
for(const [an,a]of inputs)for(const [bn,b]of inputs)for(const operator of ['eq','ne','lt','lte','gt','gte'])add(operator+'/'+an+'/'+bn,op(operator,a,b));
for(const [name,a]of arrays){
 add('sort/'+name,op('sort',a));add('flatten/'+name,op('flatten',a));add('flatten-wrapper/'+name,op('flatten',[a]));
 for(const operator of ['map','filter','find','some','every','index']){add(operator+'-identity/'+name,col(operator,a,v('item')));add(operator+'-true/'+name,col(operator,a,true));}
 for(const [label,x] of inputs)add('in/'+label+'/'+name,op('in',x,a));
}
for(const [name,map]of [['indexed',v('indexed')],['emptyMap',v('emptyMap')],['filledMap',v('filledMap')]] as const)for(const [label,x]of inputs){add('in/'+label+'/'+name,op('in',x,map));add('lookup/'+label+'/'+name,op('lookup',map,x));}
const files=['src/validation/constraint-kernel.ts','src/validation/constraint-language.ts','src/validation/json-equality.ts','src/validation/current-policy.ts','src/validation/literal-kernel.ts','src/validation/literal-policy.ts','src/registry/registry.ts','src/model/json.ts','src/model/types.ts','src/model/errors.ts'];
const sources=Object.fromEntries(files.map(path=>[path,sha(readFileSync(resolve(root,path)))]));
const record={profile:'umf.sol-retained-ts-runtime-operators/1',qualification:'Exact retained TypeScript interpreter outcomes on small ordinary admitted values. Callback text is represented as native JavaScript UTF-16; separate Python-origin controls remain mandatory. No Rust candidate participates in generation.',generatorSha256:sha(readFileSync(import.meta.path)),reference:{runtime:Bun.version,executable:process.execPath,executableSha256:sha(readFileSync(process.execPath)),sources},manifest,callbackDiagnostics,document,policy:{},setup,cases};
const path=resolve(import.meta.dir,'sol-runtime-operators-predecessor.json');writeFileSync(path,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({path,sha256:sha(readFileSync(path)),cases:cases.length,errorCases:cases.filter(c=>c.expected.status==='error').map(c=>c.id)}));
