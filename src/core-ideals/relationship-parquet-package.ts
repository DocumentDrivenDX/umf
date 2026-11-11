// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../spec/extensions/parquet-relationships/package.json';
import type {ExtensionPackage} from '../model/types';

export const PARQUET_RELATIONSHIPS_EXTENSION='umf.parquet.relationships';
export const parquetRelationshipsPackage=manifest as unknown as ExtensionPackage;
