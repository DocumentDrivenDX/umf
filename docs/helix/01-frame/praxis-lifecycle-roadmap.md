---
ddx:
  id: umf.praxis-lifecycle-roadmap
  type: roadmap
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: FEAT-033
      kind: informed_by
    - id: FEAT-008
      kind: informed_by
---

# Praxis table and ontology lifecycle roadmap

**Scope:** One generated typed model/query/action API for direct tables and ontology-backed graphs, with Weft compilation and consumer-owned execution.
**Owner:** UMF stack maintainers; individual assignees remain unassigned.
**Last revised:** 2026-10-18, following the owner's Praxis integration and stack licensing requests.

## Horizon and Cadence

This draft sequences three candidate delivery cuts: P1 (portable clients and packaging), P2 (direct-table lifecycle), and P3 (graph-host integration). These are dependency gates, not calendar commitments. No approved delivery dates or Hohfeld integration date were found. Proposed package versions below reserve no release number and must be reconciled against the release heads before tagging. Publish prereleases at each passing gate; never use a future version label as evidence of delivery.

The user reports testing UMF SDK 0.5.0, umf_access 0.1.0.dev2, umf_core 0.9.0 and Weft 0.4.44. Current-source findings below are qualified separately from those installed artifacts. This planning exercise does not rerun Praxis or establish Lakebase deployment acceptance. The separately authorized licensing implementation is recorded in [licensing evidence](../04-build/evidence/stack-licensing.md).

Review after each native gate or a dependency/release change. Beyond P3, broader dialects and temporal qualification retain their existing backlog and HELD status. This roadmap does not reorder the TableSpec finalization priority or waive current native qualification gaps.

## Governing direction and boundaries

[Product vision](../00-discover/product-vision.md), [PRD](prd.md), [ADR-004](../02-design/adr/ADR-004-typed-data-access-sdk.md), [FEAT-033](features/FEAT-033-generated-ontology-access.md) and [CONTRACT-079](../02-design/contracts/CONTRACT-079-unified-python-access.md) require one schema-derived API, exact values, explicit bindings and visible unsupported capabilities. Tables do not need an ontology or DDD annotation. [Shared security](features/FEAT-008-shared-security.md), CONTRACT-062/063 and SD-008 govern policy semantics; a Praxis-specific row_scope must map to them rather than establish a second policy language.

CONTRACT-081 distinguishes explicit PostgreSQL RLS declarations from the stronger
shared `umf.security` semantics. Native owner/group/via/batch policies must retain
their actual PostgreSQL behavior and are not evidence that CONTRACT-063 is
implemented. A source selecting both profiles refuses until combined enforcement
is qualified. This clarification supersedes interpreting the row_scope mapping
above as permission to relabel native RLS as the stronger policy profile.

UMF owns schema semantics, versioned declarations, reusable schema/DDL generation, generated client types and transport contracts. Weft owns query/action logical semantics and SQL lowering, using the same Rust core for native Python and browser WASM. Bindings own native execution, identity, transactions, installed-state checks and publication. Truss owns mutable graph admission, invariants and journals; Ashlar owns immutable publication construction, selection and freshness. Hohfeld is a host integration layer. Praxis injects authenticated identity/connection custody and calls the generated API; it must not retain a query compiler or policy/DDL emitter.

FEAT-033's exclusion of production execution and grants still applies to the portable generator. The stack lifecycle work introduces reusable host/deployment components, not execution inside UMF's portable metamodel or generated application package. Before implementation, amend the relevant feature/design/contract/test artifacts with the accepted slices below; these proposals do not silently approve new core fields or extension wire formats.

## Workstreams

WS-1 through WS-4 are already allocated by the domain-pack roadmap and remain unchanged. This scope allocates subsequent aliases.

