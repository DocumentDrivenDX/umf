---
ddx:
  id: umf.sdk-release-notes-0.5.6
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-081
      kind: informed_by
    - id: SD-007
      kind: informed_by
    - id: TD-085
      kind: informed_by
    - id: STP-085
      kind: informed_by
    - id: umf.plan.schema-migrations
      kind: informed_by
---

# UMF SDK 0.5.6 candidate

## Release Scope

This draft describes candidate SDK 0.5.6 for MIG-G02 typed per-row backfills.
Its selected components are `umf_access` 0.1.0.dev8, `umf_codegen` 0.1.0a5,
Weft 0.4.53 and the unchanged semantic-core 0.10.0 distribution. Independent
review passed for the recorded candidate008 compiler and candidate009 Access
replacement bytes on local PostgreSQL 18.6/macOS arm64. This candidate is not a
published release. Weft 0.4.53 has been published at merge commit
`726a840e956e25217d6aeea2674fdfcf3f342a24` and independently verified from
fresh downloads. Final UMF current-head CI, cohort integration, merge/tag and
fresh verification of the selected published UMF artifacts remain.

## Changes and Ownership

The closed `umf.table-operation/0.2` declaration supports same-row Field reads,
finite literals, coalesce, strict text concatenation, exact numeric +/−/×,
and conditional expressions with literal-only predicates. UMF validates model
meaning and compiles source-bound migration plans. Weft's shared Rust core
validates the operation and its PostgreSQL backend lowers the expression and
private exact-assignment guard. The host retains connections, identity,
approval, locks, effects and recovery authority.

Migration options and plans 0.4 select one bounded derived fill. An existing
target fill updates only NULL values and retains present values. It preserves
target identity, type, default and facets, with only the reviewed nullability
change. An existing optional Field can become required through a reviewed
atomic fill/tighten pair. A newly appended required Field uses one atomic
add/check/fill/default/tighten phase. Any future default is installed after the
historical fill. Both supported shapes are standalone and reject unrelated
compound source changes. A matched NULL result, nonfinite numeric input, or
lossy assignment aborts the entire phase. Native constraint and overflow errors
retain their SQLSTATE while row details are excluded from public host errors.

Administrative 0.2 operations are excluded from generated application methods;
ordinary 0.1 operations remain available. Historical profiles retain their
semantics. The additive Rust UMF migration path remains scoped to profiles
0.1/0.2; it does not implement profiles 0.3/0.4. G01's existing-field fill/tighten
behavior retains its separate qualification and regression coverage.

## Migration and Recovery

Retain both exact sources and review the compiled plan against the installed
predecessor. Existing input Fields must preserve logical, native, facet and
mapping meaning. Record host approval independently of the authored plan.
Keep generated clients fenced until final publication. After an uncertain
commit response, observe authenticated progress before resuming; a committed
fill must never be dispatched again. Committed data changes require a separately
reviewed forward repair or an independently retained backup.

## Qualification and Limits

Independent review passed for candidates 008 and 009 as recorded. Candidate008
uses Weft compiler source `7413c19d16ca5d8d8ce60b62d49ca0a3250544df`, UMF
input checkpoint `fa722648c8a70044a31420b32c3979253493dbe5`, and Weft metadata
head `5d196ea3184b1a711bb4bcf91215a496c18ce9b2`. It passed 37 native host
cases, 87 recovery assertions, 19 no-default append assertions, 37 literal
admission/bind cases, 47 real Chromium native/WASM parity cases, 139 installed
SDK cases and 37 exact Python/native plan checks.

Candidate009 replaces Access with source
`63f1f50d4cbfad5949e382fce2d5fcbacfd611e0`. Its wheel SHA-256 is
`e5f68b12375e9181db531fdb2e49eca9e2ba61498a0cd2ebc0defc38efe99faf`; its sdist
SHA-256 is `f9fbcdb04df144cc558b03d98a0fca5862510aa65611bb8dbde82f85e2e326da`.
It retains the reviewed codegen007, SDK007, Weft008 and semantic-core 0.10.0
bytes. The fresh 18-distribution runtime passed 9 installed Access controls, one
native unique-privacy case, two guard/rollback cases, three recovery scenarios
with 87 assertions, and 19 no-default append assertions. The independent runtime
wheel-custody record verifies all 18 selected wheel hashes and 584 installed
payload members against the source wheels.

