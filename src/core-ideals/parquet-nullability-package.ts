// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ExtensionPackage} from '../model/types';
import manifest from '../../spec/extensions/parquet-nullability/package.json';
export const PARQUET_NULLABILITY_EXTENSION='umf.parquet.nullability';
export const parquetNullabilityPackage=manifest as unknown as ExtensionPackage;
export {default as parquetNullabilityClassificationSchema} from '../../spec/core/parquet-nullability-classification.schema.json';
