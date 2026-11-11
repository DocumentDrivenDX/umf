// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {ExtensionPackage,Json} from '../../model/types';
import type {Registry as BaseRegistry,SemanticValidator} from '../../registry/registry';
import {composeOwnedSemanticValidator} from '../../registry/semantic-owner';
import {protobufPackage} from './package';
import type {Document} from '../../model/types';
import type {Diagnostic,Validation} from '../../model/types';
import type {DescriptorNode} from './descriptor-types';

type PublicUmfErrorConstructor=typeof UmfError;
export interface ProtobufDescriptorDocumentRustEngine {
  readDescriptorSet(binary:Uint8Array):DescriptorNode;
  writeDescriptorSet(descriptorSet:DescriptorNode):Uint8Array;
  importProtobufDescriptorSet(binary:Uint8Array,options:{id:string}):Document;
  getProtobufDescriptorSet(document:Document):DescriptorNode;
  proposeProtobufDescriptorEdit(document:Document,descriptorSet:DescriptorNode):{document:Document;diagnostics:Diagnostic[]};
  exportProtobufDescriptorSet(document:Document):Uint8Array;
  inspectProtobuf(document:Document):Validation;
  inspectProtobufPayload(payload:unknown):Validation;
  exportProtobufBundle(document:Document):{descriptorSet:Uint8Array;source:Document;diagnostics:Diagnostic[]};
}
export type ProtobufDescriptorDocumentRustEngineFactory=(options:{ErrorType:PublicUmfErrorConstructor})=>ProtobufDescriptorDocumentRustEngine;

/** Construct the eight-operation Rust facade with the package's public error constructor. */
export function createProtobufDescriptorDocumentRustDefault(
  createEngine:ProtobufDescriptorDocumentRustEngineFactory,
){
  const engine=createEngine({ErrorType:UmfError});
  return Object.freeze({
    readDescriptorSet(binary:Uint8Array):DescriptorNode{return engine.readDescriptorSet(binary);},
    writeDescriptorSet(descriptorSet:DescriptorNode):Uint8Array{return engine.writeDescriptorSet(descriptorSet);},
    importProtobufDescriptorSet(binary:Uint8Array,options:{id:string}):Document{return engine.importProtobufDescriptorSet(binary,options);},
    getProtobufDescriptorSet(document:Document):DescriptorNode{return engine.getProtobufDescriptorSet(document);},
    proposeProtobufDescriptorEdit(document:Document,edit:(node:DescriptorNode)=>void):{document:Document;diagnostics:Diagnostic[]}{
      const descriptorSet=engine.getProtobufDescriptorSet(document);
      edit(descriptorSet);
      return engine.proposeProtobufDescriptorEdit(document,descriptorSet);
    },
    exportProtobufDescriptorSet(document:Document):Uint8Array{return engine.exportProtobufDescriptorSet(document);},
    inspectProtobuf(document:Document):Validation{return engine.inspectProtobuf(document);},
    inspectProtobufPayload(payload:Json):Validation{return engine.inspectProtobufPayload(payload);},
    exportProtobufBundle(document:Document):{descriptorSet:Uint8Array;source:Document;diagnostics:Diagnostic[]}{return engine.exportProtobufBundle(document);},
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
