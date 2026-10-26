// SPDX-License-Identifier: MIT OR Apache-2.0
export type NonStringFixture = {
  id: string;
  position: 'root' | 'resource';
  makeInput(events: string[], sentinel: Error): unknown;
};
export function nonStringCases(): NonStringFixture[];
export function optionsFor(fixture: NonStringFixture, input: unknown, events: string[]): {
  source: unknown;
  options: unknown;
};
