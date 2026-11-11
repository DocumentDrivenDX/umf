// SPDX-License-Identifier: MIT OR Apache-2.0
import type {POSTGRESQL_EXTENSION,postgresqlPackage} from './package';
export {POSTGRESQL_EXTENSION,postgresqlPackage} from './package';
export interface PostgresqlBackend {identity:'@libpg-query/parser@17.6.10';parse(sql:string):Promise<unknown>;deparse(tree:unknown):Promise<string>;codecRoundTrip(tree:unknown):unknown;}
