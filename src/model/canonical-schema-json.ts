// SPDX-License-Identifier: MIT OR Apache-2.0

/** Serialize schema data using the exact JSON spelling used for package identity. */
export function canonicalSchemaJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalSchemaJson).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const members = Object.keys(object).sort().map(key =>
      JSON.stringify(key) + ':' + canonicalSchemaJson(object[key]));
    return '{' + members.join(',') + '}';
  }
  return JSON.stringify(value);
}
