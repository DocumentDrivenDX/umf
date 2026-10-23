---
ddx:
  id: umf.plan.repository-size
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.implementation-plan
      kind: references
---

# Reduce the current repository tree

## Scope

Remove bulky verification run output, copied historical trees and retired runtime
bundles. Keep complete domain packs, their source documents/data, canonical
conformance corpora and licenses, verification code, active build/acceptance
inputs, and the published reference site. History is unchanged; commit the cleanup
as an ordinary new commit. The unrelated Rust planning work remains separate.

The owner requested direct deletion first and then review before committing.
Review found that the earlier 50/125 MB cuts removed functional inputs. Those
cuts are superseded. The source-content budget is **500,000,000 bytes**, including
needed fixtures and product publication assets, excluding `.git`, dependencies,
ignored caches and local build output. Independent corpus packaging is future
architecture work, not justification for breaking existing builds in this cut.

Governing inputs: [PRD](../01-frame/prd.md), FR-11–14 and FR-32;
[cross-cutting requirements](../01-frame/cross-cutting-requirements.md);
[architecture](../02-design/architecture.md); [TP-001](../03-test/test-plan.md);
and [implementation plan](implementation-plan.md). No semantic or native support
claim changes through this storage cleanup.

## Shared Constraints

- Preserve all domain-pack/native source bytes and canonical test inputs. A file
  named results/provenance/log can be a regression oracle; its role, not its suffix,
  determines retention. Keep hash-bound logs consumed by active provenance checks.
- Preserve active acceptance policy, original-byte history manifests and their
  mapped archives, extension evidence declarations, reference allocations, Python
  sdist inputs and documentation build links. Presence is not native qualification.
- Keep the active published site and its original signing policy intact. Its
  generated reference/source downloads are product content used by current tests
  and publication checks, not disposable verification output.
- Keep optional historical replay recoverable using exact original Git objects in
  [optional-assets.json](optional-assets.json). Do not require history hydration for
  normal package, fixture, reference or domain-pack inputs. No external upload or
  history rewrite is selected here.
- Before later deleting history, independently preserve still-needed optional
  inputs and verify restoration. Until cleanup is committed, restore optional
  output into an isolated directory so pending deletions are not undone.
- Preserve unrelated user edits. Stage only cleanup changes, including only the
  cleanup paragraphs in shared documentation files.

## Implementation Slices

| Slice | Scope | Gate |
| --- | --- | --- |
| RS-01 | Inventory tracked bytes and classify runtime/source/input/output roles | Compare deletions to original Git objects and active consumers |
| RS-02 | Restore over-cut product and verification dependencies | No canonical code/pack/native deletion; required corpora, licenses and manifests present |
| RS-03 | Keep a bounded historical recovery index and targeted ignores | Every remaining deletion indexed; no blanket ignore of authored fixture JSON |
| RS-04 | Add size and input-closure guards | Check 28 packs, source checksums and declared package/reference/history inputs in local/pre-commit/CI runs |
| RS-05 | Review, verify and commit cleanup separately | Required checks recorded; baseline failures distinguished; no unrelated planning staged |

## Review Findings and Disposition

| Finding | Disposition |
| --- | --- |
| High: Python sdist and SDK install fixtures were deleted | Restored current metamodel and Python conformance inputs; Python and installed SDK checks pass |
| High: Dynamic JSON Schema, Arrow/Parquet, RDF and other corpora lost members and licenses | Restored ordinary fixture families, manifests, expected data and all canonical licensing source |
| High: Active reference, action-guide and acceptance readers lost records | Restored declared allocations, certificate/source-impact records, acceptance policies and guide-linked receipts |
| High: Retired-byte regression manifests referenced missing archive members | Restored the manifests and exact mapped original-byte closure |
| High: Active site publication/signing expected checked-in reference content | Restored the complete published site and original signing workflow order |
| High: Some deleted .log files are hash-bound test inputs | Restored provenance-referenced logs; disposable output logs remain optional |
| Historical replay snapshots remain referenced by old replay scripts | Keep their optional roots and exact restore mapping; do not describe them as unreferenced junk |
| Acceptance-ledger snapshot mismatch | Reproduced from untouched HEAD in an isolated baseline; do not refresh unrelated acceptance claims in this cleanup |

## Content Disposition

Keep `src/`, `scripts/`, `tests/`, `tools/`, `native/`, complete `spec/domain-packs/`,
canonical `fixtures/` corpora and licenses, current support/policy records, retired
byte-oracle archives used by tests, and the active microsite publication tree.

Optional material comprises bulk evidence runs/source snapshots/distributions,
nonessential logs, selected copied relationship replay trees and explicitly
retired Truss/Weft runtime bundles. Some optional historical trees remain hash
inputs to separately invoked historical replay/publication scripts; those scripts
require explicit restoration. The size guard does not redefine semantic support.

