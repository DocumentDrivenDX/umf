// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/tables/package.json';
import {copyJson} from '../../model/json';
import type {ExtensionPackage} from '../../model/types';

/** Inert package metadata for Rust-owned table lifecycle registry admission. */
export const tableLifecyclePackage = copyJson(manifest) as unknown as ExtensionPackage;
