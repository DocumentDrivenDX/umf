---
ddx:
  id: umf.plan.browser-pack-tools
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - id: FEAT-009
      kind: informed_by
    - id: TD-089
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-052
      kind: informed_by
    - id: CONTRACT-054
      kind: references
    - id: CONTRACT-077
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Browser domain-pack implementation tools

## Scope

The owner requests a working online microsite tool for the existing domain packs:
select a pack, generate PostgreSQL DDL, SQLAlchemy 2.0 models and Python CRUD
implementation, inspect files and diagnostics, then download a file or ZIP.
The owner authorizes implementation and publication. All builds, tests and CI run
locally; do not dispatch hosted build/test jobs or wait for Actions credits.
GitHub documents standard Pages deployment runners as free. A deployment-only
run may seal and publish the exact locally qualified site using the existing
publication secret; it performs no hosted build, test or CI matrix.

[FEAT-009](../01-frame/features/FEAT-009-domain-pack-catalog.md) PACK-02/06 govern
deterministic artifacts and consumer evidence. [TD-089](../02-design/technical-designs/TD-089-generated-reference.md),
[CONTRACT-052](../02-design/contracts/CONTRACT-052-domain-packs.md),
[CONTRACT-054](../02-design/contracts/CONTRACT-054-browser-schema-downloads.md),
[CONTRACT-077](../02-design/contracts/CONTRACT-077-generated-reference.md),
[ADR-006](../02-design/adr/ADR-006-shared-rust-implementation.md) and
[TP-001](../03-test/test-plan.md) constrain source fidelity, browser isolation,
shared Rust execution and verification. CONTRACT-054's older scalar-export
profile remains separate; it does not establish the new compiler's behavior.

Use a new top-level `pack-tools.html` workbench and fixed source-built WASM
assets under `assets/pack-tools/`. Keep the released read-only schema-browser
2.0 package and its inspection host unchanged. Preserve existing catalog routes,
examples, native-source downloads and generated-client capabilities. Do not revive
the withdrawn browser database mutation demo or any retired TypeScript engine.

## Shared constraints and capability profile

Rust owns source admission, supported type mappings, key/reference checks,
diagnostics, code emission and digests. TypeScript owns catalog selection, worker
loading, UI, request correlation and archive encoding. Pack generator IDs never
load code. No database, credentials, dataset rows or external references are
accessed by the page or compiler. Caller-owned SQLAlchemy Sessions and transactions
execute downloaded CRUD code outside the site.

The new operation is `generatePackTools(request)`. Wire family `pack-tools` uses
`umf.pack-tools-wire/1`, operation `generatePackTools` and fields `{request}`.
The request profile `umf.pack-tools/1` contains:

- `pack: {id, version, text}` with the exact JSON manifest.
- `sources: [{id, path, format, schemaFormat, text}]` for exactly the manifest's
  ordered `schemas[]` declarations; IDs and paths match declared identities.
- `options: {schema, package}` and requested targets `ddl`, `orm`, `crud`.

Reject missing/ambiguous sources, identity mismatches, unsupported options and
unsafe output paths. There is no key-override option in this profile. Preserve
the original manifest, source text and unknown content in `source-companion.json`.
Ontology and artifact metadata do not imply physical tables; diagnose unsupported
content without fabricating schemas or operations.

Result profile `umf.pack-tools-result/1` contains `status` (`generated`, `partial`,
`blocked`), pack identity, `sourceDigest`, `files` (`path`, `text`, `sha256`, `kind`),
structured `diagnostics` (`severity`, `code`, `source`, `path`, `message`) and
per-source `coverage` (`source`, `status`, optional `table`, `operations`). A partial
result exposes every omission. A blocked target produces no pretend implementation.
Source/report artifacts can remain available when executable targets are blocked.

Emit `schema.sql`, a named Python package with `__init__.py`, `models.py` and
`crud.py`, plus source companion, report and README as applicable. Target choices
are fixed and versioned; source descriptions never become executable Python/SQL.
Honor declared primary keys, including composite keys. Do not invent `id` keys,
autoincrement, server defaults, constraints or authorizations. Supported unkeyed
tables produce DDL; mapped ORM and keyed CRUD remain explicitly blocked.
Resolve foreign keys only against an unambiguous declared table/column closure.
Unknown domain-type and extension meanings remain visible and retained.

