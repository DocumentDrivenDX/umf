import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import evidence from '../../fixtures/validation/facets-postgresql-constraints-native.json';
import {inspectPostgresqlFacetPredicate} from '../../src/adapters/postgresql/facet-predicate';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const find=(schema:string,relation:string)=>evidence.capture.constraints.find(c=>c.schema===schema&&c.relation===relation)!;
test('native supplement is pinned, fingerprinted and preserves resolved identities separately from syntax',async()=>{
 expect(evidence.capture.serverVersion).toBe(170004);expect(evidence.capture.encoding).toBe('UTF8');
 expect(evidence.capture.constraints).toHaveLength(12);
 for(const [path,hash] of Object.entries(evidence.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(hash);
 for(const relation of ['decimal_exact','text_bound','binary_bound']){
  const row=find('facet',relation);expect(row.validated).toBe(true);expect(row.columnNumbers).toEqual([1]);expect(row.nodeTree).toContain(':varattno 1');
  expect(row.operatorLookups.length).toBeGreaterThan(0);
  for(const op of row.operatorLookups){expect(op.schema).toBe('pg_catalog');expect(op.functionSchema).toBe('pg_catalog');expect(row.nodeTree).toContain(':opno '+op.oid+' ');}
  for(const fn of row.functionLookups){expect(fn.schema).toBe('pg_catalog');expect(row.nodeTree).toContain(':funcid '+fn.oid+' ');}
 }
 expect(find('facet','unvalidated').validated).toBe(false);expect(find('facet_shadow','multi_column').columnNumbers).toEqual([1,2]);
 // Both constraints contain a name spelled char_length, but identities differ.
 const builtin=find('facet','text_bound').functionLookups[0]!,custom=find('facet_shadow','length_check').functionLookups[0]!;
 expect(builtin.name).toBe('char_length');expect(custom.name).toBe('char_length');expect(custom.oid).not.toBe(builtin.oid);expect(custom.schema).toBe('facet_shadow');
 expect(find('facet_shadow','length_check').expression).toContain('facet_shadow.char_length');
 expect(find('facet_shadow','bound_check').operatorLookups.some(o=>o.schema==='facet_shadow'&&o.name==='<=')).toBe(true);
});
test('native deparsed checks replay as candidates or explicit refusals with complete retained trees',()=>{
 let candidates=0,unsupported=0;
 for(const row of evidence.rows){const r=inspectPostgresqlFacetPredicate(row.inspection.native,'value');expect(copyJson(r)).toEqual(copyJson(row.inspection));expect(r.requires).toBe('catalog-resolution-and-enforcement-evidence');if(row.schema==='facet_shadow')expect(r.state).toBe('unsupported');if(r.state==='candidate')candidates++;else unsupported++;}
 expect(candidates).toBe(8);expect(unsupported).toBe(4);
 for(const format of ['json','yaml'] as const)expect(readJsonValue(writeJsonValue(copyJson(evidence.capture),format),format)).toEqual(copyJson(evidence.capture));
 for(const probe of evidence.probes)expect(probe.actual).toBe(probe.expected);
 expect(evidence.probes.map(p=>[p.id,p.expected])).toEqual([
  ['custom-length-accepts-overlength','abcdef'],['custom-trunc-accepts-extra-scale','1.235'],
  ['custom-operator-accepts-overflow','1000'],['unvalidated-existing-nan','NaN']]);
});
