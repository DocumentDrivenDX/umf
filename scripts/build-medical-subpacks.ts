import {mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {projectMedicalFhir,projectCdcMortality,projectDicomMetadata,type MedicalTables,type MedicalRow} from '../src/domain-packs/medical';
import {createValidator} from '../src/validation/schema';
import {generateDomainPackSchema} from '../src/domain-packs/schema';
import {importTableSpec,exportTableSpec} from '../src/adapters/tablespec';

const base='spec/domain-packs',check=process.argv.includes('--check');
const validate=createValidator().compile(generateDomainPackSchema());
const sha=(bytes:Uint8Array)=>new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
const serialize=(v:unknown)=>JSON.stringify(v,null,2)+'\n';
async function output(path:string,text:string){
 if(check){if(!await Bun.file(path).exists()||await Bun.file(path).text()!==text)throw Error('Stale medical artifact: '+path);}
 else {await mkdir(join(path,'..'),{recursive:true});await Bun.write(path,text);}
}
const csv=(rows:MedicalRow[],columns:string[])=>columns.join(',')+'\n'+rows.map(row=>columns.map(c=>{
 const v=row[c];if(v===null||v===undefined)return '\\N';
 const s=String(v);if(s==='\\N')throw Error('Literal collides with CSV null marker');
 return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
}).join(',')).join('\n')+(rows.length?'\n':'');
async function source(root:string,reference:string,data_kind:string,publisher:string,extra:Record<string,unknown>={}){
 const bytes=new Uint8Array(await Bun.file(join(root,reference)).arrayBuffer());
 return {kind:'external',data_kind,reference,format:reference.endsWith('.dcm')?'dicom-part10':reference.endsWith('.txt')?'text':'json',
  checksum:{algorithm:'sha256',value:sha(bytes)},license:{redistribution:'allowed',reference:'licenses/NOTICE.txt'},
  provenance:{publisher,retrieved_at:'2026-10-08',transformations:[]},...extra};
}
const remote=(reference:string,publisher:string,data_kind='unknown',revision?:string)=>({kind:'external',data_kind,reference,format:'publisher-page',
 ...(revision?{revision}:{}),license:{redistribution:'unknown',notices:['Reference or consumer-local licensed input only; no bytes bundled or retrieval implied.']},provenance:{publisher}});
async function build(id:string,tables:MedicalTables,sources:Record<string,any>,qualification:Record<string,unknown>,notice:string,bindings:Record<string,string[]>={}){
 const root=join(base,id),schemas=[] as {id:string;format:string;reference:string}[],source_bindings=[] as {schema_id:string;source_id:string;role:string}[];
 const fixture_counts:Record<string,number>={};
 await output(join(root,'licenses/NOTICE.txt'),notice);
 sources.notices=await source(root,'licenses/NOTICE.txt','unknown','UMF project');
 for(const [name,rows] of Object.entries(tables)){
  if(!rows.length)throw Error('A fixture table needs authored columns: '+name);
  const columns=Object.keys(rows[0]!);
  if(rows.some(r=>Object.keys(r).join('\0')!==columns.join('\0')))throw Error('Inconsistent projection columns: '+name);
  const schema:any={version:'1.0',table_name:name,description:'Source-qualified selected view. Full original meaning remains in pinned sources. '+String(qualification.subset),
   columns:columns.map(n=>({name:n,data_type:n.endsWith('_json')?'TEXT':rows.some(r=>typeof r[n]==='boolean')?'BOOLEAN':'VARCHAR',nullable:rows.some(r=>r[n]===null),description:n.replaceAll('_',' ')})),primary_key:[columns[0]!]};
  const fks:any[]=[];
  if(name!=='resources'&&columns.includes('resource_key')&&tables.resources)fks.push({column:'resource_key',references_table:'resources',references_column:'resource_key'});
  if(name==='resource_references')fks.push({column:'target_key',references_table:'resources',references_column:'resource_key'});
  if(name==='claim_lines')fks.push({column:'parent_line_key',references_table:'claim_lines',references_column:'line_key'});
  if(name==='adjudications')fks.push({column:'line_key',references_table:'claim_lines',references_column:'line_key'});
  if(name==='attributes')fks.push({column:'source_id',references_table:'instances',references_column:'source_id'});
  if(fks.length)schema.relationships={foreign_keys:fks};
  const schemaText=serialize(schema);
  if(exportTableSpec(importTableSpec(schemaText,{id:name,format:'json'}))!==schemaText)throw Error('Native schema differs');
  await output(join(root,'umf',name+'.json'),schemaText);
  const reference='data/'+name+'.csv',text=csv(rows,columns);await output(join(root,reference),text);
  const sourceId='csv_'+name;
  sources[sourceId]={kind:'external',data_kind:id==='medical-terminology'?'unknown':id==='medical-epidemiology'&&name==='measures'?'observed':'fabricated',reference,format:'csv',revision:id+'-1.0.0',
   checksum:{algorithm:'sha256',value:sha(new TextEncoder().encode(text))},license:{redistribution:'allowed',reference:'licenses/NOTICE.txt'},
   provenance:{publisher:'UMF project',source_ids:bindings[name]??Object.keys(sources).filter(k=>k!=='notices'&&!k.startsWith('csv_')&&!sources[k].reference.includes(':')),transformations:['Deterministic selected-column projection; original native sources retained separately.']}};
  schemas.push({id:name,format:'tablespec',reference:'umf/'+name+'.json'});
  source_bindings.push({schema_id:name,source_id:sourceId,role:'rows'});
  for(const sourceId of bindings[name]??[])source_bindings.push({schema_id:name,source_id:sourceId,role:id==='medical-terminology'?'terminology':'reference'});
  fixture_counts[name]=rows.length;
 }
 const pack={id,version:'1.0.0',description:'Independently versioned medical-family subpack; no implicit retrieval, code execution or native equivalence.',
  domain_types:{source_qualified_identity:{description:'Source namespace and native identity; no inferred patient identity.'},exact_native_literal:{description:'Numeric and temporal source spelling retained as text.'}},
  schemas,sources,source_bindings,csv_conventions:{encoding:'UTF-8',null_value:'\\N',header:true,quote:'"'},fixture_counts,qualification};
 if(!validate(pack))throw Error('Invalid generated metadata: '+JSON.stringify(validate.errors));
 await output(join(root,'pack.json'),serialize(pack));
 await output(join(root,'README.md'),'# '+id+' 1.0.0\n\n'+String(qualification.subset)+'\n\n'+String(qualification.limits)+'\n\n'+
  'Use the shared `export-domain-pack.ts --include-sources` command with this pack, then TableSpec `sample-data ingest`. Sources and schemas are local and checksum-pinned. Remote/licensed references remain metadata.\n\nSee `licenses/NOTICE.txt`, source provenance and [governed evidence](../../../docs/helix/04-build/evidence/medical-subpacks.md).\n');
 console.log(JSON.stringify({pack:id,schemas:schemas.length,rows:Object.values(fixture_counts).reduce((a,b)=>a+b,0),checked:check}));
}

const carrierRoot=join(base,'medical-carrier'),files=(await readdir(join(carrierRoot,'sources'))).filter(n=>n.endsWith('.json')&&n!=='workflow-events.json').sort();
const carrierSources:Record<string,any>={};
const groups:Record<string,{source_id:string;text:string}[]>={hl7:[],supplement:[]};
const upstreamNames:Record<string,string>={coverage:'coverage-example','eligibility-request':'coverageeligibilityrequest-example','eligibility-response':'coverageeligibilityresponse-example',claim:'claim-example',claimresponse:'claimresponse-example',eob:'explanationofbenefit-example',insuranceplan:'insuranceplan-example',enrollment:'enrollmentrequest-example',payment:'paymentreconciliation-example'};
for(const file of files){
 const id=file.slice(0,-5),official=id.startsWith('hl7-'),text=await Bun.file(join(carrierRoot,'sources',file)).text();
 groups[official?'hl7':'supplement']!.push({source_id:id,text});
 carrierSources[id]=await source(carrierRoot,'sources/'+file,'fabricated',official?'HL7 International':'UMF project',official?{
  format:'fhir-r4-json',revision:'4.0.1',license:{id:'CC0-1.0',reference:'https://hl7.org/fhir/R4/license.html',redistribution:'allowed'},
  provenance:{publisher:'HL7 International',retrieved_at:'2026-10-08',upstream_url:'https://hl7.org/fhir/R4/'+upstreamNames[id.slice(4)]+'.json',transformations:[]}}:{format:'fhir-r4-json',revision:'umf-scenario-1.0.0'});
}
const carrier=projectMedicalFhir(groups.hl7!,'hl7');
const supplement=projectMedicalFhir(groups.supplement!,'supplement');
for(const [name,rows] of Object.entries(supplement))carrier[name]!.push(...rows);
carrier.workflow_events=(await Bun.file(join(carrierRoot,'sources/workflow-events.json')).json()).events;
carrierSources.workflow=await source(carrierRoot,'sources/workflow-events.json','fabricated','UMF project');
carrierSources.cms_rif=remote('https://data.cms.gov/','Centers for Medicare & Medicaid Services','fabricated');
carrierSources.cms_blue_button=remote('https://bluebutton.cms.gov/data/understanding-the-data/','Centers for Medicare & Medicaid Services','fabricated');
await build('medical-carrier',carrier,carrierSources,{native_format:'FHIR R4 4.0.1 selected views plus independent UMF scenario events',subset:`${groups.hl7!.length} unchanged official HL7 carrier resources and ${groups.supplement!.length} authored supplemental FHIR-shaped resources, plus four workflow events.`,
 limits:'Illustrative sources are not a validated FHIR Bundle or carrier simulation. Native official examples do not form a coherent history. CMS ingestion and X12 services are not implemented. Reference resolution is namespace-local; no patient matching.'},
 'HL7 FHIR R4 examples: CC0 per https://hl7.org/fhir/R4/license.html. HL7/FHIR trademarks do not imply endorsement. Selected examples contain no explicitly identified SNOMED CT, CPT, CDT or DICOM terminology. Unqualified codes retain their absent system; no dictionary rights or clinical meaning are inferred. UMF-authored supplemental scenarios and projections may be redistributed with this notice.\n');

const epiRoot=join(base,'medical-epidemiology');
const epiSources={cdc:await source(epiRoot,'sources/cdc-mortality.json','observed','CDC/NCHS',{revision:'bi63-dtpu-rowsUpdatedAt-1571926785',license:{id:'USGOV_WORKS',reference:'https://data.cdc.gov/api/views/bi63-dtpu.json',redistribution:'allowed'},provenance:{publisher:'CDC/NCHS',retrieved_at:'2026-10-08',upstream_url:'https://data.cdc.gov/resource/bi63-dtpu.json?$limit=12&$order=year,state,cause_name',transformations:[]}}),
 cdc_metadata:await source(epiRoot,'sources/cdc-metadata.json','unknown','CDC/NCHS'),supplement:await source(epiRoot,'sources/supplement.json','fabricated','UMF project'),
 wonder:remote('https://wonder.cdc.gov/','CDC/NCHS','observed')};
await build('medical-epidemiology',{measures:projectCdcMortality(await Bun.file(join(epiRoot,'sources/cdc-mortality.json')).text(),'cdc'),
 supplemental_measures:(await Bun.file(join(epiRoot,'sources/supplement.json')).json()).rows},epiSources,{subset:'12 CDC/NCHS leading-causes-of-death aggregate records and two separate fabricated zero/suppression cases.',
 limits:'Observed deaths and age-adjusted rates use native international ICD-10 cause groups, not ICD-10-CM billing diagnoses. Source rows omit denominators and uncertainty. No rate recomputation, inference of patients, epidemiological comparability or current-year surveillance is claimed.'},
 'Source: CDC/NCHS. Dataset bi63-dtpu metadata declares USGOV_WORKS; preserve the suggested citation: National Center for Health Statistics. NCHS - Leading Causes of Death: United States. Accessed 2026-10-08. https://data.cdc.gov/d/bi63-dtpu. These materials are available without charge from CDC. Their use and links do not imply endorsement by CDC, ATSDR, HHS or the US Government. See https://www.cdc.gov/other/agencymaterials.html. Rates per 100000 population are age-adjusted to the 2000 US standard population. Supplemental cases are UMF-authored fabricated data and may be redistributed with this notice; they are not CDC observations.\n',{measures:['cdc','cdc_metadata'],supplemental_measures:['supplement']});

const imagingRoot=join(base,'medical-imaging'),imaging=projectDicomMetadata(await Bun.file(join(imagingRoot,'sources/synthetic-dicom.json')).text(),'synthetic-dicom');
imaging.instances![0]!.binary_reference='sources/synthetic.dcm';
imaging.instances![0]!.binary_sha256=sha(new Uint8Array(await Bun.file(join(imagingRoot,'sources/synthetic.dcm')).arrayBuffer()));
imaging.instances![0]!.transfer_syntax='1.2.840.10008.1.2.1';
await build('medical-imaging',imaging,{dicom_json:await source(imagingRoot,'sources/synthetic-dicom.json','fabricated','UMF project',{format:'dicom-json',revision:'umf-synthetic-1.0.0'}),
 dicom_binary:await source(imagingRoot,'sources/synthetic.dcm','fabricated','UMF project'),provenance:await source(imagingRoot,'sources/provenance.json','unknown','UMF project'),
 tcia:remote('https://www.cancerimagingarchive.net/data-usage-policies-and-restrictions/','The Cancer Imaging Archive','deidentified')},
 {native_format:'DICOM Part 10 Explicit VR Little Endian and DICOM JSON',subset:'One authored 4x4 Secondary Capture instance with fixed synthetic study/series/SOP UIDs, private tags and nested private sequence.',
 projection_losses:['pydicom DICOM JSON normalizes native DS decimal spellings (1.2500 to 1.25); original spellings remain in the unchanged binary object. File-meta elements and preamble are binary-only, retained in the original.'],
 limits:'Native metadata and original binary retention only. No public patient images, pixel decoding, full IOD conformance, DICOMweb or live PACS operations. TCIA remains a collection-specific rights/access candidate; no TCIA bytes are bundled.'},
 'All included DICOM objects, metadata and byte-ramp pixels are UMF-authored fabricated fixtures and may be redistributed with this notice. No real patient or acquired image is represented. DICOM is a NEMA trademark; this fixture does not reproduce the copyrighted DICOM standard or claim endorsement. TCIA collections require their own citation and data-use conditions.\n',{instances:['dicom_json','dicom_binary','provenance'],attributes:['dicom_json']});

const termRoot=join(base,'medical-terminology'),selection=await Bun.file(join(termRoot,'sources/selection.json')).json();
const concepts=(await Bun.file(join(termRoot,'sources/icd10cm-order-2026-subset.txt')).text()).trimEnd().split(/\r?\n/).map(line=>({concept_key:selection.system+'|'+selection.release+'|'+line.slice(6,13).trim(),system:selection.system,release:selection.release,code:line.slice(6,13).trim(),billable:line[14]==='1',short_display:line.slice(16,76).trimEnd(),display:line.slice(77),effective_start:selection.effective_start,effective_end:selection.effective_end,native_line:line}));
const systems:MedicalRow[]=[
 ['icd10cm','http://hl7.org/fhir/sid/icd-10-cm',selection.release,'bundled-subset','US diagnosis classification'],
 ['icd10pcs','http://www.cms.gov/Medicare/Coding/ICD10',null,'reference-only','US inpatient procedure classification'],
 ['hcpcs2','urn:oid:2.16.840.1.113883.6.285',null,'reference-only','HCPCS Level II quarterly files; distinct from CPT Level I'],
 ['snomed','http://snomed.info/sct',null,'consumer-local-licensed','Clinical terminology; edition and territory required'],
 ['cpt','http://www.ama-assn.org/go/cpt',null,'consumer-local-licensed','AMA licensed procedure terminology'],
 ['icd10','http://hl7.org/fhir/sid/icd-10',null,'reference-only','International classification used by mortality groups; distinct from ICD-10-CM']
].map(([id,system,release,availability,description])=>({system_key:id!,system:system!,release:release??null,availability:availability!,description:description!}));
await build('medical-terminology',{systems,concepts},{icd10cm:await source(termRoot,'sources/icd10cm-order-2026-subset.txt','unknown','CDC/NCHS',{
 revision:selection.release,format:'icd10cm-order-text',provenance:{publisher:'CDC/NCHS',retrieved_at:'2026-10-08',
 source_ids:['icd10cm_archive'],transformations:[selection.selection]}}),
 selection:await source(termRoot,'sources/selection.json','unknown','UMF project'),
 icd10cm_archive:{...remote(selection.upstream_url,'CDC/NCHS','unknown',selection.release),format:'zip',
 checksum:{algorithm:'sha256',value:selection.upstream_sha256}},
 icd10pcs:remote('https://www.cms.gov/medicare/coding-billing/icd-10-codes','CMS'),
 hcpcs2:remote('https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update','CMS'),
 snomed:remote('https://www.nlm.nih.gov/healthit/snomedct/us_edition.html','NLM / SNOMED International'),
 cpt:remote('https://www.ama-assn.org/about/cpt-editorial-panel/faq-editorial-panel-cpt-overview','American Medical Association')},
 {subset:'12 native ICD-10-CM FY2026 October 2025 order-file records; six separately identified system/access descriptors.',
 limits:'Historical subset only, not current or exhaustive codes. SNOMED CT/CPT have no bundled dictionary or mappings. Exact consumer-local release lookup makes no clinical/billing equivalence claim. An unmatched code means not in this subset, never invalid.'},
 'Source: CDC/NCHS. ICD-10-CM selected order-file lines are unchanged excerpts of the CDC/NCHS FY2026 US government publication, with selected original line bytes and upstream ZIP SHA-256 in sources/selection.json. Include source attribution when redistributing. Materials are available without charge from the CDC source linked in selection.json. Their use and links do not imply endorsement by CDC, ATSDR, HHS or the US Government. See https://www.cdc.gov/other/agencymaterials.html and the ICD-10-CM public-domain publication https://stacks.cdc.gov/view/cdc/148699. No AMA CPT or SNOMED CT vocabulary is bundled; licenses and territory restrictions remain source-specific. UMF-authored projections/metadata may be redistributed with this notice.\n',{concepts:['icd10cm','selection'],systems:['icd10pcs','hcpcs2','snomed','cpt']});
