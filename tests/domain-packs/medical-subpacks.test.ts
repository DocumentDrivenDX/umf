import {expect,test} from 'bun:test';
import {mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectMedicalFhir,projectCdcMortality,projectDicomMetadata,lookupMedicalTerminology} from '../../src/domain-packs/medical';
import {createValidator} from '../../src/validation/schema';
import {generateDomainPackSchema} from '../../src/domain-packs/schema';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';
const packs=['medical-carrier','medical-epidemiology','medical-imaging','medical-terminology'];
const root='spec/domain-packs';
const read=(pack:string,name:string)=>Bun.file(`${root}/${pack}/sources/${name}`).text();
const run=async(args:string[])=>{
 const p=Bun.spawn(['bun',...args],{stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
 return {stdout,stderr,code};
};
// @covers US-055-AC1 @covers US-055-AC2
 test('carrier projections retain distinct native workflows, exact amounts and source namespaces',async()=>{
 const response=await read('medical-carrier','hl7-claimresponse.json');
 const t=projectMedicalFhir([{source_id:'response',text:response}],'hl7');
 expect(t.resources![0]!.resource_json).toBe(response);
 expect(t.adjudications!.find(r=>r.category_json==='{"coding":[{"code":"copay"}]}')!.amount).toBe('10.00');
 expect(t.payments![0]!.amount).toBe('100.47');
 expect(t.resource_references!.every(r=>r.target_key===null)).toBe(true);
 const carrier=await Bun.file(root+'/medical-carrier/pack.json').json();
 expect(carrier.schemas.map((s:any)=>s.id)).toEqual(['resources','coverage','eligibility','claims','claim_lines','adjudications','payments','plans','enrollments','resource_references','coded_values','workflow_events','cms_beneficiaries','cms_inpatient_claims','cms_carrier_claims','ontology']);
 const positive=JSON.parse(await read('medical-carrier','supplement-eligibility-positive-response.json'));
 const negative=JSON.parse(await read('medical-carrier','supplement-eligibility-negative-response.json'));
 expect(positive.insurance[0].inforce).toBe(true);expect(negative.insurance[0].inforce).toBe(false);
 const claimed=projectMedicalFhir([{source_id:'claim',text:await read('medical-carrier','supplement-claim-paid-denied.json')},
 {source_id:'response',text:await read('medical-carrier','supplement-response-paid-denied.json')}],'supplement');
 expect(claimed.claim_lines!.filter(r=>r.resource_key==='supplement::Claim/paid-denied')).toHaveLength(2);
 expect(claimed.adjudications!.filter(r=>r.amount==='0')).toHaveLength(1);
 expect(claimed.resource_references!.find(r=>r.native_reference==='Claim/paid-denied')!.target_key).toBe('supplement::Claim/paid-denied');
 const events=JSON.parse(await read('medical-carrier','workflow-events.json')).events;
 expect(new Set(events.map((e:any)=>e.event_type))).toEqual(new Set(['coordination-of-benefits','appeal','adjustment']));
 expect(events.find((e:any)=>e.status==='upheld').prior_event_key).toBe('supplement::appeal/1');
 const auth=JSON.parse(await read('medical-carrier','supplement-claim-authorization-denied.json'));
 expect(auth.use).toBe('preauthorization');
 const exact='{"resourceType":"Claim","id":"exact","use":"claim","item":[{"sequence":1,"net":{"value":9007199254740993.0100,"currency":"USD"},"future":{"number":1e400}}],"future":{"native":true}}';
 const q=projectMedicalFhir([{source_id:'exact',text:exact}],'one');
 expect(q.claim_lines![0]!.net_amount).toBe('9007199254740993.0100');
 expect(q.claim_lines![0]!.line_json).toContain('1e400');expect(q.resources![0]!.resource_json).toBe(exact);
 expect(projectMedicalFhir([{source_id:'exact',text:exact}],'two').resources![0]!.resource_key).not.toBe(q.resources![0]!.resource_key);
 expect(()=>projectMedicalFhir([{source_id:'x',text:exact},{source_id:'y',text:exact}],'one')).toThrow('Duplicate');
 expect(()=>projectMedicalFhir([{source_id:'x',text:'{"resourceType":"Claim","id":"x","id":"y"}'}],'one')).toThrow();
 expect(()=>projectMedicalFhir([{source_id:'x',text:exact}],'unsafe::namespace')).toThrow();
 let accessed=false;const hostile:any={source_id:'x'};Object.defineProperty(hostile,'text',{enumerable:true,get(){accessed=true;return exact;}});
 expect(()=>projectMedicalFhir([hostile],'one')).toThrow();expect(accessed).toBe(false);
 expect(()=>projectMedicalFhir([{source_id:'x',text:'{"resourceType":"Claim","id":"x","item":[{"sequence":1},{"sequence":1}]}'}],'one')).toThrow('sequence');
 const nested=projectMedicalFhir([{source_id:'nested',text:await read('medical-carrier','hl7-eob.json')}],'hl7');
 expect(nested.claim_lines!.some(r=>r.native_path==='/item/1/detail/0/subDetail/0')).toBe(true);
 expect(nested.claim_lines!.find(r=>r.native_path==='/item/1/detail/0/subDetail/0')!.parent_line_key).toBe('hl7::ExplanationOfBenefit/EB3500/item/1/detail/0');
});
// @covers US-055-AC3
 test('epidemiology preserves observed aggregates and separates fabricated suppression from zero',async()=>{
 const native=await read('medical-epidemiology','cdc-mortality.json'),rows=projectCdcMortality(native,'cdc');
 expect(rows).toHaveLength(12);expect(rows[0]!.count).toBe('44806');expect(rows[0]!.adjusted_rate).toBe('1009.3');
 expect(rows.every(r=>r.population_denominator===null&&r.adjustment==='age-adjusted to 2000 US standard population')).toBe(true);
 const originals=JSON.parse(native);expect(JSON.parse(String(rows[0]!.native_json))).toEqual(originals[0]);
 const edge=JSON.parse(await read('medical-epidemiology','supplement.json')).rows;
 expect(edge[0].count).toBe('0');expect(edge[0].count_status).toBe('reported');
 expect(edge[1].count).toBeNull();expect(edge[1].count_status).toBe('suppressed');
 expect(()=>projectCdcMortality('[{"year":"2026"}]','x')).toThrow();
});
// @covers US-055-AC4 @covers US-055-AC2
 test('DICOM metadata retains private sequences, binary references and unknown content',async()=>{
 const raw=await read('medical-imaging','synthetic-dicom.json'),t=projectDicomMetadata(raw,'synthetic-dicom');
 expect(t.instances![0]!.study_uid).toBe('2.25.555010');expect(t.instances![0]!.series_uid).toBe('2.25.555020');
 expect(t.instances![0]!.sop_instance_uid).toBe('2.25.555001');expect(t.instances![0]!.metadata_json).toBe(raw);
 expect(t.attributes!.find(r=>r.native_path==='/00111010/Value/0/00111002')!.vr).toBe('DS');
 const native=JSON.parse(raw);native['7FE00010']={vr:'OB',BulkDataURI:'https://invalid.example/pixels',future:{retained:true}};
 const extended=projectDicomMetadata(JSON.stringify(native),'extended');
 expect(extended.attributes!.find(r=>r.tag==='7FE00010')!.bulk_data_uri).toBe('https://invalid.example/pixels');
 expect(extended.attributes!.find(r=>r.tag==='7FE00010')!.native_json).toContain('"future":{"retained":true}');
 expect(()=>projectDicomMetadata('{"invalid":{"vr":"UI"}}','x')).toThrow();
 expect(()=>projectDicomMetadata('{"00080018":{"vr":"UI","Value":[]}}','x')).toThrow();
 const pack=await Bun.file(root+'/medical-imaging/pack.json').json();
 expect(pack.qualification.projection_losses[0]).toContain('1.2500 to 1.25');
});
// @covers US-055-AC5
 test('terminology exact release lookup preserves unknowns and never declares absent codes invalid',()=>{
 const rows=[{system:'http://snomed.info/sct',release:'US-2026',code:'example-only',future:{retained:true}},
 {system:'http://snomed.info/sct',release:'INT-2026',code:'example-only'}];
 const query={system:'http://snomed.info/sct',release:'US-2026',code:'example-only'};
 const result=lookupMedicalTerminology(query,rows);expect(result.status).toBe('matched');expect(result.matches).toHaveLength(1);
 expect(result.matches[0]!.future).toEqual({retained:true});
 (result.matches[0]!.future as any).retained=false;expect(rows[0]!.future!.retained).toBe(true);
 expect(lookupMedicalTerminology(query).status).toBe('source-unavailable');
 expect(lookupMedicalTerminology({...query,release:'missing'},rows).status).toBe('not-in-subset');
 expect(lookupMedicalTerminology({...query,system:'other'},rows).matches).toHaveLength(0);
 expect(lookupMedicalTerminology(query,[{...query,active:false}]).matches[0]!.active).toBe(false);
 expect(()=>lookupMedicalTerminology({...query,release:''},rows)).toThrow();
 let invoked=false;const hostile={...query};Object.defineProperty(hostile,'code',{enumerable:true,get(){invoked=true;return 'x';}});
 expect(()=>lookupMedicalTerminology(hostile,rows)).toThrow();expect(invoked).toBe(false);
});
// @covers US-055-AC6 @covers US-055-AC5
 test('medical subpacks pin every local source, validate native schemas and regenerate exactly',async()=>{
 for(const id of packs){
  const pack=await Bun.file(root+'/'+id+'/pack.json').json();
  expect(createValidator().compile(generateDomainPackSchema())(pack)).toBe(true);expect(pack.generator).toBeUndefined();
  for(const s of pack.schemas.filter((s:any)=>s.format==='tablespec')){const text=await Bun.file(root+'/'+id+'/'+s.reference).text();expect(exportTableSpec(importTableSpec(text,{id:s.id,format:'json'}))).toBe(text);}
  for(const source of Object.values(pack.sources) as any[]){
   if(source.reference.includes(':')){expect(source.license.redistribution).toBe('unknown');continue;}
   const bytes=await Bun.file(root+'/'+id+'/'+source.reference).arrayBuffer();
   expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(source.checksum.value);
   expect(source.license.redistribution).toBe('allowed');
  }
  for(const b of pack.source_bindings){expect(pack.sources[b.source_id]).toBeDefined();expect(pack.schemas.some((s:any)=>s.id===b.schema_id)).toBe(true);}
 }
 expect((await run(['scripts/build-medical-subpacks.ts','--check'])).code).toBe(0);
});
// @covers US-055-AC5 @covers US-055-AC6
 test('shared source export recovers imaging bytes and refuses rights and checksum changes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'umf-subpacks-'));
 try{
  await cp(root+'/medical-imaging',join(dir,'pack'),{recursive:true});
  const args=['scripts/export-domain-pack.ts','--pack',join(dir,'pack/pack.json'),'--output',join(dir,'export'),'--include-sources'];
  expect((await run(args)).code).toBe(0);expect((await run([...args,'--check'])).code).toBe(0);
  expect(new Uint8Array(await Bun.file(join(dir,'export/sources/synthetic.dcm')).arrayBuffer())).toEqual(new Uint8Array(await Bun.file(root+'/medical-imaging/sources/synthetic.dcm').arrayBuffer()));
  const path=join(dir,'pack/pack.json'),pack=await Bun.file(path).json();
  pack.sources.dicom_binary.license.redistribution='unknown';await Bun.write(path,JSON.stringify(pack));
  expect((await run(args)).stderr).toContain('redistribution');
  pack.sources.dicom_binary.license.redistribution='allowed';await Bun.write(path,JSON.stringify(pack));
  await Bun.write(join(dir,'pack/sources/synthetic.dcm'),'changed');expect((await run(args)).stderr).toContain('checksum');
 }finally{await rm(dir,{recursive:true,force:true});}
});
