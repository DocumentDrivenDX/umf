---
ddx:
  id: umf.evidence.rust-migration.r8-v4-default-barrel-separation-plan
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-default-inspector-relationship-callsite-audit
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-inspectors-installed
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# R8 V4 default barrel separation plan

## Baseline and boundary

The current Node and browser V4 entries each use `export * from './index'`
(`src/index-node-v4.ts:58`, `src/index-browser-v4.ts:56`) and then explicitly
export 76 source-selected names. `src/index.ts` is both the TypeScript
`./reference` root and the broad aggregation of more than 500 source modules.
The route inventory records 1,120 runtime declarations for each of Node,
browser, and reference. Its scope cautions that root selection does not retire
inherited TypeScript algorithms. `package.json` also points both root and
`./reference` type conditions at the common `dist/src/index.d.ts`.

This proposal is restricted to removing the Inspector and Relationship
TypeScript bodies shadowed by V4's selected runtime exports, without changing
the reference route or the 1,120-name default runtime surface. It is a plan,
not evidence of a completed bundle change. The installed evidence at
[`r8-core-inspectors-installed/current-5e7138383-20261026`](../r8-core-inspectors-installed/current-5e7138383-20261026/README.md)
qualifies only that pinned archive and its cases.

## Exact barrel edges in scope

The `src/index.ts` routes that expose the target declarations are:

| `src/index.ts` edge | Target module and shadowed runtime body | Non-shadowed exports to preserve |
| --- | --- | --- |
| `:349-350` named exports | `src/model/relationships.ts`: `inspectCoreRelationships`, `lookupCoreRelationship`, `declareCoreRelationship`, `verifyCoreRelationshipOperation` | Export the seven operation/request/meaning types with `export type`; the four runtime names come from the V4 Rust-bound locals. |
| `:473-474` named and type exports | `src/extensions/binding/raw-profiles.ts`: TS-bound `inspectRawTableBinding` | Re-export `RAW_TABLE_BINDING_SUBSET`, `rawTableBindingProfiles`, `RawTableBindingTarget`, and `CoreRecordMembersInspector` from `raw-profiles-inspector`; V4's local `inspectRawTableBinding` uses the injected Rust inspector. |
| `:478` star export | `src/model/scalar-type.ts`: `inspectCoreScalarType` | Re-export its public model types as type-only; V4 supplies the runtime function. |
| `:479` star export | `src/model/record-members.ts`: `inspectCoreRecordMembers` | Re-export its public model types as type-only; V4 supplies the runtime function. |
| `:480` star export | `src/model/reference-links.ts`: `inspectCoreReferenceLinks` | Re-export its public model types as type-only; V4 supplies the runtime function. |
| `:357,359,361,364-366` stars | `relationship-tablespec-projection.ts`, `relationship-avro-projection.ts`, `relationship-parquet-projection.ts`, `relationship-sqlserver-projection.ts`, `relationship-extras.ts`, `relationship-postgresql.ts`: the old projection/verify/recover wrapper values | V4 local factory outputs provide the shadowed projection values. Re-export the unaffected constants, classifiers, schema values and archive helpers from their actual factory/ideal source modules, not from the wrapper modules. Most wrapper types are type-only re-exports from the factory modules. |

The six legacy wrapper files each create their old projection closure with TS
`lookupCoreRelationship` and `verifyCoreRelationshipOperation`. Their six V4
counterparts are constructed with the Rust-bound operations. For extras and
PostgreSQL, the wrapper also re-exports other useful runtime operations from a
factory; those names must stay public, but can be re-exported directly from
`relationship-extras-factory.ts` and `relationship-postgresql-factory.ts`.
This bypass preserves those helpers without evaluating the wrapper's TS
projection closure.

The source graph also has TS-to-TS edges in
`src/model/record-type-inspection.ts:11,24`,
`src/model/record-type-journal.ts:14,42`, and
`src/compilation/admission/index.ts:7,62`. They are not imported by the V4
root barrel graph and are not in scope for this bundle cut. Before deleting
the corresponding TS declarations, those direct callers must be separately
injected, intentionally retained as reference/internal code, or retired with
their own supported route decision. `selectCoreRelationships` is a distinct,
root-exported TypeScript algorithm and remains in the default facade unless a
separate port is approved and evidenced.

