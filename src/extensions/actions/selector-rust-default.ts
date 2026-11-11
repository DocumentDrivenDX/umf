// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import {copyJson} from '../../model/json';
import type {ActionInputs, CompiledActionSelector, PreparedActionIdentities, SelectedActionIdentity, CompiledActionRule, ActionRulePhase} from './runtime-types';
import type {Action, ActionFrame, ActionRule} from './types';
import type {Document} from '../../model/types';
type Engine = {
  compileActionRule(document: unknown, action: unknown, rule: unknown, phase: ActionRulePhase): unknown;
  admitActionDeclaration(document: unknown, action: unknown): unknown;
  admitActionInputs(document: unknown, action: unknown, inputs: unknown, outputs?: boolean): unknown;
  compileActionSelector(document: unknown, action: unknown, frame: unknown): unknown;
  selectActionIdentity(document: unknown, action: unknown, frame: unknown, inputs: unknown): unknown;
  actionFieldValueKey(reference: unknown): unknown;
};
function nativeError(error: unknown, isNativeError: (error: unknown) => boolean): never {
  if (!isNativeError(error)) throw error;
  const native = error as {code?: unknown; message?: unknown; path?: unknown};
  if (typeof native.code !== 'string' || !native.code.startsWith('ACTION_') && native.code !== 'LIMIT' && native.code !== 'CORE_SCHEMA_PROPERTIES') throw error;
  throw new UmfError(native.code, String(native.message ?? ''), typeof native.path === 'string' ? native.path : '');
}
/** Public selector and identity operations over Rust-owned admission and key semantics. */
export function createActionSelectorsRustDefault(createEngine: () => Engine, isNativeError: (error: unknown) => boolean) {
  let engine: Engine | undefined;
  const native = () => engine ??= createEngine();
  const compileActionRule = (document: Document, action: Action, rule: ActionRule, phase: ActionRulePhase): CompiledActionRule => {
    try { return native().compileActionRule(document, action, rule, phase) as CompiledActionRule; } catch (error) { return nativeError(error, isNativeError); }
  };
  const compileActionSelector = (document: Document, action: Action, frame: ActionFrame): CompiledActionSelector => {
    try { return native().compileActionSelector(document, action, frame) as CompiledActionSelector; } catch (error) { return nativeError(error, isNativeError); }
  };
  const admitActionInputs = (document: Document, action: Action, inputs: ActionInputs, outputs = false): ActionInputs => {
    try { return native().admitActionInputs(document, action, inputs, outputs) as ActionInputs; } catch (error) { return nativeError(error, isNativeError); }
  };
  const selectActionIdentity = (document: Document, action: Action, frame: ActionFrame, inputs: ActionInputs): SelectedActionIdentity => {
    try { return native().selectActionIdentity(document, action, frame, inputs) as SelectedActionIdentity; } catch (error) { return nativeError(error, isNativeError); }
  };
  const actionFieldValueKey = (reference: {module: string; element: string}): string => {
    try { return native().actionFieldValueKey(reference) as string; } catch (error) { return nativeError(error, isNativeError); }
  };
  const prepareActionIdentities = (documentInput: Document, actionInput: Action): PreparedActionIdentities => {
    let document: Document, action: Action;
    try {
      document = copyJson(documentInput) as unknown as Document;
      action = native().admitActionDeclaration(document, actionInput) as Action;
      for (const frame of [...action.reads, ...action.writes]) compileActionSelector(document, action, frame);
    } catch (error) { return nativeError(error, isNativeError); }
    const freeze = (value: unknown): void => {
      if (value !== null && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
    };
    freeze(document); freeze(action);
    return Object.freeze({
      profile: 'umf.actions.keys.prepared/1' as const,
      source: document,
      action,
      admitInputs: (inputs: ActionInputs, outputs = false) => admitActionInputs(document, action, inputs, outputs),
      select: (frameId: string, inputs: ActionInputs) => {
        const frame = [...action.reads, ...action.writes].find(candidate => candidate.id === frameId);
        if (!frame) throw new UmfError('ACTION_SELECTOR_FRAME', 'Selector must retain an exact declared frame');
        return selectActionIdentity(document, action, frame, inputs);
      },
    });
  };
  return Object.freeze({compileActionRule, compileActionSelector, admitActionInputs, selectActionIdentity, prepareActionIdentities, actionFieldValueKey});
}
