// SPDX-License-Identifier: MIT OR Apache-2.0
export interface BoundaryCase {
  id: string;
  position: 'root' | 'resource';
  input: (events: string[], sentinel: unknown) => unknown;
  options: (events: string[], sentinel: unknown) => unknown;
  throwsPrimitive: boolean;
  makeInput: (events: string[], sentinel: unknown) => unknown;
}

export function boundaryCases(): BoundaryCase[];
export function prepareBoundaryCase(
  fixture: BoundaryCase,
  events: string[],
  sentinels: {object: unknown; primitive: unknown},
): {source: any; options: any};
