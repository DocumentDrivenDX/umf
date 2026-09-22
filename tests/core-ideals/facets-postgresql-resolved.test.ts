import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import datums from '../../fixtures/validation/facets-postgresql-resolved-native.json';
import evidence from '../../fixtures/validation/facets-postgresql-constraints-native.json';
import {inspectResolvedFacetPredicate as inspect} from '../../src/adapters/postgresql/facet-resolved-predicate';
import {readFacetNodeTree,decodeFacetConstant,type PgFacetNode} from '../../src/adapters/postgresql/facet-node-tree';
const profile={serverVersion:170004,encoding:'UTF8',datumFormat:'little-endian-datum64'};
const row=(name:string)=>evidence.capture.constraints.find(c=>c.relation===name)!;
test('complete resolved expressions yield exact predicates and explicit value scope',()=>{
 for(const c of evidence.capture.constraints){const r=inspect(c,profile);expect(r.state,c.relation).toBe(c.schema==='facet_shadow'?'unsupported':'verified-expression');expect(r.native).toEqual(c);expect(r.requires).toBe('retained-catalog-correspondence-and-projection-scope');}
 expect(inspect(row('decimal_exact'),profile).terms).toEqual([{kind:'bound',operator:'>=',literal:'-999.99'},{kind:'bound',operator:'<=',literal:'999.99'},{kind:'scale',scale:'2'}]);
 expect(inspect(row('signed8'),profile).terms).toEqual([{kind:'bound',operator:'>=',literal:'-128'},{kind:'bound',operator:'<=',literal:'127'}]);
 expect(inspect(row('unsigned8'),profile).terms).toEqual([{kind:'bound',operator:'>=',literal:'0'},{kind:'bound',operator:'<=',literal:'255'}]);
 expect(inspect(row('text_zero'),profile).terms).toEqual([{kind:'length',unit:'unicode-scalar',max:'0'}]);
 expect(inspect(row('binary_bound'),profile).terms).toEqual([{kind:'length',unit:'byte',max:'2'}]);
 expect(inspect(row('unvalidated'),profile).valueScope).toBe('new-values-only');expect(inspect(row('decimal_exact'),profile).valueScope).toBe('stored-and-new-values');
});
test('unknown nodes, forged resolution, context changes and hidden conjuncts refuse atomically',()=>{
 for(const mutate of [
  (c:any)=>c.nodeTree=c.nodeTree.replace(':boolop and',':boolop or'),
  (c:any)=>c.nodeTree=c.nodeTree.replace(':varattno 1',':varattno 2'),
  (c:any)=>c.nodeTree=c.nodeTree.replace(':funcid 1709',':funcid 999999'),
  (c:any)=>c.nodeTree=c.nodeTree.replace(':opfuncid 1721',':opfuncid 1723'),
  (c:any)=>c.nodeTree=c.nodeTree.replace(':varlevelsup 0',':varlevelsup 1'),
  (c:any)=>c.nodeTree=c.nodeTree.replace(':constisnull false',':constisnull true'),
  (c:any)=>c.nodeTree=c.nodeTree.replace(':constvalue 10',':future 1 :constvalue 10'),
  (c:any)=>c.nodeTree=c.nodeTree.replace(':constvalue 10',':constvalue 11'),
  (c:any)=>c.nodeTree=c.nodeTree.replace('40 0 0 0','44 0 0 0'),
  (c:any)=>c.nodeTree+=' trailing',
  (c:any)=>c.functionLookups[0].schema='custom',
  (c:any)=>c.functionLookups[0].argumentTypeOids='[0:1]={23,23}',
  (c:any)=>c.functionLookups.push(c.functionLookups[0]),
  (c:any)=>c.operatorLookups[0].functionOid='999999',
  (c:any)=>c.columns[0].typeKind='d',
  (c:any)=>c.columns[0].modifier=327686,
  (c:any)=>c.columnNumbers=[1,2],
  (c:any)=>c.inheritanceCount=1,
 ]){const c=structuredClone(row('decimal_exact'));mutate(c);const r=inspect(c,profile);expect(r.state).toBe('unsupported');expect(r.terms).toEqual([]);}
 for(const p of [{...profile,serverVersion:170005},{...profile,encoding:'LATIN1'},{...profile,datumFormat:'big-endian-datum64'}])expect(inspect(row('decimal_exact'),p).state).toBe('unsupported');
 let calls=0;expect(()=>inspect({get nodeTree(){calls++;return ''}},profile)).toThrow();expect(calls).toBe(0);
});
test('bounded node reader rejects duplicate fields, malformed structure and resource abuse',()=>{
 for(const value of ['{VAR :x 1 :x 2}','{VAR :x [ 1 2 )}','{VAR :x 1','{VAR :x 1} {VAR :x 2}','('.repeat(100)+'x'+')'.repeat(100),'x'.repeat(1_000_001)])expect(readFacetNodeTree(value)).toBeUndefined();
});
test('Datum64 integers remain exact beyond JavaScript precision',()=>{
 for(const value of [-9223372036854775808n,9223372036854775807n]){
  const buffer=new ArrayBuffer(8);new DataView(buffer).setBigInt64(0,value,true);
  const text=`{CONST :consttype 20 :consttypmod -1 :constcollid 0 :constlen 8 :constbyval true :constisnull false :location -1 :constvalue 8 [ ${[...new Uint8Array(buffer)].join(' ')} ]}`;
  expect(decodeFacetConstant(readFacetNodeTree(text)!)).toBe(String(value));
 }
 const n=readFacetNodeTree(row('decimal_exact').nodeTree)!;
 function constants(n:PgFacetNode):PgFacetNode[]{const out:PgFacetNode[]=[];if(n.tag==='CONST')out.push(n);for(const v of Object.values(n.fields))if(Array.isArray(v))for(const child of v)if(typeof child==='object'&&!Array.isArray(child))out.push(...constants(child));return out;}
 expect(constants(n).map(decodeFacetConstant)).toEqual(['-999.99','999.99','2']);
});

test('independent native Datum corpus replays exactly and fingerprints are current',async()=>{
 for(const [path,sha] of Object.entries(datums.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(sha);
 for(const row of datums.rows){const tree=readFacetNodeTree(row.nodeTree)!;expect(decodeFacetConstant((tree.fields.args as PgFacetNode[])[1]!)??null).toBe(row.actual);expect(row.actual).toBe(row.expected);}
 expect(inspect(row('decimal_exact'),profile).nonNullValuesOnly).toBe(true);
});
