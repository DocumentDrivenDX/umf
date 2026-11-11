// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../../spec/extensions/security-protection/package.json';
import {copyJson} from '../../../model/json';
import type {ExtensionPackage} from '../../../model/types';

// The package snapshot is independent of the private schema used for validation.
export const protectionPackage=copyJson(manifest) as unknown as ExtensionPackage;
