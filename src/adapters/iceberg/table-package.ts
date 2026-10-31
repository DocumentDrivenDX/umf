// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ExtensionPackage} from '../../model/types';
import manifest from '../../../spec/extensions/iceberg-table/package.json';
export const ICEBERG_TABLE_EXTENSION = 'umf.iceberg.table';
export const icebergTablePackage = manifest as unknown as ExtensionPackage;
