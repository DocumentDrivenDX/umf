// SPDX-License-Identifier: MIT OR Apache-2.0
// Policy interpretation and source codecs are owned by the Rust V4 roots.
import type {Json,Validation} from '../../model/types';

export interface SecurityInspection extends Validation {source:Json;resolution?:Json}
