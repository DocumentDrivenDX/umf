// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ExtensionPackage} from '../../model/types';
import manifest from '../../../spec/extensions/owl/package.json';
export const OWL_EXTENSION='umf.owl';
export const owlPackage=manifest as unknown as ExtensionPackage;
