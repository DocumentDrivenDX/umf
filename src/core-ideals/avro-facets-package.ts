// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ExtensionPackage} from '../model/types';
import manifest from '../../spec/extensions/avro-facets/package.json';

export const AVRO_FACETS_EXTENSION = 'umf.avro.facets';
export const avroFacetsPackage = manifest as unknown as ExtensionPackage;
