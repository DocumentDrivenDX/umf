import {expect,test} from 'bun:test';
import {mkdtemp,cp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createValidator} from '../../src/validation/schema';
import {generateDomainPackSchema} from '../../src/domain-packs/schema';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';

const root='spec/domain-packs/medical';
test('medical pack shares canonical structure, pins original bytes and retains external reference-only rights',async()=>{
 const pack=await Bun.file(root+'/pack.json').json();
 expect(createValidator().compile(generateDomainPackSchema())(pack)).toBe(true);
 expect(pack.generator).toBeUndefined();
 for(const entry of pack.schemas.filter((s:any)=>s.format==='tablespec')){
  const text=await Bun.file(root+'/'+entry.reference).text();
  expect(exportTableSpec(importTableSpec(text,{id:entry.id,format:'json'}))).toBe(text);
 }
 let resources=0;
 for(const source of Object.values(pack.sources) as any[]){
  if(source.reference.includes(':')){expect(source.license.redistribution).toBe('unknown');continue;}
  const bytes=await Bun.file(root+'/'+source.reference).arrayBuffer();
  expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(source.checksum.value);
  if(source.format!=='fhir-r4-json')continue;
  resources++;
  const resource=JSON.parse(new TextDecoder().decode(bytes));
  // Rights checks recurse through coded fields, rather than searching prose only.
  const visit=(v:any)=>{if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object'){
   if(typeof v.system==='string')expect(v.system).not.toMatch(/snomed|ama-assn|dicom|cdt/i);
   Object.values(v).forEach(visit);
  }};visit(resource);
 }
 expect(resources).toBe(17);
});

test('explicit local source export preserves pins, refuses tampering and uncleared rights',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'umf-medical-'));
 const run=async(check=false)=>{
  const child=Bun.spawn(['bun','scripts/export-domain-pack.ts','--pack',join(dir,'pack/pack.json'),'--output',join(dir,'export'),'--include-sources',...(check?['--check']:[])],{stdout:'pipe',stderr:'pipe'});
  await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);return child.exited;
 };
 try{
  await cp(root,join(dir,'pack'),{recursive:true});
  expect(await run()).toBe(0);expect(await run(true)).toBe(0);
  expect(await Bun.file(join(dir,'export/sources/patient-example.json')).text()).toBe(await Bun.file(root+'/sources/patient-example.json').text());
  const path=join(dir,'pack/pack.json'),pack=await Bun.file(path).json();
  pack.sources.notices.license.redistribution='unknown';await Bun.write(path,JSON.stringify(pack));
  expect(await run()).not.toBe(0);
  pack.sources.notices.license.redistribution='allowed';await Bun.write(path,JSON.stringify(pack));
  await Bun.write(join(dir,'pack/data/patients.csv'),'tampered');
  expect(await run()).not.toBe(0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
