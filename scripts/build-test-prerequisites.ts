// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host-only browser bundles consumed by adapter regression/evidence tests. */
import {buildStandaloneBindingBrowserRuntime} from './binding/browser-runtime';
const bundles: Record<string, string> = {
 'avro-facet-selection': 'src/core-ideals/avro-facet-selection.ts',
 'avro-facet-type': 'src/adapters/avro/facet-type.ts',
 'facet-node-tree': 'scripts/core-ideals/postgresql-facet-node-tree.ts',
 'facet-resolved-predicate': 'scripts/core-ideals/postgresql-facet-resolved-predicate.ts',
 'parquet-facet-type': 'src/adapters/parquet/facet-type.ts',
 'postgresql-facet-catalog': 'scripts/core-ideals/postgresql-facet-catalog.ts',
 'postgresql-facet-predicate': 'scripts/core-ideals/postgresql-facet-predicate.ts',
 'postgresql-facet-type': 'scripts/core-ideals/postgresql-facet-typmod.ts',
 'sqlserver-facet-predicate': 'src/adapters/sqlserver/facet-predicate.ts',
 'sqlserver-facet-type': 'src/adapters/sqlserver/facet-type.ts',
};
export async function buildAdapterBrowserFixtures() {
 for (const [name, entrypoint] of Object.entries(bundles)) {
  const result = await buildStandaloneBindingBrowserRuntime({entrypoints: [entrypoint], target: 'browser', format: 'esm'});
  if (!result.success || result.outputs.length !== 1) throw new Error(`Cannot build ${name}: ${result.logs.join('\n')}`);
  await Bun.write(`dist/${name}.js`, result.outputs[0]!);
 }
 console.log(`Built ${Object.keys(bundles).length} adapter test prerequisites.`);
}
if (import.meta.main) {
 await import('./prepare-kind-tests');
 await buildAdapterBrowserFixtures();
}
