// SPDX-License-Identifier: MIT OR Apache-2.0
// Private staged-import bridge for source-native non-string coercion effects.
export const JSON_SCHEMA_IMPORT_SOURCE_LIMIT = 4_000_000;
export const JSON_SCHEMA_IMPORT_HOST_COERCION_PROFILE = 'nonstring-string-source-oracle-v1';

/**
 * Observe the source's first length check and JSON.parse ToString operation
 * without parsing JSON in JavaScript. The original non-string value is kept
 * only by this synchronous host frame, never sent across the wire.
 */
export function stageJsonSchemaSource(text) {
  if (typeof text === 'string') return {text, original: undefined, nonString: false};
  const original = text;

  // Match parseNativeJson's first source operation, including native getter,
  // comparison coercion, and exception behavior.
  if (text.length > JSON_SCHEMA_IMPORT_SOURCE_LIMIT) {
    const error = new TypeError('Non-string source exceeds the staged host-coercion profile limit');
    error.code = 'JSON_SCHEMA_HOST_INPUT_PROFILE';
    throw error;
  }

  // Template substitution performs the same ECMAScript ToString operation as
  // JSON.parse, including string-hint ToPrimitive and Symbol rejection. JSON
  // parse exceptions are swallowed by the source adapter and normalized to its
  // generic syntax refusal; Rust performs that refusal using invalid JSON.
  let coerced;
  try { coerced = `${text}`; } catch { coerced = '{'; }

  // Avoid transporting a host-coerced string beyond the exact parser profile
  // supported by the source's own text bound.
  if (coerced.length > JSON_SCHEMA_IMPORT_SOURCE_LIMIT) {
    const error = new TypeError('Coerced source exceeds the staged host-coercion profile limit');
    error.code = 'JSON_SCHEMA_HOST_INPUT_PROFILE';
    throw error;
  }
  // A deliberately finite grammar boundary prevents Rust's JSON/YAML parser
  // from refusing JSON that native JSON.parse would accept on the source path.
  // '{}' is the only admitted successful JSON parse; '{' represents both a
  // caught native ToString exception and the pinned invalid-JSON control.
  if (coerced !== '{}' && coerced !== '{') {
    const error = new TypeError('Non-string source is outside the staged host-coercion source profile');
    error.code = 'JSON_SCHEMA_HOST_INPUT_PROFILE';
    throw error;
  }
  return {text: coerced, original, nonString: true};
}

/** After Rust parses successfully, reproduce the source YAML parser's first
 * observation on the original non-string value and its native refusal. */
export function finishJsonSchemaSourceObservation(staged) {
  if (!staged.nonString) return;
  void staged.original.length;
  throw new TypeError('source is not a string');
}
