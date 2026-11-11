// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../spec/extensions/tablespec-facets/package.json';
import type {ExtensionPackage} from '../model/types';

export const TABLESPEC_FACETS_EXTENSION='umf.tablespec.facets';
export const tableSpecFacetsPackage=manifest as unknown as ExtensionPackage;
