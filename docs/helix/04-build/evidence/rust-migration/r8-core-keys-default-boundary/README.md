---
ddx:
  id: umf.evidence.rust-migration.r8-core-keys-default-boundary
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-keys-default-route
      kind: references
    - id: umf.evidence.rust-migration.r5-core-key-tuple
      kind: references
---

# R8 Core Keys default-route admission packet

## Recommendation

The next bounded executable default family after the Core Relationships
operations is the four Core Keys operations already selected by the V4 Node and
browser roots: `inspectCoreKeys`, `lookupCoreKey`, `declareCoreRecordMembers`,
and `declareCoreKey`. This is four unique logical declarations, or eight
route-specific root rows across Node and browser. The R8 ledger maps these to
Rust ownership, but currently marks their binding routes unproven and leaves
all four within the 922 logical retirement gaps. `verifyCoreKeyOperation`
stays on TypeScript and is explicitly outside this family.

The source family is `src/access/rust-keys-default.ts`; the Rust semantic owner
is `crates/umf-core/src/core_keys.rs`, dispatched via
`crates/umf-core-wire/src/lib.rs` and the Node/WASM core-keys wrappers. The
public selection points are `src/index-node-v4.ts` and
`src/index-browser-v4.ts`. The frozen TypeScript baseline and prior host
admission findings are in
[`r5-core-keys-default-route`](../r5-core-keys-default-route/README.md), with
the core algorithm baseline in [`r5-core-keys`](../r5-core-keys/README.md).

## Why this is the next coherent slice

The family has one explicit governing profile in CONTRACT-040 and one
predecessor packet for the four exported operations. Inspection and lookup are
read-only queries over explicit Record/stable-Key identities. The two
declarations update membership or one key atomically while retaining source,
request, unknown qualifiers and operation receipts. The frozen baseline covers
raw host admission order, error names, result prototypes and a 700,000-unit
retained-value control. It is materially more coherent than selecting a
cross-adapter group from names alone.

This is a recommendation to finish bounded route qualification, not to claim
that key metadata proves native uniqueness, author provenance, or enforcement.
CONTRACT-040's semantic and native boundaries remain in force.

## Admission blockers and exact next work

No production or generated files were changed for this packet. The V4 root
entries and adjacent generated mirrors are under concurrent source generation,
and the Core Keys access facade is under provenance review. Do not patch those
surfaces until their owner releases them. The existing frozen TypeScript
packet is a historical capture: its recorded source closure differs from the
current generated core model/validator and core schema/domain-policy resources.
Therefore, do not treat its old hashes or any earlier private package as a
current fixed-point route receipt.

After the active edits settle:

1. Regenerate the Core Keys predecessor packet from
   `scripts/rust-migration/r5/freeze-core-keys-default.ts` and verify all local
   source pins. Confirm the four casesets preserve error/reflection order,
   prototypes, resource controls, and copy isolation in both modes.
2. Inspect the current access facade operand order. In particular, baseline
   inspection admits source before identity, while lookup/declaration admit
   identity or request before source. Do not replace these with eager generic
   wire admission. Re-run the frozen raw-host getter/proxy controls and retain
   the existing 700,000-unit control.
3. Build one fixed-point private SDK archive from the settled source closure.
   Replay the same packet against installed Node, Bun and real Chromium package
   roots. Record exact outcome, error name/message, reflection trace, object
   prototype, and resource-control results. Verify archive/member/source
   closure hashes before accepting any receipt.
4. Keep `verifyCoreKeyOperation` on TypeScript. Its predecessor requires
   malformed-receipt refusal before touching `current`, while the current
   generic wire route admits both values before Rust; the staged binder also
   repeats verification. This is a distinct staged-handle design problem, not
   a gap to hide inside the four-operation slice.
5. Recapture the condition-aware inventory and ledger after authorized route
   changes. Only a subsequent retirement review can change the 922 logical
   gap count; source selection and a private archive alone do not retire rows.

## Installed archive replay — 2026-10-25

The refreshed Core Keys baseline is persisted as
[`refreshed-predecessor-20261025.json`](refreshed-predecessor-20261025.json),
SHA-256
`503d47318c8bb5f31bca1839393e3ff14e88599abb14d5d7b7354276e70b4e74`. It was
generated from 25 source pins without overwriting the historical predecessor
packet, which is itself part of the archive's captured source closure. The
historical packet has five generated-input hashes that differ from the
archive's current source. All other 24 packet pins match the archive closure.
The remaining pin, `tests/helpers/uuid-fixtures.ts`, has the same SHA-256 in
the historical and refreshed packets, but is absent from the archive's 3,431
captured inputs. It supplies the test fixture only; this receipt does not claim
that fixture as archive-captured source. The checked-in historical packet and
the archive closure were left untouched.

The same focused 14-case packet passed from the private archive in Node
26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12. The host checks preserve
the frozen source/request admission order and getter counts, compare exact
outcomes against the captured TypeScript predecessor, check result prototypes
and recursive property order, and exercise source/target copy isolation plus
the 700,000-unit retained unknown-value control. Chromium ran with `process`
and `Buffer` absent and made no external requests. The archived `verifyCoreKeyOperation`
behavior was exercised as characterization only; no default route is claimed
for it.

Archive SHA-256 is
`591e5e5e3e919d2a613ed90f31dd1faf50e158f2666d6c613e21b3dc35d41711`; all
1,787 member hashes plus the separately hashed package manifest matched the
archive's member bytes. The manifest records a fixed-point closure of
`65a6458ad8950da0669fa713d736d1b81e576793d0f6c12896ccf59027ed941d`, and all
3,431 live inputs match the current worktree. Detailed per-host results and
limits are recorded in
[`installed-archive-20261025.json`](installed-archive-20261025.json).

The 700,000-unit check is a retained-value boundary, not a `maxWork`,
cancellation, or general resource-limit result. The archive is a private
macOS arm64 qualification artifact, not a release. All four Core Keys
declarations remain logical retirement gaps pending review; this replay does
not change the R8 ledger.

## Candidate inventory and evidence scope

| Operation | Rust wire operation | Current status |
|---|---|---|
| `inspectCoreKeys` | `model/inspectCoreKeys` | V4 source-selected; installed route unproven |
| `lookupCoreKey` | `model/lookupCoreKey` | V4 source-selected; installed route unproven |
| `declareCoreRecordMembers` | `model/declareCoreRecordMembers` | V4 source-selected; installed route unproven |
| `declareCoreKey` | `model/declareCoreKey` | V4 source-selected; installed route unproven |

The candidate count is four unique logical operations (eight Node/browser
route rows). `verifyCoreKeyOperation`, Core Key tuple operations, package
resources and unrelated core-ideal classifiers are excluded. This packet adds
no accepted ledger mapping, source override, retirement decision, release
claim, or support claim.

## Current-source replay note — 2026-10-25

The four-route replay against archive SHA-256
`0b95d2d2efcc19fcbc0793fa80c3bb08810b09f031d00d81eedb92b54eeb9cb3` and
closure `bfa7697725c068eeaa8c5cb3cf21efa2698484a88c297813327ed48e00ee96f6`
passed in Node, Bun, and Chromium. Its receipt is
[`final-archive-core-keys-installed-20261025.json`](final-archive-core-keys-installed-20261025.json).
The access facade was subsequently edited to align Bun's null-receipt error
expression with the TypeScript predecessor. That archive and receipt are now
historical relative to current source and are not current-source ledger evidence.
The harness covers four frozen outcomes, root/reference parity, result shape,
and selected admission-order sentinels; it does not repeat the former 14-case
host matrix or the 700,000-unit retained-value control.
