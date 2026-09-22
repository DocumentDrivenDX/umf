import {test,expect} from 'bun:test';
import {copyJson} from '../../src/model/json';
import {backend} from '../../native/postgresql/runtime';
import {inspectPostgresqlFacetPredicate as inspect} from '../../src/adapters/postgresql/facet-predicate';
const parse=(sql:string)=>backend.parse('SELECT '+sql);
test('closed predicate syntax retains exact bounds without claiming resolved enforcement',async()=>{
 const ast=await parse("value >= '-999.99'::numeric AND value <= 999.99 AND value = pg_catalog.trunc(value, 2)");
 const result=inspect(ast,'value');
 expect(result.state).toBe('candidate');expect(result.native).toEqual(copyJson(ast));
 expect(result.requires).toBe('catalog-resolution-and-enforcement-evidence');
 expect(result.candidates).toEqual([
  {kind:'bound',operator:'>=',literal:'-999.99',cast:'numeric'},
  {kind:'bound',operator:'<=',literal:'999.99'},
  {kind:'scale',functionName:['pg_catalog','trunc'],scale:'2'}]);
 for(const token of ['9223372036854775807','999999999999999999999999999999.999999999999999999','-128','0']){
  const r=inspect(await parse('value <= '+token),'value');expect(r.state).toBe('candidate');expect(r.candidates[0]).toMatchObject({literal:token});
 }
 for(const fn of ['char_length','pg_catalog.char_length','octet_length'])for(const max of ['0','2','2147483648']){
  const r=inspect(await parse(`${fn}(value) <= ${max}`),'value');expect(r.candidates).toEqual([{kind:'length',functionName:fn.split('.'),max}]);
 }
 expect(inspect(await parse('value = trunc(value, 0)'),'value').candidates).toEqual([{kind:'scale',functionName:['trunc'],scale:'0'}]);
});
test('lookalikes and extra syntax stay native; conjuncts never produce partial claims',async()=>{
 for(const sql of [
  'value >= 0 OR value <= 127','value >= 0 AND other <= 127','value::integer <= 127',
  'custom.char_length(value) <= 2','char_length(value COLLATE "C") <= 2',
  'char_length(DISTINCT value) <= 2','char_length(value) FILTER (WHERE true) <= 2',
  'char_length(value) OVER () <= 2','char_length(value ORDER BY value) <= 2',
  'value = custom.trunc(value, 2)','value = trunc(value, -1)','value = trunc(value, 1.5)',
  'value <= \'127\'','value <= \'NaN\'::numeric','value <= \'128\'::numeric(2,0)',
  'value <= 127::custom.numeric','value OPERATOR(custom.<=) 127',
  'char_length(value) <= -1','value >= 0 AND unknown(value)',
  'value <= 127 FROM anything','value <= 127 WHERE false','value <= 127 AS renamed',
  'value <= 127; SELECT 1','value <= 127 UNION SELECT true','value <= 1e2',
 ]){
  const ast=await parse(sql),r=inspect(ast,'value');expect(r.state,sql).toBe('unsupported');expect(r.candidates,sql).toEqual([]);expect(r.native).toEqual(copyJson(ast));
 }
});
test('unknown AST content, forged versions and unsafe objects are never interpreted',async()=>{
 const ast:any=await parse('value <= 127');
 for(const mutate of [
  (n:any)=>n.version=180000,
  (n:any)=>n.future={semantics:'unknown'},
  (n:any)=>n.stmts[0].stmt.SelectStmt.targetList[0].ResTarget.val.A_Expr.future=true,
 ]){const copy=structuredClone(ast);mutate(copy);const r=inspect(copy,'value');expect(r.state).toBe('unsupported');expect(r.native).toEqual(copy);}
 let calls=0;expect(()=>inspect({get version(){calls++;return 170004}},'value')).toThrow();expect(calls).toBe(0);
 const copy:any=structuredClone(ast);copy.stmts[0].stmt.SelectStmt.targetList[0].ResTarget.val.A_Expr.rexpr.A_Const.ival.ival=9007199254740992;
 expect(()=>inspect(copy,'value')).toThrow();expect(inspect(ast,'different').state).toBe('unsupported');
});
