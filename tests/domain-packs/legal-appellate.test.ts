import {expect,test} from 'bun:test';
import {mkdtemp,rm,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectDomainPack} from '../../src/domain-packs/profile';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';

const root='spec/domain-packs/legal-appellate';
const hash=(bytes:ArrayBuffer)=>new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
// RFC-style quoted cells, including embedded newlines in extracted PDF text.
function csv(text:string){
 const records:string[][]=[];let record:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i]!;
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(c===','||c==='\n')){record.push(cell);cell='';if(c==='\n'){records.push(record);record=[];}}
  else cell+=c;
 }
 if(quoted||cell||record.length)throw Error('Unterminated CSV fixture');
 const header=records.shift()!;
 return records.map(row=>{if(row.length!==header.length)throw Error('CSV width');return Object.fromEntries(header.map((k,i)=>[k,row[i]==='\\N'?null:row[i]]));});
}
const table=async(name:string)=>csv(await Bun.file(`${root}/data/${name}.csv`).text());

function deliveryRequest(receipts:Set<string>,key:string,transport:string){
 if(receipts.has(key))return 'suppressed_duplicate';
 if(transport==='simulated_transport_failed')return 'delivery_retry_eligible';
 receipts.add(key);return 'notification_sent';
}

// @covers US-061-AC9
test('appellate originals, schema recovery and all row references retain provenance',async()=>{
 const pack=await Bun.file(root+'/pack.json').json();
 expect(inspectDomainPack(pack)).toEqual({valid:true,complete:true,diagnostics:[]});
 expect(pack.execution_profile.mode).toBe('fixed');
 expect(pack.fixture_counts.decisions).toBe(34);
 expect(pack.fixture_counts.decision_pages).toBe(1689);
 const tables:Record<string,any[]>=Object.fromEntries(await Promise.all(pack.schemas.map(async(s:any)=>[s.id,await table(s.id)])));
 for(const entry of pack.schemas){
  const text=await Bun.file(root+'/'+entry.reference).text(),schema=JSON.parse(text);
  expect(exportTableSpec(importTableSpec(text,{id:entry.id,format:'json'}))).toBe(text);
  expect(tables[entry.id]!.length).toBe(pack.fixture_counts[entry.id]);
  const pk=schema.primary_key[0];expect(new Set(tables[entry.id]!.map(r=>r[pk])).size).toBe(tables[entry.id]!.length);
  for(const row of tables[entry.id]!){
   for(const column of schema.columns){expect(Object.hasOwn(row,column.name)).toBe(true);if(!column.nullable)expect(row[column.name]).not.toBeNull();}
   for(const fk of schema.relationships?.foreign_keys??[]){const value=row[fk.column];if(value!==null)expect(tables[fk.references_table]!.some(r=>r[fk.references_column]===value)).toBe(true);}
  }
  expect(pack.source_bindings.filter((b:any)=>b.schema_id===entry.id&&b.role==='rows')).toHaveLength(1);
 }
 for(const [id,source] of Object.entries(pack.sources) as [string,any][]){
  const bytes=await Bun.file(root+'/'+source.reference).arrayBuffer();expect(hash(bytes),id).toBe(source.checksum.value);
  if(source.format==='pdf'){expect(new TextDecoder().decode(bytes.slice(0,4))).toBe('%PDF');expect(source.data_kind).toBe('observed');expect(source.provenance.retrieved_at).toBeString();expect(source.license.redistribution).toBe('allowed');}
 }
 expect(tables.courts!.filter(c=>c.court_level==='state_highest').map(c=>c.court_id).sort()).toEqual(['nycoa','pasc']);
 for(const d of tables.decisions!){expect(tables.decision_pages!.filter(p=>p.document_id===d.document_id)).toHaveLength(Number(d.page_count));expect(d.sha256).toBe(pack.sources[d.document_id].checksum.value);}
 const pages=new Map(tables.decision_pages!.map(p=>[p.page_id,p]));
 for(const e of tables.annotation_evidence!)expect(pages.get(e.page_id)!.text.includes(e.excerpt)).toBe(true);
 for(const a of tables.annotations!){expect(a.review_state).toBe('provisional_requires_attorney_review');expect(tables.annotation_evidence!.some(e=>e.annotation_id===a.annotation_id&&e.purpose==='disposition_or_outcome')).toBe(true);}
 expect(pack.sources.csv_annotations.data_kind).toBe('unknown');
 expect(pack.sources.csv_workflow_events.data_kind).toBe('fabricated');
 expect(tables.decision_links!.some(l=>l.relationship==='amends'&&l.target_document_id==='cobra-original')).toBe(true);
 expect(tables.decisions!.find(d=>d.document_id==='cobra-original')!.sha256).not.toBe(tables.decisions!.find(d=>d.document_id==='cobra-amended')!.sha256);
 const release=await Bun.file(root+'/loader-release.json').json();
 for(const artifact of release.artifacts){
  expect(pack.loader.artifacts).toContainEqual({reference:artifact.reference,sha256:artifact.sha256});
  expect(hash(await Bun.file(root+'/'+artifact.reference).arrayBuffer())).toBe(artifact.sha256);
 }
 const inventory=await Bun.file(root+'/loader-inventory.json').json();expect(inventory.entries).toHaveLength(34);
 for(const entry of inventory.entries){const d=tables.decisions!.find(d=>d.document_id===entry.id)!;expect(entry.url).toBe(d.source_url);expect(entry.metadata.sha256).toBe(d.sha256);expect(entry.expected_sha256).toBe(d.sha256);expect(entry.license.redistribution).toBe('allowed');}
});

