---
ddx:
  id: umf.plan.core-successor-bounded-transport
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - {id: umf.plan.release-0-10-9, kind: informed_by}
    - {id: ADR-006, kind: informed_by}
    - {id: CONTRACT-080, kind: informed_by}
    - {id: CONTRACT-081, kind: informed_by}
    - {id: TP-001, kind: informed_by}
---

# Prospective bounded multipart qualification transport

## Scope and authority

Source preparation only under Sol's `SOL-MULTIPART-TRANSPORT-SOURCE-PREPARATION-SCOPE.json`
SHA256 `d8ca818cfa601cc6a0a47641c0012bfd6c0edcb4375d922fe443afe762b40798`.
The size inventory SHA256 `4de6ead22300b2506b34269bff605842c674a593d991e92c8d958dd81032a16f`
is metadata evidence, not an allowance or future C artifact identity. Its
70,727-file / 4,906,549,698-byte regular-file observation does not allocate any
budget below. The three-holds source review (`f15e85e0…`, decision `c7901f…`)
and all original 76 pure controls remain historical/source preparation evidence.

The governing release plan, ADR-006, source release authority and coupled roster
still require complete source, both platform CLI/SDK/Core deliveries, the common
sdist/Codegen pair, manifests, pins and checksums. This transport does not select
C, revise another owner's 0.10.9 reservation, publish, allocate a size profile,
relax native member/CLI/wheel parsers, or change any semantic acceptance gate.
No archive production, native execution, installation, registration or dispatch
is authorized by this document. No runtime saving or artifact fit is claimed.

## Distinct profiles and immutable logical identity

The existing `umf.core-successor.candidate/2`, single-envelope intake and
`umf.core-successor.retention/1` retain their 67,108,864-byte refusals. New
`umf.core-successor.candidate-multipart/1` requires a closed signed transport
plan (`umf.core-successor.multipart/1`). Received original parts require
`umf.core-successor.multipart-material/1`. The main registry remains EMPTY and
workflow admission remains default false. Unknown versions, source/controller
pairs and profiles refuse before producer work.

An object binds its original name, every role, mode, whole length and SHA256.
Its ordered parts bind ordinal, contiguous offset, length and SHA256. Offset
splits may cross a leaf, UTF8 sequence, TAR header/PAX record or GZIP block; the
logical bytes are never rewritten or validated by a hash alone. Missing,
reordered, duplicate, overlapping, mixed-origin and extra parts refuse. Explicit
multiple role membership may share one physical object, while role-byte totals
remain separate from physical logical bytes. No silent role omission is allowed.

Original material binds each actual run/job/attempt, source, controller,
platform, registered workflow, exact upload-step interval, artifact ID and ZIP
digest, complete member roster and compressed/expanded lengths. Part upload
names have a distinct `-part-NNN` suffix; the proof artifact uses `-proof`.
Those are transport identities, never product versions or qualification seals.
Old ZIPs are not re-uploaded, projected or relabelled by this preparation.

## Finite support and signed byte model

These are implementation support limits, not default C admissions:

| Dimension | Maximum / derivation |
|---|---|
| Original envelope compressed AND expanded | 64 MiB each, independently checked at intake |
| Payload per part | 60 MiB; remaining headroom does not substitute for actual ZIP checks |
| Physical objects / total parts | 128 / 128; each nonempty object consumes at least one slot |
| Logical bytes | actual sum of signed object lengths, bounded by 128 × 64 MiB support ceiling |
| Role bytes | exact sum of object length × explicit role multiplicity; separate from physical bytes |
| Metadata | closed manifest, 64 MiB maximum; each multipart API JSON response at most 1 MiB |
| Control reservations | at least `(3 × partCount + 4) × 1 MiB`, explicitly signed; actual received bytes recorded separately |
| Proof | separately signed 4 KiB–64 MiB, original full-retention roster required for reuse |
| Source | at most 100,000 Git leaves, 4,096-byte names, 64 KiB PAX bodies; streamed leaf bytes |
| Streaming buffers | at most 1 MiB per read/hash/copy operation |
| Time | explicit admission, at most existing 5,400 seconds; no extra worker or matrix |

