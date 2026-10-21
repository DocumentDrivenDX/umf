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
**Last revised:** 2026-10-21, following bounded U1–U3 source review and installed candidate acceptance. The current checkpoint below supersedes resolved implementation gaps in the historical R1–R11 assessment; consumer adoption and broader requirements remain open. The original baseline is retained as dated context.

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

## Original P1 implementation checkpoint — historical baseline

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

## Next release requirements — Praxis revision2, 2026-10-21

The [retained revision2](../00-discover/inputs/praxis-table-lifecycle-asks-v2-2026-10-21.md)
supersedes the original consumer draft. Its U1–U9 identifiers govern the next
release acceptance map; the R1–R11 analysis below is historical context. The
consumer reports scratch execution of release-digest-matching UMF0.5.3 and
Weft0.4.49 wheels. That is useful consumer evidence, not a native Praxis workload
or an independent release audit performed by this assessment. No new release
number or calendar date is reserved here.

Keep WS-5–9 and their existing owners. This revision does not create another
policy language, emitter, migration ledger, workstream registry or issue queue.
It recognizes sync/Python generation, licensing, the Pydantic range and initial
DDL/RLS as delivered in the consumer's inspected release. Do not reopen those as
new implementation projects. The current owner-authorized local lifecycle changes
must finish their focused/browser/installed/native gates before release; they
are not evidence that the posted wheels contain the successor changes.

| Requirement | Existing workstream / accountable role | Disposition and next-release gate |
| --- | --- | --- |
| U1: transaction modes, validation and reviewed data steps | WS-6, WS-7; UMF lifecycle maintainer, Weft for typed data SQL | Bounded maintenance profile accepted locally: one v0.2 plan contains backfill, ADD NOT VALID/VALIDATE, concurrent indexes and seeds. Durable phase custody, old-head fencing, unknown-commit observation, explicit exact index repair and no repeated committed data effects pass 21 installed native checks and an independent replay. App locks and native authority/prefix checks precede effects. This is not online chunked execution or managed-service qualification. |
| U2: reviewed changes to existing objects | WS-6; UMF migration/schema maintainer | Source review fixes exact marker binding, typed dependency closure and ordered native dispositions. Installed reviewed shards A/B/C/D pass 128 checks across 14 native cases and two additional compiler refusal cases for column/policy/Key/index/CHECK/FK/nullability/finite widening. Independent source/evidence review closes MIG-R01–R06 for this profile. Drops disclose immediate irreversible stored-value purge; history is not a backup. Preserve explicit refusal of unsupported conversions, dependencies and combined column drop/append. |
| U3: command subsets, groups, open reference reads, owner+via | WS-6, WS-5; UMF authoring/security maintainer | Bounded row_scope normalization is public in TypeScript/browser and embedded Python. It preserves sources and explicit command maps, denies omitted commands, resolves trusted groups/joins and refuses cycles or inaccessible related SELECT dependencies. Installed owner+via native checks pass owner-only/via-only/neither, old/new rows, FORCE RLS and membership reassignment. This is native RLS qualification, not a complete ethical-wall system or managed consumer acceptance. |
| U4: comments and simple checks | WS-6; UMF schema/deployment maintainer | Comments from core descriptions are in the local successor. Core allowedValues and exact range facets already drive blocking native domain CHECKs. Document enum/range authoring first; if named native-check shorthand is needed, normalize it to the existing typed expressions rather than invent competing range/null semantics. Gate: descriptions and exact enum/range bounds round-trip, emit deterministic comments/CHECKs, enforce in native PostgreSQL and produce located refusals for unsupported carriers. |
| U5: reference applier and approval custody | WS-7, WS-6; UMF administrative runtime maintainer | Accept. Local native applier now has file-byte digest custody and explicit approval/head inputs. Extract a small typed host protocol for read-history, execute-step and persist-step/approval, leaving Psycopg/native correspondence as one qualified adapter. Host atomicity/durability capabilities must be explicit; a fake interface is not native proof. Record approved plan/file digest, decider supplied by the trusted host, native evidence/qualification and per-phase outcomes. `nativeQualified:false` remains a compiler statement; host approval is a separate recorded receipt, not mutation of the compiled plan. Gate: edited applied file, reordered chain, wrong terminal snapshot, wrong approval and interrupted step refuse/recover through the shared state machine. |
| U6: optional containment for untrusted author SQL | WS-6, WS-7; UMF admission and Weft SQL owners | Accept as separately versioned optional profile. Generated plans already require complete original-source recompilation; untrusted SQL is not admitted by rehashing. Review the contributed checker before choosing reuse. Any hand-authored SQL ingress must use parsed statements with positive supported syntax/object-reference closure, not regex approval. Reject foreign schemas, role/schema creation, external grants, settings and stored code; trusted runner's own role/timeout/fence setup is a separate host authority. Gate: malicious CTEs, quoting/comments/dollar strings, multi-statements, indirect object references and source-rehashed altered SQL; unsupported syntax blocks. |
| U7: pure-Python host or tested V8 matrix | WS-5, WS-9; generator/release maintainer | Take the offered matrix alternative first. Publish exact mini-racer0.14.1 platform/Python/wheel hashes and installed generation/refusal parity evidence, plus native dependency size/notices. Generated application code stays stdlib-only; the build/administrative compiler currently embeds V8. Do not claim production apply is V8-free: native source verification invokes codegen. A pure-Python compiler or verified source-free execution artifact would require a separate parity/custody design; no duplicate compiler is promised for this release. Gate: every advertised matrix cell has an installed receipt; unsupported hosts have an explicit build-outside-host/vendoring boundary or refusal. |
| U8: index publication or mirror procedure | WS-9; stack release maintainer | Accept. Produce a hash-pinned local PEP503 mirror/vendoring procedure for umf-core, umf-access, umf-codegen, weft-sql and their selected dependencies; verify clean and offline installs plus license/source manifests. Public index upload needs actual publisher authority and new immutable versions. A local mirror proof is not public-index availability. |
| U9: Hohfeld0.10/date | WS-8; Hohfeld owner, UMF conformance support | Retain the separate reader/graph-host cut and uncommitted date. Table modules can move to0.10 independently of legacy ontology documents. Never relabel a0.10 source to0.7; any bridge retains original/version and explicit fidelity/refusal evidence. No release/date claim without an owner commitment and actual reader/host tests. |

