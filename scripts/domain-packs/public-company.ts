/** Offline build from reviewed, pinned SEC inputs. Network collection is caller-owned. */
import {join,resolve} from 'node:path';
import {projectSecSubmissions,projectSecCompanyFacts,type PublicCompanyRow} from '../../src/domain-packs/public-company';
import {ontology} from './ontology';
const root=resolve('spec/domain-packs/public-company-intelligence'),check=process.argv.includes('--check');
const encode=(x:unknown)=>JSON.stringify(x,null,2)+'\n';
const hash=(x:string|Uint8Array)=>new Bun.CryptoHasher('sha256').update(x).digest('hex');
const selectionText=await Bun.file(join(root,'source-selection.json')).text(),selection=JSON.parse(selectionText);
const rows:Record<string,PublicCompanyRow[]>={},sources:Record<string,any>={},bindings:any[]=[],schemas:any[]=[];
const fields:Record<string,string>={
 companies:'id name source_id@source_snapshots',
 identifiers:'id company_id@companies scheme native_value source_id@source_snapshots',
 universes:'id title membership_basis window_start window_end',
 memberships:'id universe_id@universes company_id@companies selected_at basis',
 source_snapshots:'id company_id?@companies kind reference upstream_url sha256 retrieved_at coverage upstream_source_id?@source_snapshots',
 filings:'id company_id@companies snapshot_id@source_snapshots accession filing_date report_date? form items? primary_document? primary_url? native_path native_json',
 documents:'id filing_id@filings source_id?@source_snapshots native_url? availability format extraction_status',
 financial_observations:'id company_id@companies snapshot_id@source_snapshots taxonomy concept unit ordinal value? value_state start_date? end_date? accession? filed_date? form? fiscal_year? fiscal_period? frame? native_path native_json concept_json',
 business_events:'id company_id@companies filing_id@filings event_kind evidence_basis reported_at event_date? native_item',
 signal_definitions:'id version title method meaning',
 signal_observations:'id company_id@companies event_id@business_events rule_id@signal_definitions run_id@analysis_runs result evidence_basis',
 opportunity_hypotheses:'id signal_id@signal_observations run_id@analysis_runs interpretation review_status offering_scope',
 analysis_runs:'id method version model_id? prompt_version? source_revision analyzed_at',
 evidence_links:'id signal_id@signal_observations filing_id@filings snapshot_id@source_snapshots native_path citation_kind',
};
for(const name of Object.keys(fields))rows[name]=[];
function source(id:string,reference:string,text:string,kind:string,provenance:any){
 sources[id]={kind:'external',data_kind:kind,reference,format:reference.endsWith('.csv')?'csv':'json',revision:'2026-10-09',checksum:{algorithm:'sha256',value:hash(text)},license:{redistribution:'allowed',reference:'https://www.sec.gov/about/webmaster-frequently-asked-questions',attribution:'SEC EDGAR public filing data; UMF selected projections and authored research configuration',notices:['EDGAR public filing reuse policy; company-authored filings are not described as government-authored works.']},provenance};
}
async function write(reference:string,text:string){
 if(Buffer.byteLength(text)>10*1024*1024)throw Error('Per-file export budget: '+reference);
 if(check){if(!await Bun.file(join(root,reference)).exists()||await Bun.file(join(root,reference)).text()!==text)throw Error('Stale public-company artifact: '+reference);}
 else await Bun.write(join(root,reference),text);
}
const start=selection.window.start,end=selection.window.end;
const within=(date:string|null)=>date!==null&&date>=start&&date<=end;
const allFilings:PublicCompanyRow[]=[];
for(const input of selection.inputs){
 const text=await Bun.file(join(root,input.reference)).text();if(hash(text)!==input.sha256)throw Error('Source checksum differs: '+input.id);
 source(input.id,input.reference,text,'observed',{publisher:'SEC / UMF scoped projection',retrieved_at:input.retrieved_at,upstream_url:input.url,source_ids:input.upstream?[input.upstream.id]:[],transformations:input.kind==='submissions'?[selection.submission_scope]:[selection.financial_scope.method+' Concepts: '+input.selection.join(', ')]});
 if(input.upstream){
  sources[input.upstream.id]={kind:'external',data_kind:'observed',reference:input.upstream.reference,format:'json',revision:'2026-10-09',checksum:{algorithm:'sha256',value:input.upstream.sha256},license:{redistribution:'allowed',reference:'https://www.sec.gov/about/webmaster-frequently-asked-questions'},provenance:{publisher:'SEC',retrieved_at:input.retrieved_at,transformations:[]},availability:'reference-only; original full response exceeds selected corpus scope',byte_count:input.upstream.bytes};
  rows.source_snapshots!.push({id:input.upstream.id,company_id:input.cik,kind:input.kind+'-full-reference',reference:input.upstream.reference,upstream_url:input.url,sha256:input.upstream.sha256,retrieved_at:input.retrieved_at,coverage:'Full response hash only; original bytes not bundled',upstream_source_id:null});
 }
 rows.source_snapshots!.push({id:input.id,company_id:input.cik,kind:input.kind,reference:input.reference,upstream_url:input.url,sha256:input.sha256,retrieved_at:input.retrieved_at,coverage:input.kind==='companyfacts'?'Five selected entity-wide concepts; all selected observations retained in JSON':'Scoped recent-array 8-K/8-K/A window only; original ordinals retained in selection; older shards not retrieved',upstream_source_id:input.upstream?.id??null});
 if(input.kind==='submissions'){
  const p=projectSecSubmissions(text,input.id);rows.companies!.push(...p.companies);rows.identifiers!.push(...p.identifiers);allFilings.push(...p.filings);
 }else if(input.kind==='companyfacts')rows.financial_observations!.push(...projectSecCompanyFacts(text,input.id).filter(r=>within(r.filed_date??null)));
 else throw Error('Unsupported selected input');
}
rows.filings=allFilings.filter(r=>['8-K','8-K/A'].includes(r.form!)&&within(r.filing_date!));
rows.universes!.push({id:'selected-25',title:'Selected cross-sector public-company research universe',membership_basis:'selected-research-universe',window_start:start,window_end:end});
for(const company of rows.companies!)rows.memberships!.push({id:JSON.stringify(['selected-25',company.id]),universe_id:'selected-25',company_id:company.id!,selected_at:'2026-10-09',basis:selection.selection_basis});
rows.signal_definitions!.push({id:'disclosed-deal-or-exit',version:'1.0.0',title:'Disclosed acquisition/disposition or exit-activity metadata',method:'Exact comma-delimited 8-K item selection: 2.01 or 2.05',meaning:'Evidence of a reported filing category; no unannounced deal, need, likelihood or recommendation asserted'});
rows.analysis_runs!.push({id:'fixed-screen-2026-10-09',method:'deterministic-item-metadata',version:'1.0.0',model_id:null,prompt_version:null,source_revision:'1.0.0',analyzed_at:'2026-10-09'});
const attemptedDocuments=new Set(rows.companies!.flatMap(c=>{
 const candidates=rows.filings!.filter(f=>f.company_id===c.id&&f.primary_document);
 const deal=candidates.filter(f=>(f.items??'').split(',').some(i=>['2.01','2.05'].includes(i.trim())));
 return (deal[0]??candidates[0])?[(deal[0]??candidates[0])!.id]:[];
}));
for(const f of rows.filings){
 rows.documents!.push({id:JSON.stringify([f.id,'primary']),filing_id:f.id!,source_id:null,native_url:f.primary_url??null,availability:attemptedDocuments.has(f.id!)?'unavailable-http-403':'not-requested',format:'html',extraction_status:'not-retrieved; no narrative/section/exhibit analysis'});
 for(const item of new Set((f.items??'').split(',').map(s=>s.trim()))){
  if(!['2.01','2.05'].includes(item))continue;
  const eventId=JSON.stringify([f.id,item]),signalId=JSON.stringify([eventId,'disclosed-deal-or-exit']);
  rows.business_events!.push({id:eventId,company_id:f.company_id!,filing_id:f.id!,event_kind:item==='2.01'?'acquisition-or-disposition-completion-metadata':'exit-or-disposal-cost-metadata',evidence_basis:'SEC submissions item metadata only',reported_at:f.filing_date!,event_date:null,native_item:item});
  rows.signal_observations!.push({id:signalId,company_id:f.company_id!,event_id:eventId,rule_id:'disclosed-deal-or-exit',run_id:'fixed-screen-2026-10-09',result:'candidate-for-human-research',evidence_basis:'Observed disclosed filing item; no narrative interpretation'});
  rows.opportunity_hypotheses!.push({id:JSON.stringify([signalId,'hypothesis']),signal_id:signalId,run_id:'fixed-screen-2026-10-09',interpretation:'Review whether this disclosed transaction or exit activity creates a relevant advisory or integration opportunity.',review_status:'unreviewed-authored-hypothesis',offering_scope:'unspecified; no fit or ranking claim'});
  rows.evidence_links!.push({id:JSON.stringify([signalId,'evidence']),signal_id:signalId,filing_id:f.id!,snapshot_id:f.snapshot_id!,native_path:f.native_path!,citation_kind:'SEC recent-array row ordinal; not a document page/section citation'});
 }
}
const specs:any[]=[];
for(const [name,definition] of Object.entries(fields)){
 const columns=definition.split(' ').map(field=>({name:field.split('@')[0]!.replace('?',''),data_type:'VARCHAR',nullable:field.includes('?'),description:`${name}.${field.split('@')[0]!.replace('?','')}; exact source literal or explicitly authored research metadata.`}));
 const foreign_keys=definition.split(' ').filter(f=>f.includes('@')).map(f=>({column:f.split('@')[0]!.replace('?',''),references_table:f.split('@')[1]!,references_column:'id'}));
 const spec={version:'1.0',table_name:name,description:`Public-company intelligence ${name}; source/context and interpretation qualifications apply.`,columns,primary_key:['id'],...(foreign_keys.length?{relationships:{foreign_keys}}:{})};specs.push(spec);
 const header=columns.map(c=>c.name),csv=[header,...rows[name]!.map(r=>header.map(c=>{if(!Object.hasOwn(r,c))throw Error('Missing column '+name+'.'+c);return r[c];}))].map(r=>r.map(v=>'"'+(v===null?'\\N':String(v)).replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
 await write('umf/'+name+'.json',encode(spec));await write('data/'+name+'.csv',csv);
 source('rows-'+name,'data/'+name+'.csv',csv,['opportunity_hypotheses','signal_definitions','universes','memberships'].includes(name)?'unknown':'observed',{publisher:'UMF',source_ids:selection.inputs.map((s:any)=>s.id),transformations:[`CONTRACT-058 offline projection 1.0.0; ${name}. Authored configuration/hypotheses are not observed company needs. Filing and financial filed-date window ${start} through ${end}.`]});
 schemas.push({id:name,format:'tablespec',reference:'umf/'+name+'.json'});bindings.push({schema_id:name,source_id:'rows-'+name,role:'rows'});
}
await write('ontology.json',encode(ontology('public-company-intelligence',specs)));schemas.push({id:'ontology',format:'umf',reference:'ontology.json'});
source('selection','source-selection.json',selectionText,'unknown',{publisher:'UMF',transformations:['Authored source selection and scope; no index membership claim']});
const loader=await Bun.file(join(root,'loader-annotation.json')).json();
source('loader-inventory','inventory.json',await Bun.file(join(root,'inventory.json')).text(),'unknown',{publisher:'UMF',transformations:['Explicit 50-URL acquisition inventory for shared CONTRACT-057 companion; refresh and scoped projection are separate.']});
const sql="SELECT DISTINCT f.company_id,f.accession FROM filings f JOIN business_events e ON e.filing_id=f.id WHERE e.native_item IN ('2.01','2.05') ORDER BY f.company_id,f.accession";
const expected=await Bun.file(join(root,'scenarios/deal-signals.expected.json')).json();
source('reviewed-scenario','scenarios/deal-signals.expected.json',await Bun.file(join(root,'scenarios/deal-signals.expected.json')).text(),'unknown',{publisher:'UMF',transformations:['Independently enumerated accession expectations from pinned SEC metadata; reviewed finite scenario, not a prevalence claim.']});
const preservation=await Bun.file(resolve('spec/loader-preservation/1.0.0/profile.json')).json();
const pack={preservation,id:'public-company-intelligence',version:'1.0.0',description:'25 selected SEC issuers: fixed filing-item evidence and exact scoped financial observations; separate authored deal-opportunity hypotheses.',domain_types:{cik:{description:'Ten-digit SEC Central Index Key; ticker aliases are not identity'},exact_financial_token:{description:'Native JSON numeric token as text; units, taxonomy, period and source ordinal remain attached'},evidence_assertion:{description:'Source fact, item-metadata screen and authored hypothesis remain separate records'}},sources,source_bindings:bindings,schemas,loader,execution_profile:{version:'1.0.0',targets:{tabular:Object.keys(fields),graph:['ontology']},mode:'fixed',include_sources:[...selection.inputs.map((s:any)=>s.id),'selection','reviewed-scenario','loader-inventory'],qualification:'Fixed observed SEC JSON subset and explicitly authored research configuration/hypotheses. No observed replay, exhaustive filings, narrative extraction, S&P membership, model analysis, native graph or live Databricks claim.'},scenario_checks:[{id:'disclosed-deal-or-exit',question:'Which selected issuers disclosed 8-K item 2.01 or 2.05 within the window?',sql,expected}],fixture_counts:Object.fromEntries(Object.entries(rows).map(([name,r])=>[name,r.length])),research_profile:{version:'1.0.0',universe:'selected-25',membership_basis:'selected-research-universe',filing_window:selection.window,financial_scope:selection.financial_scope,documents:selection.document_retrieval,coverage:'Recent-array 8-K/8-K/A rows only; older shards not fetched. Financial table contains selected-concept observations filed within window; original scoped JSON retains other dates.',consumer_owned:['remote fetching','Databricks jobs/storage','model routing/evaluation','config/admin UI','email digest'],remote_candidates:['GLEIF','FTC/DOJ public actions','CUAD/MAUD evaluation data','CourtListener'],private_joins:'excluded'},qualification:{financial_values:'Exact numeric tokens as VARCHAR; no ratio arithmetic or fact deduplication',hypotheses:'Authored and unreviewed; no model or offering-specific fit claim',documents:'Metadata references only; HTTP 403 originals not bundled',graph:'Schema and portable candidate only; Truss/Ashlar intake unexecuted'}};
await write('pack.json',encode(pack));
console.log(JSON.stringify({checked:check,tables:specs.length,rows:pack.fixture_counts,bytes:Object.values(sources).filter((s:any)=>!s.reference.includes(':')).reduce((sum:number,s:any)=>sum+Bun.file(join(root,s.reference)).size,0)}));
