import {chromium} from 'playwright';
const publicPacks:{pack:unknown;schemas:{id:string;text:string}[]}[]=[];
for(const id of ['nyc-tlc','movielens','noaa-ghcn-daily','gtfs-schedule']){
 const pack=await Bun.file(`spec/domain-packs/${id}/pack.json`).json(),schemas=[];
 for(const entry of pack.schemas)schemas.push({id:entry.id,text:await Bun.file(`spec/domain-packs/${id}/${entry.reference}`).text()});
 publicPacks.push({pack,schemas});
}
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/public-packs.json')return Response.json(publicPacks);
 if(path==='/medical-pack.json')return new Response(Bun.file('spec/domain-packs/medical/pack.json'),{headers:{'content-type':'application/json'}});
 const fixtureFiles:Record<string,string>={
  '/carrier-response.json':'medical-carrier/sources/hl7-claimresponse.json',
  '/cdc.json':'medical-epidemiology/sources/cdc-mortality.json',
  '/dicom.json':'medical-imaging/sources/synthetic-dicom.json',
  ...Object.fromEntries(['medical-carrier','medical-epidemiology','medical-imaging','medical-terminology'].map(id=>['/'+id+'.json',id+'/pack.json']))};
 if(fixtureFiles[path])return new Response(Bun.file('spec/domain-packs/'+fixtureFiles[path]),{headers:{'content-type':'application/json'}});
 return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>UMF pack schema verification</title>',{headers:{'content-type':'text/html'}});
}});
const browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
try {
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 const result=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path);let checks=0;
  const check=(v:boolean)=>{checks++;if(!v)throw Error('Pack browser check '+checks);};
  check(JSON.stringify(u.generateDomainPackSchema())===JSON.stringify(u.domainPackSchema));
  const registry=new u.Registry().register(u.domainPackPackage);
  const pack={id:'legal',version:'1.0.0',generator:{id:'tablespec.legal',version:'1.0.0'},domain_types:{client_name:{sample_generation:{method:'generate_client_name'},future:{preserved:true}}},future:{preserved:true}};
  const document={umf:'0.8.0',id:'pack-browser',modules:[],vocabularies:{'umf.domain-pack':{version:'1.0.0'}},extensions:{'umf.domain-pack':pack}};
  check(u.validateDocument(document,registry).valid);
  for(const format of ['json','yaml'])check(JSON.stringify(u.readDocument(u.writeDocument(document,format),format))===JSON.stringify(document));
  check(!u.validateDocument({...document,extensions:{'umf.domain-pack':{...pack,generator:{id:'x'}}}},registry).valid);
  const source={kind:'external',data_kind:'fabricated',reference:'official-fixture.csv',format:'csv',license:{redistribution:'unknown'},future:{preserved:true}};
  const sourceRegistry=new u.Registry().register(u.datasetSourcePackage);
  const sourceDocument={umf:'0.8.0',id:'source-browser',modules:[],vocabularies:{'umf.dataset-source':{version:'1.0.0'}},extensions:{'umf.dataset-source':source}};
  check(u.validateDocument(sourceDocument,sourceRegistry).valid);
  for(const format of ['json','yaml'])check(JSON.stringify(u.readDocument(u.writeDocument(sourceDocument,format),format))===JSON.stringify(sourceDocument));
  const medical=await (await fetch('/medical-pack.json')).json();
  const medicalDocument={...document,id:'medical-browser',extensions:{'umf.domain-pack':medical}};
  check(u.validateDocument(medicalDocument,registry).valid);
  for(const format of ['json','yaml'])check(JSON.stringify(u.readDocument(u.writeDocument(medicalDocument,format),format))===JSON.stringify(medicalDocument));
  // @covers US-055-AC6
  for(const id of ['medical-carrier','medical-epidemiology','medical-imaging','medical-terminology']){
   const subpack=await(await fetch('/'+id+'.json')).json();
   const d={...document,id,extensions:{'umf.domain-pack':subpack}};
   check(u.validateDocument(d,registry).valid);
   for(const format of ['json','yaml'])check(JSON.stringify(u.readDocument(u.writeDocument(d,format),format))===JSON.stringify(d));
  }
  // @covers US-055-AC2 @covers US-055-AC3 @covers US-055-AC4 @covers US-055-AC5
  const response=await(await fetch('/carrier-response.json')).text();
  const carrier=u.projectMedicalFhir([{source_id:'response',text:response}],'browser');
  check(carrier.resources[0].resource_json===response);
  check(carrier.adjudications.some((a:any)=>a.amount==='10.00'));
  const exact='{"resourceType":"Claim","id":"exact","item":[{"sequence":1,"net":{"value":9007199254740993.0100,"currency":"USD"}}]}';
  check(u.projectMedicalFhir([{source_id:'exact',text:exact}],'browser').claim_lines[0].net_amount==='9007199254740993.0100');
  const epi=u.projectCdcMortality(await(await fetch('/cdc.json')).text(),'cdc');
  check(epi.length===12&&epi[0].count==='44806'&&epi[0].population_denominator===null);
  const dicom=u.projectDicomMetadata(await(await fetch('/dicom.json')).text(),'dicom');
  check(dicom.instances[0].sop_instance_uid==='2.25.555001');
  check(dicom.attributes.some((a:any)=>a.native_path==='/00111010/Value/0/00111002'&&a.vr==='DS'));
  const query={system:'http://www.ama-assn.org/go/cpt',release:'caller-selected',code:'fixture-only'};
  check(u.lookupMedicalTerminology(query).status==='source-unavailable');
  check(u.lookupMedicalTerminology(query,[{...query,future:{retained:true}}]).matches[0].future.retained);
  const publicPacks=await (await fetch('/public-packs.json')).json();
  for(const {pack,schemas} of publicPacks){
   const publicDocument={...document,id:pack.id,extensions:{'umf.domain-pack':pack}};
   check(u.validateDocument(publicDocument,registry).valid);
   for(const format of ['json','yaml'])check(JSON.stringify(u.readDocument(u.writeDocument(publicDocument,format),format))===JSON.stringify(publicDocument));
   for(const schema of schemas)check(u.exportTableSpec(u.importTableSpec(schema.text,{id:schema.id,format:'json'}))===schema.text);
  }
  check(typeof (globalThis as any).Bun==='undefined'&&typeof (globalThis as any).process==='undefined');
  return {checks};
 });console.log(JSON.stringify({browser:browser.version(),...result}));
}finally{await browser.close();server.stop(true);}