// A test-only reference consumer. Expectations are checked-in authored input;
// neither the builder nor this interpreter writes them. No email/PACER integration.
// @covers US-061-AC10 @covers US-061-AC11
test('fixed replay checks independent expected receipts, recovery and missing coverage',async()=>{
 const input=await Bun.file(root+'/replay.json').json(),decisions=await table('decisions');
 const receipts=new Set<string>(),reviews=new Map<string,{status:string;actionable:boolean}>(),failures=new Set<string>(),covered=new Set<string>();
 const links=await table('decision_links');
 const fictional=new Map<string,{status:string;counsel:string|null}>(input.fictional_reviews.map((r:any)=>[r.review_id,{status:'not_attempted',counsel:null}]));
 for(const event of input.workflow_events){
  const expected=input.expected_outputs.find((x:any)=>x.event_id===event.event_id);
  const key=JSON.stringify([event.window_id,event.stage,event.document_id,event.stage==='delivery_request'?event.recipient_id:null]);
  let action:string,notification:string|null=null;
  if(event.stage==='delivery_request'){
   notification=JSON.stringify([event.recipient_id,decisions.find(d=>d.document_id===event.document_id)!.sha256,event.alert_kind]);
   action=deliveryRequest(receipts,notification,event.outcome);
   if(action==='delivery_retry_eligible')failures.add(key);
   else if(action==='notification_sent')failures.delete(key);
  }else if(event.outcome==='failed'){
   failures.add(key);action='failure_opened';
  }else if(event.stage==='listing'){
   const recovered=failures.delete(key);covered.add(event.window_id);action=event.outcome==='empty'?'coverage_complete_empty':recovered?'coverage_recovered':'coverage_complete';
  }else if(event.stage==='screening'){
   failures.delete(key);action=event.outcome==='not_flagged'?'no_alert':reviews.has(event.document_id)?'review_updated':'review_created';
   if(event.outcome==='flagged')reviews.set(event.document_id,{status:'candidate',actionable:true});
  }else if(event.stage==='status'){
   const targets=links.filter(l=>l.source_document_id===event.document_id&&l.relationship==='vacates');expect(targets.length).toBeGreaterThan(0);
   for(const target of targets){expect(reviews.has(target.target_document_id!)).toBe(true);reviews.set(target.target_document_id!,{status:'vacated',actionable:false});}
   action='review_status_updated';
  }else if(event.stage==='enrichment'){
   if(event.outcome==='not_attempted')action='enrichment_unknown';
   else{
    const lookup=input.enrichment_fixtures.find((l:any)=>l.lookup_id===event.lookup_id),review=input.fictional_reviews.find((r:any)=>r.review_id===event.review_id);
    expect(lookup.fictional_case).toBe(review.fictional_case);expect(lookup.fictional_party).toBe(review.fictional_party);
    fictional.set(event.review_id,{status:lookup.lookup_status,counsel:lookup.lookup_status==='found'?lookup.counsel_name:null});
    action=lookup.lookup_status==='found'?'review_enrichment_updated':'review_enrichment_unknown';
   }
  }
  else{expect(failures.delete(key)).toBe(true);action='stage_recovered';}
  expect({action,notification,failures:failures.size},event.event_id).toEqual({action:expected.expected_action,notification:expected.notification_key,failures:expected.open_failure_count});
  if(expected.affected_document_id)expect(reviews.get(expected.affected_document_id)).toEqual({status:expected.expected_review_status,actionable:expected.expected_actionable});
  if(expected.expected_enrichment_status)expect(fictional.get(event.review_id)).toEqual({status:expected.expected_enrichment_status,counsel:expected.expected_counsel_name});
 }
 expect(receipts.size).toBe(6);expect(failures.size).toBe(2);
 // Eligibility precedes transport: even a proposed failed transport on a known
 // duplicate is suppressed without creating a receipt or delivery failure.
 const duplicate=[...receipts][0]!;
 expect(deliveryRequest(receipts,duplicate,'simulated_transport_failed')).toBe('suppressed_duplicate');
 expect(receipts.size).toBe(6);expect(failures.size).toBe(2);
 expect(input.collection_windows.filter((w:any)=>!covered.has(w.window_id)).map((w:any)=>w.window_id)).toEqual(['window-3']);
 const attempts=await Bun.file(root+'/retrieval-attempts.json').json();expect(attempts.some((a:any)=>a.status==='failed')).toBe(true);
});

