// Main transport identity migration; retained historical runner is unchanged.
import {realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const workspace=resolve(dirname(import.meta.path),'../..');
const repository=process.env.WEFT_SECURITY_REPOSITORY;
if(!repository)throw Error('Explicit Weft security source checkout required');
const owner=realpathSync(resolve(repository,'docs/helix/02-design/contracts'));
const root=owner;
if(Bun.argv.length!==2||import.meta.path!==workspace+'/tools/security/weft-main-transport-conformance.ts')throw Error('Only the installed reviewed runner and owner schemas are admitted');
const hash=(bytes:string|Uint8Array)=>new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
const referencedSchemas=[owner+'/compile-response-v0.2.schema.json',owner+'/logical-plan-v0.2.schema.json',owner+'/backend-manifest-v0.2.schema.json'];
const dependencyPaths:string[]=[];
for(const pkg of ['ajv','fast-uri','fast-deep-equal','json-schema-traverse','require-from-string']){
 const directory=realpathSync(workspace+'/node_modules/'+pkg);
 for await(const name of new Bun.Glob('**/*').scan({cwd:directory,onlyFiles:true,dot:true}))dependencyPaths.push(directory+'/'+name);
}
const paths=[owner+'/CONTRACT-006-security-compilation.md',workspace+'/docs/helix/04-build/evidence/security/weft-original-use.json',root+'/security-backend-manifest-v0.1.schema.json',root+'/security-compile-request-v0.2.schema.json',root+'/security-compile-response-v0.2.schema.json',root+'/security-cells-v0.1.schema.json',...referencedSchemas,workspace+'/spec/core/schema-properties-document.schema.json',import.meta.path,realpathSync(process.execPath),...dependencyPaths].sort();
const frozen=new Map(await Promise.all(paths.map(async path=>[path,new Uint8Array(await Bun.file(path).arrayBuffer())] as const)));
const sourceDigests=Object.fromEntries([...frozen].map(([path,bytes])=>[path,hash(bytes)]));
const readJson=(path:string)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(frozen.get(path)!));
const {default:Ajv}=await import('ajv/dist/2020.js');
const ajv=new Ajv({strict:false,allErrors:true,validateFormats:false});
for(const path of referencedSchemas)ajv.addSchema(readJson(path));
ajv.addSchema(readJson(workspace+'/spec/core/schema-properties-document.schema.json'));
const requestCheck=ajv.compile(readJson(root+'/security-compile-request-v0.2.schema.json')),responseCheck=ajv.compile(readJson(root+'/security-compile-response-v0.2.schema.json')),cellsCheck=ajv.compile(readJson(root+'/security-cells-v0.1.schema.json'));
const foundation=readJson(workspace+'/docs/helix/04-build/evidence/security/weft-original-use.json');
const original=foundation.artifacts[0],input=original.request;
const request={interfaceVersion:'weft-security-compile/0.2.0',dialect:'weft-sql/0.2.0',sql:input.sql,modules:input.modules,target:{backendId:input.backendId,backendVersion:input.backendVersion,targetProfile:input.targetProfile,bindingJson:input.bindingJson,bindingSha256:hash(input.bindingJson)},security:{version:'umf.security/0.1.0',policyJson:input.policyJson,ontologyJson:input.ontologyJson,queryProfileJson:input.queryProfileJson}};
const field={documentId:'domain',revision:'schema-1',module:'m',element:'salary'};
const domain={kind:'scalar',type:{family:'integer',facets:{integerWidth:{bits:64,signed:true}},nullable:true}};
const resultContract={version:'weft.security.result-contract/0.1.0',encoding:'weft.security.cells/0.1.0',columns:[{position:1,outputName:'salary',sourceFields:[field],outcomes:[{id:'raw',disposition:'original',domain},{id:'replacement',disposition:'transformed',transform:{kind:'constant',version:'0.1.0',outputField:field,literal:{integerToken:'9223372036854775807'}},dispositionSources:[{ruleId:'salary-mask',target:{...field,element:'employee'},field}],domain},{id:'hidden',disposition:'withheld'},{id:'missing',disposition:'absent'}]}]};
const requestJson=JSON.stringify(request),handoff=JSON.stringify(original.handoff);
// Synthetic lowering demonstrates transport shape only; this is not an
// owner-admitted physical plan, executable native profile or qualification.
const compiled={interfaceVersion:'weft-security-compile/0.2.0',status:'compiled',diagnostics:[],compilerVersion:'draft-schema-fixture',backend:{interfaceVersion:'weft-security-backend/0.1.0',backendId:input.backendId,backendVersion:input.backendVersion,targetProfile:input.targetProfile,bindingProfile:'schema-fixture',bindingSha256:hash(input.bindingJson)},sourceRequestJson:requestJson,sourceRequestSha256:hash(requestJson),ownerPlan:{version:'weft.security.mapping-handoff/0.2.0',json:handoff,sha256:hash(handoff)},lowering:{version:'weft.security.physical/0.1.0',installation:[{id:'synthetic-staging',sql:'SELECT 1',parameters:[]}],execution:{id:'synthetic-execution',sql:'SELECT 1',parameters:[]}},resultContract,resultContractJson:JSON.stringify(resultContract),resultContractSha256:hash(JSON.stringify(resultContract)),obligations:[{id:'native-inventory',semanticSources:['/security'],enforcementSite:'native',prerequisites:[],failureCode:'WFT-SECURITY-LOWERING-UNSUPPORTED',evidenceCaseIds:['pg-raw.B09']}],nativeAdmission:'required'};
const error={code:'WFT-SECURITY-BACKEND-REQUIRED',severity:'error',message:'Security backend is required',phase:'capability',recoverability:'host-action'};
const blocked={interfaceVersion:'weft-security-compile/0.2.0',status:'blocked',diagnostics:[error]};
const cells={version:'weft.security.cells/0.1.0',resultContractSha256:hash(JSON.stringify(resultContract)),rows:[[{outcomeId:'raw',disposition:'original',value:null}],[{outcomeId:'replacement',disposition:'transformed',value:{integerToken:'9223372036854775807'}}],[{outcomeId:'hidden',disposition:'withheld'}],[{outcomeId:'missing',disposition:'absent'}]]};
const observations:any[]=[];
function check(id:string,validate:any,value:any,expected:boolean){const observed=!!validate(value);observations.push({id,expected,observed,errors:structuredClone(validate.errors)});if(expected!==observed)throw Error('Schema mismatch: '+id);}
check('request-shape',requestCheck,request,true);check('blocked-shape',responseCheck,blocked,true);check('synthetic-compiled-transport-shape',responseCheck,compiled,true);check('four-distinct-cell-shapes',cellsCheck,cells,true);
function mutate(id:string,base:any,validate:any,edit:(value:any)=>void){const changed=structuredClone(base);edit(changed);check(id,validate,changed,false);}
mutate('request-old-version',request,requestCheck,v=>v.interfaceVersion='weft-security-compile/0.1.0');
mutate('request-missing-profile',request,requestCheck,v=>delete v.security.queryProfileJson);
mutate('request-report-option',request,requestCheck,v=>v.options={report:true});
mutate('request-unknown-security-version',request,requestCheck,v=>v.security.version='umf.security/99.0.0');
mutate('blocked-partial-sql',blocked,responseCheck,v=>v.sql='SELECT 1');
mutate('blocked-partial-lowering',blocked,responseCheck,v=>v.lowering=compiled.lowering);
mutate('blocked-no-error',blocked,responseCheck,v=>v.diagnostics=[]);
mutate('blocked-warning-only',blocked,responseCheck,v=>v.diagnostics[0].severity='warning');
mutate('compiled-error',compiled,responseCheck,v=>v.diagnostics=[error]);
mutate('compiled-native-qualified',compiled,responseCheck,v=>v.nativeAdmission='qualified');
mutate('compiled-extra-qualified-flag',compiled,responseCheck,v=>v.qualified=true);
mutate('compiled-ordinary-backend',compiled,responseCheck,v=>v.backend.interfaceVersion='weft-backend/0.2.0');
mutate('compiled-missing-owner-plan',compiled,responseCheck,v=>delete v.ownerPlan);
mutate('compiled-missing-source-bytes',compiled,responseCheck,v=>delete v.sourceRequestJson);
mutate('compiled-empty-installation',compiled,responseCheck,v=>v.lowering.installation=[]);
mutate('compiled-empty-obligations',compiled,responseCheck,v=>v.obligations=[]);
mutate('compiled-empty-evidence-cases',compiled,responseCheck,v=>v.obligations[0].evidenceCaseIds=[]);
mutate('compiled-missing-result-domain',compiled,responseCheck,v=>delete v.resultContract.columns[0].outcomes[0].domain);
mutate('compiled-transform-no-identity',compiled,responseCheck,v=>delete v.resultContract.columns[0].outcomes[1].transform.literal);
mutate('compiled-withheld-value-domain',compiled,responseCheck,v=>v.resultContract.columns[0].outcomes[2].domain=domain);
mutate('compiled-old-untyped-result',compiled,responseCheck,v=>v.resultContract.encoding='text-rows');
mutate('compiled-extra-top-level-sql',compiled,responseCheck,v=>v.sql='SELECT salary FROM employee');
mutate('cells-withheld-value',cells,cellsCheck,v=>v.rows[2][0].value=null);
mutate('cells-absence-value',cells,cellsCheck,v=>v.rows[3][0].value=null);
mutate('cells-original-missing-value',cells,cellsCheck,v=>delete v.rows[0][0].value);
mutate('cells-transform-missing-value',cells,cellsCheck,v=>delete v.rows[1][0].value);
mutate('cells-number-coercion',cells,cellsCheck,v=>v.rows[1][0].value=9223372036854775807);
mutate('cells-bad-integer-token',cells,cellsCheck,v=>v.rows[1][0].value={integerToken:'not-an-integer'});
mutate('cells-missing-contract-pin',cells,cellsCheck,v=>delete v.resultContractSha256);
mutate('cells-unknown-disposition',cells,cellsCheck,v=>v.rows[0][0].disposition='redacted-null');
mutate('compiled-missing-contract-bytes',compiled,responseCheck,v=>delete v.resultContractJson);
mutate('compiled-missing-contract-hash',compiled,responseCheck,v=>delete v.resultContractSha256);
mutate('compiled-missing-disposition-link',compiled,responseCheck,v=>v.resultContract.columns[0].outcomes[1].dispositionSources=[]);
mutate('compiled-unknown-transform',compiled,responseCheck,v=>v.resultContract.columns[0].outcomes[1].transform.kind='unknown');
const empty={...cells,rows:[]};check('empty-batch-shape',cellsCheck,empty,true);
// Independent transport-custody oracle; this does not substitute for owner
// lineage/domain checking or installed backend enforcement.
const normalize=(value:any):any=>Array.isArray(value)?value.map(normalize):value!==null&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalize(value[key])])):value;
const custody=(response:any)=>{
 try {
  if(!responseCheck(response))return false;
  const checked:any=response;
  return hash(checked.resultContractJson)===checked.resultContractSha256 &&
   JSON.stringify(normalize(JSON.parse(checked.resultContractJson)))===JSON.stringify(normalize(checked.resultContract));
 } catch { return false; }
};
check('contract-custody-positive',custody,compiled,true);
mutate('contract-byte-reordering-old-hash',compiled,custody,v=>v.resultContractJson=JSON.stringify({columns:v.resultContract.columns,encoding:v.resultContract.encoding,version:v.resultContract.version}));
mutate('contract-domain-object-only-drift',compiled,custody,v=>v.resultContract.columns[0].outcomes[0].domain.type.nullable=false);
mutate('contract-mask-literal-object-only-drift',compiled,custody,v=>v.resultContract.columns[0].outcomes[1].transform.literal={integerToken:'100'});
mutate('contract-byte-and-hash-only-mask-drift',compiled,custody,v=>{const changed=JSON.parse(v.resultContractJson);changed.columns[0].outcomes[1].transform.literal={integerToken:'200'};v.resultContractJson=JSON.stringify(changed);v.resultContractSha256=hash(v.resultContractJson);});
const reordered=structuredClone(compiled);reordered.resultContractJson=JSON.stringify({columns:reordered.resultContract.columns,encoding:reordered.resultContract.encoding,version:reordered.resultContract.version});reordered.resultContractSha256=hash(reordered.resultContractJson);check('contract-reordered-valid-own-hash',custody,reordered,true);
mutate('contract-malformed-bytes',compiled,custody,v=>{v.resultContractJson='{';v.resultContractSha256=hash(v.resultContractJson);});
const manifestCheck=ajv.compile(readJson(root+'/security-backend-manifest-v0.1.schema.json'));
const language={dialectProfile:'weft-sql/0.2.0',irVersion:'weft-ir/0.2.0'};
const manifest={interfaceVersion:'weft-security-backend/0.1.0',backendId:'fixture',backendVersion:'draft',bindingProfile:'fixture',sourceProfiles:[{dialect:'weft-sql/0.2.0',applicationIr:'weft-ir/0.2.0',policy:'0.1.0',ontology:'0.1.0',securityIr:'weft.security.logical-ir/0.1.0'}],targetProfiles:[{id:'fixture',engine:'PostgreSQL',engineVersion:'17',sessionSettings:{},storageLayoutRevision:'fixture',publicationRevision:'fixture'}],capabilities:[{id:'shape-only',logicalDomain:{fixture:true},resultDomain:{fixture:true},constraints:[],obligations:[],status:'candidate',evidence:[],targetProfiles:['fixture'],languageProfiles:[language]}],evidence:[]};
check('manifest-shape-only',manifestCheck,manifest,true);
mutate('manifest-ordinary-interface',manifest,manifestCheck,v=>v.interfaceVersion='weft-backend/0.2.0');
mutate('manifest-no-source',manifest,manifestCheck,v=>v.sourceProfiles=[]);
mutate('manifest-duplicate-source',manifest,manifestCheck,v=>v.sourceProfiles.push(v.sourceProfiles[0]));
mutate('manifest-unknown-ontology',manifest,manifestCheck,v=>v.sourceProfiles[0].ontology='0.2.0');
mutate('manifest-unknown-member',manifest,manifestCheck,v=>v.fallback='ordinary');
mutate('manifest-empty-capabilities',manifest,manifestCheck,v=>v.capabilities=[]);
mutate('manifest-empty-targets',manifest,manifestCheck,v=>v.targetProfiles=[]);
for(const path of paths)if(hash(new Uint8Array(await Bun.file(path).arrayBuffer()))!==sourceDigests[path])throw Error('Source changed during protocol replay: '+path);
const report={status:'draft-transport-shape-conformance-passed',nativeImplementationQualified:false,sourcesUnchanged:true,runtime:{bunVersion:Bun.version,executable:realpathSync(process.execPath)},sourceDigests,observations,scope:'Draft schema structural and exact result-contract transport-custody conformance only; synthetic physical positive is not semantic/owner/native admission. Cross-source SHA correspondence, domain/outcome membership, dependency coverage and trusted native authority require actual implementation.'};
await Bun.write(new URL('../../docs/helix/04-build/evidence/security/weft-main-protocol-transport.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:observations.length}));
