/** Declaration-shape experiment only. No policy evaluation or native admission. */
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, realpathSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const schemaPath='docs/helix/02-design/spikes/security/record-homes-v0.1.schema.json';
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
function inventory(){
 const files=new Set<string>(), packages:Record<string,{name:string,version:string}>={}, pending=[realpathSync(fileURLToPath(import.meta.resolve('ajv/package.json'))).replace(/\/package\.json$/,'')];
 while(pending.length){const dir=pending.pop()!;if(packages[dir])continue;
  const manifest=JSON.parse(readFileSync(dir+'/package.json','utf8'));packages[dir]={name:manifest.name,version:manifest.version};
  const walk=(base:string)=>{for(const e of readdirSync(base,{withFileTypes:true})){if(e.name==='node_modules')continue;const path=base+'/'+e.name;if(e.isDirectory())walk(path);else if(e.isFile())files.add(realpathSync(path));else throw Error('Unexpected dependency file kind: '+path);}};walk(dir);
  for(const name of Object.keys(manifest.dependencies??{}))pending.push(realpathSync(Bun.resolveSync(name+'/package.json',dir)).replace(/\/package\.json$/,''));
 }
 return {packages,files:[...files].sort(),entry:realpathSync(fileURLToPath(import.meta.resolve('ajv/dist/2020.js')))};
}
const dependencyInventory=inventory();
const paths=[import.meta.path,schemaPath,'docs/helix/02-design/spikes/SPIKE-010-security-result-coverage.md','spec/core/schema-properties-document.schema.json',realpathSync(process.execPath),...dependencyInventory.files].sort();
const frozen=new Map(paths.map(p=>[p,readFileSync(p)]));
const pins=Object.fromEntries([...frozen].map(([p,b])=>[p,hash(b)]));
const capturedJson=(path:string)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(frozen.get(path)!));
const schema=capturedJson(schemaPath);
const {default:Ajv2020}=await import(dependencyInventory.entry);
const validate=new Ajv2020({strict:true,allErrors:true}).compile(schema);
const treeClone=(v:any)=>JSON.parse(JSON.stringify(v));
const ref=(element:string)=>({documentId:'shape-fixture',revision:'illustrative-only',module:'records',element});
const codec={string:'weft.security.pg-text-c-utf8/0.1.0',boolean:'weft.security.pg-bool/0.1.0',integer:'weft.security.pg-int8-lexical/0.1.0'};
const field=(name:string,type:keyof typeof codec='string')=>({field:ref(name),column:name,codec:codec[type],sourceDomain:{scalarType:type,cardinality:'one',nullability:'required',facets:type==='integer'?{integerWidth:{bits:64,signed:true}}:{},allowedValues:null}});
const source=(name:string)=>({schema:'public',name,kind:'table',discriminator:null});
const employee={type:ref('Staff'),source:source('employee'),key:{id:'employee-key',fields:[ref('staffId')]},fields:[field('staffId'),field('salary','integer')],endpoints:[]};
const project={type:ref('Project'),source:source('project'),key:{id:'project-key',fields:[ref('projectId')]},fields:[field('projectId')],endpoints:[]};
const membership={type:ref('StaffProject'),source:source('m2m_employee_project'),key:{id:'membership-key',fields:[ref('memberStaff'),ref('memberProject')]},fields:[field('memberStaff'),field('memberProject'),field('active','boolean')],endpoints:[{role:'staff',target:ref('Staff'),targetKeyId:'employee-key',fields:[ref('memberStaff')]},{role:'project',target:ref('Project'),targetKeyId:'project-key',fields:[ref('memberProject')]}]};
const fixture={version:'weft.security.record-homes/0.1.0',selection:{backendId:'shape-only-pg',backendVersion:'0.1.0',targetProfile:'illustrative-pg17.9'},nativeSemantics:{encoding:'UTF8',textCollation:'C'},modelPins:[{documentId:'shape-fixture',revision:'illustrative-only',umfVersion:'0.8.0',sha256:'0'.repeat(64)}],subject:{type:ref('Staff'),mechanism:'weft.security.pg-session-user/0.1.0',login:{column:'login',codec:codec.string}},types:[employee,project,membership],queryCarriers:[{type:employee.type,source:employee.source,fields:employee.fields}],context:[]};
const observations:any[]=[];
function check(name:string,expected:boolean,value:any,layer='shape',remaining?:string){const actual=!!validate(value);observations.push({name,layer,expected,actual,remaining:remaining??null,errors:actual?[]:structuredClone(validate.errors),inputSha256:hash(JSON.stringify(value))});if(actual!==expected)throw Error(name+': unexpected schema result '+JSON.stringify(validate.errors));}
function mutate(name:string,fn:(v:any)=>void,expected=false,remaining?:string){const v=treeClone(fixture);fn(v);check(name,expected,v,remaining?'schema-valid-but-unqualified':'shape',remaining);}
check('raw-relational-natural-composite-key',true,fixture);
mutate('typed-view-homes',v=>{for(const t of v.types)t.source={...t.source,kind:'view',name:'typed_'+t.source.name};v.queryCarriers[0].source=v.types[0].source;},true);
mutate('same-type-authoritative-and-carrier-source-reuse',()=>{},true);
mutate('distinct-type-shared-relation-partitions',v=>{for(const [i,t] of v.types.entries())t.source={schema:'graph',name:'nodes',kind:'table',discriminator:{column:'type_tag',codec:codec.string,literal:{string:String(i)}}};v.queryCarriers[0].source=v.types[0].source;},true);
// Exercise every concrete typed object in the admitted fixture, not just roots.
const objectPaths:(string|number)[][]=[];
function collect(v:any,p:(string|number)[]=[]){if(v&&typeof v==='object'){if(!Array.isArray(v))objectPaths.push(p);for(const [k,x] of Object.entries(v))collect(x,[...p,Array.isArray(v)?Number(k):k]);}}
collect(fixture);
const at=(v:any,p:(string|number)[])=>p.reduce((x,k)=>x[k],v);
for(const p of objectPaths){const label=p.join('/')||'root';mutate('unknown-member/'+label,v=>{at(v,p).__unknown=true;});if(!p.length)check('positional-object/root',false,[]);else mutate('positional-object/'+label,v=>{at(v,p.slice(0,-1))[p.at(-1)!]=[];});for(const k of Object.keys(at(fixture,p)))mutate('missing/'+label+'/'+k,v=>{delete at(v,p)[k];});}
mutate('unknown-version',v=>v.version='weft.security.query-homes/0.1.0');
mutate('unknown-codec',v=>v.types[0].fields[0].codec='text');
mutate('codec-domain-mismatch',v=>v.types[0].fields[0].sourceDomain.scalarType='boolean');
mutate('optional-column',v=>v.types[0].fields[0].sourceDomain.nullability='optional');
mutate('caller-sql',v=>v.types[0].source.sql='select * from employee');
mutate('unknown-context-provider',v=>v.context=[{provider:'caller-guc'}]);
mutate('non-C-collation',v=>v.nativeSemantics.textCollation='en_US');
mutate('NUL-identifier',v=>v.types[0].source.name='x\0y');
for(const token of ['-0','1e0','1.0'])mutate('noncanonical-discriminator/'+token,v=>v.types[0].source.discriminator={column:'tag',codec:codec.integer,literal:{integerToken:token}});
// Schema acceptance is deliberately not owner semantic or native acceptance.
mutate('foreign-revision',v=>v.types[0].key.fields[0].revision='other',true,'Owner must resolve full qualified selected Key correspondence.');
mutate('reversed-composite-key',v=>v.types[2].key.fields.reverse(),true,'Owner must compare actual selected Key order.');
mutate('wrong-endpoint-target',v=>v.types[2].endpoints[0].target=ref('Project'),true,'Owner must compare actual role, target, Key and paired domains.');
mutate('duplicate-field',v=>v.types[0].fields.push(v.types[0].fields[0]),true,'Owner must enforce field/column identity uniqueness.');
mutate('duplicate-carrier',v=>v.queryCarriers.push(v.queryCarriers[0]),true,'Owner must enforce one declaration per type while retaining actual scans.');
mutate('64-byte-16-character-identifier',v=>v.types[0].source.name='😀'.repeat(16),true,'Owner UTF8 byte check must refuse 64 bytes.');
mutate('logical-string-NUL-allowed-value',v=>v.types[0].fields[0].sourceDomain.allowedValues=[{string:'x\0y'}],true,'Logical domain is retained; selected native image must explicitly refuse NUL.');
mutate('out-of-int64-discriminator',v=>v.types[0].source.discriminator={column:'tag',codec:codec.integer,literal:{integerToken:'9223372036854775808'}},true,'Exact owner integer range check must refuse.');
mutate('incoherent-length-refinement',v=>v.types[0].fields[0].sourceDomain.facets={length:{unit:'unicode-scalar',min:9,max:2}},true,'Owner must validate interpreted refinement coherence.');
mutate('hostile-identifier-content',v=>v.types[0].source.name='employee"; DROP TABLE employee; --',true,'Renderer must quote literal identifier components; native meaning remains unqualified.');
const literalSchema=capturedJson('spec/core/schema-properties-document.schema.json');
for(const [name,key] of [['textLiteral','string'],['boolLiteral','boolean'],['integerLiteral','integerToken']]){const original=literalSchema.$defs.literal.oneOf.find((v:any)=>v.required?.includes(key));if(JSON.stringify(schema.$defs[name])!==JSON.stringify(original))throw Error('Core literal drift: '+name);}
if(JSON.stringify(inventory())!==JSON.stringify(dependencyInventory))throw Error('Dependency inventory changed');
for(const p of paths)if(hash(readFileSync(p))!==pins[p])throw Error('Source changed during execution: '+p);
const receipt={status:'shape-experiment-passed',scope:'JSON Schema declaration shape only; illustrative pins do not represent an owner model or native source',runtime:{bun:Bun.version,executable:realpathSync(process.execPath)},dependencyInventory,sourceDigests:pins,sourcesUnchanged:true,nativeImplementationQualified:false,ownerBindingInterpreterQualifiedByThisProbe:false,acceptanceCasesPromoted:[],acceptanceCriteria:['US-056-AC6','US-056-AC7'],observations,observationCount:observations.length,schemaValidUnqualifiedCount:observations.filter(x=>x.layer==='schema-valid-but-unqualified').length};
writeFileSync('docs/helix/04-build/evidence/security/record-home-shape-execution.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,observations:receipt.observationCount,schemaValidUnqualified:receipt.schemaValidUnqualifiedCount}));