| Alias | Workstream | Scope | Proposed accountable owner | Status |
| --- | --- | --- | --- | --- |
| WS-5 | Portable typed access | Python sync/async clients, module surfaces, checked generation, conformance | UMF SDK maintainers | active planning |
| WS-6 | Table lifecycle | Table declarations, DDL, migrations, seeds, RLS and grants | UMF schema maintainers; Weft lowering maintainers | active planning |
| WS-7 | Native identity and execution | Driver adapters, request-scoped sessions, paging, commands and replay | umf_access and native binding maintainers | active planning |
| WS-8 | Graph-host convergence | Current-core Hohfeld, protected Truss, publication-bound Ashlar | Hohfeld, Truss and Ashlar maintainers | active planning |
| WS-9 | Distribution and licensing | Dual licensing, reproducible wheels, index publication, release manifests | Stack release maintainers | active; licensing implemented separately |

## P1 implementation checkpoint

The owner authorized P1 implementation after publication of the licensing work.
[The build plan](../04-build/praxis-p1-plan.md) sequences the implementation.
Portable generated SyncClient/SyncActions and explicit async aliases are now
implemented, with unchanged wire/codec semantics. The host Pydantic dependency
admits >=2.13,<3, including the shared sentinel compatibility import; installed
2.13.5 and 2.14.1 checks are recorded in
[P1 evidence](../04-build/evidence/praxis-p1.md).
Native connection/session/driver qualification, the Bun-free generator and index
publication remain open. No P1 release or complete-P1 acceptance is claimed.
The table below retains the original baseline audit and proposed landing cuts.

## Baseline gap assessment and proposed fixes

“Partial” means the cited subset exists; it is not an assertion that the full Praxis requirement is supported. Versions in the last column are **proposed landing targets**, not approved dates or existing releases. Core schema version, SDK archive version and Python distribution version are independent.