### Next release order and completion boundary

1. **WS-6/7 — promote the bounded candidate:** retain exact installed source and
   wheel custody through hosted CI and publication. The
   [candidate packet](../04-build/evidence/praxis-u123-adoption/README.md) records
   accepted mixed-phase, reviewed-operation and owner+via results; independent
   source/evidence review closes MIG-R01–R06 for the recorded maintenance profile.
2. **WS-6/5 — consumer authoring acceptance:** row_scope normalization and native
   authorization pass the bounded fixtures. Port the exact consumer schema and
   enum/range/description metadata when available; fabricated legal-domain
   evidence does not substitute for Praxis acceptance.
3. **WS-6/7 — preserve the adoption boundary:** U1–U3 are upstream replacement
   capabilities, not evidence that Praxis has deleted its emitter. U5's general
   host protocol and MIG-G01–G11 remain separately selected work. Keep the exact
   eleven-table/four-migration consumer and managed-target gates below.
4. **WS-9/5 — U7/U8 distribution:** start matrix and mirror preparation alongside
   the above, finalize against the exact release cohort. Publish only passing
   capability/matrix claims; do not let packaging erase unresolved P1 requirements.
5. **WS-6/7/9 — consumer acceptance:** port the exact eleven tables/four migration
   history, preserving their applied byte digests; run typed calls on real
   per-person/batch connections and the selected Lakebase environment. Remove
   consumer machinery only when the corresponding replacement is accepted. U5/U6
   may remain explicit host components until their separate gates pass.

