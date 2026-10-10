import {test,expect} from 'bun:test';
import {mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectSecSubmissions,projectSecCompanyFacts} from '../../src/domain-packs/public-company';
import {inspectDomainPack} from '../../src/domain-packs/profile';
import {validateDocument} from '../../src/validation/document';
import {readDocument} from '../../src/model/document';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';
import {Database} from 'bun:sqlite';
const root='spec/domain-packs/public-company-intelligence';
const load=()=>Bun.file(root+'/pack.json').json();
const facts=(observations:string)=>'{"cik":320193,"facts":{"us-gaap":{"Cash":{"label":"Cash","future":{"retained":true},"units":{"USD":'+observations+'}}}}}';
const submissions=()=>({cik:'0000320193',name:'Synthetic counterexample',tickers:['SYN'],exchanges:['Synthetic'],filings:{recent:{accessionNumber:['0000320193-26-000001','0000320193-26-000002'],filingDate:['2026-01-02','2026-01-03'],reportDate:['2026-01-01',''],form:['8-K','8-K/A'],primaryDocument:['xsl/test.xml','report.htm'],items:['2.01','2.02'],future:['retained','unknown']}}});
test('@covers US-078-AC3 exact facts preserve large tokens, duplicate context, unknowns and absent/null/zero',()=>{
 const r=projectSecCompanyFacts(facts('[{"val":9007199254740993.0100,"accn":"A","future":{"x":1}},{"val":9007199254740993.0100,"accn":"A"},{},{"val":null},{"val":0}]'),'s');
 expect(r.map(x=>x.value)).toEqual(['9007199254740993.0100','9007199254740993.0100',null,null,'0']);
 expect(r.map(x=>x.value_state)).toEqual(['present','present','absent','null','present']);
 expect(new Set(r.map(x=>x.id)).size).toBe(5);expect(r[0]!.native_json).toContain('"future":{"x":1}');expect(r[0]!.concept_json).toContain('"future":{"retained":true}');
 expect(()=>projectSecCompanyFacts(facts('[{"val":"1"}]'),'s')).toThrow();
 expect(()=>projectSecCompanyFacts('{"cik":0,"facts":{}}','s')).toThrow();
 expect(()=>projectSecCompanyFacts('{"cik":1,"cik":2,"facts":{}}','s')).toThrow();
});
test('@covers US-078-AC3 submission arrays preserve unknown columns and reject malformed identities/lengths',()=>{
 const s=submissions(),p=projectSecSubmissions(JSON.stringify(s),'s');expect(p.companies[0]!.id).toBe('0000320193');expect(p.filings[0]!.native_json).toContain('"future":"retained"');expect(p.filings[0]!.primary_url).toContain('/xsl/test.xml');
 const short=submissions();short.filings.recent.items.pop();expect(()=>projectSecSubmissions(JSON.stringify(short),'s')).toThrow();
 const duplicate=submissions();duplicate.filings.recent.accessionNumber[1]=duplicate.filings.recent.accessionNumber[0]!;expect(()=>projectSecSubmissions(JSON.stringify(duplicate),'s')).toThrow();
 const escaped=submissions();escaped.filings.recent.primaryDocument[0]='../outside';expect(()=>projectSecSubmissions(JSON.stringify(escaped),'s')).toThrow();
});
test('@covers US-078-AC1 inventory has exact native recovery, key closure and valid ontology',async()=>{
 const p=await load();expect(inspectDomainPack(p)).toEqual({valid:true,complete:true,diagnostics:[]});expect(p.schemas).toHaveLength(15);
 const specs=new Map<string,any>();
 for(const s of p.schemas){const text=await Bun.file(root+'/'+s.reference).text();if(s.format==='tablespec'){expect(exportTableSpec(importTableSpec(text,{id:s.id,format:'json'}))).toBe(text);specs.set(s.id,JSON.parse(text));}else expect(validateDocument(readDocument(text,'json'))).toEqual({valid:true,complete:true,diagnostics:[]});}
 for(const s of specs.values())for(const fk of s.relationships?.foreign_keys??[])expect(specs.get(fk.references_table)?.primary_key).toEqual([fk.references_column]);
 for(const s of Object.values(p.sources) as any[])if(!s.reference.includes(':'))expect(new Bun.CryptoHasher('sha256').update(await Bun.file(root+'/'+s.reference).arrayBuffer()).digest('hex')).toBe(s.checksum.value);
});
test('@covers US-078-AC2 screen independently selects metadata items and excludes earnings-only controls',async()=>{
 const p=await load(),selection=await Bun.file(root+'/source-selection.json').json(),db=new Database(':memory:');
 try{
  db.exec('CREATE TABLE filings(id TEXT,company_id TEXT,accession TEXT,items TEXT); CREATE TABLE business_events(filing_id TEXT,native_item TEXT)');
  const selected:string[][]=[],earnings:string[]=[];
  for(const s of selection.inputs.filter((x:any)=>x.kind==='submissions')){
   const recent=(await Bun.file(root+'/'+s.reference).json()).filings.recent;
   for(let i=0;i<recent.form.length;i++){
    const acc=recent.accessionNumber[i],id=JSON.stringify([s.cik,acc]),items=new Set<string>(recent.items[i].split(',').map((x:string)=>x.trim()));
    db.query('INSERT INTO filings VALUES(?,?,?,?)').run(id,s.cik,acc,recent.items[i]);
    const hits=[...items].filter(x=>x==='2.01'||x==='2.05');for(const item of hits)db.query('INSERT INTO business_events VALUES(?,?)').run(id,item);
    if(hits.length)selected.push([s.cik,acc]);else if(items.has('2.02'))earnings.push(acc);
   }
  }
  selected.sort((a,b)=>a.join().localeCompare(b.join()));expect(selected).toEqual([['0000034088','0001193125-26-291986'],['0000858877','0000858877-26-000075']]);
  expect(p.scenario_checks[0].expected).toEqual(selected);expect(db.query(p.scenario_checks[0].sql).values()).toEqual(selected);expect(earnings.length).toBeGreaterThan(20);expect(selected.every(x=>!earnings.includes(x[1]!))).toBe(true);
 }finally{db.close();}
});
test('@covers US-078-AC7 lineage separates selected universe, source observations and authored hypotheses',async()=>{
 const p=await load();expect(p.research_profile.membership_basis).toBe('selected-research-universe');expect(p.execution_profile.mode).toBe('fixed');expect(p.generator).toBeUndefined();expect(p.fixture_counts.companies).toBe(25);expect(p.fixture_counts.business_events).toBe(2);
 expect(p.sources['rows-opportunity_hypotheses'].data_kind).toBe('unknown');expect(p.sources['rows-filings'].data_kind).toBe('observed');expect(p.qualification.hypotheses).toContain('unreviewed');expect(p.qualification.documents).toContain('403');
 const selected=p.execution_profile.include_sources.map((id:string)=>p.sources[id]);expect(selected.every((s:any)=>!s.reference.includes(':'))).toBe(true);
 expect((await Bun.file(root+'/data/analysis_runs.csv').text())).toContain('"\\N","\\N"');
});
async function run(args:string[]){const child=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});const [out,error]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);return {code:await child.exited,out,error};}
test('@covers US-078-AC4 rebuild is byte-identical from pinned offline inputs',async()=>{expect(await run(['bun','scripts/domain-packs/public-company.ts','--check'])).toMatchObject({code:0,error:''});},30000);
test('@covers US-078-AC6 export preserves sources and refuses corruption/uncleared rights',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'umf-company-'));
 try{
  const args=['bun','scripts/export-domain-pack.ts','--pack',root+'/pack.json','--output',join(temporary,'export'),'--include-sources'];expect(await run(args)).toMatchObject({code:0,error:''});expect(await run([...args,'--check'])).toMatchObject({code:0,error:''});
  const copy=join(temporary,'pack');await cp(root,copy,{recursive:true});const original=await load();
  for(const mutation of ['checksum','rights']){const p=structuredClone(original);if(mutation==='checksum')p.sources.selection.checksum.value='0'.repeat(64);else p.sources.selection.license.redistribution='unknown';await Bun.write(join(copy,'pack.json'),JSON.stringify(p));const r=await run(['bun','scripts/export-domain-pack.ts','--pack',join(copy,'pack.json'),'--output',join(temporary,mutation),'--include-sources']);expect(r.code).not.toBe(0);expect(r.error).toContain(mutation==='checksum'?'checksum':'redistribution');}
 }finally{await rm(temporary,{recursive:true,force:true});}
},30000);
