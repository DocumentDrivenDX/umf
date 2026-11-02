// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {inspectSecurityPolicyV2Source,upgradeSecurityPolicySource,downgradeSecurityPolicySource,readSecuritySource,writeSecuritySource} from '../../src/index-node-v4';

const policy = () => ({vocabulary: 'umf.security', version: '0.1.0', id: 'policy', revision: 'r1', ontology: {documentId: 'domain', revision: 'o1'}, rules: []});

test('Node V4 Security source root upgrades, inspects, and round-trips JSON/YAML through Rust', () => {
  const source = policy();
  const upgraded = upgradeSecurityPolicySource(source, 'r2') as {status: string; target?: unknown; complete: boolean; authority: boolean};
  expect(upgraded.status).toBe('migrated');
  expect(upgraded.target).toEqual({...source, version: '0.2.0', revision: 'r2'});
  expect(upgraded.complete).toBe(false);
  expect(upgraded.authority).toBe(false);
  expect((inspectSecurityPolicyV2Source(upgraded.target) as {valid: boolean; complete: boolean}).valid).toBe(true);
  for (const format of ['json', 'yaml'] as const) {
    expect(readSecuritySource(writeSecuritySource(source, format), format)).toEqual(source);
  }
  const restored = downgradeSecurityPolicySource(upgraded.target, 'r3') as {status: string; target?: unknown};
  expect(restored.status).toBe('migrated');
  expect(restored.target).toEqual({...source, revision: 'r3'});
  expect((upgradeSecurityPolicySource(source, 'r1') as {status: string}).status).toBe('refused');
  expect((inspectSecurityPolicyV2Source({...source, version: '0.1.0'}) as {valid: boolean}).valid).toBe(false);
},60_000);
