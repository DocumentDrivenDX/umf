// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {Document} from '../../model/types';
import type {
  exportProtobufBundle as exportProtobufBundleType,
  exportProtobufDescriptorSet as exportProtobufDescriptorSetType,
  getProtobufDescriptorSet as getProtobufDescriptorSetType,
  importProtobufDescriptorSet as importProtobufDescriptorSetType,
  inspectProtobuf as inspectProtobufType,
} from './index';
import type {DescriptorNode,writeDescriptorSet as writeDescriptorSetType} from './descriptor';

type PublicUmfErrorConstructor=typeof UmfError;
export interface ProtobufDescriptorDocumentRustEngine {
  readDescriptorSet(binary:Uint8Array):DescriptorNode;
  writeDescriptorSet(descriptorSet:DescriptorNode):Uint8Array;
  importProtobufDescriptorSet(binary:Uint8Array,options:{id:string}):Document;
  getProtobufDescriptorSet(document:Document):ReturnType<typeof getProtobufDescriptorSetType>;
  exportProtobufDescriptorSet(document:Document):ReturnType<typeof exportProtobufDescriptorSetType>;
  inspectProtobuf(document:Document):ReturnType<typeof inspectProtobufType>;
  exportProtobufBundle(document:Document):ReturnType<typeof exportProtobufBundleType>;
}
export type ProtobufDescriptorDocumentRustEngineFactory=(options:{ErrorType:PublicUmfErrorConstructor})=>ProtobufDescriptorDocumentRustEngine;

/** Construct the seven-operation Rust facade with the package's public error constructor. */
export function createProtobufDescriptorDocumentRustDefault(
  createEngine:ProtobufDescriptorDocumentRustEngineFactory,
){
  const engine=createEngine({ErrorType:UmfError});
  return Object.freeze({
    readDescriptorSet(binary:Uint8Array):DescriptorNode{return engine.readDescriptorSet(binary);},
    writeDescriptorSet(descriptorSet:DescriptorNode):ReturnType<typeof writeDescriptorSetType>{return engine.writeDescriptorSet(descriptorSet);},
    importProtobufDescriptorSet(binary:Uint8Array,options:{id:string}):ReturnType<typeof importProtobufDescriptorSetType>{return engine.importProtobufDescriptorSet(binary,options);},
    getProtobufDescriptorSet(document:Document):ReturnType<typeof getProtobufDescriptorSetType>{return engine.getProtobufDescriptorSet(document);},
    exportProtobufDescriptorSet(document:Document):ReturnType<typeof exportProtobufDescriptorSetType>{return engine.exportProtobufDescriptorSet(document);},
    inspectProtobuf(document:Document):ReturnType<typeof inspectProtobufType>{return engine.inspectProtobuf(document);},
    exportProtobufBundle(document:Document):ReturnType<typeof exportProtobufBundleType>{return engine.exportProtobufBundle(document);},
  });
}