## Mechanically safe replacement

Do not replace the V4 star export with named exports from `./index`: that
still loads the broad reference barrel and its dependency graph. Instead, add
a deterministic generation/check step that uses the installed TypeScript
Compiler API and the same package-condition roots as the route inventory:

1. Resolve the complete module export table for `src/index.ts` with the TS
   checker. Record each public name, whether it is a type/value/both, and its
   resolved declaration module. Resolve aliases to their actual declaration
   source rather than copying the `index.ts` export-star syntax. This retains
   the complete TypeScript type surface as `export type` statements, including
   names not counted in the 1,120 runtime inventory rows.
2. Use the checked-in/source-selected V4 entry exports as the override map.
   For every name supplied by a V4 local binding, omit its value export from
   the generated facade. Re-export all other runtime names from the resolved
   origin modules. Where a public name is both type and value, emit the type
   re-export separately and the selected runtime export once.
3. For the four Inspector and four Relationship declaration names, emit no
   export binding to their TypeScript implementation modules: the V4 root's
   local Rust-bound value is the only value binding. For raw-profile values,
   re-export the non-inspector values from `raw-profiles-inspector`, and leave
   `inspectRawTableBinding` to the V4 local binding. For the six consumer
   wrapper modules, route unaffected names from their true origin files and
   omit wrapper-local TS projection values.
4. Emit the route-specific facade as a generated artifact under an explicitly
   named V4 default entry module, and make both V4 roots export from that
   facade plus their local selected bindings. Keep `src/index.ts` and the
   `./reference` build unchanged. Do not hand-maintain a second list: generator
   output, route inventory, and override map must be checked together in
   `--check` mode.
5. Re-resolve exports from the built V4 entries and prove exact name-set
   equality with the existing default roots: 1,120 runtime names for Node and
   browser, no duplicate/ambiguous names, and unchanged declaration/type
   resolution. Compare reference export names and behavior before/after; the
   reference build must remain byte-identical if its inputs did not change.

The generated facade must not import `src/index.ts`, any of the target TS
declaration modules at runtime, `raw-profiles.ts`, or the six legacy consumer
wrapper modules. Type-only re-exports are allowed only if declaration emit
proves they do not create runtime imports. Direct exports from unaffected
origin modules are allowed and should be minimal.

## Risks and validation gates

- **Public-surface drift:** TS star exports have conflict/ambiguity semantics.
  The checker-resolved export table, not a text parser or the 1,120 runtime
  inventory alone, must drive generation. Compare names and type/value
  meaning for Node, browser, and `./reference` before accepting output.
- **Origin modules with mixed contents:** a wrapper can re-export live factory
  helpers while also constructing a TS projection closure. Route the
  unaffected helpers from their originating factory module; otherwise the
  wrapper itself remains evaluated.
- **Bundler behavior:** current Bun build calls do not request/store a
  per-entry metafile. Add a reproducible module-input/metafile report or
  equivalent build graph assertion. The acceptance check must show that the
  default Node/browser bundles no longer include TS implementation markers
  from `scalar-type.ts`, `record-members.ts`, `reference-links.ts`,
  `relationships.ts`, `raw-profiles.ts`, and the six legacy relationship
  wrapper modules, while continuing to include their Rust bindings and
  necessary factory modules.
- **Types and declaration emit:** `package.json` currently shares
  `dist/src/index.d.ts` across default and reference. Keep the reference type
  root stable and verify exact declaration exports for the default facade;
  if default declarations need route differentiation, treat that as an
  explicit package API change rather than an incidental build result.
- **Behavior and error contracts:** rerun the frozen Inspector 26-case and
  host-shape suite plus installed raw-profile and relationship consumer
  default/reference replays in Node, Bun, and real Chromium. Check wasm is
  requested in browser and missing/corrupt addon refusal remains intact.
- **No overclaim:** bundle removal is not source declaration retirement by
  itself. Retire declarations only after non-root callers are resolved,
  reference route compatibility is preserved, and current-source installed
  evidence is recorded. Keep the known TS `selectCoreRelationships` surface
  outside this tranche.

This design preserves public exports by construction while removing only
selected shadowed TS bodies from the V4 runtime graph. A successful typecheck
or matching runtime output alone is insufficient; all listed export-graph,
bundle-graph, host, and route checks are required before claiming the change.
