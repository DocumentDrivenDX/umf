// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/parquet/package.json';
import type {ExtensionPackage} from '../../model/types';

/** Static package metadata for Parquet, safe to import from the default facade. */
export const PARQUET_EXTENSION='umf.parquet';
export const PARQUET_MAX_BYTES=1_000_000;
export const parquetPackage=manifest as unknown as ExtensionPackage;
