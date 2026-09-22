import {test,expect} from 'bun:test';
import {parseNativeJson} from '../../src/model/native-json';
import {importSqlServerCatalog,exportSqlServerCatalog} from '../../src/adapters/sqlserver';
import {inspectSqlServerFacetConstraints as inspect} from '../../src/adapters/sqlserver/facet-constraints';
const proof=await Bun.file('fixtures/validation/facets-sqlserver-discovery-native.json').json();
const source=JSON.parse(proof.sourceText);
function sample(name:string,edit?:(table:any,root:any)=>void){const root=structuredClone(source),index=root.tables.findIndex((t:any)=>t.name===name);if(edit)edit(root.tables[index],root);return {document:importSqlServerCatalog(JSON.stringify(root),{id:'facet-constraints'}),path:`/tables/${index}/columns/0`};}
function observation(name:string,edit?:(table:any,root:any)=>void){const s=sample(name,edit);return inspect(s.document,s.path).observations[0]!;}
test('captured CHECKs yield scoped native facts without changing source or asserting core facets',()=>{
 const document=importSqlServerCatalog(proof.sourceText,{id:'facet-constraints'}),before=exportSqlServerCatalog(document);let interpreted=0,residual=0;
 for(const [i,t] of source.tables.entries())for(const [j] of t.columns.entries()){
  const r=inspect(document,`/tables/${i}/columns/${j}`);expect(r.complete).toBe(false);expect(r.sourceAuthenticity).toBe('unverified');expect(r.checksAvailable).toBe(true);
  for(const o of r.observations){if(o.state==='interpreted')interpreted++;else residual++;expect(o.native).toEqual(parseNativeJson(JSON.stringify(t.checks[0])));}
 }
 expect({interpreted,residual}).toEqual({interpreted:6,residual:5});expect(exportSqlServerCatalog(document)).toBe(before);
 expect(observation('signed8')).toMatchObject({state:'interpreted',scope:'stored-and-ordinary-checked-write-non-null',facts:[{kind:'integer-bound',operator:'>=',literal:'-128'},{kind:'integer-bound',operator:'<=',literal:'127'}]});
 expect(observation('bytes_bound').facts).toEqual([{kind:'binary-byte-bound',maximum:'2'}]);
 expect(observation('length_zero')).toMatchObject({state:'residual',facts:[]});
 expect(observation('decimal_checked').facts).toEqual([{kind:'decimal-stored-scale',scale:'2',inputExactness:false}]);
},20000);
test('disabled, untrusted and replication checks cannot become unconditional guarantees',()=>{
 expect(observation('disabled')).toMatchObject({state:'residual',facts:[]});
 for(const name of ['untrusted','replica_value'])expect(observation(name)).toMatchObject({state:'interpreted',scope:'ordinary-checked-write-non-null'});
 for(const name of ['length_len','length_sentinel','custom'])expect(observation(name)).toMatchObject({state:'residual',facts:[]});
});
test('missing inventory, column association, type and version are explicit',()=>{
 const missing=sample('signed8',(t,r)=>{r.profile='sqlserver-catalog-v1';delete t.checks;});expect(inspect(missing.document,missing.path)).toMatchObject({checksAvailable:false,complete:false,observations:[]});
 for(const parent of [0,2])expect(observation('signed8',t=>{t.checks[0].parent_column_id=parent;})).toMatchObject({state:'residual',facts:[]});
 for(const change of [(t:any)=>{t.columns[0].is_computed=true;},(t:any,r:any)=>{r.serverVersion='16.0.9999.9';},(t:any,r:any)=>{r.state='modified';},(t:any,r:any)=>{r.profile='sqlserver-catalog-v2';}])expect(observation('signed8',change).state).toBe('residual');
 expect(observation('signed8',t=>{t.checks[0].definition='[value]>=0 AND [other]<=255';}).state).toBe('residual');
 expect(observation('signed8',t=>{t.checks[0].definition='[value]>=0 AND len([value])<=2';})).toMatchObject({state:'residual',facts:[]});
 expect(observation('decimal_checked',t=>{t.checks[0].definition='[value]=round([value],1,1)';}).state).toBe('residual');
 const future=sample('signed8',(_t,r)=>{r.serverVersion='17.0';});expect(inspect(future.document,future.path).type.state).toBe('unsupported');
});
test('exact native numeric tokens and future fields survive; unsafe IDs and getters refuse',()=>{
 const s=sample('signed8',t=>{t.checks[0].future={unknown:'retain'};t.checks[0].definition='[value]<=9223372036854775807';});
 const r=inspect(s.document,s.path).observations[0]!;expect(r.facts).toEqual([{kind:'integer-bound',operator:'<=',literal:'9223372036854775807'}]);expect(JSON.stringify(r.native)).toContain('retain');
 const native=(s.document.extensions!['umf.sqlserver'] as any).root.members.tables.items[Number(s.path.split('/')[2])].members.checks.items[0];native.members.parent_column_id={kind:'number',value:'1.00000000000000001'};expect(()=>inspect(s.document,s.path)).toThrow();
 let calls=0;expect(()=>inspect({get umf(){calls++;return '0.1.0';}} as any,'/tables/0/columns/0')).toThrow();expect(calls).toBe(0);
 const clean=sample('signed8');expect(()=>inspect(clean.document,'/tables/999/columns/0')).toThrow();
});

test('scope boundaries agree with pinned independent native value probes',()=>{
 const result=(id:string)=>proof.cases.find((r:any)=>r.id===id).actual;
 for(const name of ['signed8','unsigned16']){expect(result(name+'-min').error).toBe(0);expect(result(name+'-max').error).toBe(0);expect(result(name+'-below').error).toBe(547);expect(result(name+'-above').error).toBe(547);}
 expect(result('bytes-nul').value).toBe('0000');expect(result('bytes-overflow').error).toBe(547);
 expect(result('untrusted-existing').value).toBe('256');expect(result('untrusted-new-rejects').error).toBe(547);
 expect(result('disabled-accepts').value).toBe('256');expect(result('replication-ordinary-rejects').error).toBe(547);
 expect(result('decimal-checked-still-rounds').value).toBe('1.24');
});
