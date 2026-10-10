import {test,expect} from 'bun:test';
import {inspectDomainPack} from '../../src/domain-packs/profile';
const preservation={version:'1.0.0',handoff:'BagIt-1.0',fixity:'sha256',events:'PREMIS-3.0-semantic-mapping',provenance:'PROV-O-JSON-LD',originals:'authoritative-immutable-bytes',primary_runtime:'tablespec-python'};
test('preservation declarations retain annotations and refuse unsupported claims',()=>{
 const pack={id:'documents',version:'1.0.0',domain_types:{document:{}},sources:{document:{kind:'external',data_kind:'observed',reference:'urn:test',format:'pdf'}},preservation:{...preservation,future:{meaning:'retained'}}};
 expect(inspectDomainPack(pack).valid).toBe(true);
 expect(pack.preservation.future.meaning).toBe('retained');
 for(const change of [{version:'2.0.0'},{fixity:'md5'},{events:'PREMIS-XML'},{primary_runtime:'bun'},{derivations:[{schema_id:'missing',source_identity:'sha256'}]}])expect(inspectDomainPack({...pack,preservation:{...preservation,...change}}).valid).toBe(false);
});
