// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {projectFacetsToSqlServer, recoverFacetsFromSqlServer} from '../../src/index-node-v4';
import {facetsSqlServerProjectionCases} from '../../scripts/core-ideals/facets-sqlserver-projection-cases';

test('Rust SQL Server Facets projection retains source, verifies native text, and refuses strict loss', () => {
  const normal = facetsSqlServerProjectionCases().find(
    item => item.name === 'smallint-8-true' && item.request.encoding === 'checked' && item.request.mode === 'report',
  )!;
  const projected = projectFacetsToSqlServer(normal.author, normal.request);
  expect(projected.status).toBe('projected');
  expect(projected.nativeSql).toContain('CHECK ([value] >= -128 AND [value] <= 127)');
  expect(recoverFacetsFromSqlServer(projected, projected.nativeSql!)).toEqual(normal.author.target);
  expect(() => recoverFacetsFromSqlServer(projected, projected.nativeSql + ' ')).toThrow();

  const refused = projectFacetsToSqlServer(normal.author, {
    ...normal.request,
    mode: 'strict',
    obligation: 'exact-input',
  });
  expect(refused.status).toBe('blocked');
  expect(refused.target).toBeUndefined();
  expect(refused.residuals.length).toBeGreaterThan(0);
});