| Gap | Current state and evidence | Owner | Fix and acceptance boundary | Version it lands in — proposed |
| --- | --- | --- | --- | --- |
| 1. Table specs | **Partial.** Core 0.10 Records, Fields, Keys and relationships feed the generator (`src/access/index.ts`). PostgreSQL catalog/native declarations are preserved under CONTRACT-015; binding/index/facet profiles have scoped evidence. There is no qualified, unified Praxis authoring profile covering checks, indexes, row scope and executable seeds. | UMF schema/SDK; Weft for query use | Author ordinary module-local Records/Fields/Keys and declared relationships; attach versioned physical table/index/check and security declarations. Define exact check semantics, generated/default values, FK actions, constraint names and deterministic seed operations. Provide JSON/YAML examples and an explicit legacy-module converter retaining source and diagnostics. Reuse native extensions, core ideals and domain-pack metadata rather than invent a parallel entity model. | P2: SDK 0.7.0a1; document remains core 0.10 unless a separately approved semantic change needs a new core version |
| 2. Row scope | **Partial semantics; enforcement gap.** FEAT-008/CONTRACT-062/063 describe shared security; Weft selected paths refuse nonempty extensions (`weft-core/src/model.rs`, `raw_read.rs`). It is inaccurate to claim all extensions are always refused: `umf.access` and action paths already have selected consumers. No qualified Praxis owner/via/batch profile exists. | UMF security; Weft admission; native enforcement binding | Declare a bounded versioned profile of shared security for each SELECT/INSERT/UPDATE/DELETE, separate old-row USING and new-row WITH CHECK, typed owner identity and explicit relationship-path scope. Missing policy denies. Batch is an explicitly authenticated service principal with separately granted command capabilities; never infer it from missing person identity. Weft accepts only understood selected obligations and preserves all source content; unknown applicable constraints block. | P2: SDK 0.7.0a1, umf_access 0.3.0a1, Weft 0.5.0a1 |
| 3. DDL, migration, RLS, grants | **Partial foundations; lifecycle gap.** Native declaration inspection and bounded facet/key/UUID projections exist; they do not constitute a general forward migration/deployment system. The Praxis emitter is reported by the user, not reviewed here. | UMF reusable schema/DDL generation; Weft where logical lowering applies; native deployment runner | Generate a reviewable deployment bundle from the same source as the client: tables, constraints, indexes, RLS, grants and seed operations. Add forward-only predecessor- and digest-checked migrations, serialized ledger and live drift verification. Isolate plugin schemas/roles; separate install authority from person/runtime roles. Replace Praxis's emitter only after differential native qualification. | P2: SDK 0.7.0a1 and umf_access 0.3.0a1; Weft 0.5.0a1, recorded in the cohort manifest |
| 4. Async only | **Gap on unified surface.** CONTRACT-079 terminals and `Transport.execute` are async. Older runtime components do not establish unified sync-client support. Generated code is already stdlib-only. | UMF SDK and umf_access | Emit SyncClient/AsyncClient and typed sync/async protocols from one operation model. Add genuine synchronous DB-API adapters for psycopg2 and psycopg 3 plus explicit SQLAlchemy Core connection support; async psycopg 3/SQLAlchemy adapters remain separate. Do not hide event-loop runners inside sync methods. Create connection leases inside child processes; do not share sockets or pools across fork. | P1: SDK 0.6.0a1, umf_access 0.2.0a1 |
| 5. Identity per call | **Partial callback seam.** `WeftTableBinding.__init__` accepts compiler, original binding and execute/action callbacks; it creates no global pool. Callbacks can close over a request's connection today. A typed per-call lease/factory, session setup and cleanup contract are missing. | umf_access; host authenticates identity | Standard per-operation execution context accepts a caller-owned connection or lease/factory; state ownership of commit/rollback/release. Bind trusted identity before compiling/executing the operation; set transaction-local role and allowlisted settings, safe search path and timeout. Verify cleanup under cancellation/error and pool reuse. Never accept an arbitrary role from plugin request data. | P1: umf_access 0.2.0a1; P2 adds native RLS profile acceptance |
| 6. Paging, named statements, counts, upserts | **Partial.** Unified binding constructs lexicographic keyset predicates with key tie-breakers, signed cursors and size+1 lookahead (`unified/__init__.py`); `Page.items/next_cursor` exists. Older engine-page/action/bulk entry points and catalog runtime exist. Their existence does not establish a complete unified named-statement/count/upsert contract. Unified Actions currently delegate to a host callback. | UMF API; Weft compiler; execution host replay store | Qualify ASC/DESC/null/collation/exact-value order, counts under the caller's RLS and explicit consistency. Generate typed named statement arguments/results as optional registered commands using the same DSL. Define conflict target, update whitelist, returned keys/counts and transaction behavior. Compile ON CONFLICT through Weft; durable idempotency separately binds principal/module/schema/command/input digest to atomic outcome storage. Never automatically retry an uncertain write. | P1 paging/command contract: SDK 0.6.0a1; P2 complete counts/upserts/replay: SDK 0.7.0a1, umf_access 0.3.0a1 and Weft 0.5.0a1 |
| 7. Pydantic | **Confirmed gap.** `python/umf_access/pyproject.toml` pins 2.14.1; `python/pyproject.toml` already allows >=2.11,<3. The generated application package needs neither package. | umf_access packaging | Change host runtime requirement to >=2.13,<3 only after exercising 2.13.5 and the chosen latest compatible 2.x in isolated installed-wheel tests. Keep exact release/test locks outside broad library dependency metadata. Test the actual frozen Praxis platform dependency set. | P1: umf_access 0.2.0a1; not changed by the licensing patch |
| 8. Hohfeld/core skew | **Confirmed gap.** Local Hohfeld 0.4.5 has `UMF_VERSION = "0.7.0"` in `src/hohfeld/umf.py` and requires its DDD subset. Current UMF generator targets core 0.10. Production Hohfeld adoption is explicitly absent from unified-access evidence. | Hohfeld integration; UMF shared reader; Truss/Ashlar bindings | Move Hohfeld's reader to the supported current core using shared metadata and exact codecs; retain DDD as an optional semantic extension. Implement the shared transport and conformance suite over real Truss/Ashlar hosts. Meanwhile use the current generated client with qualified direct-table callbacks; retain any old Hohfeld cohort as a separate immutable contract. Do not edit a 0.10 document's version to 0.7 or imply lossless downconversion. | P3: Hohfeld 0.5.0a1, SDK 0.8.0a1; **date uncommitted** pending reader and real-engine gates |
| 9. Index and licensing | **Mixed.** SDK 0.5.0 release notes explicitly disclaim PyPI publication for umf_core; GitHub wheel assets and checksums exist. A lockable common index for all three was not established by this audit. Weft already declares MIT OR Apache-2.0; UMF and other stack metadata were incomplete. Owner now explicitly chose dual licensing. | Stack release maintainers | Licensing is implemented in this worktree and sibling source checkouts: LICENSE.md, full MIT/Apache texts, SPDX headers, package metadata and artifact inclusion; verify each wheel before release. Select/verify a PEP 503-compatible index and vendor from immutable versions/hashes, with platform/Python wheel matrix and offline install proof. Until then retain exact release asset URLs and hashes; no invented index URL. | P1 candidate cohort: SDK 0.6.0a1, umf_access 0.2.0a1, umf-core 0.9.1 and Weft 0.4.45a1; sibling licensing in their next rebuilt releases. Index publication requires publisher access; existing public wheels remain unchanged |
| 10. Generator toolchain | **Partial.** Pure TypeScript generator has Bun/Chromium parity. `scripts/umf-client-generate.ts` implements generate/check with drift refusal and atomic writes. Release archive packaging does not yet constitute a shipped standalone Python generator entry point, nor prove the source CLI is present in the archive. | UMF generator/release tooling | Publish a pinned generator artifact containing CLI, runtime and dependencies with checksums and reproducible check mode. Add `python -m umf_codegen generate/check` backed by a qualified Python implementation of the generation contract or a self-contained executable; a wrapper still requiring external Bun does not meet the no-Bun requirement. Cross-compare complete output bytes, refusal cases and manifests against TypeScript/Chromium. | P1: SDK 0.6.0a1 and new umf-codegen 0.1.0a1; no such Python entry point claimed today |