The plan requires `logical_bytes = Σ object.bytes`,
`role_bytes = Σ object.bytes × roleCount`, and payload expanded bytes plus the
separate proof reserve. Transport intake binds the exact actual sum of all ZIP
lengths, proof ZIP length and expanded payload/proof lengths. Each download,
extraction and reassembly reserves its respective budget before writing.
Workspace must cover at least three logical copies, all simultaneous original
transport ZIPs, proof, control and separately signed external-workspace reserves; equal hashes do not discount separate
paths. Actual owned output includes parts, reassembly, raw/repaired/rebuilt
wheels, SDK intermediates and logs. It is checked before and during child work
and before packing. The source checkout and existing Cargo/Rustup/UV/Bun cache roots are included
in pre-command and during-command usage checks; source leaf bytes also require
an explicit external reserve. Cache accounting is read-only, with no cleanup
authority over those roots. Final C admission must bind measured external
reserves and exact disk/time facts; this is not a whole-host filesystem claim.
No budget is populated from the earlier roughly-5GB observation.

A final admission must supply measured object/part identities and explicit finite
budgets; current implementation support does not make current or future material
eligible. Independent parser/installed-member/CLI size profiles remain unchanged
and can still refuse otherwise authentic multipart inputs.

## Complete source correspondence

New producers retain byte-identical complete Git TAR.GZ output. The compressed
object SHA256/length, decoded raw TAR SHA256/length, and regular-member byte total
are different named fields. Source TAR/PAX parsing is streamed with bounded
headers, names, counters and reads. The source comment must match the actual Git
commit; all original Git blob IDs, modes, executable bits and safe symlink targets
must match. Unknown types, escaping links, duplicate/missing paths, malformed
PAX, truncated records and nonzero trailing data refuse. The inspector169 subset
cannot replace the full Git roster. Received source is also streamed across the
original part files and compared with the actual source checkout before reuse.

## Retention, continuation and cleanup

One selected platform job retains a bounded proof plus up to128 independently
bounded part artifacts using the existing upload action. Fixed guarded slots do
not create a matrix, second producer or uploads for absent slots. Legacy upload
compression/name remains unchanged when multipart is not selected. New part
uploads use stored payloads; actual Actions ZIP size/digest and upload provenance
must still be authenticated by subsequent readback before reuse. Local completion
explicitly says `uploadReadbackAuthenticated=false` and `qualified=false`.

Complete original objects move intact into owned custody only after part hashes
are sealed. Indexes retain original/current namespaces separately. Any missing or
changed object produces partial/fullRetention=false, never completed material.
Proof omission forbids complete multipart reuse. If sealing itself fails, the
existing bounded failure/quarantine mechanism retains a refusal/omission index;
no automatic retry or disguised legacy success follows. Existing owned cleanup
remains explicit and retained; shared-owner state is untouched.

Publication can only reconstruct identical logical assets after separate exact
release authority. Parts are not permission to change asset names or remove any
required source/binary/SDK/manifest from the coupled roster.

## Source verification and next gate

Only stdlib synthetic transport/orchestration tests run here: unchanged original
76 plus new boundary controls. They check actual byte reassembly, TAR/GZIP/UTF8
splits, hashes and source correspondence, exact provenance, bounds, first refusal,
partial retention, finite static upload selection and empty-registry refusal.
They are not native, actual full-source, platform or publication qualification.
The original early18/later31, fresh installed51, Saga and complete release gates
remain mandatory; protected semantic controls are not adapted by this work.

Freeze the six scoped paths, original76 AST-preservation map, schema/profile and
support model, exact diff and pure logs for Sol source review. Integration,
commit/push, workflow registration, C allocation/enrollment and all execution stay
outside this preparation. Actual GitHub multipart readback, external disk/cache
budget reconciliation and exact production input admissions are future gates.


## Two-hold source correction: profile isolation and one deadline

Sol review `SOL-MULTIPART-TWO-HOLD-SOURCE-REVIEW.json`, SHA256
`7c72c833c210fbba854edf1312808df0e027e9b08304105f9493d98d0d5d712f`,
confirmed two defects in the initial prospective source. The retained RED tests
show actual old acceptance of `envelope` on legacy common/continuation records
and actual success after a fake-clock mid-read deadline crossing. Those failures
remain immutable evidence; source preparation was not execution qualification.

The material parser defaults to the original closed fields. Multipart envelope
and whole-material records can only be reached through the distinct multipart
admission context; legacy common, continuation and aggregate inputs reject them.
New-profile parsing checks the additional closed field directly, without removing
an extension to turn a legacy record into accepted input. No legacy byte ceiling,
closed schema or recorded oversized/refused object is reinterpreted.

One monotonic origin and the minimum of the original admission/transport seconds
are persisted once for this operation. Later run, tokenless inspect and seal
phases restore that origin; no part, helper or finalizer gets a renewed interval.
The bound travels through metadata requests, original downloads, file reads,
GZIP/TAR parsing, hashing, copies, reassembly, sealing, inventory and final success.
Checkpoints run before and after blocking reads/writes and at chunk/phase/loop
boundaries. Network open/read timeouts and child work use the remaining span,
never a fresh full duration. Expired reads cannot be written or published as
completed data; even EOF/close/final-hash expiry prevents successful completion.
These are outer controller wall-clock checks, not changes to Core1M callbacks,
constructor inputs, native fees, counters or independent public call lifetimes.

