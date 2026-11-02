// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {decodeSecurityDisclosureV2,encodeSecurityDisclosureV2,inspectSecurityDisclosureV2} from '../../../src/index-node-v4';
import {domainFixture,domainRef} from './domain-fixture';
import {UmfError} from '../../../src/model/errors';

function fixture(){
 const f=domainFixture();
 f.catalog.transforms[0]!.parameters=[];f.catalog.transforms[0]!.disclosureProfile=[];
 const batch={version:'umf.security.disclosure/0.2.0' as const,policy:{id:'p',revision:'p1'},protection:{id:'catalog',revision:'c1'},domains:structuredClone(f.closure.pins),
  columns:[{field:domainRef('input'),storageEffect:'canonical' as const}],
  rows:[[{disposition:'transformed' as const,selection:{ruleIndex:0,disclosureIndex:0},outputDomain:domainRef('output'),transform:{id:'transform',version:'t1'},value:{string:'restricted'}}]]};
 return {...f,batch};
}

test('Node V4 disclosure 0.2.0 is Rust validated and roundtrips JSON/YAML without authority',()=>{
 const f=fixture(),report=inspectSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure);
 expect(report.status).toBe('validated-disclosure');expect(report.batch).toEqual(f.batch);expect(report.authority).toBe(false);
 for(const format of ['json','yaml'] as const){
  const source=encodeSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure,format);
  expect(decodeSecurityDisclosureV2(source,f.policy,f.catalog,f.closure,format)).toEqual(f.batch);
 }
});

test('Node V4 disclosure 0.2.0 refuses substituted output-domain meaning',()=>{
 const f=fixture();f.batch.rows[0]![0]!.outputDomain=domainRef('input');
 expect(inspectSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure).status).toBe('refused');
 expect(()=>encodeSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure)).toThrow(UmfError);
});
