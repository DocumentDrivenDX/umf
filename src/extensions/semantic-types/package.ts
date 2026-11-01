// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/semantic-types/package.json';
import {copyJson} from '../../model/json';
import type {ExtensionPackage} from '../../model/types';

/** Inert package metadata for Rust-owned semantic type registry admission. */
export const semanticTypesPackage = copyJson(manifest) as unknown as ExtensionPackage;