Both candidate reviews cover their recorded bytes on local PostgreSQL
18.6/macOS arm64. These suites overlap; their counts are not additive.

Final UMF current-head CI, selected cohort integration, and UMF
release/source/native/asset and license-custody approval remain open. UMF
merge/tag and fresh verification of selected published UMF artifacts also
remain. Weft dependency publication is complete and independently verified.
The local evidence does not establish hosted Linux native execution, managed
database acceptance, additional platforms or private consumer adoption.

The selected subset is a fenced maintenance migration on one existing table
and one target, with exact retained JSON predecessor and successor sources and
at most 10,000 selected rows. Non-JSON sources refuse during profile 0.4 plan
admission. Expression depth is at most
16, node count 256, fanout 32 and literal payload 1 MiB; exact numeric inference
is bounded to 1,000 digits at every node. Each decoded UTF-8 literal payload is
limited to 1 MiB. Decimal input storage requires finite `numeric(p,s)` with
nonnegative scale no greater than precision; unbounded
numeric storage is outside this profile. Hosts also impose statement and lock
timeouts. The public result-frame limit does not bound PostgreSQL's private
expression memory.

Arbitrary SQL, callbacks, joins, casts, floating arithmetic and ambient state
are outside this profile. Inputs cannot include the target, newly appended
siblings, generated values or uninterpreted selected meaning. Appended domain
CHECKs must permit NULL staging. Adding keys, foreign keys or cross-column
constraints alongside an appended derived target is outside this profile.
Existing unchanged native constraints remain effective. Appending a required
Field without a declared default is supported only when retained successor
create commands already provide that Field. G02 does not rewrite retained
commands; a create that omits the required target is refused with
`TABLES_OPERATION_REQUIRED`. A command-free predecessor and successor retaining
only the selected migration command is covered separately.

| Residual | Separate scope remaining after G02 |
| --- | --- |
| MIG-G03 | General changes to existing-column future defaults. |
| MIG-G04 | Narrowing, cross-family casts and shadow rewrites. |
| MIG-G05 | Retained-value retirement windows and reversible deletion. |
| MIG-G06 | Online chunked backfills with concurrent application writes. |
| MIG-G07 | Cross-document and coordinated multi-store migrations. |
| MIG-G08 | Genuine migration qualification for Truss, Ashlar and other backends. |
| MIG-G09 | Actual managed consumer acceptance on an authorized isolated target; local PostgreSQL evidence is insufficient. |
| MIG-G10 | Initial publication and table-inventory changes in the phased successor profiles. |
| MIG-G11 | Combined drop/append replacement of columns in one existing-table migration. |

No Praxis code or managed target is changed by this release.

## References

- [G02 design and ownership](../02-design/solution-designs/SD-007-schema-migrations.md)
- [Selected declaration and execution contract](../02-design/contracts/CONTRACT-081-table-lifecycle.md)
- [Acceptance plan](../03-test/test-plans/STP-085-typed-actions-on-raw-tables.md)
- [Candidate008 independent review](../04-build/evidence/mig-g02/independent-review/candidate-008-review.json) and [evidence archive](../04-build/evidence/mig-g02/independent-review/candidate-008-independent-evidence.tar.gz)
- [Candidate009 independent review](../04-build/evidence/mig-g02/independent-review/candidate-009-review.json) and [evidence archive](../04-build/evidence/mig-g02/independent-review/candidate-009-independent-evidence.tar.gz)
- [Candidate009 runtime wheel custody](../04-build/evidence/mig-g02/independent-review/candidate-009-runtime-wheel-custody.json) (SHA-256 `82aafc27925909db73c9af46ab97aab881ec7666984aeb800e36ecc144b86080`)
- [Independent native replay fixture and custody record](../04-build/evidence/mig-g02/independent-review/independent-native-replay-fixture-custody.json)
- [Weft 0.4.53 browser and packaging evidence](../04-build/evidence/mig-g02/weft-wasm-008/README.md)
- [Published Weft 0.4.53](https://github.com/DocumentDrivenDX/weft/releases/tag/v0.4.53) and [permanent dependency publication evidence](../04-build/evidence/mig-g02/weft-publication-0.4.53/README.md)
- [Implementation checkpoints and evidence](../04-build/evidence/mig-g02/continuation.json)
