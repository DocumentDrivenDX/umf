// @covers US-079-AC4
// @covers US-079-AC7
// @covers US-079-AC10
// @covers US-079-AC1
// @covers US-079-AC2
// @covers US-079-AC3
// @covers US-079-AC9
// @covers US-079-AC5
// @covers US-079-AC6
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {securityLogicCorpus,securityPolicyCorpus,securityEvaluationCorpus,securityRegistrationCorpus,securityGuardCorpus,securityWriteCorpus,securityDependencyCorpus,securityDisclosureCorpus} from '../../tests/security/browser-corpus';
const files=['src/extensions/security/logic.ts','src/model/json.ts','src/model/types.ts',
  'src/extensions/security/types.ts','src/extensions/security/policy.ts',
  'spec/extensions/security/schema.json','spec/extensions/security/ontology.schema.json',
  'spec/extensions/security/package.json','tests/security/fixture.ts',
  'src/extensions/security/disclosure.ts','src/extensions/security/dependencies.ts','src/extensions/security/write.ts','tests/security/write-fixture.ts','src/extensions/security/authority-guard.ts','src/extensions/security/registration.ts','src/extensions/security/evaluate.ts','src/model/key-tuple.ts','tests/security/evaluation-fixture.ts',
  'tests/security/browser-corpus.ts','tools/security/browser.ts'];
const caseId=Bun.env.UMF_SECURITY_CASE_ID,runId=Bun.env.UMF_SECURITY_RUN_ID;
const casePlan=caseId ? (await Bun.file('docs/helix/03-test/security/cases.json').json()).cases.find((c:any)=>c.id===caseId):null;
if(caseId&&(caseId!=='S10'||!runId||!casePlan))throw new Error('Fresh browser case binding required');
if(casePlan)for(const path of [casePlan.testSource,casePlan.oracleSource,...casePlan.implementationSources])if(!files.includes(path))files.push(path);
const before:Record<string,string>={};
for(const file of files)before[file]=createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex');
const build=await Bun.build({entrypoints:['tests/security/browser-corpus.ts'],target:'browser',format:'esm'});
if(!build.success)throw new Error('Security logic browser build failed');
const js=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){
  return new URL(req.url).pathname==='/logic.js' ? new Response(js,{headers:{'content-type':'text/javascript'}}) : new Response('<!doctype html><title>Security logic</title>');
}});
let browser;
try {
  browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();let external=0;
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external++;return route.abort();}return route.continue();});
  await page.goto(`http://127.0.0.1:${server.port}`);
  const observed=await page.evaluate(async()=>{
    const url='/logic.js'; const m=await import(url);
    return {corpus:m.securityLogicCorpus(),policy:m.securityPolicyCorpus(),evaluation:m.securityEvaluationCorpus(),registration:m.securityRegistrationCorpus(),guard:await m.securityGuardCorpus(),write:m.securityWriteCorpus(),dependencies:m.securityDependencyCorpus(),disclosure:m.securityDisclosureCorpus(),hostGlobals:['Bun','process','Buffer'].filter(key=>key in globalThis)};
  });
  const expected=securityLogicCorpus();
  const policyExpected=securityPolicyCorpus();
  const evaluationExpected=securityEvaluationCorpus();
  const registrationExpected=securityRegistrationCorpus();
  const guardExpected=await securityGuardCorpus();
  const writeExpected=securityWriteCorpus();
  const dependenciesExpected=securityDependencyCorpus();
  const disclosureExpected=securityDisclosureCorpus();
  if(disclosureExpected.mismatches || JSON.stringify(disclosureExpected)!==JSON.stringify(observed.disclosure) || dependenciesExpected.mismatches || JSON.stringify(dependenciesExpected)!==JSON.stringify(observed.dependencies) || writeExpected.mismatches || JSON.stringify(writeExpected)!==JSON.stringify(observed.write) || guardExpected.mismatches || JSON.stringify(guardExpected)!==JSON.stringify(observed.guard) || registrationExpected.mismatches || JSON.stringify(registrationExpected)!==JSON.stringify(observed.registration) || expected.mismatches || policyExpected.mismatches || evaluationExpected.mismatches || JSON.stringify(evaluationExpected)!==JSON.stringify(observed.evaluation) || JSON.stringify(expected)!==JSON.stringify(observed.corpus) ||
      JSON.stringify(policyExpected)!==JSON.stringify(observed.policy) || observed.hostGlobals.length || external)throw new Error('Security browser logic/policy mismatch');
  const sourceDigests:Record<string,string>={};
  for(const file of files)sourceDigests[file]=createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex');
  if(Object.keys(before).some(file=>before[file]!==sourceDigests[file]))throw new Error('Browser sources changed during execution');
  const observations=[
    {assertionId:'S10:logic',expected:expected,observed:observed.corpus},
    {assertionId:'S10:policy',expected:policyExpected,observed:observed.policy},
    {assertionId:'S10:evaluation',expected:evaluationExpected,observed:observed.evaluation},
    {assertionId:'S10:disclosure',expected:disclosureExpected,observed:observed.disclosure},
    {assertionId:'S10:dependencies',expected:dependenciesExpected,observed:observed.dependencies},
    {assertionId:'S10:write',expected:writeExpected,observed:observed.write},
    {assertionId:'S10:guard',expected:guardExpected,observed:observed.guard},
    {assertionId:'S10:registration',expected:registrationExpected,observed:observed.registration},
    {assertionId:'S10:host-globals',expected:[],observed:observed.hostGlobals},
    {assertionId:'S10:external-requests',expected:0,observed:external},
    {assertionId:'S10',expected:true,observed:true}
  ];
  const receipt={status:'passed',covers:['US-079-AC1','US-079-AC2','US-079-AC3','US-079-AC4','US-079-AC5','US-079-AC6','US-079-AC7','US-079-AC9','US-079-AC10'],
    scope:'Policy inspection/preservation, composition and bounded expression execution over host-attested facts; no native credential or backend qualification',
    versions:{bun:Bun.version,chromium:browser.version()},sourceDigests,observed,externalRequests:external};
  await Bun.write('docs/helix/04-build/evidence/security/logic-browser.json',JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(casePlan?{...receipt,id:caseId,runId,command:casePlan.command,backend:'semantic',observations}:receipt));
} finally {await browser?.close();server.stop(true);}
