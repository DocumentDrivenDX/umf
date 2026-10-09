import {expect,test} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createValidator} from '../../src/validation/schema';
import {generateDomainPackSchema} from '../../src/domain-packs/schema';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';

const ids=['nyc-tlc','movielens','noaa-ghcn-daily','gtfs-schedule'];
const load=(id:string)=>Bun.file(`spec/domain-packs/${id}/pack.json`).json();
const table=(id:string,name:string)=>Bun.file(`spec/domain-packs/${id}/umf/${name}.json`).json();
test('public packs resolve schemas, domains and source bindings without fabricated fallback',async()=>{
 const validate=createValidator().compile(generateDomainPackSchema());
 for(const id of ids){
  const pack=await load(id);expect(validate(pack)).toBe(true);expect(pack.generator).toBeUndefined();
  expect(pack.sources.documentation.checksum.value).toMatch(/^[a-f0-9]{64}$/);
  const schemas=new Map<string,any>();
  for(const entry of pack.schemas){
   const text=await Bun.file(`spec/domain-packs/${id}/${entry.reference}`).text(),value=JSON.parse(text);
   expect(schemas.has(entry.id)).toBe(false);schemas.set(entry.id,value);
   expect(exportTableSpec(importTableSpec(text,{id:entry.id,format:'json'}))).toBe(text);
   for(const column of value.columns)if(column.domain_type)expect(pack.domain_types[column.domain_type]).toBeDefined();
  }
  for(const binding of pack.source_bindings){expect(schemas.has(binding.schema_id)).toBe(true);expect(pack.sources[binding.source_id]).toBeDefined();}
  for(const value of schemas.values())for(const key of value.relationships?.foreign_keys??[]){
   expect(value.columns.some((column:any)=>column.name===key.column)).toBe(true);
   expect(schemas.get(key.references_table)?.columns.some((column:any)=>column.name===key.references_column)).toBe(true);
  }
  for(const source of Object.values(pack.sources) as any[]){expect(source.kind).toBe('external');expect(source.generator).toBeUndefined();expect(source.license.redistribution).not.toBe('allowed');}
 }
});
test('public source semantics avoid invented identities, times and missing-value conversions',async()=>{
 const taxi=await table('nyc-tlc','yellow_trips');expect(taxi.primary_key).toBeUndefined();expect(taxi.columns.every((c:any)=>c.nullable)).toBe(true);
 expect(taxi.columns.find((c:any)=>c.name==='cbd_congestion_fee')).toBeDefined();
 expect(taxi.columns.find((c:any)=>c.name==='tpep_pickup_datetime').data_type).toBe('VARCHAR');
 const movie=await load('movielens');expect(movie.sources.release.revision).toContain('ml-32m');expect(movie.sources.release.license.redistribution).toBe('restricted');
 expect((await table('movielens','tags')).primary_key).toBeUndefined();expect((await table('movielens','links')).columns.find((c:any)=>c.name==='imdbId').data_type).toBe('VARCHAR');
 const noaa=await table('noaa-ghcn-daily','daily_monthly');expect(noaa.columns).toHaveLength(128);
 for(let day=1;day<=31;day++){
  expect(noaa.columns.find((c:any)=>c.name===`VALUE${day}`).description).toContain('-9999');
  for(const flag of ['MFLAG','QFLAG','SFLAG'])expect(noaa.columns.find((c:any)=>c.name===`${flag}${day}`).nullable).toBe(false);
 }
 expect((await load('noaa-ghcn-daily')).domain_types.ghcn_element.core_units).toEqual({PRCP:'0.1 mm',SNOW:'mm',SNWD:'mm',TMAX:'0.1 Celsius',TMIN:'0.1 Celsius'});
 const gtfs=await load('gtfs-schedule');expect(gtfs.sources.feed.reference).toContain('unresolved');
 const times=await table('gtfs-schedule','stop_times');expect(times.primary_key).toEqual(['trip_id','stop_sequence']);
 expect(times.columns.find((c:any)=>c.name==='arrival_time').data_type).toBe('VARCHAR');
 expect((await table('gtfs-schedule','trips')).relationships.foreign_keys.some((k:any)=>k.column==='service_id')).toBe(false);
 expect((await table('gtfs-schedule','calendar_dates')).relationships).toBeUndefined();
});
test('every public pack exports and checks exact local schemas while row references remain opaque',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'umf-public-packs-'));
 try{for(const id of ids)for(const check of [false,true]){
  const child=Bun.spawn(['bun','scripts/export-domain-pack.ts','--pack',`spec/domain-packs/${id}/pack.json`,'--output',join(directory,id),...(check?['--check']:[])],{stdout:'pipe',stderr:'pipe'});
  const [,error]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
  expect({code:await child.exited,error}).toEqual({code:0,error:''});
 }}finally{await rm(directory,{recursive:true,force:true});}
});
