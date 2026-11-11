// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../spec/extensions/avro-nullability/package.json';
import type {ExtensionPackage} from '../model/types';

export const AVRO_NULLABILITY_EXTENSION='umf.avro.nullability';
export const avroNullabilityPackage=manifest as unknown as ExtensionPackage;
