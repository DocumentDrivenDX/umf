// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ExtensionPackage} from '../model/types';
import manifest from '../../spec/extensions/postgresql-keys/package.json';
export const POSTGRESQL_KEYS_EXTENSION='umf.postgresql.keys';
export const postgresqlKeysPackage=manifest as unknown as ExtensionPackage;
