import {test,expect} from 'bun:test';
import {domains} from '../../scripts/domain-packs/catalog';
import {inspectDomainPack} from '../../src/domain-packs/profile';
import {readDocument} from '../../src/model/document';
import {validateDocument} from '../../src/validation/document';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
for(const domain of domains){
 // Domain-specific schema/inventory assertions. AC5/7 explicitly partial in STPs.
 test(`@covers US-${domain.story.toString().padStart(3,'0')}-AC1 ${domain.id} has typed inventory, independent checks and graph schema closure`,async()=>{
  const root='spec/domain-packs/'+domain.id,pack=await Bun.file(root+'/pack.json').json();
  expect(inspectDomainPack(pack)).toEqual({valid:true,complete:true,diagnostics:[]});
  expect(pack.scenario_checks).toEqual(domain.checks);
  expect(pack.execution_profile.targets.tabular).toEqual(domain.tables.map(t=>t.name));
  for(const schema of pack.schemas){
   const text=await Bun.file(join(root,schema.reference)).text();
   if(schema.format==='tablespec'){
    expect(exportTableSpec(importTableSpec(text,{id:schema.id,format:'json'}))).toBe(text);
    const table=JSON.parse(text),authored=domain.tables.find(t=>t.name===schema.id)!;
    expect(table.columns.map((c:any)=>c.name)).toEqual(authored.fields.map(f=>f.split('@')[0]!.split(':')[0]!.replace('?','')));
   }else{const checked=validateDocument(readDocument(text,'json'));expect(checked,root+'/'+schema.id).toEqual({valid:true,complete:true,diagnostics:[]});}
  }
  for(const source of Object.values(pack.sources) as any[]){const bytes=await Bun.file(join(root,source.reference)).arrayBuffer();expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(source.checksum.value);}
 });
}
test('all sixteen packs declare graph schemas without replacing baseline source rows',async()=>{
 for(const id of await readdir('spec/domain-packs')){const root='spec/domain-packs/'+id,pack=await Bun.file(root+'/pack.json').json();expect(inspectDomainPack(pack).valid,id).toBe(true);expect(pack.execution_profile.targets.graph).toEqual(['ontology']);expect(validateDocument(readDocument(await Bun.file(root+'/ontology.json').text(),'json')).valid,id).toBe(true);}
 const medical=await Bun.file('spec/domain-packs/medical/pack.json').json();expect(medical.generator).toBeUndefined();expect(medical.execution_profile.mode).toBe('fixed');expect(medical.fixture_counts.resources).toBe(17);
});
test('@covers US-060-AC3 @covers US-060-AC7 invalid target, profile, inclusion and source identities refuse admission',async()=>{
 const original=await Bun.file('spec/domain-packs/commerce/pack.json').json();
 for(const mutate of [(p:any)=>p.execution_profile.version='2.0.0',(p:any)=>p.execution_profile.code='execute',(p:any)=>p.execution_profile.targets.graph=['orders'],(p:any)=>p.execution_profile.scales.large=10001,(p:any)=>p.execution_profile.include_sources=['missing'],(p:any)=>p.source_bindings[0].source_id='missing',(p:any)=>p.schemas.push(p.schemas[0])]){const p=structuredClone(original);mutate(p);expect(inspectDomainPack(p).valid).toBe(false);}
 expect(inspectDomainPack(original).valid).toBe(true);
});
import {parseEntry} from '../../docs/helix/05-deploy/microsite/explorer-model';
import {stringify} from 'yaml';
test('JSON and YAML profile admission agree and malformed present profiles refuse',async()=>{
 const text=await Bun.file('spec/domain-packs/commerce/pack.json').text(),pack=JSON.parse(text);
 const base={id:'test',title:'test',category:'local',path:'test.json'};
 for(const [format,source] of [['json',text],['yaml',stringify(pack)]] as const){const parsed=parseEntry({...base,format,text:source});expect(parsed.valid).toBe(true);expect(parsed.complete).toBe(true);}
 for(const profile of [false,0,'',null,{}, {...pack.execution_profile,targets:{}}])expect(inspectDomainPack({...pack,execution_profile:profile}).valid).toBe(false);
});
test('@covers US-076-AC9 @covers US-076-AC10 @covers US-076-AC11 archaeology asset and evidence schemas retain specialist lineage and exact asset revisions',async()=>{
 const pack=await Bun.file('spec/domain-packs/archaeology/pack.json').json(),domain=domains.find(d=>d.id==='archaeology')!;
 const assets=domain.tables.find(t=>t.name==='assets')!;
 for(const row of assets.rows){if(row[3]==='included'){const source=pack.sources[row[7] as string];expect(source.reference).toBe(row[2]);expect(source.revision).toBe(row[8]);expect(source.checksum.value).toBe(row[9]);expect(new Bun.CryptoHasher('sha256').update(await Bun.file('spec/domain-packs/archaeology/'+source.reference).arrayBuffer()).digest('hex')).toBe(row[9] as string);}else expect(row.slice(7)).toEqual([null,null,null]);}
 expect(domain.tables.find(t=>t.name==='interpretations')!.fields).toContain('basis');
 for(const id of ['specialists','sample','evidence-links']){const check=domain.checks.find(c=>c.id===id)!;expect(check.sql).not.toContain('CROSS JOIN');expect(check.expected.length).toBeGreaterThan(0);}
});
