// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect} from 'bun:test';

export function expectAccessorRefusal(validate: () => {valid: boolean}): void {
  let result: {valid: boolean};
  try {
    result = validate();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    expect(error.name).toBe('AdmissionError');
    expect(error.message).toBe('Accessor properties are not invoked during admission');
    return;
  }
  expect(result.valid).toBe(false);
}
