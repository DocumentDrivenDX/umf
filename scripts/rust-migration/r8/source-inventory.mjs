// SPDX-License-Identifier: MIT OR Apache-2.0
// Exact source-path inventory comparison for private SDK snapshot transforms.
export function assertSameSourceInventory(before, after, label = 'source inventory') {
  const expected = new Set(before);
  const actual = new Set(after);
  const added = [...actual].filter(name => !expected.has(name)).sort();
  const removed = [...expected].filter(name => !actual.has(name)).sort();
  if (added.length || removed.length) {
    const details = [
      ...(added.length ? [`added: ${added.join(', ')}`] : []),
      ...(removed.length ? [`removed: ${removed.join(', ')}`] : []),
    ].join('; ');
    throw new Error(`${label} changed (${details})`);
  }
}
