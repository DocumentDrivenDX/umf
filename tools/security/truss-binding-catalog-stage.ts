/** Trusted installer-only bridge. Archives an opaque binding; no interpretation. */
import {createInterface} from 'node:readline';
import {createCatalogInputPreparation} from './truss/packages/umf-bun/src/catalog-input';
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
}catch(error){emit({kind:'failure',reason:(error as Error).message});process.exitCode=1}
