// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../spec/extensions/avro-keys/package.json';
import type {ExtensionPackage} from '../model/types';

export const AVRO_KEYS_EXTENSION='umf.avro.keys';
export const avroKeysPackage=manifest as unknown as ExtensionPackage;