U6 and U9 keep separate acceptance and can proceed independently. Revise sequence
on a mixed-phase safety counterexample, reviewed-change dependency conflict,
unavailable platform wheel, changed consumer source/lock or failed managed proof.
No newer external requirement is silently treated as implemented by this checkout.

## Additional consumer assessment — 2026-10-21

Recommendation: accept the consumer outcomes, with the revisions below. Most
belong to UMF's existing table-lifecycle profile and host tooling. Weft remains
the query/mutation compiler; it does not need a second DDL or migration system.
This is an alignment assessment and remaining delivery sequence, not authorization
to execute migrations, change core, publish packages or contact the consumer.

The [retained request](../00-discover/inputs/praxis-table-lifecycle-asks-2026-10-20.md)
is dated 2026-10-20 but describes older installed artifacts. Its R1–R11 identifiers
are local to that request, distinct from the ontology request's R1–R21 and the
baseline table below. The exact eleven YAML tables and four migrations from its
referenced consumer revision have **not** been inspected in this assessment.
Earlier private conversion evidence covers a different selected cohort: seventeen
tables and prospective operations, not acceptance of these eleven examples.
No live database, package index or release inventory was requalified here.

Catalog: installed HELIX `workflows/graph.yml`; routes `align` then `iterate`.
The existing WS-5–9 registry and roadmap remain the planning authority. Governing
boundaries are PRD FR-43/52–56, ADR-004, FEAT-033 and CONTRACT-079/081. New wire
semantics require corresponding design/test amendments before implementation.

### Ownership and request dispositions

“Source implemented” below means the cited bounded component exists with retained
evidence. It does not mean released, supported on every platform, or accepted by
Praxis. Reviewed source is this UMF checkout; sibling Weft/Hohfeld reads are local
observations, not remote-head or installed-package claims.