## Execution Contract

The owner authorizes review, necessary restoration and one ordinary cleanup commit.
Do not squash, rebase, prune, publish, push or change branches. No tracker is selected.
Planning and implementation have no metered token baseline or user spending ceiling;
runtime enforcement is unavailable. Keep verification scoped to deletion safety,
restoration integrity, active build/packaging inputs and functional regression.

## Validation Plan

1. Check every remaining deletion against the pinned recovery index and confirm
   no deletion under canonical implementation, test, tooling, native or pack roots.
2. Run `bun run check:repo-size`: pack closure plus declared Python/package,
   extension evidence, reference, site and historical-byte dependencies. Unit-test
   missing inputs, checksums, traversal, symlink escape and restoration controls.
3. Run all core tests, focused JSON Schema/Avro/Parquet/dbt/metamodel tests,
   Python core tests, extension audit and installed SDK checks.
4. Check action-guide certificate/link integrity and original site inventory/
   signing-policy tests. Validate changed CI YAML and whitespace.
5. Run typecheck, generated metamodel and source boundary checks. Review staged
   tree membership and shared-document hunks before committing.
6. Preserve failures which reproduce on unchanged HEAD as existing limitations;
   never relabel them as passing or alter acceptance assertions to make cleanup green.

## Risks and Rollbacks

| Risk | Response / rollback |
| --- | --- |
| A size threshold removes a functional input | Input-closure guards reject the cut; restore exact bytes and reclassify the file |
| Literal-only dependency scanning misses dynamic corpora | Restore bounded canonical fixture families and verify manifest-driven readers |
| A log or snapshot is actually an oracle | Retain active provenance/hash closure; historical-only replay remains explicitly optional |
| Product artifacts are mistaken for disposable output | Keep published site and signing behavior unchanged |
| Unrelated edits enter the commit | Explicit path staging and index-only cleanup hunks in shared documentation |
| Future history cleanup loses optional replay | Require independent preservation before that later operation |

## Exit Criteria

- [x] Canonical code, complete packs, native sources, corpora, licenses and active product/build inputs remain local.
- [x] Remaining deletion set is reviewed and fully indexed; source/input guards pass.
- [x] Scoped validation and baseline limitations are recorded without widening support claims.
- [ ] Cleanup is committed separately; unrelated edits and existing history remain intact.

## Continuation Evidence

Review restored required fixture families, provenance-bound logs, reference and
acceptance inputs, guide-linked records and active published site content. No
normal CI job hydrates the old multi-gigabyte run archive. The original site
signing checks and order remain unchanged.

Validation so far: 177 core tests pass; 126 JSON Schema/Parquet/metamodel tests
pass; Python core passes 166 tests using an existing Python environment with
`PYTHONPATH=python/src`; all 71 extension package declarations pass their audit.
The SDK archive builds, installs, passes distribution checks and replays 139
installed conformance cases. Initial sandbox installation failure was resolved by
running only the install probe outside the sandbox. Avro corpus/bundle and dbt
graph checks pass; the dbt semantic provenance test passes after restoring its
hash-bound command log.

The acceptance ledger's expected counts are stale on untouched HEAD as well:
computed 169 SATISFIED / 400 UNTESTED / 230 UNCITED_COVERAGE versus saved
168 / 405 / 226. The baseline probe used HEAD scripts, tests, stories and policy
inputs in an isolated directory. No acceptance snapshot or test assertion is
changed by this cleanup. Hosted/native full qualification remains outside this
scoped deletion review.

Final review measurements: 27,526 deleted tracked files / 4,137,271,457 original
bytes; approximately 450.9 MB of current source/product/fixture content. The
500 MB budget preserves functionality; further reduction would require deliberate
corpus/product packaging rather than deleting declared inputs. All 28 packs,
742 pack asset references and 709 declared build/reference/history dependencies
pass the closure guards.

Final checks also pass: six new input/pack guard tests, five restore tests,
seven site signing/inventory tests, dbt semantic provenance, full TypeScript
checking, generated metamodel consistency and source-boundary checks. Action-guide
render/build and certificate checks succeeded; regenerated guide output was then
returned to its original publication snapshot so this commit changes no site
content. The original signing order and checks are preserved. A plain system
Python lacked pytest; the existing Python environment named above supplied the
successful source-tree test run without adding project dependencies.

The cleanup is ready for the user-authorized ordinary commit. The runtime reports
its final commit identity. The historical native/browser full qualification and
previously observed long export-test timeouts are not promoted to passing by this
review. No acceptance-ledger snapshot is rewritten, and no history cleanup is run.
