// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/tablespec/package.json';
import type {ExtensionPackage} from '../../model/types';

export const TABLESPEC_EXTENSION='umf.tablespec';
export const tablespecPackage=manifest as unknown as ExtensionPackage;