Failure/cleanup has a distinct disposition after operation expiry. It does not
walk or hash multiGiB payloads to manufacture a completed retention receipt.
A single owned namespace rename preserves unretained bytes for existing cleanup,
while a <=4096-byte diagnostic states refusal, fullRetention/qualified=false and
explicitly unobserved payload counts/hashes. That bounded diagnostic is neither
a multipart completion nor a legacy input admission. Original cleanup authority
and required failure aggregation are unchanged; no retry or extra work allowance
is granted by diagnostic retention.

All original76 pure method bodies remain unchanged. Additional deterministic
fake-clock controls use tiny private fixtures: no sleeps, native work, actual
network, large archives, version registration or integration. Final exact source
pins and RED/GREEN logs live in the separate correction packet for Sol review.

## Closed initial Inspector material intake

The optional `initialInspector` field is a distinct, closed source reference for
the original Linux/Python 3.11 Inspector run. Its source/controller, workflow
path and ID, run/attempt/job, ref, artifact name, complete member pins, raw
0.10.10 wheel identity, census and candidate-resource fixture are checked
against source and original GitHub run/job/artifact metadata. It does not alter
the existing `continuation` material authority. When absent, the existing
candidate and continuation paths remain unchanged. A present initial intake is
processed under the same monotonic controller deadline as source checking and
subsequent candidate work.

The original producer schemas remain authoritative for the producer, source
archive, cost/measurement, public controls, compiled/executed Rust census,
Python groups, Saga19, lifecycle2, installed identity, wheel members and
`RECORD`. Intake rejects missing or extra files, mismatched source/current
input identities, failed or skipped gates, and incomplete raw-log/JUnit
companions. Only the authenticated original raw Core wheel may replace the
redundant Linux raw-Core wheel build; the source archive, Codegen outputs,
independent sdist rebuild, repaired-wheel proof and standalone CLI generation
remain separate obligations. The embedded CLI is never promoted to standalone
output.

Run `42724153895` is retained as a failed original Inspector run. Its strict
1,000,000-work gate attempted 1,000,014 units, returned 999,971, and stopped
before public controls and heavy semantic stages. Its wheel bytes are real
retained producer output, but the failed workflow conclusion and cost report
make it ineligible for initial intake. The registry remains empty and workflow
dispatch remains default-off; this source change does not claim a qualified
0.10.10 component or grant native admission.

## First-production observation and unchanged continuation

The existing default-off multipart candidate can now use the separate `observe`
operation for a Linux 0.10.10 first producer only. Its closed observation
configuration supplies fixed role slots, file modes, per-object maximums, a
complete source identity and finite byte, workspace, proof, part and time
budgets. It supplies no guessed object digest, length or part list. The
controller still authenticates the registered immutable P admission, frozen Q
controller, source checkout and original Inspector input before work begins.

Observation executes the existing job-setup, source, common, wheel, SDK and
independent rebuild bodies in their original order and on the one persisted
monotonic deadline. It reuses the authenticated initial raw wheel; it does not
run a second Linux raw-wheel producer. SDK and rebuild receipts retain their
original stage meanings. Consumers, inspection, final identity, aggregate and
finish do not run. The component remains `producer-observed` after all six
stages, or `failed` at the first refusal. A failed attempt may retain only
objects actually present and a complete authenticated source object; absent
roles are omitted from that partial transport plan and cannot become a
successful continuation.

After production, the controller measures each present fixed-path object and
derives exact whole-object hashes and ordered parts under the original
multipart reader's limits. Seal reauthenticates P/Q/source, recomputes those
identities, and compares the local plan before invoking the existing multipart
sealer. The resulting transport artifact remains explicitly unqualified and
its independent GitHub artifact/member readback is still required. Only a
separate normal registry-pinned continuation may import authenticated completed
producer stages, rerun job setup, execute the unchanged consumers, inspection
and final identity, and satisfy the existing full aggregate. No observation
receipt or registry pin alone proves a passed component, and no 0.10.10 native
or SDK qualification is claimed here.

Pure controls cover the closed observe configuration and operation boundary,
the exact six-stage stop and first failure, a synthetic committed source plus
source-shaped role outputs through the real plan derivation and existing
multipart seal/readback validators, and a failed partial-source plan. These
fixtures exercise source/controller logic only; they are not an actual
producer run, GitHub readback, Linux-hosted execution or native SDK result.
