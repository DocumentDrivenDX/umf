// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from '../model/json';

/** Serialize only the already admitted copy, without consulting toJSON methods. */
function wireJson(value: any): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let index = 0; index < value.length; index++) items.push(wireJson(value[index]));
    return `[${items.join(',')}]`;
  }
  const fields: string[] = [];
  for (const key of Object.keys(value)) fields.push(`${JSON.stringify(key)}:${wireJson(value[key])}`);
  return `{${fields.join(',')}}`;
}

/** Bind the synchronous public inspector to a host-specific Rust JSON-wire operation. */
export function createDomainPackLoaderInspectionOperation(inspectWire: (wire: string) => string) {
  if (typeof inspectWire !== 'function') throw new TypeError('A Rust domain-pack loader inspector is required');
  return function inspectDomainPackLoader(input: unknown) {
    let wire: string;
    try {
      wire = wireJson(copyJson(input));
    } catch {
      return {valid: false, complete: false, diagnostics: ['Non-JSON loader companion']};
    }
    const result = inspectWire(wire);
    if (typeof result !== 'string') throw new TypeError('Rust domain-pack loader inspector returned a non-string result');
    return JSON.parse(result) as {valid: boolean; complete: boolean; diagnostics: string[]};
  };
}
