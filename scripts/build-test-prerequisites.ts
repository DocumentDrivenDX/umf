// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host-only browser bundles consumed by adapter regression/evidence tests. */
import './prepare-kind-tests';
const bundles: Record<string, string> = {
 'avro-facet-selection': 'src/core-ideals/avro-facet-selection.ts',
 'avro-facet-type': 'src/adapters/avro/facet-type.ts',
 'facet-node-tree': 'src/adapters/postgresql/facet-node-tree.ts',
 'facet-resolved-predicate': 'src/adapters/postgresql/facet-resolved-predicate.ts',
 'parquet-facet-carrier': 'src/core-ideals/parquet-facet-carrier.ts',
 'parquet-facet-type': 'src/adapters/parquet/facet-type.ts',
 'postgresql-facet-catalog': 'src/adapters/postgresql/facet-catalog.ts',
 'postgresql-facet-predicate': 'src/adapters/postgresql/facet-predicate.ts',
 'postgresql-facet-type': 'src/adapters/postgresql/facet-typmod.ts',
 'sqlserver-facet-constraints': 'src/adapters/sqlserver/facet-constraints.ts',
 'sqlserver-facet-predicate': 'src/adapters/sqlserver/facet-predicate.ts',
 'sqlserver-facet-type': 'src/adapters/sqlserver/facet-type.ts',
};
for (const [name, entrypoint] of Object.entries(bundles)) {
 const result = await Bun.build({entrypoints: [entrypoint], target: 'browser', format: 'esm'});
 if (!result.success || result.outputs.length !== 1) throw new Error(`Cannot build ${name}: ${result.logs.join('\n')}`);
 await Bun.write(`dist/${name}.js`, result.outputs[0]!);
}
console.log(`Built ${Object.keys(bundles).length} adapter test prerequisites.`);
export {};
