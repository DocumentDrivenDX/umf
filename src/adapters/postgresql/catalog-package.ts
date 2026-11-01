// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/postgresql-catalog/package.json';
import type {ExtensionPackage} from '../../model/types';

export const POSTGRESQL_CATALOG_EXTENSION = 'umf.postgresql.catalog';
export const postgresqlCatalogPackage = manifest as unknown as ExtensionPackage;
export interface PostgresqlCatalogObjectIdentity {catalog:string;type:string;identity:string;}
