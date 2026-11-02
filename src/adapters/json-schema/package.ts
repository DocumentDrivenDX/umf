// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/json-schema/package.json';
import type {ExtensionPackage} from '../../model/types';
export const JSON_SCHEMA_DIALECT='https://json-schema.org/draft/2020-12/schema';
export const JSON_SCHEMA_EXTENSION='umf.json-schema';
export const jsonSchemaPackage=manifest as unknown as ExtensionPackage;
