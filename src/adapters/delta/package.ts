// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/delta/package.json';
import tableManifest from '../../../spec/extensions/delta-table/package.json';
import logManifest from '../../../spec/extensions/delta-log/package.json';
import definitionManifest from '../../../spec/extensions/delta-definition/package.json';
import type {ExtensionPackage} from '../../model/types';
export const DELTA_EXTENSION='umf.delta';
export const DELTA_TABLE_EXTENSION='umf.delta.table';
export const DELTA_LOG_EXTENSION='umf.delta.log';
export const DELTA_DEFINITION_EXTENSION='umf.delta.definition';
export const deltaPackage=manifest as unknown as ExtensionPackage;
export const deltaTablePackage=tableManifest as unknown as ExtensionPackage;
export const deltaLogPackage=logManifest as unknown as ExtensionPackage;
export const deltaDefinitionPackage=definitionManifest as unknown as ExtensionPackage;
