/** Owned installer-only RPC bridge; original preparation and staging, no public API. */
import {createInterface} from 'node:readline';
import {createCatalogInputPreparation} from './truss/packages/umf-bun/src/catalog-input';
import {prepareDefaultCatalogHomes} from './truss/packages/umf-bun/src/catalog-default-homes';
import {stageNewCatalogCohort} from './truss/packages/umf-bun/src/catalog-new-stage';
const lines=createInterface({input:process.stdin,crlfDelay:Infinity})[Symbol.asyncIterator]();
async function receive(){const line=await lines.next();if(line.done||Buffer.byteLength(line.value)>1048576)throw Error('Bounded original response required');return JSON.parse(line.value)}
const emit=(value:unknown)=>process.stdout.write(JSON.stringify(value)+'\n');
try{
 const input=await receive();
 const preparation=await createCatalogInputPreparation(input.ownerDirectory,input.dependenciesPackage);
 const original=input.artifact.request.modules[0].documentJson,bytes=Buffer.from(original);
 const request=input.fixture.input;request.binding={state:'absent'};request.transforms=[];
 const documentId=JSON.parse(original).id;
 request.documents=[{documentId,documentRevision:'original-security-candidate',artifact:{identity:'original-owner-document',bytesBase64:bytes.toString('base64'),sha256:new Bun.CryptoHasher('sha256').update(bytes).digest('hex')},umfProfile:preparation.umfProfile,ingress:{kind:'native'}}];
 const prepared=preparation.prepare(new TextEncoder().encode(JSON.stringify(request)));
 const connection={async unsafe(sql:string,parameters:unknown[]=[]){emit({kind:'query',sql,parameters});const response=await receive();if(response.error)throw Error('Native staging refusal '+response.error);return response.rows}};
 const prestate=await connection.unsafe('SELECT truss.runtime_capture_catalog_prestate() AS bytes');
 await connection.unsafe("SELECT * FROM truss.runtime_admit_operation('catalog-acceptance',decode('01','hex'),decode($1::text,'hex'),decode($2::text,'hex'),decode('04','hex'),decode('05','hex'),decode('06','hex'))",[prepared.original.originalUtf8Hex,prestate[0].bytes]);
 const staged=await stageNewCatalogCohort(connection,prepared,prepareDefaultCatalogHomes(prepared).homes,{});
 emit({kind:'result',staged,originalText:prepared.documents[0].originalText,validation:prepared.documents[0].validation,profile:preparation.umfProfile});
}catch(error){emit({kind:'failure',reason:(error as Error).message});process.exitCode=1}