| Ask | Assessment / disposition | Owner and remaining acceptance |
| --- | --- | --- |
| R1: core table vocabulary, no extensions | **DIVERGENT acceptance; accept the modeling outcome.** Core0.10 already provides Records, Fields, descriptions, Keys, relationships and scalar domains. Physical columns/indexes/defaults and native policy belong in versioned `umf.tables`0.1.0, governed by CONTRACT-081. Requiring empty extension content would discard the intended native semantics. | UMF model/generator. Replace “no extension content” with “no Praxis-private vocabulary; registered, understood declarations; unknown content retained and selected execution refused.” Convert the exact eleven tables, check semantic round trips and generated types. Clarify whether TIMESTAMP means local time or an instant. |
| R2: PostgreSQL18 DDL | **INCOMPLETE; accept.** `src/table-deployment/ddl.ts` emits tables, keys, typed defaults, checks, FKs, ordinary/unique indexes, RLS and grants. Identifier admission enforces63 UTF-8 bytes. Comment emission and concurrent index phases are missing. `timestamp` without timezone is explicitly refused by this executable subset; `timestamptz` has bounded finite precision/range evidence. | UMF portable deployment generator; host executes approved output. Complete comments and needed typed defaults, qualify exact example DDL and reads/writes on PostgreSQL18, then separately on the actual Lakebase build. Do not infer managed equivalence from the server major. |
| R3: forward migrations/checks | **INCOMPLETE; accept with a bounded execution contract.** `src/table-migration/index.ts`, Python codegen compile/verify functions and `lifecycle/ledger.py` provide source-bound forward plans, predecessor/digest history, reviewed application, seeds, appended tables/indexes, nullable columns and bounded policy changes. Required-column backfills, general added checks/FKs, nontransactional steps and a lifecycle `new/check/apply` CLI remain gaps. Existing unsupported changes refuse; all compiled plans require exact-digest approval. | UMF migration compiler and administrative host API/CLI. Keep SQL generation/checking available without execution. Host-supplied connection and explicit approval are required for optional apply; no automatic deployment. Compare each historical migration's effects and snapshot, rather than promising its original bytes can be inferred from schema endpoints. |
| R4: row policy/grants | **ALIGNED outcome; INCOMPLETE consumer qualification.** CONTRACT-081 and native related-policy evidence cover owner/group, FK-backed via and explicit association matching without an FK, person/batch command rules, forced RLS and grants. The blanket “Weft refuses extensions” claim is stale for its selected table-operation path. | UMF owns declaration and DDL/policy generation; Weft consumes selected obligations for reads/writes; host owns trusted roles and application. Qualify the actual task/project membership example for SELECT/INSERT/UPDATE/DELETE, including old/new row checks. No missing-policy default allow, inferred joins or implicit batch authority. |
| R5: synchronous client | **STALE_PLAN in the request; source implemented.** Generated SyncClient/SyncActions use synchronous transports, without an event loop per call; async remains available. | UMF generator/runtime. Demonstrate a plain function reading a page and invoking the required typed action using the exact installed candidate and Psycopg3. Source/test evidence is not evidence the consumer's pinned wheel has it. |
| R6: per-call connection | **STALE_PLAN / partial adoption.** Native per-call leases, identity/session setup, caller-owned transactions and pool cleanup have scoped evidence; no global pool is required. | `umf_access` binding, with host-owned authentication and connection custody. Replay two people through the same binding plus explicit batch, exceptions, cancellation, pool reuse and child-process creation. Role names from plugin input are never authority. |
| R7: paging/upsert/counts/binds | **ALIGNED, bounded source support.** Declared pages use keysets, including mixed directions and complete unique-Key tie-breakers. Nullable sort fields are refused by this profile; live pages are not a held snapshot. Typed CRUD/upsert/batch and durable outcomes have native evidence. | UMF API and host bounds/receipts; Weft SQL lowering. Verify exact bound NULLs, page/row/frame caps, affected-row counts and conflict/update semantics in the consumer cohort. ON CONFLICT alone is not retry idempotency: retain durable outcome keys, current authorization checks and unknown-write recovery without automatic retries. |
| R8: dependency pins | **PARTLY STALE; accept remaining packaging work.** `umf_access` currently admits `pydantic>=2.13,<3`, with installed2.13.5/2.14.1 evidence. `typing-extensions==4.16.0` remains pinned. | Runtime packaging. Select a justified typing-extensions minimum/range from actual imports and installed tests against the Praxis frozen lock. Publish a tested matrix; a declared range is not proof of every intermediate version. Generated application packages remain stdlib-only. |
| R9: index/licenses | **PARTLY STALE; release gap remains.** LICENSE.md, MIT/Apache texts and SPDX package license expressions now exist. This assessment establishes no usable package index for a complete cohort. | Stack release maintainers. Verify wheel contents and standard license metadata, clean install and offline vendoring from a proven index/mirror, immutable versions and checksums. Keep verified asset URLs/hashes meanwhile; no need to add an obsolete classifier just to duplicate valid license metadata. |
| R10: Python generator/check | **STALE_PLAN in the request; source implemented with packaging limits.** `python -m umf_codegen generate/check` and `umf-codegen` embed the original generator via pinned mini-racer; no external Bun/Node is required. This is a build tool with a native engine dependency, not a stdlib-only generator. | UMF codegen/release. Qualify wheel availability on the consumer's actual build platforms, complete-byte/refusal parity and CI drift checks. Generated output remains stdlib-only. Keep build dependencies out of plugin runtime requirements. |
| R11: Hohfeld alignment/date | **INCOMPLETE; coordinate separately.** The inspected local `hohfeld/umf.py` still requires0.7.0. A current generated client is not evidence of a current Hohfeld reader or native graph transport. | Hohfeld owner, with UMF conformance support (WS-8). No defensible date is available. Use current-core direct-table bindings for this table cut; keep any legacy Hohfeld schema as a distinct explicitly converted/qualified artifact. Never relabel0.10 as0.7. |

