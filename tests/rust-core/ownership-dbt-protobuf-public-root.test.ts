// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {
 dbtManifestRegistry,importDbtManifest,protobufRegistry,importProtobufDescriptorSet,
 validateDocument,
} from '../../src/index-node-v4';
import {dbtManifestPackage} from '../../src/adapters/dbt/index';
import {protobufPackage} from '../../src/adapters/protobuf/package';

const manifestText=JSON.stringify({
 metadata:{dbt_schema_version:'https://schemas.getdbt.com/dbt/manifest/v12.json'},
 nodes:{},sources:{},macros:{},docs:{},exposures:{},metrics:{},groups:{},selectors:{},disabled:{},parent_map:{},child_map:{},group_map:{},saved_queries:{},semantic_models:{},unit_tests:{},
});
const unknownWire=new Uint8Array([0x82,0xb5,0x18,0x04,0x00,0x01,0x02,0xff]);

test('Node V4 DBT and Protobuf registries use Rust payload semantics and retain caller checks',()=>{
 const dbt=importDbtManifest(manifestText,{id:'registry-dbt'});
 const dbtReport=validateDocument(dbt,dbtManifestRegistry());
 expect(dbtReport.valid).toBe(true);
 expect(dbtReport.diagnostics.some(item=>item.code==='DBT_MANIFEST_CONTEXT')).toBe(true);
 const invalidDbt=structuredClone(dbt);
 (invalidDbt.modules[0]!.elements[0]!.extensions[dbtManifestPackage.id] as any).root={kind:'string',value:'not-an-object'};
 expect(validateDocument(invalidDbt,dbtManifestRegistry()).diagnostics.some(item=>item.code==='DBT_MANIFEST_STRUCTURE'&&item.severity==='error')).toBe(true);
 let callerRan=false;
 const dbtWithCaller=dbtManifestRegistry().register(dbtManifestPackage,()=>{callerRan=true;return [{code:'CALLER_CHECK',path:'',message:'caller retained',severity:'warning'}];});
 const retainedDbt=validateDocument(dbt,dbtWithCaller);
 expect(callerRan).toBe(true);
 expect(retainedDbt.diagnostics.some(item=>item.code==='CALLER_CHECK')).toBe(true);

 const protobuf=importProtobufDescriptorSet(unknownWire,{id:'registry-protobuf'});
 const protobufReport=validateDocument(protobuf,protobufRegistry());
 expect(protobufReport.valid).toBe(true);
 expect(protobufReport.diagnostics.some(item=>item.code==='PROTOBUF_UNKNOWN')).toBe(true);
 expect(protobufReport.diagnostics.some(item=>item.code==='PROTOBUF_COMPILER_REQUIRED')).toBe(true);
 let protobufCallerRan=false;
 const protobufWithCaller=protobufRegistry().register(protobufPackage,()=>{protobufCallerRan=true;return [{code:'CALLER_CHECK',path:'',message:'caller retained',severity:'warning'}];});
 expect(validateDocument(protobuf,protobufWithCaller).diagnostics.some(item=>item.code==='CALLER_CHECK')).toBe(true);
 expect(protobufCallerRan).toBe(true);
});
