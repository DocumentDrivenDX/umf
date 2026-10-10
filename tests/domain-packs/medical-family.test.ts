import {expect,test} from 'bun:test';
import {mkdtemp,cp,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {resolveDomainFamily} from '../../scripts/domain-pack-family';
import {inspectDomainPack} from '../../src/domain-packs/profile';
import {readDocument} from '../../src/model/document';
import {validateDocument} from '../../src/validation/document';
const root='spec/domain-packs/medical/pack.json';
async function run(input:string,output:string,check=false){const p=Bun.spawn(['bun','scripts/export-domain-family.ts','--pack',input,'--output',output,'--include-sources',...(check?['--check']:[])],{stdout:'pipe',stderr:'pipe'});const [code,stderr]=await Promise.all([p.exited,new Response(p.stderr).text(),new Response(p.stdout).text()]);return {code,stderr};}
// @covers US-055-AC1 @covers US-055-AC4 @covers US-055-AC6
 test('medical composition preserves five independent fixed profiles and ontology/table closure',async()=>{
 const members=await resolveDomainFamily(root);expect(members.map(m=>m.pack.id)).toEqual(['medical','medical-carrier','medical-epidemiology','medical-imaging','medical-terminology']);
 let tables=0;
 for(const {path,pack} of members){expect(inspectDomainPack(pack)).toEqual({valid:true,complete:true,diagnostics:[]});expect(pack.version).toBe('1.2.0');expect(pack.execution_profile.mode).toBe('fixed');
  const ontology=readDocument(await Bun.file(join(path,'../ontology.json')).text(),'json');expect(validateDocument(ontology).valid).toBe(true);
  const records=ontology.modules.flatMap(m=>m.elements.filter(e=>e.kind==='record'));expect(records.map(r=>r.id)).toEqual(pack.execution_profile.targets.tabular);tables+=records.length;
  for(const record of records){const native=await Bun.file(join(path,'../umf/'+record.id+'.json')).json();expect((Array.isArray(record.members)?record.members.length:0)).toBe(native.columns.length);}
 }
 expect(tables).toBe(29);
 const metadata=members[0]!.pack;
 for(const composition of [{...metadata.composition,version:'2.0.0'},{...metadata.composition,components:[...metadata.composition.components,metadata.composition.components[0]]},{...metadata.composition,components:[{...metadata.composition.components[0],id:'../medical-carrier'}]},{...metadata.composition,components:[{...metadata.composition.components[0],id:'medical'}]}])expect(inspectDomainPack({...metadata,composition}).valid).toBe(false);
});
// @covers US-055-AC5 @covers US-055-AC6
 test('complete medical export recovers all original sources and preflights member failures',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'umf-medical-family-'));
 try{
  expect((await run(root,join(dir,'export'))).code).toBe(0);expect((await run(root,join(dir,'export'),true)).code).toBe(0);
  const inventory=await Bun.file(join(dir,'export/family.json')).json();expect(inventory.packs).toHaveLength(5);
  for(const member of await resolveDomainFamily(root))for(const source of Object.values(member.pack.sources) as any[]){if(source.reference.includes(':'))continue;const a=new Uint8Array(await Bun.file(join(member.path,'../'+source.reference)).arrayBuffer()),b=new Uint8Array(await Bun.file(join(dir,'export',member.pack.id+'@1.2.0',source.reference)).arrayBuffer());expect(b).toEqual(a);}
  for(const member of await resolveDomainFamily(root))await cp(join(member.path,'..'),join(dir,member.pack.id),{recursive:true});
  const copy=join(dir,'medical/pack.json'),parent=await Bun.file(copy).json();parent.composition.components[0].version='9.0.0';await Bun.write(copy,JSON.stringify(parent));expect((await run(copy,join(dir,'blocked'))).stderr).toContain('version');expect(await stat(join(dir,'blocked')).then(()=>true,()=>false)).toBe(false);
  parent.composition.components[0].version='1.2.0';parent.composition.components[0].checksum.value='0'.repeat(64);await Bun.write(copy,JSON.stringify(parent));expect((await run(copy,join(dir,'blocked'))).stderr).toContain('checksum');
  const child=join(dir,'medical-carrier/pack.json'),metadata=await Bun.file(child).json();metadata.sources.cms_carrier.license.redistribution='unknown';const text=JSON.stringify(metadata);await Bun.write(child,text);parent.composition.components[0].checksum.value=new Bun.CryptoHasher('sha256').update(text).digest('hex');await Bun.write(copy,JSON.stringify(parent));expect((await run(copy,join(dir,'blocked'))).stderr).toContain('redistribution');expect(await stat(join(dir,'blocked')).then(()=>true,()=>false)).toBe(false);
 }finally{await rm(dir,{recursive:true,force:true});}
},30000);
