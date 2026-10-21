# Table lifecycle completion candidate — 2026-10-21

This unpublished successor implements the bounded LC-01–06 source work in the
[build continuation](../../praxis-p1-plan.md#authorized-lifecycle-gap-completion--2026-10-21).
The [revision2 roadmap](../../../01-frame/praxis-lifecycle-roadmap.md#next-release-requirements--praxis-revision2-2026-10-21)
separately maps the updated U1–U9 requirements. Passing this component is not
completion of the U1–U3 adoption gate or permission to delete Praxis machinery.

## Implemented boundary

- UMF emits deterministic table/column comments from core descriptions, including
  explicit clearing on migration. Description-bearing deployments use bundle0.2;
  legacy0.1 verifier recovery remains exact and comment-free. Core meanings and
  schema/profile versions are not relabeled.
- Source-bound migration options permit an explicitly acknowledged administrative
  backfill of an appended column through an original bounded parameter-free typed
  UPDATE. Weft owns SQL and literal lowering. Native host execution temporarily
  disables RLS only on that protected table within the approved migration
  savepoint; any failure restores data, schema and RLS. Server defaults and
  NOT NULL install after backfill. Appended authored checks/FKs validate directly.
- Index-only concurrent migrations have forbidden-transaction steps, exact prefix
  source proofs, source-witness identity checks, explicit failed-index repair and
  final immutable ledger publication. Person/batch SELECT on the fixed head view
  remains durably revoked after interruption; final head restoration and ledger
  advancement commit together. Native session/commit failures preserve an
  observe-history requirement. No automatic index repair or write retry exists.
- `umf-table new/check/apply` is explicit administrative tooling. New refuses
  overwrite; offline checks verify complete source, ordered history, terminal
  snapshot and optional trusted file manifests. Applied file digests bind ledger
  entries without rewriting older canonical-only history. Exact plan approval
  remains independent of compilation's `nativeQualified:false`.
- `typing-extensions>=4.16,<5` replaces the exact pin. Pydantic remains
  `>=2.13,<3`; generated Python remains stdlib-only. Original compiler verification
  still needs mini-racer in the administrative environment.
- Four fabricated legal-pack tables and three source generations retain complete
  original metadata and explicit projection decisions. Matter membership,
  protected roster/billing reads and limited batch commands exercise native RLS.
  This is not a complete ethical-wall/shared-security implementation.

## Verification

[Receipt](receipt.json) pins all changed executable sources, fixtures, original
mini-racer wheel and exact scope/limits. [Wheel evidence](wheels.json) verifies
source/embedded-asset correspondence and dual-license payloads. Local staging
wheel labels are not public release identifiers and must not be republished over
existing versions.

| Gate | Result |
| --- | --- |
| Focused Bun deployment/migration/domain suites | 31 tests,179 assertions pass; [log](focused.log) |
| Existing boundary negative controls | 24 tests,174 assertions pass; codegen's3 negative-control test methods pass |
| TypeScript, public browser build, extension package audit | Pass; [typecheck](typecheck.log), [build](build.log), [extension audit](extension-audit.log) |
| Python/portable ownership checks | Pass; [native boundary log](boundaries.log), [portable log](unified-boundaries.log), [codegen log](codegen-boundaries.log) |
| Actual Chromium153 local loopback | 83 assertions; Bun/browser complete legal migration results and generated files match, with no external requests; [receipt](browser.json) |
| Final installed CPython3.11.17, Weft0.4.49, Psycopg3.2.13, Pydantic2.14.1 | 28 PostgreSQL18 checks pass; [native receipt](native.json) |
| Installed codegen mini-racer0.14.1 | 30 complete generation/refusal cases, writer faults and integrity controls pass with external JS/network forbidden; [receipt](installed-generator.json) |
| Pydantic2.13.5, typing-extensions4.16.0, final runtime/codegen wheel install | Four actual offline CLI tests and seven existing session-double tests pass; not a second final-wheel native matrix cell |
| Installed CLI | Three-generation offline check passes; [receipt](cli-check.json); unapproved apply refuses before connection |
| Static local mirror | All four stack packages resolve/install offline with no-deps; [manifest](mirror.json). Transitive dependencies subsequently install from the pre-existing resolver cache, not from a complete standalone mirror |
| Ruff / diff whitespace / scoped review | Pass; no remaining blocker within this bounded component |

The final wheel-only native run covers membership isolation, generated sync page,
typed mutation count and durable replay, balanced leases, membership-forgery
refusal, applied-file edit refusal, over-bound backfill rollback, required-column
and added-check/FK correspondence, transactional/concurrent runner separation,
unique-index failure, explicit invalid-index repair, durable head fencing,
ledger replay, batch UPDATE denial and comment drift. The fixture cleans up its
isolated native schemas/roles. Weft0.4.48 passed an earlier development cohort;
only0.4.49 is the final installed receipt's compiler.

## Review and open gates

Review corrected three material issues before qualification: source SQL fragments
are no longer parsed to remove NOT NULL/defaults (quoted identifiers may contain
those words); new comment emission uses a versioned bundle with legacy recovery;
and interrupted nontransactional steps durably fence lifecycle clients rather
than leaving their old references usable. Cleanup/publication uncertainty requires
history observation. Full native CLI apply success was not separately exercised;
the native library apply and installed offline CLI/refusal paths were exercised.

The current native administrative data/compiler binding accepts JSON sources;
YAML may be preserved/inspected but is not promoted to native backfill support.
Backfills support only explicit appended NULL-column UPDATEs with literal or
transaction-clock assignments and source-declared bounds. Concurrent plans are
index-only. U1 mixed phases and NOT VALID/VALIDATE, U2 reviewed existing-object
changes, U3 row_scope authoring conversion, U5 generic host applier/approval
records, U6 untrusted SQL containment, broader U7 platform cells, complete U8
mirror/public publication and U9 Hohfeld0.10 remain next-release gates. Private
Praxis tables/workload and managed Lakebase acceptance remain unverified. No
complete repository regression or released support is claimed.
