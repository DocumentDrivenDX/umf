// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {ExtensionPackage,Json} from '../../model/types';
import type {Registry as BaseRegistry,SemanticValidator} from '../../registry/registry';
import {composeOwnedSemanticValidator} from '../../registry/semantic-owner';
import {protobufPackage} from './index';
import type {Document} from '../../model/types';
import type {
  exportProtobufBundle as exportProtobufBundleType,
  exportProtobufDescriptorSet as exportProtobufDescriptorSetType,
  getProtobufDescriptorSet as getProtobufDescriptorSetType,
  importProtobufDescriptorSet as importProtobufDescriptorSetType,
  inspectProtobuf as inspectProtobufType,
  proposeProtobufDescriptorEdit as proposeProtobufDescriptorEditType,
} from './index';
import type {DescriptorNode,writeDescriptorSet as writeDescriptorSetType} from './descriptor';

type PublicUmfErrorConstructor=typeof UmfError;
export interface ProtobufDescriptorDocumentRustEngine {
  readDescriptorSet(binary:Uint8Array):DescriptorNode;
  writeDescriptorSet(descriptorSet:DescriptorNode):Uint8Array;
  importProtobufDescriptorSet(binary:Uint8Array,options:{id:string}):Document;
  getProtobufDescriptorSet(document:Document):ReturnType<typeof getProtobufDescriptorSetType>;
  proposeProtobufDescriptorEdit(document:Document,descriptorSet:DescriptorNode):ReturnType<typeof proposeProtobufDescriptorEditType>;
  exportProtobufDescriptorSet(document:Document):ReturnType<typeof exportProtobufDescriptorSetType>;
  inspectProtobuf(document:Document):ReturnType<typeof inspectProtobufType>;
  inspectProtobufPayload(payload:unknown):ReturnType<typeof inspectProtobufType>;
  exportProtobufBundle(document:Document):ReturnType<typeof exportProtobufBundleType>;
}
export type ProtobufDescriptorDocumentRustEngineFactory=(options:{ErrorType:PublicUmfErrorConstructor})=>ProtobufDescriptorDocumentRustEngine;

/** Construct the eight-operation Rust facade with the package's public error constructor. */
export function createProtobufDescriptorDocumentRustDefault(
  createEngine:ProtobufDescriptorDocumentRustEngineFactory,
){
  const engine=createEngine({ErrorType:UmfError});
  return Object.freeze({
    readDescriptorSet(binary:Uint8Array):DescriptorNode{return engine.readDescriptorSet(binary);},
    writeDescriptorSet(descriptorSet:DescriptorNode):ReturnType<typeof writeDescriptorSetType>{return engine.writeDescriptorSet(descriptorSet);},
    importProtobufDescriptorSet(binary:Uint8Array,options:{id:string}):ReturnType<typeof importProtobufDescriptorSetType>{return engine.importProtobufDescriptorSet(binary,options);},
    getProtobufDescriptorSet(document:Document):ReturnType<typeof getProtobufDescriptorSetType>{return engine.getProtobufDescriptorSet(document);},
    proposeProtobufDescriptorEdit(document:Document,edit:(node:DescriptorNode)=>void):ReturnType<typeof proposeProtobufDescriptorEditType>{
      const descriptorSet=engine.getProtobufDescriptorSet(document);
      edit(descriptorSet);
      return engine.proposeProtobufDescriptorEdit(document,descriptorSet);
    },
    exportProtobufDescriptorSet(document:Document):ReturnType<typeof exportProtobufDescriptorSetType>{return engine.exportProtobufDescriptorSet(document);},
    inspectProtobuf(document:Document):ReturnType<typeof inspectProtobufType>{return engine.inspectProtobuf(document);},
    inspectProtobufPayload(payload:Json):ReturnType<typeof inspectProtobufType>{return engine.inspectProtobufPayload(payload);},
    exportProtobufBundle(document:Document):ReturnType<typeof exportProtobufBundleType>{return engine.exportProtobufBundle(document);},
  });
}

/** Construct the public Protobuf registry with Rust-owned payload semantics. */
export function createProtobufRegistryRustDefault(
 engine:Pick<ReturnType<typeof createProtobufDescriptorDocumentRustDefault>,'inspectProtobufPayload'>,
 createRegistry:()=>BaseRegistry,
){
 const semantic:SemanticValidator=(payload)=>engine.inspectProtobufPayload(payload as Json).diagnostics;
 const owner=composeOwnedSemanticValidator({id:protobufPackage.id,version:protobufPackage.version},semantic);
 return Object.freeze({protobufRegistry:()=>createRegistry().register(protobufPackage as ExtensionPackage,owner)});
}
