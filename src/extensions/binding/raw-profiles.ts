// SPDX-License-Identifier: MIT OR Apache-2.0
import {inspectCoreRecordMembers} from '../../model/record-members';
import {createRawTableBindingInspector} from './raw-profiles-inspector';

export {RAW_TABLE_BINDING_SUBSET,rawTableBindingProfiles,type RawTableBindingTarget,type CoreRecordMembersInspector,createRawTableBindingInspector} from './raw-profiles-inspector';

/** The reference route retains its TypeScript-owned implementation. V4 roots inject Rust explicitly. */
export const inspectRawTableBinding=createRawTableBindingInspector(inspectCoreRecordMembers);
