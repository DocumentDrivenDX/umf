import {expect,test} from 'bun:test';
import {copyJson,inspectBinding,projectBindingIndexes,type Document} from '../../src';

const logical:Document={
  umf:'0.1.0',id:'order-model',vocabularies:{'umf.ddd':{version:'0.1.0'}},
  modules:[{id:'sales',namespace:'sales',elements:[{id:'Order',extensions:{'umf.ddd':{
    kind:'entity',fields:{id:{type:{kind:'scalar',name:'integer'},cardinality:'one'},details:{type:{kind:'scalar',name:'string'},cardinality:'optional'},region:{type:{kind:'scalar',name:'string'},cardinality:'one'}},identity:{fields:['id'],scope:'context'}
  }}}]}]
};
const field=(name:string)=>({module:'sales',element:'Order',field:name});
const binding:Document={
  umf:'0.1.0',id:'order-pg',vocabularies:{'umf.binding':{version:'0.1.0'}},modules:[],
  extensions:{'umf.binding':{
    profile:'umf-binding-1',logical:{documentId:'order-model',coreVersion:'0.1.0'},target:{system:'postgresql',version:'17.4',subset:'declared-indexes'},
    elements:[{module:'sales',element:'Order',table:'orders'}],
    fields:[{...field('id'),storage:'column',column:'id'},{...field('details'),storage:'embedded',documentColumn:'payload',path:['details']},{...field('region'),storage:'column',column:'region'}],
    relationships:[],indexes:[
      {name:'id_idx',kind:'btree',on:[{field:field('id')}],unique:false,include:[field('region')]},
      {name:'details_idx',kind:'expression',on:[{documentPath:{field:field('details'),path:['details']}}],unique:false},
      {name:'recent_idx',kind:'partial',on:[{field:field('region')}],predicate:{language:'postgresql',version:'17',expression:"region = 'east'"},unique:false},
      {name:'cluster_idx',kind:'clustering',on:[{field:field('id')}],unique:false}
    ]
  }}
};
const clone=()=>copyJson(binding) as unknown as Document;
const payload=(d:Document)=>d.extensions!['umf.binding'] as any;

test('@covers US-047-AC1 @covers US-047-AC2: ordered index capability lives only in binding',()=>{
  const original=copyJson(logical);
  expect(inspectBinding(binding,logical).valid).toBe(true);
  expect(JSON.stringify(logical)).not.toContain('id_idx');
  const report=projectBindingIndexes(binding,logical,'report');
  expect(report.outcomes.map(x=>x.name)).toEqual(['id_idx','details_idx','recent_idx','cluster_idx']);
  expect(report.source).toEqual(binding);
  expect(logical).toEqual(original as unknown as Document);
});

test('@covers US-047-AC4 @covers US-047-AC5: strict blocks and report residualizes clustering',()=>{
  const strict=projectBindingIndexes(binding,logical,'strict');
  expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
  const report=projectBindingIndexes(binding,logical,'report');
  expect(report.status).toBe('reported');
  expect(report.outcomes.at(-1)?.outcome).toBe('not-expressible');
  expect(report.outcomes.at(-1)?.path).toBe('/extensions/umf.binding/indexes/3');
  expect(report.candidate?.map(x=>x.name)).toEqual(['id_idx','details_idx','recent_idx']);
});

test('@covers US-047-AC9: invalid index kind combinations and paths fail',()=>{
  const bad=clone();const p=payload(bad);
  p.indexes[0].kind='unique';
  expect(inspectBinding(bad,logical).diagnostics.some(d=>d.code==='BINDING_INDEX')).toBe(true);
  p.indexes[0].kind='btree';
  p.indexes[1].on[0].documentPath.path=['wrong'];
  expect(inspectBinding(bad,logical).diagnostics.some(d=>d.code==='BINDING_INDEX')).toBe(true);
  p.indexes[1].on[0].documentPath.path=['details'];
  p.indexes[2].predicate=undefined;
  expect(inspectBinding(bad,logical).valid).toBe(false);
});

test('@covers US-047-AC8: target outcomes are qualified and never infer author intent',()=>{
  for(const [system,version,expected] of [['sqlserver','2022','not-expressible'],['delta','3.2','not-expressible'],['iceberg','1.6','not-expressible'],['parquet','2.9','not-expressible']] as const){
    const other=clone();payload(other).target.system=system;payload(other).target.version=version;
    const result=projectBindingIndexes(other,logical,'report');
    expect(result.outcomes[1]?.outcome).toBe(expected);
    expect(result.source).toEqual(other);
  }
});

test('@covers US-047-AC5: unknown index refinements survive but block unsafe projection',()=>{
  const future=clone();payload(future).indexes[0].future={operator:'unknown'};
  expect(inspectBinding(future,logical).diagnostics.some(d=>d.code==='BINDING_UNKNOWN')).toBe(true);
  expect(()=>projectBindingIndexes(future,logical,'report')).toThrow('Unknown binding content');
  expect(payload(future).indexes[0].future).toEqual({operator:'unknown'});
});

test('@covers US-046-AC3 @covers US-047-AC9: storage alternatives and expression paths cannot be mixed',()=>{
  const mixed=clone(),p=payload(mixed);
  p.fields[0].path=['unexpected'];
  expect(inspectBinding(mixed,logical).valid).toBe(false);
  delete p.fields[0].path;
  p.fields[1].column='shadow';
  expect(inspectBinding(mixed,logical).valid).toBe(false);
  delete p.fields[1].column;
  p.indexes[1].on=[{field:field('id')}];
  expect(inspectBinding(mixed,logical).diagnostics.some(d=>d.code==='BINDING_INDEX')).toBe(true);
});