## Proposed authoring and execution contract

A plugin module is a capability boundary: document/module/record identities qualify every field, key, relationship and command. Generate only the selected module's public operations; dependency key types do not expose another module's query capability. Host admission checks module membership even for forged wire requests. Python imports and type checkers alone cannot enforce access control.

The proposed authoring bundle has four explicit parts. Their exact wire shapes must be resolved in downstream contracts before implementation:

1. Current-core logical model: typed Fields, Records, Keys, relationships, exact literals and separately declared semantic references. Absence and null remain distinct. Native-specific precision, checks, collation, indexes and identity/default expressions retain their native version/profile.
2. Versioned physical binding/deployment declarations: module-to-schema ownership, table/column mappings, indexes/checks/FKs, seed actions and migration policy. Existing PostgreSQL/binding/pack extensions supply reusable meaning; unsupported target enforcement produces a blocking obligation or explicit residual, not success.
3. Versioned security declarations: command-specific rule, authenticated subject mapping, owner-field reference or bounded related-record path, batch capabilities and policy-combination semantics. The native binding supplies role mappings; client values cannot manufacture them.
4. Operation declarations: typed actions and optional named read/bulk commands, bounds, conflict semantics, replay policy and backend capability requirements. Ordinary reads remain directly composable under ADR-004. Named statements do not become a second query language.

A single source digest closes over the selected model, policy, physical binding, commands and pinned dependency documents. Derived client, SQL catalog and deployment bundle record their own hashes and that common authority. A deployed host compares the current installed cohort before effects; changing only the client cannot grant access or migrate a database. Migration/deployment operations use a separate administrative component and typed interface, never ordinary plugin CRUD privileges.

### Direct table lifecycle

Support author → inspect/typecheck → generate/check → review deployment → install → seed → read/page/count → create/update/delete/upsert/bulk → schema evolution/backfill → retire/archive. Forward-only describes the schema ledger, not a prohibition on transaction rollback. Retrying an applied migration verifies the recorded digest; edited or reordered history refuses. Unsupported/destructive changes produce an explicit reviewable plan. Multi-step data changes retain progress and resumability without claiming atomicity that the backend cannot provide. Nontransactional index operations need explicit phases and recovery rules.

Seed data is exact, typed, ordered and checksum-pinned, with declared conflict behavior. Applying seeds is explicit and permission-scoped, never a consequence of importing a schema. Separate fixtures from production bootstrap data and preserve source/license information.

