// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ExtensionPackage} from '../model/types';
import manifest from '../../spec/extensions/parquet-keys/package.json';
export const PARQUET_KEYS_EXTENSION='umf.parquet.keys';
export const parquetKeysPackage=manifest as unknown as ExtensionPackage;
export {default as parquetKeyClassificationSchema} from '../../spec/core/parquet-key-classification.schema.json';
