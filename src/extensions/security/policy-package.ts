// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/security/package.json';
import {copyJson} from '../../model/json';
import type {ExtensionPackage} from '../../model/types';

/** Inert package metadata for Rust-owned Security registry admission. */
export const securityPackage = copyJson(manifest) as unknown as ExtensionPackage;
