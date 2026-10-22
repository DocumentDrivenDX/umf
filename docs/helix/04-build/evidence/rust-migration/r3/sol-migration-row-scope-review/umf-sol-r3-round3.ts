import {readFileSync,writeFileSync} from 'node:fs';
import {compileTableDeployment} from '/Users/erik/.codex/worktrees/rust-binding-spike/umf/src/table-deployment/index.ts';
import '/Users/erik/.codex/worktrees/rust-binding-spike/umf/scripts/codegen/entry.ts';
const root='/Users/erik/.codex/worktrees/rust-binding-spike/umf';
const b=JSON.parse(readFileSync(root+'/docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json','utf8')).cases;
const row=structuredClone(b.find((c:any)=>c.id==='row-scope/supplied-owner-via-group-batch').request);
const cases:any[]=[];
function add(id:string,request:any,operation='normalizeRowScope'){cases.push({id:'sol3_'+id,operation,request});}
for(const value of [0,null,{},false]){const r=structuredClone(row);r.input={owner_column:value,commands:['select'],batch:[]};add('owner_'+String(value===null?'null':typeof value),r);}
{const r=structuredClone(row);r.input={commands:['select'],batch:[],['\ud800']:{retained:true}};add('unknown_lone_surrogate',r);}
{const r=structuredClone(row);r.input={owner_column:'owner',commands:['select'],batch:[],groups:[{name:'reviewers',commands:['select']},{name:'reviewers',commands:['select']}]};add('identical_group_origins',r);}
{const r=structuredClone(row);r.input={owner_column:'owner',commands:['select'],batch:[],groups:[{name:'reviewers',commands:['select','select']}]};add('duplicate_group_command',r);}
const initial=structuredClone(b.find((c:any)=>c.id==='deployment/deterministic-group-map').request);
for(const [name,scalar,native,facets] of [['varchar','string',{kind:'varchar',length:20},undefined],['numeric','decimal',{kind:'numeric',precision:8,scale:2},{precision:8,scale:2}],['instant','timestamp',{kind:'timestamptz'},undefined],['binary','binary',{kind:'bytea'},undefined]] as any[]){
 const d=JSON.parse(initial.text),m=d.modules[0],t=m.extensions['umf.tables'].tables[0],r={module:'demo',element:'extra'};m.elements.push({id:'extra',kind:'field',scalarType:scalar,cardinality:'one',nullability:'absent-allowed',extensions:{},...(facets?{facets}:{})});m.elements.find((x:any)=>x.kind==='record').members.push(r);t.columns.push({field:r,name:'extra',nativeType:native});const prior=compileTableDeployment(initial),next=compileTableDeployment({...initial,text:JSON.stringify(d)});if(prior.status!=='compiled'||next.status!=='compiled')throw Error(name+' deployment failed '+JSON.stringify(next));
 add('append_'+name,{id:'migration-'+name,predecessor:{id:'old',digest:'1'.repeat(64)},previous:prior.bundle,next:next.bundle},'compileTableMigration');
}
const globals=globalThis as any;
for(const c of cases){const fn=c.operation==='normalizeRowScope'?globals.__umf_row_scope:globals.__umf_table_migrate;c.expected=JSON.parse(fn(JSON.stringify(c.request)));}
writeFileSync('/private/tmp/umf-sol-r3-round3.json',JSON.stringify({cases},null,2)+'\n');
console.log(cases.map(c=>({id:c.id,status:c.expected.result?.status,valid:c.expected.result?.valid,diagnostics:c.expected.result?.diagnostics})))