### Contract clarifications and pushback

- Keep one declaration/compiler path. Reuse the existing profile, generators,
  administrative ledger and typed operations; do not lift a second Praxis table
  reader/emitter into the SDK. Use its implementation as differential behavior
  input after source/licensing review. Preserve unsupported original metadata.
- Separate logical defaults from server expressions. Existing deployment supports
  typed literal, random UUID and transaction-time timestamp defaults. Arbitrary
  SQL expressions are not automatically supported by an expression string field.
  Expand a typed, versioned subset only for inspected examples and native tests.
- An old/new schema pair cannot recover backfill intent, seed order, concurrency
  decisions or original file formatting. Require explicit reviewed data/phase
  declarations and source snapshots. Guarantee byte stability for identical
  complete inputs/compiler versions. If old SQL files remain authoritative,
  retain and verify their original byte digests; never regenerate their history
  and silently bless new digests.
- Scope widening needs a visible permission delta and explicit digest-bound review.
  Existing all-plan approval is useful but does not replace a named widening
  diagnostic. Arbitrary destructive/type/key/FK transformations stay refused
  until their own qualified plan exists; approval is not a bypass for unsupported
  semantics. Backfills must declare scoped-table access and affected-row bounds.
- “No stored code” means no user-defined functions, triggers, procedures or logic
  views emitted by this profile; approved built-in expressions such as
  CURRENT_TIMESTAMP and native role checks still have their native meanings.
  The request's exclusion of data migration is read as excluding automatic
  execution: explicit seed/backfill *plans* remain required. Clarify this boundary
  with the consumer before offering an apply interface.
- FORCE RLS does not constrain superusers/BYPASSRLS or stop an owner altering its
  own policy. Keep administrative custody separate, verify effective role closure
  and never grant ordinary runtime users ownership/BYPASSRLS. Related policies
  must work through visible membership rows without privileged helper functions;
  cycles refuse. PostgreSQL's native integrity checks are not proof of the stronger
  shared-security non-disclosure profile. See [PostgreSQL18 RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).
