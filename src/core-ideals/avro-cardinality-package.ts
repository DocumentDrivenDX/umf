// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../spec/extensions/avro-cardinality/package.json';
import type {ExtensionPackage} from '../model/types';
export const AVRO_CARDINALITY_EXTENSION='umf.avro.cardinality';
export const avroCardinalityPackage=manifest as unknown as ExtensionPackage;
export {default as avroCardinalityClassificationSchema} from '../../spec/core/avro-cardinality-classification.schema.json';