A PostgreSQL runtime role receives only its required schema/table/sequence/function privileges. It must not own the tables, have BYPASSRLS/superuser authority or receive cross-plugin schema creation rights. Verify whether FORCE ROW LEVEL SECURITY is required for each ownership model. RLS filters and new-row checks remain native enforcement; plugin-level query filters are not a security boundary. Command grants and row policies are generated and verified together. PostgreSQL documents owner/bypass behavior and command-specific USING/WITH CHECK separately ([PostgreSQL 18 RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)).

Identity setup uses a trusted role registry and a native-safe identifier mechanism; bind values with driver parameters. Where switching is selected, use a transaction-local role and settings with defined cleanup; where a per-person pool is selected, verify the checked-out connection's identity. [PostgreSQL 18 SET ROLE](https://www.postgresql.org/docs/18/sql-set-role.html) defines membership and privilege constraints. Scope-by-related-table policies require concurrent reassignment/revocation tests, not just static EXISTS examples.

### Ontology graph lifecycle

Run the same typed application operations against genuine Truss nodes/properties/edges and an Ashlar publication-bound reader. Truss writes go through accepted mutable-engine admission, atomic invariant checks and journals. Ashlar's immutable publications expose read-only application capabilities; writes are explicit publication/import workflows producing a new revision, never in-place SQL mutations against a held snapshot. Cursor/freshness tokens bind the full selected publication vector. Protected admission, feed/ack custody, deletion propagation and policy changes keep their existing separate gates.

Do not promise identical transaction, freshness or mutation capabilities for every binding. Capability negotiation/refusal is typed and explicit; substituting a backend may leave the application call shape unchanged while legitimately refusing unsupported operations. Full lifecycle includes admission/import, schema evolution, journal/feed/publication, read/command execution, revocation and retirement with retained unknown metadata.

### Type safety and behavior

Generate model-specific fields, keys, predicates, relationship paths, result projections, create/patch inputs, action arguments and business outputs. Reject foreign-module/record fields, wrong exact carriers, nullable arguments in required positions, immutable/generated writes and unsupported selected semantics. Check forged requests again at runtime and enforce invariants/authorization at commit. Compile-time typing cannot guarantee freedom from unexpected native behavior; the support promise is bounded by explicit runtime guarantees and evidence.

Preserve UUID/128-bit, integer/decimal, date/time, absence/null and collection semantics. No float coercion or guessed timezone/collation behavior. Shared typed exceptions distinguish denial, conflict, precondition failure, schema mismatch, invalid cursor, unsupported capability and unknown write outcome. Backend errors must be sanitized without collapsing known denial/conflict into generic busy failures.

## Sequenced Outcomes

| Order | Outcome | Workstream | Governing artifacts / Praxis requirement | Target cut | Depends on | Confidence | Rationale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Reproducible, dual-licensed distribution and precise installed capability inventory | WS-9 | PRD FR-5/23; requests 7, 9, 10; licensing amendment | P1 | Package payload/build checks | high for licenses; medium for index | A lockable artifact is necessary to reproduce every later claim. |
| 2 | Sync/async module-scoped API with trusted per-call connections and deterministic generator/check tooling | WS-5, WS-7 | FEAT-033 OA-12/14/18/19; requests 4, 5, 10 | P1 | 1; sync/wire/driver contracts | medium | Resolves host integration without changing the storage-independent API. |
| 3 | Authored table/security/deployment profile can express the complete Praxis module | WS-6 | FEAT-008 SEC-01–04; requests 1–3 | P2 | Versioned profile and native counterexamples | medium | Policy and physical meaning must be settled before generating deployable SQL. |
| 4 | Direct PostgreSQL lifecycle, RLS, counts, named commands and replay pass on installed packages | WS-6, WS-7 | FEAT-033; CONTRACT-062/063/079; requests 2, 3, 5, 6 | P2 | 2, 3; native compiler and migration gates | medium locally; low until managed replay | Eliminates the Praxis query/emitter layer only after native equivalence is shown. |
| 5 | Current-core Hohfeld and real graph-host conformance preserve one application surface | WS-8 | ADR-004; FEAT-033 OA-10–12/20; request 8 | P3 | 2; accepted Truss and publication-bound Ashlar hosts | low until dependency qualification | A graph fixture cannot qualify engine authorization, durability or publication behavior. |
| 6 | Praxis vendors one complete cohort and removes its private query/emitter implementations | WS-9, WS-5–8 | Owner lifecycle requirement; requests 1–10 | P3 | 1–5; Praxis native acceptance | medium after prerequisites | Client adoption is the final proof, not an inference from unit tests. |