Use the SQLAlchemy 2.0 API: [declarative table documentation](https://docs.sqlalchemy.org/en/20/orm/declarative_tables.html)
requires a declared primary key for mapped ORM classes. Generated CRUD uses bound
values, validates complete key sets and field names, and never constructs an
empty update/delete predicate. Generated code does not commit caller transactions.

## Resource and browser choices

Load the worker and WASM lazily when generation starts. A focused Pack Tools WASM
host forwards the established `nativeFamilyDispatcherProfileVersion` and
`executeNativeFamilyWire` ABI directly to the same `pack_tools_binding` compiler.
It accepts only `pack-tools`; every other family returns a structured refusal.
Reuse the existing host-control adapter and introduce no second semantic owner.
The full released SDK module is approximately 50 MB; measure the focused output
before making any size or startup improvement claim. This host split is a bounded
online-delivery refinement, not a wider runtime decomposition.

Ship matching WASM JavaScript and binary built from the actual changed Rust
source; record their input/asset hashes. Keep the fixed worker/runtime closure
separate from full SDK initialization. Same-origin CSP permits only this execution
profile; a missing permission yields visible refusal and leaves inspection available.

The new pack-tools profile caps aggregate input at 4 MiB, declared sources at
256, generated files at 32 and output text at 16 MiB. Check limits before/while
allocating and charge Rust Context work in source/table/field loops. The controller
terminates a worker after 30 seconds or immediately on Cancel. These are pack-tools
limits; the existing reference-workbench protocol retains its separate limits.
Pack selection and new requests invalidate old results. Show loading/generating/
packaging phases, preserve inputs on refusal, and permit retry with a fresh worker.
Do not display invented progress percentages or allow stale completion to overwrite
the selected pack. Revoke obsolete download URLs. ZIP paths preserve package
directories and contain the exact generated file bytes.

## Implementation slices

| Slice | Owner and boundary | Depends on | Validation gate |
| --- | --- | --- | --- |
| PT-1 | GPT-6 Luna: new Rust compiler/wire module and type-only TS contract/facade | Frozen profile above | Focused Rust generation/refusal tests; generated-code validation |
| PT-2 | GPT-6 Luna: new page, catalog-to-request model, worker/controller and ZIP/file UI | Frozen profile; PT-1 for execution | Model/controller tests; actual browser generate/refuse/cancel/download |
| PT-3 | Root: central registrations, focused WASM host/workspace/lock integration, page/build/navigation | PT-1/PT-2 | Both TypeScript configs; focused ABI/refusal tests, complete asset closure and all-pack batch |
| PT-4 | GPT-6.1 Sol review; root fixes, signs and publishes final site | PT-3 | Focused review clean; local full site checks; signed inventory; public URL verification |

Root is the sole official-tree writer. Agents return temporary patches and test
evidence. Keep shared registries/build/navigation files with root to prevent
overlapping writes. Preserve user `.tmp/`. A passing capability remains closed
unless a relevant source/dependency change or an observed failure requires rerun.

## Execution contract

Execute through browser verification and publication within the owner's request.
No new frontend framework, backend service, SDK release or broad conformance
campaign is required. Token estimates and a token ceiling are unknown; no user
token budget or reliable per-lane metering was supplied. Bound execution to the
two implementation lanes, one focused source review and observed failure repairs.

Build and review the concrete full site before publication decisions. Preserve
`.innsigle/AGENTS.md`: every first-party HTML page, including the new workbench,
joins `.innsigle/generated-pages.json` and uses the registered build signer through
`INNSIGLE_BUILD_KEY`. Never print/copy the key, introduce a human-key fallback,
rotate keys or weaken verification. A missing local key does not block the
authorized deployment environment from using its existing secret to seal the
exact site. Verify actual deployment admission. If the signer or deployment
capability is unavailable there, retain the completed site and report that
concrete blocker; do not disguise an unsigned preview as published.

## Validation plan

1. Run focused compiler tests (`cargo test --locked -p umf-codegen pack_tools`)
   for keyed/multi-table output, composite-key CRUD, explicit unkeyed refusal,
   unresolved references, unknown retention, deterministic bytes and resource limits.
2. Rebuild the catalog and run one batch over every pack and declared schema.
   Record actual counts, target outcomes and diagnostics rather than hard-code
   eligibility. Verify every source is accounted for and companion text is exact.
3. Validate generated Python with `py_compile`, SQLAlchemy import/mapper setup and
   PostgreSQL dialect compilation. Exercise representative create/read/list/update/
   delete behavior and refusal with caller-owned transactions; record the actual
   SQLAlchemy/backend versions and the executed subset separately from compilation.
4. Run `bun run typecheck`, `python3 scripts/check-rust-boundaries.py` and
   `bun run check:access-boundaries` for affected integration. Inspect actual
   imports: browser code has no Bun/Node/database capability or second engine.
5. Run real Chromium against the built site: keyed and composite/multi-table
   packs; one unsupported/unkeyed outcome; visible diagnostics and source coverage;
   file/auxiliary preview; actual file and ZIP download contents; cancel, retry,
   changed selection and missing runtime. Check desktop/mobile containment and
   keyboard controls. Observe page errors and unexpected requests.
6. Run the existing local site/reference checks needed by the changed pages,
   then inventory, seal and verify the final exact HTML with the pinned signer.
   Publish using the authorized deployment-only Pages route, with no hosted CI;
   verify the deployed workbench and its worker/WASM/catalog asset closure.

## Continuation evidence

Initial source assessment finds 28 packs and 313 catalog entries: 256 TableSpec
schemas, 23 UMF entries and six artifact collections. The tables contain 1,660
fields; 250 tables declare primary keys, including three composite keys, and six
are unkeyed. These counts describe the inspected catalog, not future support.
Existing public APIs supply table-deployment compilation and custom Python clients;
neither supplies an existing general ORM generator. The new compiler is required.

The Rust compiler, native-family wire binding, source-bound focused WASM host,
and microsite workbench are integrated. Source review closed catalog/source
selection, result-container lifetime, wire nesting, cancellation, stale worker
events, archive encoding, key inference, foreign-key eligibility, Python symbol
and literal safety, and input/output-limit findings. The strict page CSP uses
build-time standalone catalog validation; generation does not require dynamic
JavaScript compilation.

Three focused compiler tests and four wire integration tests passed locally.
The fresh focused WASM host passed three tests covering generation, foreign-family
refusal and cancellation. One native batch assessed all 28 packs: 25 partial,
one generated and two loader-only blocked outcomes, with exact source companions.
Python 3.14 and SQLAlchemy 2.0.44 validated 78 generated Python files, 26 metadata
imports and 188 total artifacts. SQLite executed representative single-key
`archaeology.projects` and composite-key `gtfs.stop_times` CRUD and refusal cases.
PostgreSQL dialect compilation is separate evidence from native database execution.

Real Chromium generated every pack with the fresh WASM host. All 28 browser
results matched the captured native results. File preview, individual download
bytes, ZIP hashes/CRC, changed-option invalidation, cancellation, mobile layout
and missing-runtime behavior passed. A final bounded retry check found that failed
runtime imports retained their worker; the controller now discards it on an error
envelope. Four host tests and an actual blocked-download/unblock/retry browser
check passed with the unchanged qualified WASM binary. Desktop and mobile captures were visually
reviewed. The independent existing inspector initially lacked its ignored released
asset cohort; installing the exact pinned schema-browser 2.0 package restored
the verified 2,415-entry reference and iframe with no page/CSP errors. The existing
host CSP, renderer package and reference semantic runtime remain unchanged.
Deployment assembles the same hash-verified published cohort before sealing.
Final TypeScript, Rust/access boundaries and 22-page signing inventory passed.
[PR #85](https://github.com/DocumentDrivenDX/umf/pull/85) and
[the retry fix #86](https://github.com/DocumentDrivenDX/umf/pull/86) are merged.
The final deployed revision is `fbbbc51d51fbd1982ff0a464d76331a175c49b3d`.
The deployment-only
[publication](https://github.com/DocumentDrivenDX/umf/actions/runs/41501728883)
succeeded without hosted compilation or behavioral tests. The public workbench,
worker/WASM/catalog closure and registered build signature were verified;
Chromium followed the homepage link and generated all three outputs without page
errors. [The acceptance and publication receipts](evidence/browser-pack-tools/README.md)
close PT-1 through PT-4. The focused binary measures 1,034,632 bytes.

## Risks and rollbacks

| Risk | Response | Rollback |
| --- | --- | --- |
| Silent semantic loss or invented keys | Exact companions, explicit supported mappings and per-source/target diagnostics | Disable affected target without changing original catalog |
| Generated ORM/CRUD imports or key predicates are wrong | Validate actual emitted code and execute normal/refusal cases | Retain prior published page while repairing generator |
| Main-thread stalls or stale result/download | Fixed worker, timeout/Cancel, request IDs and URL cleanup | Disable generation; preserve inspection and source downloads |
| Mismatched WASM/build closure | Source-bound compile and asset/input digest inventory | Publish the previous complete verified site |
| Missing signer/deployment capability | Finish local site and report exact remaining gate | Do not deploy unsigned or weaken Pages/signature controls |

## Exit criteria

- Every catalog pack has an assessed source/target outcome with honest diagnostics.
- Supported sources produce valid DDL, models and callable CRUD code through Rust/WASM.
- Browser users can select, generate, inspect and download individual files and a real ZIP.
- Required source, generated-code, integration and browser checks pass; review findings close.
- Final HTML/asset inventory is signed and verified, and the requested public site is updated.
  Local implementation completion and publication completion remain distinct until verified.
