/** Trusted installer-only bridge. Archives an opaque binding; no interpretation. */
import {createInterface} from 'node:readline';
import {createCatalogInputPreparation} from './truss/packages/umf-bun/src/catalog-input';
import {collectPendingCatalogReportBasis,recheckPendingCatalogReportBasis} from './truss/packages/umf-bun/src/catalog-pending-report-basis';
import {stageNewCatalogCohort} from './truss/packages/umf-bun/src/catalog-new-stage';
const lines=createInterface({input:process.stdin,crlfDelay:Infinity})[Symbol.asyncIterator]();
async function receive(){const line=await lines.next();if(line.done||Buffer.byteLength(line.value)>1048576)throw Error('Bounded original response required');return JSON.parse(line.value)}
const emit=(value:unknown)=>process.stdout.write(JSON.stringify(value)+'\n');
try{
 const input=await receive(),preparation=await createCatalogInputPreparation(input.ownerDirectory,input.dependenciesPackage);
 const original=input.artifact.request.modules[0].documentJson,bytes=Buffer.from(original),request=input.fixture.input;
 request.binding=input.binding;request.transforms=[];
 request.documents=[{documentId:JSON.parse(original).id,documentRevision:input.artifact.request.modules[0].pin.revision,artifact:{identity:'original-owner-document',bytesBase64:bytes.toString('base64'),sha256:new Bun.CryptoHasher('sha256').update(bytes).digest('hex')},umfProfile:preparation.umfProfile,ingress:{kind:'native'}}];
 const prepared=preparation.prepare(new TextEncoder().encode(JSON.stringify(request)));
 // Explicit fixture selection: present binding does not authorize default homes.
 const homes=prepared.declarations.flatMap(document=>document.records.flatMap(record=>record.fields.map(field=>({documentId:record.documentId,moduleId:record.moduleId,elementId:record.elementId,fieldModule:field.fieldModule,fieldId:field.fieldId,home:'json' as const}))));
 const connection={async unsafe(sql:string,parameters:unknown[]=[]){emit({kind:'query',sql,parameters});const response=await receive();if(response.error)throw Error('Native staging refusal '+response.error);return response.rows}};
 const prestate=await connection.unsafe('SELECT truss.runtime_capture_binding_catalog_prestate() AS bytes');
 await connection.unsafe("SELECT * FROM truss.runtime_admit_operation('catalog-acceptance',decode('01','hex'),decode($1::text,'hex'),decode($2::text,'hex'),decode('04','hex'),decode('05','hex'),decode('06','hex'))",[prepared.original.originalUtf8Hex,prestate[0].bytes]);
 const staged=await stageNewCatalogCohort(connection,prepared,homes,{});
 emit({kind:'result',staged,originalText:prepared.documents[0].originalText,originalInputHex:prepared.original.originalUtf8Hex});
 if(input.pendingReportBasis){
  const phase=await receive();if(phase.kind!=='pendingReportBasis'||typeof phase.revision!=='string')throw Error('Original pending report phase required');
  const basis=await collectPendingCatalogReportBasis(connection,prepared,phase.revision);
  const anotherPrepared=preparation.prepare(Buffer.from(prepared.original.originalUtf8Hex,'hex'));
  const refusals:Record<string,string>={};
  for(const [name,actor,preparation,candidate] of [
   ['copied',connection,prepared,{...basis}],
   ['connection',{...connection},prepared,basis],
   ['preparation',connection,{...prepared},basis],
   ['recognizedPreparation',connection,anotherPrepared,basis],
  ] as const){
   try{await recheckPendingCatalogReportBasis(actor,preparation,candidate);throw Error('Required custody refusal absent');}
   catch(error){const message=(error as Error).message;if(message==='Required custody refusal absent')throw error;refusals[name]=message;}
  }
  const shapeRefusals:Record<string,string>={};
  for(const [name,rows] of Object.entries({empty:[],duplicate:[{original_basis_hex:'00'},{original_basis_hex:'00'}],null:[null],extra:[{original_basis_hex:'00',other:'00'}],uppercase:[{original_basis_hex:'AA'}],odd:[{original_basis_hex:'0'}],nonhex:[{original_basis_hex:'0x'}],emptyHex:[{original_basis_hex:''}],oversize:[{original_basis_hex:'00'.repeat(8388609)}]})){
   const malformed={async unsafe(sql:string,parameters:unknown[]=[]){if(sql.includes('AS original_basis_hex'))return rows;return connection.unsafe(sql,parameters)}};
   try{await collectPendingCatalogReportBasis(malformed,prepared,phase.revision);throw Error('Required result-shape refusal absent');}
   catch(error){const message=(error as Error).message;if(message!=='Exact bounded original native report basis bytes required')throw error;shapeRefusals[name]=message;}
  }
  const revisionRefusals:Record<string,{message:string;sqlCalls:number}>={};
  for(const [name,value] of Object.entries({numeric:1,boxed:new String(phase.revision),coercion:{[Symbol.toPrimitive](){throw Error('Coercion hook must not execute')}}})){
   let sqlCalls=0;const counted={async unsafe(sql:string,parameters:unknown[]=[]){sqlCalls++;return connection.unsafe(sql,parameters)}};
   try{await collectPendingCatalogReportBasis(counted,prepared,value as unknown as string);throw Error('Required revision refusal absent');}
   catch(error){const message=(error as Error).message;if(message!=='Original positive native revision required'||sqlCalls!==0)throw error;revisionRefusals[name]={message,sqlCalls};}
  }
  await connection.unsafe('SAVEPOINT pending_host_stale_basis');
  await connection.unsafe('UPDATE truss.row_home_operation SET effect_generation=effect_generation+1');
  let staleRefusal='';
  try{await recheckPendingCatalogReportBasis(connection,prepared,basis);throw Error('Required stale host basis refusal absent');}
  catch(error){staleRefusal=(error as Error).message;if(staleRefusal!=='Native staging refusal 55000')throw error;}
  await connection.unsafe('ROLLBACK TO SAVEPOINT pending_host_stale_basis');
  await connection.unsafe('RELEASE SAVEPOINT pending_host_stale_basis');
  await recheckPendingCatalogReportBasis(connection,prepared,basis);
  emit({kind:'pendingReportResult',basis,refusals,shapeRefusals,revisionRefusals,staleRefusal});
 }
}catch(error){emit({kind:'failure',reason:(error as Error).message});process.exitCode=1}
