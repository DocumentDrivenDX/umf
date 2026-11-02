// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../spec/extensions/postgresql-facets/package.json';
import type {ExtensionPackage} from '../model/types';

export const POSTGRESQL_FACETS_EXTENSION = 'umf.postgresql.facets';
export const postgresqlFacetsPackage = manifest as unknown as ExtensionPackage;
