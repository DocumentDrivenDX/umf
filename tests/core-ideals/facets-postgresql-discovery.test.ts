import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {inspectPostgresqlFacetType} from '../../src/adapters/postgresql/facet-typmod';
import {parseNativeJson} from '../../src/model/native-json';
import {importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../../src/adapters/postgresql/catalog';
import {copyJson,readJsonValue,writeJsonValue,type Document} from '../../src';
import evidence from '../../fixtures/validation/facets-postgresql-discovery-native.json';
const snapshot=JSON.parse(evidence.sourceText).snapshot;
const relation=(name:string)=>snapshot.relations.find((r:any)=>r.schema==='facet'&&r.name===name);
const type=(name:string)=>parseNativeJson(JSON.stringify(relation(name).columns[0].nativeType));
const inspect=(name:string)=>inspectPostgresqlFacetType(type(name));
const value=(id:string)=>evidence.cases.find(r=>r.id===id)!;
test('native evidence is pinned and preserves counterexamples to direct core promotion',async()=>{
 expect(evidence.serverVersion).toBe(170004);expect(evidence.encoding).toBe('UTF8');expect(evidence.cases).toHaveLength(74);
 for(const [path,sha] of Object.entries(evidence.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(sha);
 expect(value('decimal-nan').value).toBe('NaN');expect(value('finite-still-rounds').value).toBe('1.24');expect(value('exact-round-refusal').sqlstate).toBe('23514');expect(value('exact-trailing-zero').value).toBe('1.2300');
 expect(value('float-narrowing').value).toBe('1');expect(value('float64-retains').value).toBe('1.0000000000000002');
 expect(value('varchar-space-truncation').value).toBe('a ');expect(value('varchar-explicit-cast').value).toBe('ab');expect(value('text-bound-spaces').sqlstate).toBe('23514');
 expect(value('unvalidated-existing-nan').value).toBe('NaN');expect(value('unvalidated-new-nan').sqlstate).toBe('23514');expect(relation('unvalidated').constraints[0].validated).toBe(false);
 expect(value('binary-nul').value).toBe('\\x0000');expect(value('text-nul-refusal').sqlstate).not.toBe('00000');
});
test('signed numeric modifiers are decoded without importing misleading information_schema scale',()=>{
 expect(evidence.columns.find(r=>r.table==='decimal_negative_scale')!.numericScale).toBe(2045);
 expect(inspect('decimal_max_scale').meaning).toMatchObject({precision:1000,scale:1000});
 expect(inspect('decimal_min_scale').meaning).toMatchObject({precision:1000,scale:-1000});
 expect(inspect('varchar_max').meaning).toMatchObject({declaredMaxCharacters:10485760});
 expect(inspect('decimal_negative_scale').meaning).toEqual({family:'decimal',precision:2,scale:-3,specials:'nan',coercesScale:true});
 expect(inspect('decimal_over_scale').meaning).toEqual({family:'decimal',precision:3,scale:5,specials:'nan',coercesScale:true});
 expect(inspect('decimal_pair').meaning).toEqual({family:'decimal',precision:5,scale:2,specials:'nan',coercesScale:true});
 expect(inspect('decimal_precision_only').meaning).toMatchObject({precision:5,scale:0,coercesScale:true});expect(value('precision-only-rounds').value).toBe('2');
 for(const r of snapshot.relations){if(r.schema!=='facet')continue;const result=inspect(r.name);if(result.meaning?.family==='decimal'&&result.meaning.precision!==null)expect(r.columns[0].type).toBe(`numeric(${result.meaning.precision},${result.meaning.scale})`);}
 expect(inspect('decimal_exact').meaning).toEqual({family:'decimal',precision:null,scale:null,specials:'nan-and-infinities',coercesScale:false});
 // Native constraints are a separate interpretation; identical modifiers cannot prove identical domains.
 expect(inspect('decimal_pair').meaning).toEqual(inspect('decimal_finite').meaning);
 for(const [name,bits] of [['int16',16],['int32',32],['int64',64]] as const)expect(inspect(name).meaning).toEqual({family:'integer',signedBits:bits});
 expect(inspect('signed8').meaning).toEqual({family:'integer',signedBits:16});expect(inspect('unsigned8').meaning).toEqual({family:'integer',signedBits:16});
 expect(inspect('char_bare').meaning).toMatchObject({declaredMaxCharacters:1,padding:'blank-padded'});expect(inspect('bpchar_bare').meaning).toMatchObject({declaredMaxCharacters:null,padding:'blank-trimmed'});
 expect(inspect('varchar2').meaning).toMatchObject({declaredMaxCharacters:2,padding:'none',permitsNul:false});
 expect(inspect('domain_value').state).toBe('unsupported');expect(inspect('array_value').state).toBe('unsupported');
});
test('unknown qualifiers survive and unsafe or reserved modifier layouts cannot become native facts',()=>{
 const raw=relation('decimal_pair').columns[0].nativeType;
 for(const modifier of [-2,0,3,4,2147483648,9007199254740993,327686+2048])expect(inspectPostgresqlFacetType(parseNativeJson(JSON.stringify({...raw,modifier}))).state).toBe('unsupported');
 for(const token of ['327686.0000000000000000001','9007199254740993','1e100000'])expect(inspectPostgresqlFacetType(parseNativeJson(JSON.stringify(raw).replace('327686',token))).state).toBe('unsupported');
 const native=parseNativeJson(JSON.stringify({...raw,future:{unit:'unknown'}})),before=copyJson(native),r=inspectPostgresqlFacetType(native);expect(r.native).toEqual(native);expect(copyJson(native)).toEqual(before);
 let calls=0;expect(()=>inspectPostgresqlFacetType({get kind(){calls++;return 'object';},members:{}} as never)).toThrow();expect(calls).toBe(0);
});
test('catalog observations and native refinements survive both envelope forms without core facet assertions',()=>{
 const doc=importPostgresqlCatalogCapture(evidence.sourceText,{id:'facets-discovery'}),canonical=exportPostgresqlCatalogCapture(doc).json;
 for(const row of getPostgresqlColumnMetadata(doc))expect(row.element.facets).toBeUndefined();
 for(const format of ['json','yaml'] as const){const recovered=readJsonValue(writeJsonValue(copyJson(doc),format),format) as unknown as Document;expect(exportPostgresqlCatalogCapture(recovered).json).toBe(canonical);}
});
