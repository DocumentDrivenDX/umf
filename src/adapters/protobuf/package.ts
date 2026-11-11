// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/protobuf/package.json';
import type {ExtensionPackage} from '../../model/types';

export const PROTOBUF_EXTENSION='umf.protobuf';
export const protobufPackage=manifest as unknown as ExtensionPackage;
