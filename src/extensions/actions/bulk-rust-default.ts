// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {ActionPlanArtifact} from './plan-types';
import type {BulkOutcomeValidation} from './bulk';
type Engine = {validateBulkOutcome(artifact: ActionPlanArtifact): unknown};
/** Public bulk-result shape validation delegates schema, framing, and invariants to Rust. */
export function createBulkOutcomeRustDefault(createEngine: () => Engine, isNativeError: (error: unknown) => boolean) {
  let engine: Engine | undefined;
  return function validateBulkOutcome(artifact: ActionPlanArtifact): BulkOutcomeValidation {
    try { return (engine ??= createEngine()).validateBulkOutcome(artifact) as BulkOutcomeValidation; }
    catch (error) {
      if (!isNativeError(error)) throw error;
      const native = error as {code?: unknown; message?: unknown; path?: unknown};
      if (typeof native.code !== 'string' || !native.code.startsWith('PAP_') && native.code !== 'LIMIT') throw error;
      throw new UmfError(native.code, String(native.message ?? ''), typeof native.path === 'string' ? native.path : '');
    }
  };
}
