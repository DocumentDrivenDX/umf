---
ddx:
  id: umf.evidence.rust-migration.r8-python-logical-render-v02-interface
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.implementation-plan
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-runtime-dependency-audit
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-captured-logical-render-rust
      kind: extends
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# R8 Python logical renderer v0.2 interface decision

Status: proposed opt-in interface; not a default-route qualification.

## Ownership and boundary

`umf_access.dsl.render.render_logical` is build-time logical Weft rendering. Its output is a canonical pre-Weft request string. It does not perform database I/O or native SQL lowering: Weft owns backend acceptance, execution artifacts, decoding, and carriers. Python remains responsible for declaration capture, database I/O, and Python protocol ergonomics. The Rust implementation consumes captured DTO data only and must not infer missing authored identity or invoke Weft.

## Profile coexistence

The existing `umf-access-logical-render/0.1.0` profile remains unchanged as the narrow opt-in direct/equality-filter/limit route. The expanded renderer is a separate `umf-access-logical-render/0.2.0` profile in `crates/umf-core/src/access_logical_render_full.rs`. Profile selection is explicit in the request envelope (`binding`, `ownerBound`, `profile`, `variant`); v0.2 does not silently widen v0.1 behavior. The implementation is currently Rust-local and is not exposed by a Python/PyO3 entry point.

## DTO and resources

The DTO is the existing tagged `CapturedVariant` graph, including its tagged node and expression values, plus optional generated binding data and `ownerBound`. The Rust route validates tagged object shapes and uses the shared `Context` admission/work/text accounting. The Python bridge's `_encode_capture` independently imposes 50,000 nodes, depth 64, and 8 MiB encoded UTF-8. The predecessor `render_logical` has no corresponding bridge-walk refusal. Therefore these limits are not yet established as predecessor-equivalent and cannot justify replacing the Python default; direct predecessor calls at those boundaries remain required evidence.

## Default-switch criterion

Keep Python as the default until differential tests establish exact output and error code/message/order for the accepted predecessor domain, including resource boundaries, and the Rust route covers every logical decision used by `render_related_logical`. Any narrower refusal domain requires a separately reviewed contract/version decision before a default switch. Existing differential evidence is limited to frozen direct and equality-filter outputs. The focused command `cargo test -p umf-core access_logical_render --lib --offline --locked` passed 8 tests (4 v0.1 and 4 v0.2) using isolated target `/private/tmp/umf-render-target`. Rust-authored DTO tests do not establish broad predecessor parity, installed-package behavior, or Weft/backend qualification.

## Known unqualified areas

The current v0.2 implementation attempts scalar forms for fields, parameters, null, boolean, string, integer, decimal, exact aggregates, and bucket width. It attempts predicates for boolean composition, comparisons, null/missing tests, membership, between, prefix/match terms, and direct/inverse related-existence. Steps include filters, having, select/into, grouping, ordering, limits, declared joins, snapshot, and include-keys. Terminals include all/first/one/exists/page/count/group-count/get and update. This is an implementation inventory, not a parity claim.

Unqualified areas include valid multi-join binding/alias combinations, update assignment success and refusal precedence, include-keys variants, grouped projections/having/order/group limits beyond the one test vector, related navigation, Decimal exponent/precision edge cases, malformed DTO error precedence, and the 50k/depth-64/8 MiB resource boundaries. Related navigation still has Python orchestration and must delegate both source and target logical rendering to Rust before any claim that all shared logical-render decisions are Rust-owned. Do not treat this note as approval to switch the default.
