// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ExtensionPackage} from '../model/types';
import manifest from '../../spec/extensions/parquet-cardinality/package.json';
export const PARQUET_CARDINALITY_EXTENSION='umf.parquet.cardinality';
export const parquetCardinalityPackage=manifest as unknown as ExtensionPackage;
export {default as parquetCardinalityClassificationSchema} from '../../spec/core/parquet-cardinality-classification.schema.json';