## Acceptance and release gates

Each cut records exact sources, schema/profile versions, driver/compiler/wheel hashes, Python/platform versions and failed/unsupported cases. Existing historical certificates retain their original scope after licensing header changes; do not relabel them as acceptance of new source.

- **Portable gate:** deterministic Bun/real-Chromium/Python generation, isolated Python 3.11+ import without third-party dependencies, complete-byte check mode, atomic writer failure recovery, and mypy/pyright/ty positive and negative cases without suppressions. Sync calls run in sync workers and async calls in a real loop; child processes establish fresh resources.
- **Schema gate:** authored/imported table metadata round-trips without losing unknown content; generated schema, client and deployment hashes agree. Compare native catalogs for every type/key/index/check/default/FK/policy/grant in the declared profile. A retained but unenforced assertion is never counted as native support.
- **Native PostgreSQL 18 gate:** two people and a distinct batch principal, two plugin schemas, owner/via rules for all commands, forged module/identity attempts, pool reuse/cancellation, identity verification, direct SQL bypass attempts, owner/BYPASSRLS controls, seed replay and failure. Test direct psycopg2, sync/async psycopg 3 and selected SQLAlchemy Core versions independently.
- **Paging/command gate:** duplicate sort values, composite keys, ASC/DESC, nulls, exact decimal/UUID/bits128 values, insert/delete between pages, invalid/foreign cursors, principal/policy/schema changes, counts versus visible rows, named-command argument/result typing and denied undeclared commands. Define live versus snapshot paging; stable ordering alone does not create a stable snapshot.
- **Mutation/migration gate:** native ON CONFLICT races and policy checks, no silent lost updates, atomic bulk failure, replay with same/different inputs, concurrent replay, lost response after commit, schema drift, edited migration digest, concurrent migrators, partial/nontransactional steps, cancellation, and recovery. Idempotency key scope includes the authenticated principal and command; replay authorization is rechecked without disclosing another person's receipt.
- **Graph gate:** unchanged application scenario over installed Truss and held Ashlar publication; original admission/journal/feed/ack evidence, policy revocation, schema evolution, stale publication refusal, bounded counts/paging and explicit read-only/publication-action distinction. Hohfeld core 0.10 reader has a shared conformance corpus and no mandatory DDD worldview.
- **Managed/consumer gate:** independently replay on the specified Lakebase/PostgreSQL 18 environment with its actual role-switch/pool restrictions. Vendor all wheels from the selected immutable source into a clean/offline Databricks App build; inspect License-Expression/License-File metadata and included texts. Run one Praxis plugin entirely through generated methods, including scheduled batch work; compare results and errors with independently authored expectations.

## Open decisions and risks

Named individual owners, publisher/index credentials, actual Praxis table modules/emitter source, its frozen platform dependency lock and a dedicated managed test environment were not supplied or validated. Assign them before committing dates. Choose supported psycopg2, psycopg 3 and SQLAlchemy version ranges based on installed tests; none is silently interchangeable. Select the Python codegen packaging strategy before promising a Bun-free entry point. Confirm command count semantics, supported check-expression grammar, seed mutation rules, via-path bounds and transactional versus publication operations in downstream contracts.

Local dependency versions and package source can differ from published release cohorts. Requalify after changes; do not overwrite existing wheel versions on an index. The new license grant applies to first-party code; external corpora/dependencies retain their notices and redistribution restrictions. A selected index URL must be demonstrated with an authenticated install or a public index fetch, never inferred from repository publication.

## Revision Triggers

Re-sequence on a native semantic counterexample, failed identity/policy isolation, new core/profile version, unavailable index/wheel platform, changed Praxis platform lock, or missing Truss/Ashlar authority/publication prerequisite. Retain workstream aliases and original evidence. New scope requires a visible roadmap/contract amendment; dates become commitments only in an owner-approved iteration plan.
