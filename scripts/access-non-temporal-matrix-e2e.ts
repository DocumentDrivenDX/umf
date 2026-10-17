/** Real core oracle -> public CLI generator -> installed model/codec matrix.
 * @covers US-080-AC1 US-080-AC2 US-081-AC1 US-081-AC2 US-081-AC3
 */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readDocument,validateCoreFieldValue,validateCoreRecordValues} from '../src/index';
import {request,profile} from '../tests/compilation/access-fixtures';
import type {CoreLiteral} from '../src/model/schema-literals';
const args=new Map<string,string>();for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i]!,process.argv[i+1]!);
const python=args.get('--python'),wheel=args.get('--wheel'),report=args.get('--report');
if(!python||!wheel||!report)throw Error('Required --python --wheel --report');
const root=resolve(import.meta.dir,'..'),work=await mkdtemp('/private/tmp/umf-generated-matrix-'),commands:unknown[]=[];
async function execute(label:string,argv:string[]){const p=Bun.spawn(argv,{cwd:root,stdout:'pipe',stderr:'pipe'});const [exit,stdout,stderr]=await Promise.all([p.exited,new Response(p.stdout).text(),new Response(p.stderr).text()]);commands.push({label,argv,exit,stdout,stderr});assert.equal(exit,0,label+': '+stderr);return stdout;}
const sourceCorpus=await readFile(join(root,'fixtures/access/golden-vectors/core-carriers.json'),'utf8');
const corpus=JSON.parse(sourceCorpus) as {vectors:{id:string;field:Record<string,unknown>;extraFields?:Record<string,unknown>[];literal:unknown;expected:boolean}[]};
const elements:Record<string,unknown>[]=[],views:unknown[]=[],records:{module:string;element:string}[]=[],vectors:unknown[]=[],held:string[]=[];
const ref=(element:string)=>({module:'golden',element});
function viewField(field:Record<string,unknown>,nested=false){const nullable=field.nullability==='absent-allowed';return {field:ref(String(field.id)),row:{missing:nested?false:nullable,null:nullable},create:{missing:nested?false:nullable,null:nullable},mutable:!nested,generated:false};}
try{
 for(const [i,v] of corpus.vectors.entries()){
  if(['date','timestamp'].includes(String(v.field.scalarType))){held.push(v.id);continue;}
  const suffix=String(i).padStart(3,'0'),renames=new Map<string,string>([['value','value'+suffix],...(v.extraFields??[]).map(f=>[String(f.id),String(f.id)+suffix] as [string,string])]);
  const fields=JSON.parse(JSON.stringify([v.field,...(v.extraFields??[])])) as Record<string,unknown>[];
  function rename(value:unknown){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if((key==='id'||key==='element')&&typeof child==='string'&&renames.has(child))(value as Record<string,unknown>)[key]=renames.get(child);else rename(child);}}
  fields.forEach(rename);
  const key='identity'+suffix,record='Case'+suffix;
  const identity={id:key,kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}};
  const row={id:record,kind:'record',members:[ref(key),ref(String(fields[0]!.id))],keys:[{id:'key'+suffix,name:'Identity '+suffix,primary:true,fields:[ref(key)]}],extensions:{}};
  elements.push(identity,...fields,row);records.push(ref(record));
  views.push({record:ref(record),selectedKey:{...ref(record),key:'key'+suffix},fields:[{...viewField(identity),mutable:false},...fields.map((f,j)=>viewField(f,j>0))]});
  vectors.push({id:v.id,record,key,field:String(fields[0]!.id),literal:v.literal,expected:v.expected});
 }
 const evidenceFields=[{id:'evidenceId',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}},{id:'nullableItem',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}},{id:'nullableArray',kind:'field',cardinality:'array',itemType:ref('nullableItem'),nullability:'required',extensions:{}},{id:'nullableMap',kind:'field',cardinality:'map',itemType:ref('nullableItem'),nullability:'required',extensions:{}},{id:'defaulted',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',default:{on:'missing',value:{string:'native-default'}},extensions:{}}];
 elements.push(...evidenceFields,{id:'ContainerEvidence',kind:'record',members:['evidenceId','nullableArray','nullableMap','defaulted'].map(ref),keys:[{id:'evidenceKey',name:'Evidence',primary:true,fields:[ref('evidenceId')]}],extensions:{}});records.push(ref('ContainerEvidence'));
 views.push({record:ref('ContainerEvidence'),selectedKey:{...ref('ContainerEvidence'),key:'evidenceKey'},fields:[evidenceFields[0]!,evidenceFields[2]!,evidenceFields[3]!,evidenceFields[4]!,evidenceFields[1]!].map(f=>{const out=viewField(f,f.id==='nullableItem');if(f.id==='evidenceId')out.mutable=false;if(f.id==='defaulted')out.create.missing=true;return out;})});
 const document={umf:'0.8.0',id:'generated-golden-matrix',vocabularies:{'umf.access':{version:'0.1.0'}},modules:[{id:'golden',namespace:'golden',elements,extensions:{'umf.access':{views,columns:[],search:[],searchBindings:[]}}}]};
 const source=JSON.stringify(document),loaded=readDocument(source,'json');
 for(const vector of vectors as {id:string;record:string;field:string;literal:CoreLiteral;expected:boolean}[]){const field=validateCoreFieldValue(loaded,ref(vector.field),vector.literal);const row=validateCoreRecordValues(loaded,ref(vector.record),[{field:ref(vector.field),state:'present',value:vector.literal},{field:ref('identity'+vector.record.slice(4)),state:'present',value:{string:'oracle'}}]);assert.equal(field.valid,vector.expected,vector.id+' field');assert.equal(row.validation.valid,vector.expected,vector.id+' row');}
 const q=request();q.package='golden_matrix';q.records=records;q.sources=[{id:'logical',format:'json',text:source}];q.projections=[];q.names=[];
 const p=profile();p.python.version='3.14.8';p.dependencies=[{distribution:'umf_access',version:'0.1.0.dev0'},{distribution:'pydantic',version:'2.14.1'}];
 const req=join(work,'request.json'),prof=join(work,'profile.json'),output=join(work,'generated');await writeFile(req,JSON.stringify(q));await writeFile(prof,JSON.stringify(p));await writeFile(join(work,'vectors.json'),JSON.stringify(vectors));
 const cli=[process.execPath,join(root,'scripts/umf-access-generate.ts')],flags=['--request',req,'--profile',prof,'--output',output];
 await execute('real-cli-generate',[...cli,'generate',...flags]);await execute('real-cli-check-before',[...cli,'check',...flags]);
 const observed=JSON.parse(await execute('installed-generated-matrix',[python,'-I','-B',join(root,'python/umf_access/tests/generated_matrix_probe.py'),output,resolve(wheel),join(work,'vectors.json')]));
 await execute('real-cli-check-after',[...cli,'check',...flags]);
 await writeFile(report,JSON.stringify({status:'pass',scope:'non-temporal generated model/codec agreement and presence controls; no native backend or temporal qualification',work,wheelSha256:createHash('sha256').update(await readFile(wheel)).digest('hex'),corpusSha256:createHash('sha256').update(sourceCorpus).digest('hex'),sourceSha256:createHash('sha256').update(source).digest('hex'),heldTemporal:held,observed,commands},null,2)+'\n');
 console.log(JSON.stringify({status:'pass',report,count:observed.vectors.length,heldTemporal:held}));
}catch(error){await writeFile(report,JSON.stringify({status:'fail',work,commands,error:String(error)},null,2)+'\n');throw error;}
