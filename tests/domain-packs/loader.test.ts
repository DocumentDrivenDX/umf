import {test,expect} from 'bun:test';
import {inspectDomainPackLoader,generateDomainPackLoaderSchema} from '../../src/domain-packs/loader';
import {inspectDomainPack} from '../../src/domain-packs/profile';
const loader={version:'1.0.0',id:'umf.document-loader',implementation_version:'1.0.0',profile:'court-documents',runtime:'bun',entrypoint:'run.ts',configuration_schema:'inventory.schema.json',qualification:'Finite explicit inventory only',artifacts:[{reference:'run.ts',sha256:'a'.repeat(64)},{reference:'inventory.schema.json',sha256:'b'.repeat(64)}]};
test('loader metadata retains annotations and refuses unsupported versions @covers US-060-AC8',()=>{
 const input={...loader,future:{meaning:'retained'}};
 expect(inspectDomainPackLoader(input)).toEqual({valid:true,complete:true,diagnostics:[]});
 expect(input.future.meaning).toBe('retained');
 for(const change of [{version:'2.0.0'},{id:'execute-arbitrary'},{profile:'future'},{artifacts:[]},{entrypoint:'../code.ts'},{entrypoint:'README.md'},{configuration_schema:'loader.schema.json'}])expect(inspectDomainPackLoader({...loader,...change}).valid).toBe(false);
 let invoked=false;const getter=Object.defineProperty({...loader},'future',{enumerable:true,get(){invoked=true;return 1;}});
 expect(inspectDomainPackLoader(getter).valid).toBe(false);expect(invoked).toBe(false);
 const pack={id:'test',version:'1.0.0',domain_types:{document:{}},sources:{ref:{kind:'external',data_kind:'observed',reference:'urn:test',format:'pdf'}},loader};
 expect(inspectDomainPack(pack).valid).toBe(true);
 expect(inspectDomainPack({...pack,loader:{...loader,implementation_version:'9.0.0'}}).valid).toBe(false);
 expect(generateDomainPackLoaderSchema().$id).toBe('urn:umf:domain-pack-loader:1.0.0');
});