// @covers US-061-AC12
test('counsel has party/page/as-of evidence and absent differs from unattempted',async()=>{
 const rows=await table('counsel'),pages=new Map((await table('decision_pages')).map(p=>[p.page_id,p]));
 const named=rows.filter(r=>r.counsel_name!==null);expect(named).toHaveLength(8);
 for(const c of named){expect(c.party_scope).toBeString();expect(c.as_of_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);expect(pages.get(c.source_page_id!)!.text!.includes(c.source_excerpt!)).toBe(true);}
 expect(rows.find(r=>r.document_id==='hirschfeld-vacatur')!.observation_status).toBe('not_in_document_manual_text_review_no_pacer_attempted');
 expect(rows.some(r=>r.observation_status==='not_assessed_no_pacer_attempted'&&r.counsel_name===null)).toBe(true);
 const enriched=await table('enrichment_fixtures');expect(enriched.every(r=>r.fictional_case!.includes('Fictional')&&r.source_kind==='fabricated_pacer_like_response')).toBe(true);
 expect(enriched.find(r=>r.lookup_status==='lookup_failed')!.counsel_name).toBeNull();
});

// @covers US-061-AC9
test('complete export preserves original bytes and refuses tampering or uncleared rights',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'umf-appellate-'));
 const run=async(packPath:string,output:string)=>{
  const p=Bun.spawn(['bun','scripts/export-domain-pack.ts','--pack',packPath,'--output',output,'--include-sources'],{stdout:'pipe',stderr:'pipe'});
  const [,stderr]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text()]);return {code:await p.exited,stderr};
 };
 try{
  const output=join(dir,'export');expect((await run(root+'/pack.json',output)).code).toBe(0);
  const pack=await Bun.file(root+'/pack.json').json();for(const d of (await table('decisions')))expect(hash(await Bun.file(output+'/'+d.original_file).arrayBuffer())).toBe(d.sha256!);
  const copy=join(dir,'copy');await cp(root,copy,{recursive:true});
  pack.sources.castillo.license.redistribution='unknown';await Bun.write(copy+'/pack.json',JSON.stringify(pack));
  expect((await run(copy+'/pack.json',join(dir,'denied'))).stderr).toContain('Source redistribution is not cleared');
  pack.sources.castillo.license.redistribution='allowed';await Bun.write(copy+'/pack.json',JSON.stringify(pack));await Bun.write(copy+'/sources/castillo.pdf','%PDF altered');
  expect((await run(copy+'/pack.json',join(dir,'tampered'))).code).not.toBe(0);
 }finally{await rm(dir,{recursive:true,force:true});}
},15000);
