import {createNativeGraphConditionRequest} from './truss-graph-condition-request';
/** Rollback-only original owner/native graph mapping, not ordinary enforcement. */
import {createPgConnectionSource,createFileQueryJournal} from '/Users/erik/Projects/truss/packages/pg-runtime/src/index';
import {createCatalogInputPreparation} from '/Users/erik/Projects/truss/packages/umf-bun/src/catalog-input';
import {stageNewCatalogCohort} from '/Users/erik/Projects/truss/packages/umf-bun/src/catalog-new-stage';
import {lowerCandidateSecurityCondition} from '/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-condition';
import {createCandidateGraphSource,createCandidateGraphEndpointKeys,requireCandidateGraphSource} from '/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source';
import {collectCatalogReportDocumentBasis,recheckCatalogReportDocumentBasis} from '/Users/erik/Projects/truss/packages/umf-bun/src/catalog-report-document-basis';
import {loadUmfValueProducer} from '/Users/erik/Projects/truss/packages/umf-bun/src/index';
import {createSecurityStoredKeyVerifier} from '/Users/erik/Projects/truss/packages/postgresql/src/security-stored-key';
import {projectDeclaredSecurityGraphEndpoints,resolveSecurityGraphKeyLocator} from '/Users/erik/Projects/truss/packages/postgresql/src/security-graph-locator';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const dependencyInventory=await Bun.file('tests/security/native/pg-runtime-dependency-inventory.json').json();
const observedDriverEntries={probe:fileURLToPath(import.meta.resolve('pg')),runtimeImporter:fileURLToPath(import.meta.resolve('pg',pathToFileURL('/Users/erik/Projects/truss/packages/pg-runtime/src/index.ts').href))};
if(process.env.NODE_PG_FORCE_NATIVE||Object.values(observedDriverEntries).some(path=>path!==dependencyInventory.entry))throw Error('Unqualified graph driver resolution');
const observedAjvEntry=createRequire('/Users/erik/.codex/worktrees/1598/umf/package.json').resolve('ajv/dist/2020');
const port=Number(process.env.UMF_TRUSS_PORT),password=process.env.UMF_TRUSS_INSTALLER_PASSWORD,directory=process.env.UMF_TRUSS_JOURNAL_DIRECTORY;
if(!directory||!password||!Number.isInteger(port)||port<1||port>65535)throw Error('Owned fixture required');
const preparation=await createCatalogInputPreparation('/private/tmp/truss-umf-runtime-LmpSsH','/Users/erik/.codex/worktrees/1598/umf/package.json');
const base=(await Bun.file('/Users/erik/Projects/truss/docs/helix/02-design/contracts/bindings/acceptance-input-capacity-v0.1.fixture.json').json()).input;
const model={umf:'0.7.0',id:'security-graph-candidate',vocabularies:{},extensions:{},modules:[{id:'m',namespace:'m',elements:[
 ...['Employee','Project'].map(id=>({id,kind:'record',members:[{module:'m',element:id+'-code'}],keys:[{id:'code-key',name:'code-key',fields:[{module:'m',element:id+'-code'}],primary:true}],extensions:{}})),
 ...['Employee','Project'].map(id=>({id:id+'-code',name:id+'-code',kind:'field',scalarType:'string',nullability:'required',cardinality:'one',extensions:{}})),
 {id:'Assignment',kind:'record',members:[{module:'m',element:'Assignment-active'},{module:'m',element:'Assignment-code'}],keys:[{id:'code-key',name:'code-key',fields:[{module:'m',element:'Assignment-code'}],primary:true}],extensions:{}},
 {id:'Assignment-code',name:'Assignment-code',kind:'field',scalarType:'string',nullability:'required',cardinality:'one',extensions:{}},
 {id:'Assignment-active',name:'Assignment-active',kind:'field',scalarType:'boolean',nullability:'required',cardinality:'one',extensions:{}},
],relationships:[{id:'WorksOn',name:'WorksOn',source:[{module:'m',element:'Employee'}],target:[{module:'m',element:'Project',key:'code-key'}],sourceMultiplicity:{min:0,max:1},targetMultiplicity:{min:0,max:2},targetLifecycle:'independent',directed:true,associationRecord:{module:'m',element:'Assignment',key:'code-key'}},{id:'BareWorksOn',name:'BareWorksOn',source:[{module:'m',element:'Employee'}],target:[{module:'m',element:'Project',key:'code-key'}],sourceMultiplicity:{min:0,max:1},targetMultiplicity:{min:0,max:2},targetLifecycle:'independent',directed:true}]}]};
// Allocate the bare relationship first; property-owner type and relationship IDs
// belong to separate native domains and must not accidentally be interchangeable.
model.modules[0]!.relationships.reverse();
const bytes=new TextEncoder().encode(JSON.stringify(model));
base.binding={state:'absent'};base.transforms=[];base.documents=[{documentId:model.id,documentRevision:'candidate-1',artifact:{identity:'original-security-graph',bytesBase64:Buffer.from(bytes).toString('base64'),sha256:new Bun.CryptoHasher('sha256').update(bytes).digest('hex')},umfProfile:preparation.umfProfile,ingress:{kind:'native'}}];
const prepared=preparation.prepare(new TextEncoder().encode(JSON.stringify(base)));
const host=createPgConnectionSource({host:'127.0.0.1',port,user:'postgres',password,database:'postgres',max:1,connectionTimeoutMillis:5000},{journal:createFileQueryJournal(directory)});
const native=await host.source.acquire();
const controls=new Map<string,string>();let controlNumber=0;
const observations:{id:string;expected:unknown;observed:unknown}[]=[];
const check=(id:string,expected:unknown,observed:unknown)=>{observations.push({id,expected,observed});if(JSON.stringify(expected)!==JSON.stringify(observed))throw Error('Native graph mismatch: '+id);};
const connection={async unsafe(sql:string,parameters:unknown[]=[]):Promise<Record<string,string>[]>{
 const control=/^(SAVEPOINT|ROLLBACK TO SAVEPOINT|RELEASE SAVEPOINT) (truss_catalog_[0-9a-f]{32})$/.exec(sql);
 if(control){
  if(parameters.length)throw Error('Control parameters unavailable');const original=control[2]!;
  if(control[1]==='SAVEPOINT'){if(controls.has(original))throw Error('Duplicate stage control');controls.set(original,'truss_sp_'+(++controlNumber));}
  const selected=controls.get(original);if(!selected)throw Error('Unknown stage control');
  await native.control(control[1]+' '+selected);if(control[1]==='RELEASE SAVEPOINT')controls.delete(original);return [];
 }
 const result=await native.execute({sql,parameters:parameters.map((value,i)=>{if(typeof value!=='string')throw Error('Exact text parameters required');return {position:i+1,carrier:'text' as const,text:value};})});
 return result.rows.map(cells=>Object.fromEntries(cells.map((cell,i)=>{if(cell.state!=='text')throw Error('Required native text row');return [result.columns[i]!,cell.text];})));
}};
let active=false,released=false,errorSeen=false;
try{
 await native.begin({isolation:'read_committed',accessMode:'read_write'});active=true;
 check('original-installer',[{actor:'postgres',role:'postgres'}],await connection.unsafe('SELECT SESSION_USER::text AS actor,CURRENT_USER::text AS role'));
 const prestate=await connection.unsafe('SELECT truss.runtime_capture_catalog_prestate() AS bytes');
 await connection.unsafe("SELECT * FROM truss.runtime_admit_operation('catalog-acceptance',decode('01','hex'),decode($1::text,'hex'),decode($2::text,'hex'),decode('04','hex'),decode('05','hex'),decode('06','hex'))",[prepared.original.originalUtf8Hex,prestate[0]!.bytes!]);
 const staged=await stageNewCatalogCohort(connection,prepared,['Employee','Project'].map(elementId=>({documentId:model.id,moduleId:'m',elementId,fieldModule:'m',fieldId:elementId+'-code',home:'json' as const})).concat([{documentId:model.id,moduleId:'m',elementId:'Assignment',fieldModule:'m',fieldId:'Assignment-active',home:'json'},{documentId:model.id,moduleId:'m',elementId:'Assignment',fieldModule:'m',fieldId:'Assignment-code',home:'json'}]),{});
 const type=(name:string)=>{const rows=staged.types.filter(row=>row.element_id===name&&row.document_id===model.id&&row.module_id==='m');if(rows.length!==1)throw Error('Original type allocation missing');return rows[0]!.type_id!;};
 const employee=type('Employee'),project=type('Project'),association=type('Assignment');
 check('separate-original-type-allocations',true,employee!==project);
 const property=(typeId:string,fieldId?:string)=>{const rows=staged.properties.filter(row=>row.owner_type_id===typeId&&(fieldId?row.field_id===fieldId:typeId===association?row.field_id==='Assignment-active':true));if(rows.length!==1)throw Error('Original property allocation missing');return rows[0]!.property_id!;};
 const relationship=staged.relationships.find(row=>row.declaration.id==='WorksOn')!.relationshipId,bareRelationship=staged.relationships.find(row=>row.declaration.id==='BareWorksOn')!.relationshipId,rev=staged.provisionalRevision;
 for(const [id,typeId,value] of [['9007199254740993',employee,'Alice'],['9007199254740993',project,'Project-A'],['9007199254740994',project,'Project-B'],['9007199254740997',employee,'Bob']])await connection.unsafe('INSERT INTO truss.object(id,type_id,props,rev) VALUES ($1::bigint,$2::int,$3::text::jsonb,$4::int)',[id!,typeId!,JSON.stringify({[property(typeId!)]:value}),rev]);
 await connection.unsafe('INSERT INTO truss.edge(id,rel_type_id,source_id,source_type,target_id,target_type,props,rev) VALUES ($1::bigint,$2::int,$3::bigint,$4::int,$5::bigint,$6::int,$7::text::jsonb,$8::int)',['9007199254740995',relationship,'9007199254740993',employee,'9007199254740993',project,JSON.stringify({[property(association)]:true,[property(association,'Assignment-code')]:'work-A'}),rev]);
 await connection.unsafe('INSERT INTO truss.edge(id,rel_type_id,source_id,source_type,target_id,target_type,props,rev) VALUES ($1::bigint,$2::int,$3::bigint,$4::int,$5::bigint,$6::int,$7::text::jsonb,$8::int)',['9007199254740998',relationship,'9007199254740997',employee,'9007199254740994',project,JSON.stringify({[property(association)]:false,[property(association,'Assignment-code')]:'work-B'}),rev]);
 const objects=await connection.unsafe('SELECT id::text AS id,type_id::text AS "typeId" FROM truss.object ORDER BY id,type_id');
 check('complete-native-object-locators',[{id:'9007199254740993',typeId:employee},{id:'9007199254740993',typeId:project},{id:'9007199254740994',typeId:project},{id:'9007199254740997',typeId:employee}],objects);
 const originalInterpretation=prepared.documents[0]!.interpretation;
 check('original-reversible-key-source-transition',{source:model,targetVersion:'0.8.0',residuals:[]},{source:originalInterpretation.transition.source,targetVersion:originalInterpretation.target.umf,residuals:originalInterpretation.transition.residuals});
 const valueProducer=await loadUmfValueProducer('/private/tmp/truss-umf-runtime-bG1IMG');
 const nativeKeys=await connection.unsafe('SELECT type_id::text AS "typeId",key_num::text AS "keyNumber",key_id AS "keyId" FROM truss.key_def ORDER BY type_id,key_num');
 check('original-native-key-definitions',staged.keys.map(row=>({typeId:row.owner_type_id,keyNumber:row.key_number,keyId:row.key_id})),nativeKeys);
 const canonical=async(values:readonly string[])=>{const tree={kind:'array',items:values.map(value=>({kind:'string',utf8Hex:Buffer.from(value).toString('hex')}))};const rows=await connection.unsafe("SELECT encode(truss.runtime_canonical_tree_bytes($1::text::jsonb),'hex') AS bytes",[JSON.stringify(tree)]);if(rows.length!==1)throw Error('Native namespace correspondence');return rows[0]!.bytes!;};
 const inventorySql='SELECT family,identity::text AS identity FROM truss.runtime_collect_new_catalog_inventory($1::int)';
 const normalizeInventory=(rows:Record<string,string>[])=>rows.map(row=>({family:row.family,identity:JSON.parse(row.identity!)})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const expectedInventory=[{family:'endpoint',identity:[relationship,employee,project]},{family:'endpoint',identity:[bareRelationship,employee,project]},{family:'relationship',identity:[bareRelationship,model.id,'m','BareWorksOn']},...[[employee,'Employee'],[project,'Project']].flatMap(([typeId,element])=>[{family:'type',identity:[typeId,model.id,'m',element]},{family:'property',identity:[property(typeId!),typeId,'m',element+'-code']},{family:'key',identity:[typeId,'code-key',nativeKeys.find(row=>row.typeId===typeId)!.keyNumber]}]),{family:'relationship',identity:[relationship,model.id,'m','WorksOn']},{family:'type',identity:[association,model.id,'m','Assignment']},{family:'property',identity:[property(association),association,'m','Assignment-active']},{family:'property',identity:[property(association,'Assignment-code'),association,'m','Assignment-code']},{family:'key',identity:[association,'code-key',staged.keys.find(row=>row.owner_type_id===association)!.key_number]}].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 check('complete-original-native-catalog-inventory',expectedInventory,normalizeInventory(await connection.unsafe(inventorySql,[rev])));
 await native.control('SAVEPOINT truss_sp_100');let wrongKeyOutcome='unexpected-success';
 try{await connection.unsafe('UPDATE truss.key_def SET prop_ids=ARRAY[$1::int] WHERE type_id=$2::int',[property(project),employee]);await connection.unsafe(inventorySql,[rev]);}catch(error){wrongKeyOutcome=(error as {code?:string}).code??'missing-code';}
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_100');await native.control('RELEASE SAVEPOINT truss_sp_100');
 check('ordered-native-key-substitution-refusal','55000',wrongKeyOutcome);
 check('native-catalog-inventory-restored',expectedInventory,normalizeInventory(await connection.unsafe(inventorySql,[rev])));
 const properties=await connection.unsafe('SELECT id::text AS id,type_id::text AS "typeId",props::text AS props FROM truss.object ORDER BY id,type_id');
 check('complete-native-property-bags',[{id:'9007199254740993',typeId:employee,props:{[property(employee)]:'Alice'}},{id:'9007199254740993',typeId:project,props:{[property(project)]:'Project-A'}},{id:'9007199254740994',typeId:project,props:{[property(project)]:'Project-B'}},{id:'9007199254740997',typeId:employee,props:{[property(employee)]:'Bob'}}],properties.map(value=>({...value,props:JSON.parse(value.props!)})));
 // This candidate only decodes the declared required, singular string JSON home.
 // No generic JSON numeric codec or inferred storage-domain conversion occurs.
 const nativeStringKey=async(typeId:string,element:string,objectId='9007199254740993')=>{
  const rows=await connection.unsafe("SELECT jsonb_typeof(props) AS bag_kind,CASE WHEN NOT (props ? $3::text) THEN 'missing' ELSE jsonb_typeof(props->$3::text) END AS kind,CASE WHEN jsonb_typeof(props->$3::text)='string' THEN props->>$3::text ELSE '' END AS value FROM truss.object WHERE id=$1::bigint AND type_id=$2::int",[objectId,typeId,property(typeId)]);
  if(rows.length!==1||rows[0]!.bag_kind!=='object'||rows[0]!.kind!=='string')throw Error('TRUSS_NATIVE_KEY_VALUE_UNSUPPORTED');
  const literal={string:rows[0]!.value!};
  if(!valueProducer.validateCoreFieldValue(originalInterpretation.target,{module:'m',element:element+'-code'},literal).valid)throw Error('TRUSS_NATIVE_KEY_VALUE_UNSUPPORTED');
  return literal;
 };
 check('original-validated-native-key-values',[{string:'Alice'},{string:'Project-A'}],[await nativeStringKey(employee,'Employee'),await nativeStringKey(project,'Project')]);
 const propertyState=async()=>connection.unsafe('SELECT id::text AS id,type_id::text AS type,props::text AS props FROM truss.object ORDER BY id,type_id');
 const originalPropertyState=await propertyState();const propertyRefusals:Record<string,string>={};
 for(const [name,bag] of [['missing',{}],['null',{[property(employee)]:null}],['boolean',{[property(employee)]:true}],['integer',{[property(employee)]:9007199254740993n.toString()}],['foreign-property',{[property(project)]:'Alice'}]] as const){
  await native.control('SAVEPOINT truss_sp_103');
  // Supply the integer test as an exact JSON numeric token, never a JS Number.
  const nativeBag=name==='integer'?'{"'+property(employee)+'":9007199254740993}':JSON.stringify(bag);
  await connection.unsafe('UPDATE truss.object SET props=$1::text::jsonb WHERE id=$2::bigint AND type_id=$3::int',[nativeBag,'9007199254740993',employee]);
  try{await nativeStringKey(employee,'Employee');propertyRefusals[name]='unexpected-success';}catch(error){propertyRefusals[name]=(error as Error).message;}
  await native.control('ROLLBACK TO SAVEPOINT truss_sp_103');await native.control('RELEASE SAVEPOINT truss_sp_103');
 }
 check('native-key-property-value-refusals',Object.fromEntries(['missing','null','boolean','integer','foreign-property'].map(name=>[name,'TRUSS_NATIVE_KEY_VALUE_UNSUPPORTED'])),propertyRefusals);
 check('native-key-property-controls-restored',originalPropertyState,await propertyState());
 check('separate-association-and-relationship-allocations',true,association!==relationship);
 check('original-native-association-property-owner',[{relationshipId:relationship,ownerTypeId:association,propertyId:property(association),module:'m',field:'Assignment-active',scalar:'boolean'},{relationshipId:relationship,ownerTypeId:association,propertyId:property(association,'Assignment-code'),module:'m',field:'Assignment-code',scalar:'string'}],await connection.unsafe('SELECT r.rel_type_id::text AS "relationshipId",r.assoc_type_id::text AS "ownerTypeId",p.prop_id::text AS "propertyId",p.declaration_module AS module,p.element AS field,p.scalar_type AS scalar FROM truss.rel_def r JOIN truss.prop_def p ON p.type_id=r.assoc_type_id ORDER BY r.rel_type_id,p.prop_id'));
 check('native-absent-association-owner',[{relationshipId:bareRelationship,absent:'true'}],await connection.unsafe('SELECT rel_type_id::text AS "relationshipId",(assoc_type_id IS NULL)::text AS absent FROM truss.rel_def WHERE rel_type_id=$1::int',[bareRelationship]));
 await native.control('SAVEPOINT truss_sp_106');let associationOutcome:unknown='unexpected-success';
 await connection.unsafe('UPDATE truss.rel_def SET assoc_type_id=$1::int WHERE rel_type_id=$2::int',[employee,relationship]);
 try{await connection.unsafe(inventorySql,[rev]);}catch(error){associationOutcome={code:(error as {code?:string}).code,message:(error as Error).message};}
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_106');await native.control('RELEASE SAVEPOINT truss_sp_106');
 check('native-association-owner-substitution-refusal',{code:'55000',message:'stored original association Record owner correspondence'},associationOutcome);
 check('native-association-owner-inventory-restored',expectedInventory,normalizeInventory(await connection.unsafe(inventorySql,[rev])));
 const priorBasis=await collectCatalogReportDocumentBasis(connection,prepared,rev);
 const beforeKey=await connection.unsafe('SELECT effect_generation::text AS generation FROM truss.row_home_operation');
 const expectedBuckets:{storageRowId:string;typeId:string;keyNumber:string;objectId:string;namespaceHex:string;keyHex:string}[]=[];
 for(const [objectId,typeId,element,value] of [['9007199254740993',employee,'Employee','Alice'],['9007199254740993',project,'Project','Project-A'],['9007199254740994',project,'Project','Project-B'],['9007199254740997',employee,'Employee','Bob']]){
  const keys=nativeKeys.filter(row=>row.typeId===typeId&&row.keyId==='code-key');if(keys.length!==1)throw Error('Original key definition missing');const keyNumber=keys[0]!.keyNumber!;
  const namespace={profile:'truss-key-bucket/0.1.0' as const,sourceEpoch:'excluded-provisional-'+rev,installationId:'excluded-owned-fixture',typeId:typeId!,keyNumber,encoding:{identity:'umf-key-tuple-v1',version:'3.0.0',sha256:valueProducer.bundleSha256}};
  const namespaceHex=await canonical([namespace.profile,namespace.sourceEpoch,namespace.installationId,namespace.typeId,namespace.keyNumber,namespace.encoding.identity,namespace.encoding.version,namespace.encoding.sha256]);
  const verifier=await createSecurityStoredKeyVerifier(valueProducer,{source:originalInterpretation.target,identity:{module:'m',element:element!,key:'code-key'},namespace,namespaceHex},canonical);
  const nativeValue=await nativeStringKey(typeId!,element!,objectId!);
  const encoded=verifier.encode([nativeValue]);
  if(JSON.stringify(encoded)!==JSON.stringify(verifier.encode([{string:value!}])))throw Error('Independent original key value differs');
  const rows=await connection.unsafe("SELECT truss.runtime_stage_object_key($1::bigint,$2::int,$3::smallint,decode($4::text,'hex'),decode($5::text,'hex'),decode($6::text,'hex')) AS id",[objectId!,typeId!,keyNumber,encoded.namespaceHex,encoded.keyHex,prepared.original.originalUtf8Hex]);
  if(rows.length!==1)throw Error('Original membership staging missing');
  expectedBuckets.push({storageRowId:rows[0]!.id!,typeId:typeId!,keyNumber,objectId:objectId!,...encoded});
 }
 const buckets=await connection.unsafe(`SELECT storage_row_id::text AS "storageRowId",type_id::text AS "typeId",key_num::text AS "keyNumber",object_id::text AS "objectId",encode(namespace_bytes,'hex') AS "namespaceHex",encode(key_bytes,'hex') AS "keyHex" FROM truss.object_key_bucket ORDER BY storage_row_id`);
 check('original-native-key-buckets',expectedBuckets,buckets);
 await native.control('SAVEPOINT truss_sp_101');let staleOutcome='unexpected-success';
 try{await recheckCatalogReportDocumentBasis(connection,priorBasis);}catch(error){staleOutcome=(error as {code?:string}).code??'missing-code';}
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_101');await native.control('RELEASE SAVEPOINT truss_sp_101');
 check('pre-key-observation-stale-refusal','55000',staleOutcome);
 const finalBasis=await collectCatalogReportDocumentBasis(connection,prepared,rev);await recheckCatalogReportDocumentBasis(connection,finalBasis);
 check('post-key-observation-current',(BigInt(priorBasis.nativeObservation.effectGeneration)+4n).toString(),finalBasis.nativeObservation.effectGeneration);
 const projectBucket=expectedBuckets.find(row=>row.typeId===project)!;
 const keyState=async()=>({buckets:await connection.unsafe('SELECT to_jsonb(b)::text AS original FROM truss.object_key_bucket b ORDER BY storage_row_id'),guards:await connection.unsafe('SELECT to_jsonb(g)::text AS original FROM truss.key_bucket_guard g ORDER BY namespace_sha256,key_sha256'),operation:await connection.unsafe('SELECT to_jsonb(o)::text AS original FROM truss.row_home_operation o ORDER BY original_writer_xid,operation_ordinal')});
 const priorKeyState=await keyState();await native.control('SAVEPOINT truss_sp_102');let duplicateOutcome:unknown='unexpected-success';
 const duplicateOwnerBucket=expectedBuckets.find(row=>row.typeId===project&&row.objectId==='9007199254740994')!;
 check('native-duplicate-control-unkeyed-owner',[{id:duplicateOwnerBucket.storageRowId}],await connection.unsafe('DELETE FROM truss.object_key_bucket WHERE storage_row_id=$1::bigint RETURNING storage_row_id::text AS id',[duplicateOwnerBucket.storageRowId]));
 try{await connection.unsafe("SELECT truss.runtime_stage_object_key($1::bigint,$2::int,$3::smallint,decode($4::text,'hex'),decode($5::text,'hex'),decode($6::text,'hex')) AS id",['9007199254740994',project,projectBucket.keyNumber,projectBucket.namespaceHex,projectBucket.keyHex,prepared.original.originalUtf8Hex]);}catch(error){duplicateOutcome={code:(error as {code?:string}).code,message:(error as Error).message};}
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_102');await native.control('RELEASE SAVEPOINT truss_sp_102');
 check('native-duplicate-business-key-refusal',{code:'23505',message:'original full-byte key identity conflicts'},duplicateOutcome);check('duplicate-key-refusal-restores-full-state',priorKeyState,await keyState());
 await recheckCatalogReportDocumentBasis(connection,finalBasis);
 await native.control('SAVEPOINT truss_sp_104');
 const removed=await connection.unsafe('DELETE FROM truss.object_key_bucket WHERE storage_row_id=$1::bigint RETURNING storage_row_id::text AS id',[projectBucket.storageRowId]);
 check('native-required-key-bucket-removed',[{id:projectBucket.storageRowId}],removed);
 const missingBuckets=await connection.unsafe(`SELECT storage_row_id::text AS "storageRowId",type_id::text AS "typeId",key_num::text AS "keyNumber",object_id::text AS "objectId",encode(namespace_bytes,'hex') AS "namespaceHex",encode(key_bytes,'hex') AS "keyHex" FROM truss.object_key_bucket ORDER BY storage_row_id`);
 let missingOutcome='unexpected-success';const {storageRowId:removedStorage,objectId:removedObject,...missingExpected}=projectBucket;
 try{resolveSecurityGraphKeyLocator({objects,buckets:missingBuckets,expected:missingExpected});}catch(error){missingOutcome=(error as Error).message;}
 check('native-required-key-bucket-missing-refusal','TRUSS_SECURITY_GRAPH_LOCATOR_UNSUPPORTED',missingOutcome);
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_104');await native.control('RELEASE SAVEPOINT truss_sp_104');
 check('missing-key-control-restores-full-state',priorKeyState,await keyState());
 await recheckCatalogReportDocumentBasis(connection,finalBasis);
 const lookupRefusals:Record<string,boolean>={};
 for(const [field,value] of [['namespaceHex','00'],['keyHex','00'],['typeId',employee],['keyNumber','2']]){const {storageRowId,objectId,...expected}=projectBucket;try{resolveSecurityGraphKeyLocator({objects,buckets,expected:{...expected,[field!]:value!}});lookupRefusals[field!]=false;}catch{lookupRefusals[field!]=true;}}
 check('native-business-key-substitution-refusals',{namespaceHex:true,keyHex:true,typeId:true,keyNumber:true},lookupRefusals);
 check('native-typed-business-key-owners',expectedBuckets.map(row=>({id:row.objectId,typeId:row.typeId})),expectedBuckets.map(({storageRowId,objectId,...expected})=>resolveSecurityGraphKeyLocator({objects,buckets,expected})));
 check('native-key-operation-generation',[{generation:(BigInt(beforeKey[0]!.generation!)+4n).toString()}],await connection.unsafe('SELECT effect_generation::text AS generation FROM truss.row_home_operation'));
 check('native-key-guard-generations',[{generation:'1'},{generation:'1'},{generation:'1'},{generation:'1'}],await connection.unsafe('SELECT generation::text AS generation FROM truss.key_bucket_guard ORDER BY namespace_sha256,key_sha256'));

 const edges=await connection.unsafe('SELECT id::text AS id,rel_type_id::text AS "relationshipId",source_id::text AS "sourceId",source_type::text AS "sourceType",target_id::text AS "targetId",target_type::text AS "targetType" FROM truss.edge ORDER BY id');
 const declarations=await connection.unsafe('SELECT rel_type_id::text AS "relationshipId",source_type::text AS "sourceType",target_type::text AS "targetType" FROM truss.rel_endpoint ORDER BY rel_type_id,source_type,target_type');
 check('original-native-declared-endpoint',[{relationshipId:bareRelationship,sourceType:employee,targetType:project},{relationshipId:relationship,sourceType:employee,targetType:project}],declarations);
 check('typed-native-edge-projection',[{id:'9007199254740995',relationshipId:relationship,source:{id:'9007199254740993',typeId:employee},target:{id:'9007199254740993',typeId:project}},{id:'9007199254740998',relationshipId:relationship,source:{id:'9007199254740997',typeId:employee},target:{id:'9007199254740994',typeId:project}}],projectDeclaredSecurityGraphEndpoints({objects,edges,declarations,selectedRelationshipId:relationship}));
 // Native Boolean complete-fact membership kernel: both endpoints share one
 // edge witness. Original namespace authority and policy compiler remain open.
 const membership:Record<string,string>={},split:Record<string,string>={};
 for(const [name,sourceId,targetId] of [['alice-a','9007199254740993','9007199254740993'],['alice-b','9007199254740993','9007199254740994'],['bob-a','9007199254740997','9007199254740993'],['bob-b','9007199254740997','9007199254740994']]){
  const sourceBucket=expectedBuckets.find(row=>row.typeId===employee&&row.objectId===sourceId)!;
  const targetBucket=expectedBuckets.find(row=>row.typeId===project&&row.objectId===targetId)!;
  const resolve=(bucket:typeof sourceBucket)=>{const {storageRowId,objectId,...expected}=bucket;return resolveSecurityGraphKeyLocator({objects,buckets,expected});};
  const source=resolve(sourceBucket),target=resolve(targetBucket);const parameters=[relationship,source.id,source.typeId,target.id,target.typeId];
  const rows=await connection.unsafe('SELECT EXISTS(SELECT 1 FROM truss.edge e WHERE e.rel_type_id=$1::int AND e.source_id=$2::bigint AND e.source_type=$3::int AND e.target_id=$4::bigint AND e.target_type=$5::int)::text AS member',parameters);
  const controls=await connection.unsafe('SELECT (EXISTS(SELECT 1 FROM truss.edge e WHERE e.rel_type_id=$1::int AND e.source_id=$2::bigint AND e.source_type=$3::int) AND EXISTS(SELECT 1 FROM truss.edge e WHERE e.rel_type_id=$1::int AND e.target_id=$4::bigint AND e.target_type=$5::int))::text AS member',parameters);
  if(rows.length!==1||controls.length!==1)throw Error('Native membership result cardinality');membership[name!]=rows[0]!.member!;split[name!]=controls[0]!.member!;
 }
 check('native-correlated-original-key-membership',{'alice-a':'true','alice-b':'false','bob-a':'false','bob-b':'true'},membership);
 check('native-split-witness-false-grant-control',{'alice-a':'true','alice-b':'true','bob-a':'true','bob-b':'true'},split);
 await recheckCatalogReportDocumentBasis(connection,finalBasis);
 const edgeSourceInput={kind:'edge' as const,typeId:relationship,propertyOwnerTypeId:association,fields:[{propertyId:property(association),column:'active',scalar:'boolean' as const},{propertyId:property(association,'Assignment-code'),column:'assignment_code',scalar:'string' as const}]};
 const edgeSource=createCandidateGraphSource(edgeSourceInput);
 requireCandidateGraphSource(edgeSource);
 check('candidate-original-edge-source-validity',[{valid:'true'}],await connection.unsafe(edgeSource.validitySql));
 check('candidate-original-edge-source-projection',[{native_id:'9007199254740995',native_type:relationship,source_id:'9007199254740993',source_type:employee,target_id:'9007199254740993',target_type:project,active:'t',assignment_code:'work-A'},{native_id:'9007199254740998',native_type:relationship,source_id:'9007199254740997',source_type:employee,target_id:'9007199254740994',target_type:project,active:'f',assignment_code:'work-B'}],await connection.unsafe('SELECT * FROM ('+edgeSource.sql+') q ORDER BY native_id::bigint'));
 // Attribute and both endpoints must use the same projected association row.
 // This kernel is not the policy lowerer or an ordinary authorized read.
 const activeMembership:Record<string,string>={},splitAttribute:Record<string,string>={};
 for(const [name,sourceId,targetId] of [['alice-a','9007199254740993','9007199254740993'],['alice-b','9007199254740993','9007199254740994'],['bob-a','9007199254740997','9007199254740993'],['bob-b','9007199254740997','9007199254740994']]){
  const resolve=(typeId:string,objectId:string)=>{const bucket=expectedBuckets.find(row=>row.typeId===typeId&&row.objectId===objectId)!;const {storageRowId,objectId:ignored,...expected}=bucket;return resolveSecurityGraphKeyLocator({objects,buckets,expected});};
  const source=resolve(employee,sourceId!),target=resolve(project,targetId!);
  const endpoints='q.source_id OPERATOR(pg_catalog.=) $1::pg_catalog.text AND q.source_type OPERATOR(pg_catalog.=) $2::pg_catalog.text AND q.target_id OPERATOR(pg_catalog.=) $3::pg_catalog.text AND q.target_type OPERATOR(pg_catalog.=) $4::pg_catalog.text';
  const rows=await connection.unsafe('WITH candidate AS ('+edgeSource.sql+') SELECT EXISTS(SELECT 1 FROM candidate q WHERE '+endpoints+' AND q.active IS TRUE)::pg_catalog.text AS correlated,(EXISTS(SELECT 1 FROM candidate q WHERE '+endpoints+') AND EXISTS(SELECT 1 FROM candidate q WHERE q.active IS TRUE))::pg_catalog.text AS split',[source.id,source.typeId,target.id,target.typeId]);
  if(rows.length!==1)throw Error('Native active membership result cardinality');
  activeMembership[name!]=rows[0]!.correlated!;splitAttribute[name!]=rows[0]!.split!;
 }
 check('native-same-witness-active-membership',{'alice-a':'true','alice-b':'false','bob-a':'false','bob-b':'false'},activeMembership);
 check('native-split-attribute-false-grant-control',{'alice-a':'true','alice-b':'false','bob-a':'false','bob-b':'true'},splitAttribute);
 const endpointKey=(typeId:string)=>{const {keyNumber,namespaceHex}=expectedBuckets.find(row=>row.typeId===typeId)!;return {typeId,keyNumber,namespaceHex};};
 const keyedEdgeSource=createCandidateGraphEndpointKeys({source:edgeSource,sourceKey:endpointKey(employee),targetKey:endpointKey(project)});
 const opaqueSourceInput={kind:'edge' as const,typeId:bareRelationship,propertyOwnerTypeId:null,fields:[]},opaqueSource=createCandidateGraphSource(opaqueSourceInput);
 const opaqueKeySource=createCandidateGraphEndpointKeys({source:opaqueSource,sourceKey:endpointKey(employee),targetKey:endpointKey(project)});
 const compilerBinary='/private/tmp/umf-security-weft-bridge-target/debug/examples/security_candidate_ir';
 const documentJson=JSON.stringify(originalInterpretation.target),documentHash=new Bun.CryptoHasher('sha256').update(documentJson).digest('hex');
 const compilerRequest=createNativeGraphConditionRequest([{documentJson,pin:{documentId:model.id,revision:'candidate-1',umfVersion:originalInterpretation.target.umf,sha256:documentHash},selectedModuleIds:['m']}]);
 const compilation=Bun.spawn([compilerBinary],{stdin:new Blob([JSON.stringify(compilerRequest)]),stdout:'pipe',stderr:'pipe'});
 const [compilerExit,compilerStdout,compilerStderr]=await Promise.all([compilation.exited,new Response(compilation.stdout).text(),new Response(compilation.stderr).text()]);
 if(compilerExit)throw Error(compilerStderr);const compilerRules=JSON.parse(compilerStdout);
 if(compilerRules.length!==1||compilerRules[0].id!=='membership')throw Error('Original graph condition output');
 const originalRef=(elementId:string)=>({documentId:model.id,moduleId:'m',elementId}),compiledAssociation={documentId:model.id,moduleId:'m',relationshipId:'BareWorksOn'};
 const compiledConditionSql=lowerCandidateSecurityCondition({condition:compilerRules[0].condition,scans:[{association:compiledAssociation,home:{source:opaqueKeySource},endpoints:[{association:compiledAssociation,role:'staff',target:originalRef('Employee'),keyId:'code-key',targetKeyFields:[originalRef('Employee-code')],carrier:{incidence:{side:'source'}},columns:['source_key_hex']},{association:compiledAssociation,role:'project',target:originalRef('Project'),keyId:'code-key',targetKeyFields:[originalRef('Project-code')],carrier:{incidence:{side:'target'}},columns:['target_key_hex']}]}],subject:{target:originalRef('Employee'),keyId:'code-key',keyFields:[originalRef('Employee-code')],parameters:[1]},resource:{target:originalRef('Project'),keyId:'code-key',keyFields:[originalRef('Project-code')],parameters:[2]}});
 const compiledMembership=async(id:string,expected:Record<string,string>)=>{
  const actual:Record<string,string>={};
  for(const [label,staffId,projectId] of [['alice-a','9007199254740993','9007199254740993'],['alice-b','9007199254740993','9007199254740994'],['bob-a','9007199254740997','9007199254740993'],['bob-b','9007199254740997','9007199254740994']]){
   const staff=expectedBuckets.find(row=>row.typeId===employee&&row.objectId===staffId)!,selectedProject=expectedBuckets.find(row=>row.typeId===project&&row.objectId===projectId)!;
   const rows=await connection.unsafe('SELECT ('+compiledConditionSql+')::pg_catalog.text AS truth',[staff.keyHex,selectedProject.keyHex]);actual[label!]=rows[0]!.truth!;
  }
  check('original-compiler-opaque-'+id,expected,actual);
 };
 await compiledMembership('empty',{'alice-a':'false','alice-b':'false','bob-a':'false','bob-b':'false'});

 check('candidate-opaque-empty-validity',[{valid:'true'}],await connection.unsafe(opaqueKeySource.validitySql));
 check('candidate-opaque-empty-projection',[],await connection.unsafe(opaqueKeySource.sql));
 const misclassifiedOpaque=createCandidateGraphSource({...opaqueSourceInput,typeId:relationship});
 check('candidate-opaque-record-owner-refusal',[{valid:'false'}],await connection.unsafe(misclassifiedOpaque.validitySql));
 const conditionAssociation={documentId:model.id,moduleId:'m',relationshipId:'BareWorksOn'};
 const opaqueExists={exists:{slot:0,association:conditionAssociation,witness:'opaqueExistential',condition:{literal:true}}};
 const conditionPrograms:Record<string,string>={};
 const conditionCheck=async(id:string,source:typeof opaqueSource,condition:unknown,expected:string)=>{
  const sql=lowerCandidateSecurityCondition({condition,scans:[{association:conditionAssociation,home:{source},endpoints:[]}]});
  conditionPrograms[id]=sql;
  check('candidate-condition-'+id,[{truth:expected}],await connection.unsafe("SELECT COALESCE(("+sql+")::pg_catalog.text,E'unknown'::pg_catalog.text) AS truth"));
 };
 await conditionCheck('empty-exists',opaqueKeySource,opaqueExists,'false');
 await conditionCheck('empty-negated',opaqueKeySource,{not:opaqueExists},'true');
 await conditionCheck('invalid-negated',misclassifiedOpaque,{not:opaqueExists},'unknown');
 await conditionCheck('invalid-true-sibling',misclassifiedOpaque,{or:[{literal:true},opaqueExists]},'unknown');
 const beforeOpaqueEdges=await connection.unsafe('SELECT pg_catalog.to_jsonb(e)::pg_catalog.text AS original FROM truss.edge e ORDER BY id'),beforeOpaqueKeys=await keyState();
 await native.control('SAVEPOINT truss_sp_114');
 await connection.unsafe('INSERT INTO truss.edge(id,rel_type_id,source_id,source_type,target_id,target_type,props,rev) VALUES ($1::bigint,$2::int,$3::bigint,$4::int,$5::bigint,$6::int,$7::text::jsonb,$8::int)',['9007199254740999',bareRelationship,'9007199254740993',employee,'9007199254740994',project,'{}',rev]);
 const expectedOpaque={native_id:'9007199254740999',native_type:bareRelationship,source_id:'9007199254740993',source_type:employee,target_id:'9007199254740994',target_type:project};
 check('candidate-opaque-native-projection',[expectedOpaque],await connection.unsafe(opaqueSource.sql));
 await compiledMembership('staged',{'alice-a':'false','alice-b':'true','bob-a':'false','bob-b':'false'});
 await conditionCheck('staged-exists',opaqueKeySource,opaqueExists,'true');
 check('candidate-opaque-key-validity',[{valid:'true'}],await connection.unsafe(opaqueKeySource.validitySql));
 check('candidate-opaque-native-key-projection',[{...expectedOpaque,source_key_hex:expectedBuckets.find(row=>row.typeId===employee&&row.objectId==='9007199254740993')!.keyHex,target_key_hex:expectedBuckets.find(row=>row.typeId===project&&row.objectId==='9007199254740994')!.keyHex}],await connection.unsafe(opaqueKeySource.sql));
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_114');await native.control('RELEASE SAVEPOINT truss_sp_114');
 await compiledMembership('rollback',{'alice-a':'false','alice-b':'false','bob-a':'false','bob-b':'false'});
 await conditionCheck('rollback-exists',opaqueKeySource,opaqueExists,'false');
 check('candidate-opaque-rollback-empty-projection',[],await connection.unsafe(opaqueKeySource.sql));
 check('candidate-opaque-rollback-edges-restored',beforeOpaqueEdges,await connection.unsafe('SELECT pg_catalog.to_jsonb(e)::pg_catalog.text AS original FROM truss.edge e ORDER BY id'));
 check('candidate-opaque-rollback-keys-restored',beforeOpaqueKeys,await keyState());
 check('candidate-endpoint-key-source-validity',[{valid:'true'}],await connection.unsafe(keyedEdgeSource.validitySql));
 const keyProjection='SELECT native_id,source_key_hex,target_key_hex FROM ('+keyedEdgeSource.sql+') q ORDER BY native_id::pg_catalog.int8';
 const expectedKeyProjection=[['9007199254740995','9007199254740993','9007199254740993'],['9007199254740998','9007199254740997','9007199254740994']].map(([native_id,sourceId,targetId])=>({native_id,source_key_hex:expectedBuckets.find(row=>row.typeId===employee&&row.objectId===sourceId)!.keyHex,target_key_hex:expectedBuckets.find(row=>row.typeId===project&&row.objectId===targetId)!.keyHex}));
 check('candidate-endpoint-key-source-projection',expectedKeyProjection,await connection.unsafe(keyProjection));
 const originalEndpointType=await connection.unsafe('SELECT pg_catalog.to_jsonb(t)::pg_catalog.text AS original FROM truss.type_def t WHERE type_id=$1::pg_catalog.int4',[project]);
 await native.control('SAVEPOINT truss_sp_111');
 await connection.unsafe('UPDATE truss.type_def SET provisional=true,definition_source_kind=NULL,definition_rev=NULL,definition_doc_ord=NULL,definition_document_id=NULL WHERE type_id=$1::pg_catalog.int4',[project]);
 check('candidate-endpoint-provisional-native-state',[{provisional:'true',definition_source_kind:null,definition_rev:null,definition_doc_ord:null,definition_document_id:null}],(await connection.unsafe('SELECT pg_catalog.row_to_json(r)::pg_catalog.text AS row FROM (SELECT provisional::pg_catalog.text AS provisional,definition_source_kind,definition_rev::pg_catalog.text,definition_doc_ord::pg_catalog.text,definition_document_id FROM truss.type_def WHERE type_id=$1::pg_catalog.int4) r',[project])).map(row=>JSON.parse(row.row!)));
 check('candidate-endpoint-provisional-type-refusal',[{valid:'false'}],await connection.unsafe(keyedEdgeSource.validitySql));
 check('candidate-endpoint-provisional-rows-preserved',expectedKeyProjection,await connection.unsafe(keyProjection));
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_111');await native.control('RELEASE SAVEPOINT truss_sp_111');
 check('candidate-endpoint-provisional-control-restored',[{valid:'true'}],await connection.unsafe(keyedEdgeSource.validitySql));
 check('candidate-endpoint-provisional-type-row-restored',originalEndpointType,await connection.unsafe('SELECT pg_catalog.to_jsonb(t)::pg_catalog.text AS original FROM truss.type_def t WHERE type_id=$1::pg_catalog.int4',[project]));
 const typedOwnerEdges=await connection.unsafe('SELECT pg_catalog.to_jsonb(e)::pg_catalog.text AS original FROM truss.edge e ORDER BY id'),typedOwnerKeys=await keyState();
 for(const [role,id,savepoint] of [['source','9007199254740994','truss_sp_112'],['target','9007199254740997','truss_sp_113']] as const){
  await native.control('SAVEPOINT '+savepoint);let outcome:unknown='unexpected-success';
  try{await connection.unsafe('UPDATE truss.edge SET '+role+'_id=$1::pg_catalog.int8 WHERE id=$2::pg_catalog.int8',[id,'9007199254740995']);}catch(error){const failure=error as {code?:string;constraint?:string};outcome={code:failure.code,constraint:failure.constraint};}
  await native.control('ROLLBACK TO SAVEPOINT '+savepoint);await native.control('RELEASE SAVEPOINT '+savepoint);
  check('candidate-endpoint-'+role+'-wrong-object-type-refusal',{code:'23503',constraint:'edge_'+role+'_fk'},outcome);
  check('candidate-endpoint-'+role+'-wrong-object-edges-restored',typedOwnerEdges,await connection.unsafe('SELECT pg_catalog.to_jsonb(e)::pg_catalog.text AS original FROM truss.edge e ORDER BY id'));
  check('candidate-endpoint-'+role+'-wrong-object-keys-restored',typedOwnerKeys,await keyState());
 }
 await native.control('SAVEPOINT truss_sp_108');
 await connection.unsafe('DELETE FROM truss.object_key_bucket WHERE type_id=$1::pg_catalog.int4 AND object_id=$2::pg_catalog.int8',[project,'9007199254740994']);
 check('candidate-endpoint-key-missing-refusal',[{valid:'false'}],await connection.unsafe(keyedEdgeSource.validitySql));
 check('candidate-endpoint-key-missing-row-preserved',expectedKeyProjection.map(row=>row.native_id==='9007199254740998'?{...row,target_key_hex:null}:row),(await connection.unsafe('SELECT pg_catalog.row_to_json(r)::pg_catalog.text AS row FROM ('+keyProjection+') r')).map(row=>JSON.parse(row.row!)));
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_108');await native.control('RELEASE SAVEPOINT truss_sp_108');
 check('candidate-endpoint-key-control-restored',expectedKeyProjection,await connection.unsafe(keyProjection));
 await native.control('SAVEPOINT truss_sp_110');
 let duplicateEndpointOutcome:unknown='unexpected-success';
 try{await connection.unsafe('INSERT INTO truss.object_key_bucket(type_id,key_num,object_id,namespace_bytes,key_bytes,original_context_bytes) SELECT type_id,key_num,object_id,namespace_bytes,key_bytes,original_context_bytes FROM truss.object_key_bucket WHERE type_id=$1::pg_catalog.int4 AND object_id=$2::pg_catalog.int8',[project,'9007199254740994']);}catch(error){const failure=error as {code?:string;constraint?:string};duplicateEndpointOutcome={code:failure.code,constraint:failure.constraint};}
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_110');await native.control('RELEASE SAVEPOINT truss_sp_110');
 check('candidate-endpoint-key-native-duplicate-refusal',{code:'23505',constraint:'object_key_bucket_one_per_object'},duplicateEndpointOutcome);
 check('candidate-endpoint-key-duplicate-control-restored',priorKeyState,await keyState());
 await native.control('SAVEPOINT truss_sp_109');
 await connection.unsafe('DELETE FROM truss.edge');
 check('candidate-endpoint-key-empty-population',[{count:'0'}],await connection.unsafe('SELECT pg_catalog.count(*)::pg_catalog.text AS count FROM truss.edge'));
 check('candidate-endpoint-key-empty-projection',[],await connection.unsafe(keyProjection));
 check('candidate-endpoint-key-empty-validity',[{valid:'true'}],await connection.unsafe(keyedEdgeSource.validitySql));
 const missingDefinition=createCandidateGraphEndpointKeys({source:edgeSource,sourceKey:{...endpointKey(employee),keyNumber:'32767'},targetKey:endpointKey(project)});
 check('candidate-endpoint-key-empty-metadata-refusal',[{valid:'false'}],await connection.unsafe(missingDefinition.validitySql));
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_109');await native.control('RELEASE SAVEPOINT truss_sp_109');
 check('candidate-endpoint-key-empty-control-restored',expectedKeyProjection,await connection.unsafe(keyProjection));
 await native.control('SAVEPOINT truss_sp_107');
 const originalEdges=await connection.unsafe('SELECT to_jsonb(e)::text AS original FROM truss.edge e ORDER BY id');
 await connection.unsafe('UPDATE truss.edge SET props=props-$1::text WHERE id=$2::bigint',[property(association),'9007199254740995']);
 check('candidate-edge-source-missing-field-refusal',[{valid:'false'}],await connection.unsafe(edgeSource.validitySql));
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_107');await native.control('RELEASE SAVEPOINT truss_sp_107');
 check('candidate-edge-source-control-restored',originalEdges,await connection.unsafe('SELECT to_jsonb(e)::text AS original FROM truss.edge e ORDER BY id'));
 await native.control('SAVEPOINT truss_sp_99');
 let reversedOutcome:unknown;
 try{await connection.unsafe('INSERT INTO truss.edge(id,rel_type_id,source_id,source_type,target_id,target_type,props,rev) VALUES ($1::bigint,$2::int,$3::bigint,$4::int,$5::bigint,$6::int,$7::text::jsonb,$8::int)',['9007199254740996',relationship,'9007199254740994',project,'9007199254740993',employee,'{}',rev]);reversedOutcome='unexpected-success';}catch(error){const failure=error as {code?:string;constraint?:string};reversedOutcome={code:failure.code,constraint:failure.constraint};}
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_99');await native.control('RELEASE SAVEPOINT truss_sp_99');
 check('native-reversed-endpoint-refusal',{code:'23503',constraint:'edge_endpoint_types_fk'},reversedOutcome);
 check('native-reversal-rollback-restores-edges',edges,await connection.unsafe('SELECT id::text AS id,rel_type_id::text AS "relationshipId",source_id::text AS "sourceId",source_type::text AS "sourceType",target_id::text AS "targetId",target_type::text AS "targetType" FROM truss.edge ORDER BY id'));
 check('public-catalog-head-stays-bootstrap',[{rev:'0'}],await connection.unsafe('SELECT rev::text AS rev FROM truss.schema_head'));
 check('always-deferred-barrier-remains',[{enabled:'A',deferrable:'true',initiallyDeferred:'true'}],await connection.unsafe("SELECT tgenabled::text AS enabled,tgdeferrable::text AS deferrable,tginitdeferred::text AS \"initiallyDeferred\" FROM pg_catalog.pg_trigger WHERE tgname='runtime_operation_commit_barrier' AND tgrelid='truss.row_home_operation'::regclass"));
 await native.control('SAVEPOINT truss_sp_105');let finalizerOutcome:unknown='unexpected-success';
 try{await connection.unsafe('SET CONSTRAINTS truss.runtime_operation_commit_barrier IMMEDIATE');}catch(error){finalizerOutcome={code:(error as {code?:string}).code,message:(error as Error).message};}
 await native.control('ROLLBACK TO SAVEPOINT truss_sp_105');await native.control('RELEASE SAVEPOINT truss_sp_105');
 check('native-incomplete-finalizer-refusal',{code:'55000',message:'complete runtime finalizer is not installed'},finalizerOutcome);
 check('finalizer-refusal-restores-full-key-state',priorKeyState,await keyState());await recheckCatalogReportDocumentBasis(connection,finalBasis);
 await native.rollback();active=false;
 await native.begin({isolation:'read_committed',accessMode:'read_only'});active=true;
 check('rollback-removes-original-candidate',[{types:'0',objects:'0',edges:'0',operations:'0',buckets:'0',guards:'0'}],await connection.unsafe('SELECT (SELECT count(*)::text FROM truss.type_def) AS types,(SELECT count(*)::text FROM truss.object) AS objects,(SELECT count(*)::text FROM truss.edge) AS edges,(SELECT count(*)::text FROM truss.row_home_operation) AS operations,(SELECT count(*)::text FROM truss.object_key_bucket) AS buckets,(SELECT count(*)::text FROM truss.key_bucket_guard) AS guards'));
 await native.rollback();active=false;await native.release();released=true;
 console.log(JSON.stringify({status:'passed-candidate-native-mapping',observations,observedDriverEntries,observedAjvEntry,originalGraphCondition:{request:compilerRequest,rules:compilerRules,sql:compiledConditionSql},candidateConditionPrograms:conditionPrograms,candidateOpaqueSource:{input:opaqueSourceInput,source:opaqueSource,keySource:opaqueKeySource},candidateEdgeSource:{input:edgeSourceInput,source:edgeSource},candidateEndpointKeySource:{sourceKey:endpointKey(employee),targetKey:endpointKey(project),source:keyedEdgeSource},originalModel:model,ownerProfile:preparation.umfProfile,staged,scope:'One original installer pg-runtime connection; actual owner-backed provisional catalog allocation and native typed object/edge traversal; explicit rollback with unchanged bootstrap head and retained ALWAYS initially deferred barrier. Excluded installer-created graph fixture, provisional exact-byte key bucket mapping with excluded namespace epoch/installation selections; no ordinary identity enforcement, committed catalog, authenticated namespace authority, general property codec (only selected required singular string JSON key fields are decoded), public compiler activation, source/cut authority or backend acceptance. Original draft0.2 opaque membership IR over the exact reversibly migrated core0.8 document is executed at three rollback-only states with four independently expected subject/resource pairs; this does not qualify authenticated binding or ordinary actors.'}));
}catch(error){errorSeen=true;throw error;}finally{
 try{
  if(!released){try{if(active){await native.rollback();active=false;}await native.release();released=true;}catch{await native.quarantine('transaction_unusable');await host.shutdownQuarantinedTransports();}}
  if(released)await host.close();
 }catch(error){if(!errorSeen)throw error;}
}
