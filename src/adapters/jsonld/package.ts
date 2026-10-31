// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/jsonld/package.json';
import type {ExtensionPackage} from '../../model/types';

export const JSONLD_EXTENSION = 'umf.jsonld';
export const jsonldPackage = manifest as unknown as ExtensionPackage;
