import {CURRENT_CORE_VERSION} from '../../../src/generated/core-model';
import {evaluateProtectionValue,inspectProtectionFunction,inspectProtectionCatalog,parseGregorianDate,truncateGregorianDate} from '../../../src/index';
import packet from './functions-fixtures.json';
const clone=(x:any)=>structuredClone(x);
export function makeFixture(c:any){
 const ref=(id:string)=>({documentId:'oracle-domains',moduleId:'m',elementId:id});
 const fields=[{...clone(c.inputDomain),id:'input'},{...clone(c.outputDomain),id:'output'},{id:'record',kind:'record',extensions:{}}];
 const parameters=c.parameters.map((p:any,i:number)=>{const id='parameter-'+i;fields.push({...clone(p.domain),id});return {name:p.name,field:ref(id),value:clone(p.value)};});
 const transform:any={id:'transform',version:'1',kind:c.kind,inputDomain:ref('input'),outputDomain:ref('output'),determinism:c.determinism,reversibility:c.reversibility,parameters,disclosureProfile:[],queryUse:{}};
 if(Object.hasOwn(c,'function'))transform.function=c.function;
 for(const name of ['custody','reverseAction','algorithm','saltCustody'])if(Object.hasOwn(c,name))transform[name]=clone(c[name]);
 if(c.disclosureProfile)transform.disclosureProfile=clone(c.disclosureProfile);
 const catalog={vocabulary:'umf.security.protection',version:'0.1.0',id:'oracle-catalog',revision:'c1',transforms:[transform],native:{opaque:'preserve\r\n😀'}};
 const policy={vocabulary:'umf.security',version:'0.2.0',id:'oracle-policy',revision:'p1',ontology:{documentId:'ontology',revision:'o1'},protection:{id:catalog.id,revision:catalog.revision},rules:[{id:'r',effect:'permit',actions:['read'],target:[ref('record')],condition:{op:'literal',value:true},disclosure:[{field:ref('input'),disposition:{kind:'transformed',vocabulary:'umf.security.protection',transform:'transform',version:'1',field:ref('output')}}]}]};
 if(c.fieldSubstitution){const sub=c.fieldSubstitution;fields.push({...clone(sub.domain),id:'other'});if(sub.side==='input')policy.rules[0]!.disclosure[0]!.field=ref('other');else policy.rules[0]!.disclosure[0]!.disposition.field=ref('other');}
 const document={umf:CURRENT_CORE_VERSION,id:'oracle-domains',vocabularies:{},modules:[{id:'m',namespace:'',elements:fields}]};
 const closure={pins:[{documentId:document.id,revision:'d1'}],documents:[{revision:'d1',document}]};
 const selection:any={ruleIndex:0,disclosureIndex:0};if(Object.hasOwn(c,'input'))selection.value=clone(c.input);
 return {policy,catalog,closure,selection};
}
export async function runOracle(){
 const rows:any[]=[];
 for(const c of packet.cases){
  const f=makeFixture(c),before=JSON.stringify(f),r=evaluateProtectionValue(f.policy,f.catalog,f.closure,f.selection);
  const expected=c.expected as any,wire=inspectProtectionCatalog(f.catalog);
  const extra=(expected.wireValid!==true||wire.valid)&&(expected.errorCode===undefined||r.diagnostics.some(d=>d.severity==='error'&&d.code===expected.errorCode&&d.message.includes(expected.errorContains)));
  const pass=extra&&(expected.status==='evaluated'?r.status==='transformed'&&JSON.stringify(r.value)===JSON.stringify(expected.value):r.status==='refused'&&r.value===null)&&r.complete===false&&r.authority===false&&Object.isFrozen(r)&&JSON.stringify(f)===before;
  rows.push({id:c.id,pass,expected,actual:{status:r.status,value:r.value,...(expected.wireValid?{wireValid:wire.valid}:{})},...(pass?{}:{diagnostics:r.diagnostics.filter(d=>d.severity==='error')})});
 }
 let joined='';let n=0;
 const leap=(y:number)=>y%4===0&&(y%100!==0||y%400===0);
 for(let y=1600;y<2000;y++)for(let m=1;m<=12;m++)for(let d=1;d<=[31,leap(y)?29:28,31,30,31,30,31,31,30,31,30,31][m-1]!;d++){
  const token=String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  const parsed=parseGregorianDate(token);if(parsed.originalText!==token||parsed.year!==y||parsed.month!==m||parsed.day!==d||!Object.isFrozen(parsed))throw new Error('parse mismatch');
  joined+=[token,...['year','quarter','month','day'].map(u=>truncateGregorianDate(token,u))].join('|')+'\n';n++;
 }
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(joined)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 rows.push({id:'date-400-year-digest',pass:n===packet.calendarDigest.days&&digest===packet.calendarDigest.sha256,actual:{days:n,sha256:digest},expected:packet.calendarDigest});
 return {rows,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass),calendarDigest:digest};
}
