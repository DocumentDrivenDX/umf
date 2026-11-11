// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/parquet/package.json';
import type {ExtensionPackage} from '../../model/types';

/** Static package metadata for Parquet, safe to import from the default facade. */
export const PARQUET_EXTENSION='umf.parquet';
export const PARQUET_MAX_BYTES=1_000_000;
export const parquetPackage=manifest as unknown as ExtensionPackage;
export const PARQUET_PAGE_LIMITS={headerBytes:65536,pages:10000,pageBytes:8*1024*1024,totalBytes:64*1024*1024,pageValues:100000,totalValues:1000000,rows:10000} as const;
export const PARQUET_ROW_NODE_LIMIT=100000;