- Concurrent index builds require a durable phase state machine, failed/invalid
  index inspection, explicit repair decisions and resume tests. They cannot be
  simulated by retrying the whole migration transaction. See [PostgreSQL18 CREATE INDEX](https://www.postgresql.org/docs/18/sql-createindex.html).

### Evidence used and limits

Read-only assessment; no new functional/native tests were run. Relevant retained
component evidence, each with its own immutable cohort and limitations:

- [P1 clients/packaging](../04-build/evidence/praxis-p1.md),
  [native sessions](../04-build/evidence/praxis-p1/session-native-postgresql.json),
  [Python generator](../04-build/evidence/praxis-p1/python-codegen.json).
- [Generated native modules](../04-build/evidence/praxis-p2/generated-modules/receipt.json),
  [durable outcomes](../04-build/evidence/praxis-p2/durable-outcomes/receipt.json),
  [finite temporal/scalar domains](../04-build/evidence/praxis-p2/scalar-domains/receipt.json).
- [Related native policies](../04-build/evidence/praxis-p2/related-policies/README.md),
  [mixed-direction paging/deletes](../04-build/evidence/praxis-p2/related-operations/receipt.json),
  [seeds/additive evolution](../04-build/evidence/praxis-p2/seed-migrations/receipt.json).

These are not one integrated release certificate. The seed/evolution packet
explicitly excludes required-column backfill/type/key/FK evolution and states
`published:false` and `fullPraxisAcceptance:false`. Earlier roadmap “missing”
statements below are the2026-10-18 baseline, not the current source inventory.

## Original baseline gap assessment and proposed fixes — 2026-10-18

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

The next horizon is the direct-table acceptance/release cut and its bounded
migration follow-on. Hohfeld graph work stays separately sequenced; it is not a
prerequisite for Praxis deleting its table emitter. Dates, individual assignees
and new version numbers are uncommitted. Role owners below are accountable
proposals; existing workstream aliases remain unchanged.

| Order | Outcome / owner | Workstream | Governing artifact / additional request | Depends on | Confidence / rationale | Exit evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Exact consumer baseline and acceptance mapping; UMF maintainer with Praxis host owner | WS-5, WS-6 | CONTRACT-079/081; R1–R4 | Pinned eleven tables/four migrations and platform lock | high for assessment; source access pending. Prevents solving a different cohort. | Every source field/default/check/index/FK/policy/data step maps or has a located refusal; confirm local-time versus instant and no-extension/apply revisions. Private source stays private; public evidence uses aggregate hashes only. |
| 2 | Reusable source-authoring/DDL gaps closed; UMF schema maintainer | WS-6 | CONTRACT-081; R1/R2/R4 | 1 | medium. Comments and exact default/type requirements must precede adoption. | Comments survive document round trips and native catalog inspection; identifiers/escaping include multibyte63/64-byte cases; deterministic SQL/client source authority and two-person/batch policy tests pass. Amend CONTRACT-081, relevant design and test plan before new payload/program fields. |
| 3 | Installed direct-table consumer scenario passes; UMF runtime and Weft maintainers | WS-5, WS-7 | FEAT-033, CONTRACT-079/081; R5–R7 | 1,2; exact candidate wheels | medium locally, low managed. Reuse implemented paths rather than rebuild. | Plain sync page/action and async parity; task owner/related membership, batch SELECT/INSERT with UPDATE/DELETE denied; typed NULL/binds, bounds/counts/upsert/replay, pool/cancellation controls. PostgreSQL18 and Lakebase receipts stay separate. |
| 4 | Required forward migration subset and administrative CLI pass; UMF lifecycle maintainer with Weft for typed data steps | WS-6, WS-7 | CONTRACT-081; R3 | 1,2; individual phase design | medium for additive work; low concurrent recovery. Original four migrations determine required breadth. | Library and CLI new/check/apply parity; immutable original/history digests; terminal snapshot equals current document; named unsafe/widening reasons; reviewed scoped backfill to NOT NULL and added checks/FKs where required. Nontransactional concurrency is a separate phase gate; failed-step/invalid-index recovery must pass before advertising it. No destructive fallback. |
| 5 | Consumable immutable wheel cohort and build tool; release maintainer | WS-9, WS-5 | FEAT-033, CONTRACT-079; R8–R10 | 3, required portions of4; verified publisher/index access | medium until index/platform proof. Packaging compatibility probes can start during1. | Frozen Praxis lock resolves; tested dependency ranges; actual generate/check CLI works without external Bun; wheel license/hash/source manifests; clean/offline install from demonstrated index/mirror on selected Python/platform matrix. New artifacts get new versions. |
| 6 | Praxis removes table machinery; Praxis host owner with stack maintainer | WS-6, WS-7, WS-9 | CONTRACT-081; R1–R10 | 1–5 or explicit consumer deferral of unsupported subset | medium after native/managed gates. Deletion is acceptance, not inferred upstream completion. | Eleven tables/four migrations checked; one complete plugin plus scheduled batch runs on vendored artifacts. Host retains provisioning, identity, audit, approvals and administrative invocation only; required unsupported features block deletion. |
| Separate graph cut | Current-core Hohfeld/real graph transports; Hohfeld, Truss and Ashlar owners | WS-8 | ADR-004, FEAT-033; R11 | Reader/transport and engine conformance | low; date uncommitted. Does not block direct-table adoption. | Current0.10 reader, native graph authorization/durability and explicit compatibility evidence; no version relabeling. |

Before starting each new implementation slice, extend the existing design/test
coverage only where the inspected examples expose missing semantics. No new
tracker, parallel emitter or wholesale artifact rewrite is required. This plan
contains no execution-time/token estimate: comparable usage and runtime metering
were not available for this assessment.

## Acceptance and release gates

Each cut records exact sources, schema/profile versions, driver/compiler/wheel hashes, Python/platform versions and failed/unsupported cases. Existing historical certificates retain their original scope after licensing header changes; do not relabel them as acceptance of new source.

- **Portable gate:** deterministic Bun/real-Chromium/Python generation, isolated Python 3.11+ import without third-party dependencies, complete-byte check mode, atomic writer failure recovery, and mypy/pyright/ty positive and negative cases without suppressions. Sync calls run in sync workers and async calls in a real loop; child processes establish fresh resources.
- **Schema gate:** authored/imported table metadata round-trips without losing unknown content; generated schema, client and deployment hashes agree. Compare native catalogs for every type/key/index/check/default/FK/policy/grant in the declared profile. A retained but unenforced assertion is never counted as native support.
- **Native PostgreSQL 18 gate:** two people and a distinct batch principal, two plugin schemas, owner/via rules for all commands, forged module/identity attempts, pool reuse/cancellation, identity verification, direct SQL bypass attempts, owner/BYPASSRLS controls, seed replay and failure. Test direct psycopg2, sync/async psycopg 3 and selected SQLAlchemy Core versions independently.
- **Paging/command gate:** duplicate sort values, composite keys, ASC/DESC, nulls, exact decimal/UUID/bits128 values, insert/delete between pages, invalid/foreign cursors, principal/policy/schema changes, counts versus visible rows, named-command argument/result typing and denied undeclared commands. Define live versus snapshot paging; stable ordering alone does not create a stable snapshot.
- **Mutation/migration gate:** native ON CONFLICT races and policy checks, no silent lost updates, atomic bulk failure, replay with same/different inputs, concurrent replay, lost response after commit, schema drift, edited migration digest, concurrent migrators, partial/nontransactional steps, cancellation, and recovery. Idempotency key scope includes the authenticated principal and command; replay authorization is rechecked without disclosing another person's receipt.
- **Graph gate:** unchanged application scenario over installed Truss and held Ashlar publication; original admission/journal/feed/ack evidence, policy revocation, schema evolution, stale publication refusal, bounded counts/paging and explicit read-only/publication-action distinction. Hohfeld core 0.10 reader has a shared conformance corpus and no mandatory DDD worldview.
- **Managed/consumer gate:** independently replay on the specified Lakebase/PostgreSQL 18 environment with its actual role-switch/pool restrictions. Vendor all wheels from the selected immutable source into a clean/offline Databricks App build; inspect License-Expression/License-File metadata and included texts. Run one Praxis plugin entirely through generated methods, including scheduled batch work; compare results and errors with independently authored expectations.

## Original open decisions and risks — 2026-10-18

The additional assessment and current sequence above supersede resolved source/toolchain unknowns in this baseline. Exact consumer inputs, frozen locks, managed acceptance and publication proof remain gates.

Named individual owners, publisher/index credentials, actual Praxis table modules/emitter source, its frozen platform dependency lock and a dedicated managed test environment were not supplied or validated. Assign them before committing dates. Choose supported psycopg2, psycopg 3 and SQLAlchemy version ranges based on installed tests; none is silently interchangeable. Select the Python codegen packaging strategy before promising a Bun-free entry point. Confirm command count semantics, supported check-expression grammar, seed mutation rules, via-path bounds and transactional versus publication operations in downstream contracts.

Local dependency versions and package source can differ from published release cohorts. Requalify after changes; do not overwrite existing wheel versions on an index. The new license grant applies to first-party code; external corpora/dependencies retain their notices and redistribution restrictions. A selected index URL must be demonstrated with an authenticated install or a public index fetch, never inferred from repository publication.

## Revision Triggers

Re-sequence on a native semantic counterexample, failed identity/policy isolation, new core/profile version, unavailable index/wheel platform, changed Praxis platform lock, or missing Truss/Ashlar authority/publication prerequisite. Retain workstream aliases and original evidence. New scope requires a visible roadmap/contract amendment; dates become commitments only in an owner-approved iteration plan.
