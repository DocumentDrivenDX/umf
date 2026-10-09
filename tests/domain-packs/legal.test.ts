import {expect,test} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createValidator} from '../../src/validation/schema';
import {generateDomainPackSchema} from '../../src/domain-packs/schema';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';

const root='spec/domain-packs/legal';
test('mixed legal corpus pins originals and keeps real evidence separate from fabricated operations',async()=>{
 const pack=await Bun.file(root+'/pack.json').json();
 expect(createValidator().compile(generateDomainPackSchema())(pack)).toBe(true);
 expect(pack.version).toBe('1.1.0');
 expect(pack.fixture_counts).toEqual({cases:1,evidence_documents:7,evidence_pages:383});
 for(const entry of pack.schemas){
  const text=await Bun.file(root+'/'+entry.reference).text();
  expect(exportTableSpec(importTableSpec(text,{id:entry.id,format:'json'}))).toBe(text);
 }
 const externalRows=pack.source_bindings.filter((b:any)=>b.role==='rows'&&pack.sources[b.source_id].kind==='external');
 expect(externalRows.map((b:any)=>b.schema_id).sort()).toEqual(['cases','evidence_documents','evidence_pages']);
 expect(pack.source_bindings.filter((b:any)=>b.source_id==='fabricated')).toHaveLength(8);
 for(const [id,source] of Object.entries(pack.sources) as [string,any][]){
  if(source.kind!=='external')continue;
  const bytes=await Bun.file(root+'/'+source.reference).arrayBuffer();
  expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(source.checksum.value);
  if(source.format==='pdf'){
   expect(new TextDecoder().decode(bytes.slice(0,4))).toBe('%PDF');
   expect(source.data_kind).toBe('observed');
   expect(source.license.redistribution).toBe(id==='memorandum-opinion'?'allowed':'unknown');
  }
 }
 const schema=await Bun.file(root+'/umf/evidence_documents.json').json();
 expect(schema.relationships.foreign_keys).toEqual([{column:'case_key',references_table:'cases',references_column:'case_key'}]);
 expect(schema.columns.some((c:any)=>c.name==='client_id'||c.name==='matter_id')).toBe(false);
});

test('legal metadata export succeeds and complete source redistribution refuses unknown rights',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'umf-legal-'));
 try{
  const run=async(flags:string[])=>{
   const child=Bun.spawn(['bun','scripts/export-domain-pack.ts','--pack',root+'/pack.json','--output',dir,...flags],{stdout:'pipe',stderr:'pipe'});
   const [,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
   return {code:await child.exited,stderr};
  };
  expect((await run([])).code).toBe(0);
  expect((await run(['--check'])).code).toBe(0);
  const denied=await run(['--include-sources']);
  expect(denied.code).not.toBe(0);
  expect(denied.stderr).toContain('Source redistribution is not cleared');
  expect(await Bun.file(join(dir,'sources/PTX0014.pdf')).exists()).toBe(false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
