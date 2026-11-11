// SPDX-License-Identifier: MIT OR Apache-2.0
import * as wasm from '../../../../../bindings/core/wasm/pkg/umf_core_wasm.js';
import {
 createCodegenEngine,createCoreKeyTupleEngine,createJsonNumberEngine,
 createNativeFamilyDispatcher,createPreparedJsonSchemaEngine,
 createProtobufSourceExportEngine,createProtobufSourceImportEngine,createSecurityLogicEngine,
 initializeCoreModelRootKindNullabilityWasm,initializeProtobufDescriptorDocumentWasm,
 isNativeUmfCoreError,UmfError as BindingUmfError,
} from '../../../../../bindings/core/wasm/index.js';
import {CORE_MODEL_RESOURCES} from '../../../../../src/access/core-model-resources';
import {CODEGEN_RESOURCES} from '../../../../../src/access/codegen-resources';
import {bindCoreSchemaPropertiesRust} from '../../../../../src/access/rust-schema-properties-default';
import {createJsonSchemaRustDefault} from '../../../../../src/adapters/json-schema/rust-default';
import {createProtobufDescriptorDocumentRustDefault,createProtobufRegistryRustDefault,type ProtobufDescriptorDocumentRustEngine} from '../../../../../src/adapters/protobuf/rust-default';
import {createProtobufSourceRustDefault} from '../../../../../src/adapters/protobuf/source-rust-default';
import {createActionRegistryRustDefault} from '../../../../../src/extensions/actions/rust-registry';
import {createDashboardRustDefault} from '../../../../../src/extensions/dashboard/rust-default';
import {createEditExtensionRustDefault} from '../../../../../src/model/edit-extension-rust-default';
import {UmfError} from '../../../../../src/model/errors';
import {createNativeUtilityDefaults} from '../../../../../src/model/native-utility-default';
import {createCoreModelPublicRustDefault} from '../../../../../src/model/rust-public-default';
import {createDddJsonSchemaRustDefault} from '../../../../../src/projections/ddd-json-schema-rust-default';
import {createJsonSchemaProtobufRustDefault} from '../../../../../src/projections/json-schema-protobuf-rust-default';
import {createRegistryRustDefault} from '../../../../../src/registry/rust-default';

export async function createWorkbenchSdk(){
 const model=await initializeCoreModelRootKindNullabilityWasm(CORE_MODEL_RESOURCES,async()=>wasm,globalThis);
 const nativeFamily=createNativeFamilyDispatcher(wasm);
 const isBindingError=(error:unknown)=>isNativeUmfCoreError(error)||error instanceof BindingUmfError;
 const {registerActions}=createActionRegistryRustDefault(()=>createCodegenEngine(wasm,CODEGEN_RESOURCES),isNativeUmfCoreError);
 const {Registry,validateDocument,readDocument,writeDocument,createUmfRegistry:baseRegistry}=
  createRegistryRustDefault(model,isNativeUmfCoreError,registerActions);
 const createRegistry=()=>new Registry();
 const ddd=createDddJsonSchemaRustDefault(nativeFamily,isNativeUmfCoreError);
 const {editExtension}=createEditExtensionRustDefault(model,isNativeUmfCoreError);
 const {registerDashboard}=createDashboardRustDefault(nativeFamily,isNativeUmfCoreError,createRegistry,editExtension);
 const dddRegistry=()=>ddd.dddRegistry(createRegistry);
 const createUmfRegistry=()=>registerDashboard(ddd.registerDdd(baseRegistry()));
 const {selectCoreElements}=createCoreModelPublicRustDefault(
  model,createCoreKeyTupleEngine(wasm,CORE_MODEL_RESOURCES),isBindingError,createRegistry,
 );
 const {importJsonSchema,parseNativeJson,jsonSchemaRegistry}=
  createJsonSchemaRustDefault(createPreparedJsonSchemaEngine(wasm),isBindingError,createRegistry);
 const descriptorEngine=await initializeProtobufDescriptorDocumentWasm(async()=>wasm,globalThis,{ErrorType:UmfError} as never) as unknown as ProtobufDescriptorDocumentRustEngine;
 const protobuf=createProtobufDescriptorDocumentRustDefault(options=>{
  if(options.ErrorType!==UmfError)throw TypeError('Public Protobuf error constructor mismatch');
  return descriptorEngine;
 });
 const {protobufRegistry}=createProtobufRegistryRustDefault(protobuf,createRegistry);
 const {importProtobufSources}=createProtobufSourceRustDefault(
  createProtobufSourceImportEngine(wasm),createProtobufSourceExportEngine(wasm),isNativeUmfCoreError,
 );
 const {projectJsonSchemaToProtobuf}=createJsonSchemaProtobufRustDefault(
  nativeFamily,importProtobufSources,protobuf.inspectProtobuf,isNativeUmfCoreError,
 );
 const jsonNumber=createJsonNumberEngine(wasm);
 const {readJsonValue,writeJsonValue}=createNativeUtilityDefaults(Object.assign(
  {},model,createSecurityLogicEngine(wasm),
  {assertExactJsonNumber:jsonNumber.assertExactJsonNumber},
 ),isBindingError,createRegistry);
 const {inspectCoreSchemaProperties,resolveCoreDefault}=bindCoreSchemaPropertiesRust(model);
 return {
  Registry,createUmfRegistry,dddRegistry,importJsonSchema,importProtobufSources,inspectCoreSchemaProperties,
  jsonSchemaRegistry,parseNativeJson,projectJsonSchemaToProtobuf,protobufRegistry,readDocument,
  readJsonValue,resolveCoreDefault,selectCoreElements,validateDocument,writeDocument,writeJsonValue,
 };
}
