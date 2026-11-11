// SPDX-License-Identifier: MIT OR Apache-2.0
// Disclosure transport validation and codecs are owned by the Rust V4 roots.
import type {SecurityOutput} from './evaluate';
import type {SecurityRef} from './types';

export interface SecurityDisclosureBatch {
 version:'umf.security.disclosure/0.1.0';
 target:SecurityRef;fields:SecurityRef[];rows:SecurityOutput[][];
}
