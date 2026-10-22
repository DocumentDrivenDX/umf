// SPDX-License-Identifier: MIT OR Apache-2.0
// New immutable predecessor controls. Refuse to refresh existing expectations.
import {generateAccessPackage} from '../../../../../../../src/compilation';
import {diffAccessPackages} from '../../../../../../../src/compilation/admission';
import {request,profile} from '../../../../../../../tests/compilation/access-fixtures';
import {writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const out=import.meta.dir+'/frozen.json';if(await Bun.file(out).exists())throw Error('Refusing to refresh frozen expectations');
const cases:any[]=[]; const packages:Record<string,any>={};
const add=(id:string,fn:(q:any,d:any)=>void=()=>{},fixture='engine-only')=>{const q=request();const d=JSON.parse(readFileSync(import.meta.dir+'/../../../../../../../fixtures/access/commerce/'+fixture+'.json','utf8'));fn(q,d);q.sources[0].text=JSON.stringify(d);const p=profile();const r=generateAccessPackage(q,p);packages[id]=r;cases.push({id,operation:'generateAccessPackage',request:{request:q,profile:p},expected:{ok:true,result:r}});};
add('base');
add('allowed-values',(q,d)=>{d.modules[0].elements.find((f:any)=>f.id==='memo').allowedValues=[{string:'a'},{string:'b'}];});
add('default-value',(q,d)=>{d.modules[0].elements.find((f:any)=>f.id==='memo').default={on:'missing',value:{string:'memo'}};});
add('selected-alternate',(q,d)=>{d.modules[0].elements.find((f:any)=>f.id==='Order').keys.push({id:'HTTP-id',name:'Alternate',fields:[{module:'commerce',element:'revision'}],primary:false});d.modules[0].extensions['umf.access'].views[0].selectedKey.key='HTTP-id';});
add('names',(q,d)=>{q.names=[{sourceId:'logical',pointer:'/modules/0/elements/0',python:'renamed_id'},{sourceId:'logical',pointer:'/modules/0/elements/5',python:'Purchase'}];});
add('containers',()=>{},'containers');
add('nested-domain',(q,d)=>{d.modules[0].elements.find((f:any)=>f.id==='tagItem').allowedValues=[{string:'red'},{string:'blue'}];},'containers');
add('presence-conflict',(q,d)=>{d.modules[0].extensions['umf.access'].views[0].fields[0].row.null=true;});
add('unknown-facet',(q,d)=>{d.modules[0].elements.find((f:any)=>f.id==='amount').facets.future='retained';});
add('unknown-view',(q,d)=>{d.modules[0].extensions['umf.access'].views[0].future=true;});
for(const [a,b] of [['base','allowed-values'],['base','default-value'],['base','selected-alternate'],['base','names'],['containers','nested-domain'],['base','base'],['containers','containers']])cases.push({id:`diff-${a}-${b}`,operation:'diffAccessPackages',request:{before:packages[a],after:packages[b]},expected:{ok:true,result:diffAccessPackages(packages[a],packages[b])}});
const value=JSON.stringify({format:'umf-r3-generation-review/1',cases},null,2)+'\n';await writeFile(out,value);await writeFile(import.meta.dir+'/receipt.json',JSON.stringify({frozenSha256:createHash('sha256').update(value).digest('hex'),scope:'Pre-fix full original TypeScript output; allowed/default/nested/key/name and access refusal controls'},null,2)+'\n');console.log(cases.map(c=>[c.id,c.expected.result.outcome??'diff']));
