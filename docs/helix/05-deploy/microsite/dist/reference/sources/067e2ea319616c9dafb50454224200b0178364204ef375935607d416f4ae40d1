// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/security/package.json';
import v2Manifest from '../../../spec/extensions/security-v0.2/package.json';
import {copyJson} from '../../model/json';
import type {ExtensionPackage} from '../../model/types';

export const SECURITY_EXTENSION='umf.security';

/** Inert package metadata for Rust-owned Security registry admission. */
export const securityPackage = copyJson(manifest) as unknown as ExtensionPackage;

export const securityV2Package=copyJson(v2Manifest) as unknown as ExtensionPackage;
