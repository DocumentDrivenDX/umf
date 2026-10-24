# Post-handoff extraction and verification procedure

Status on 2026-10-24: **held; no migration cut approval or final source tree**.
This procedure records work to do after handoff. No existing paths, default
workflows, source identities, release assets or history are changed by it.
The owner has already authorized the cut once migration approves the concrete
extraction; do not ask for that same user authorization again.

## Current consumer observations

[consumer-snapshot.json](consumer-snapshot.json) captures 24 committed source/
configuration files at `e8575ac61c600409c9032defb15a469c88ac9c19`, their Git blob
identities, SHA-256 and 319 line-level discovery anchors. Working copies of those
files matched that commit when recorded. It is a curated map, not a complete
import graph. The raw source is authoritative; excerpts may be shortened.

| Consumer boundary | Confirmed current coupling | Post-handoff disposition to prove |
| --- | --- | --- |
| Core input/size guards | `check-build-inputs.ts` requires local evidence, reference pages, operation fixtures and retired-byte archives; `check-domain-pack-checkout.ts` requires local source bytes | Split core, selected full-pack and explicit conformance/publication checks. Retain checksum/path controls; do not simply delete requirements to pass a smaller budget. |
| Pack export and family composition | `loaders/export.ts` reads pack-local schemas, companion artifacts and source bindings; family export reads component manifests | Materialize the complete verified selected pack/family workspace, including unchanged schemas/loaders/licenses. Source read, cached full export and small core sample export must remain distinct. |
| Native suite/adapter runners | `conformance.ts` invokes host subprocesses and explicit fixture bases; prerequisite builders generate other inputs | Move the test/harness/helper closure externally, bind its commit and case selectors, preserve subprocess/toolchain/native/browser coverage. Keep only thin core launchers and core integrity tests. |
| Python/SDK packaging | Python sdist force-includes current metamodel conformance; installed SDK probe reads current-conformance and approve.json; Codegen bundles its transitive sources | Retain required small resources core. Prove fresh offline extracted sdist/wheel/SDK installation; include successor hatch/sdist/resource-sync and Rust `include_str!` closure from the actual handoff. |
| Extension/reference evidence | Capability evidence paths, evidence-map `recordPath`, JSON selectors, operation `fixturePaths` and source closure profiles are repository-relative | Resolve immutable records through a pinned selected cohort, preserve exact selectors, original hashes, support limits and historical/current correspondence. Missing records refuse rather than become unassessed success. |
| Browser examples | Direct fixture reads plus dynamically selected ODCS/LinkML result paths | Copy a complete bounded example set to maintained core/site source with provenance and byte pins; do not retain entire fixture families just for examples. |
| Site/signing workflow | Tracked generated publication paths; pre/post-build inventory/signing; workflow triggers on fixtures/evidence | Preserve authored host files and declarations. Build from clean source, validate actual final inventory and orphan claims, sign final bytes and preserve public download URLs. Update triggers/jobs as well as readers. |
| Security/authority policies | Acceptance and certification readers mix small policies with large original receipts; retired byte oracle has mapped archives | Keep executable policy meaning and small required byte oracles; move bulk immutable observations with a verified index/resolver. Compare all verdicts and negative controls. |

An untracked `crates/` directory is now present in this shared checkout. It was
not modified or traversed for this snapshot. Current and future Rust/G02/G03
producer closures absent from the pinned commit must be supplied by their owners;
this old snapshot cannot approve their extraction.

## 1. Accept an exact handoff packet

Obtain the migration owner's actual merged/published source commit and tree,
relevant immutable release/tag/artifact digests, and producer/consumer manifests.
The handoff must also identify the Rust integration revision and isolated G03
prototype/native inputs, including unreleased inputs where they remain consumers.
Record them alongside the extraction plan; a proposed or pre-merge SHA is not a
published handoff. Preserve the original SDK/Core evidence and coordinates.

Require an external suite **source commit**, per-job selectors and complete case,
helper/oracle/dependency closure. Per-asset hashes alone are not suite source
identity. Preserve the named G02 carrier/NULL, baseline NULL/no-default and recovery
controls, the separate G03 default/client/lock/recovery cohort, actual Chromium
and installed paths, independently authored expectations and legacy replay input.
Counts are cross-checks, not substitutes for the actual selected case IDs.

Keep the published asset release's exact byte pins. The unknown-rights legal
`evidence_pages.csv` remains core unless a permitted reviewed acquisition/source
arrangement is established. No new public mirror is implied by handoff.

## 2. Rebase the inventory without touching the shared checkout

Prepare a separate managed worktree at the supplied source commit. Leave the
shared Rust work and uncommitted files alone. Record the existing blob/mode/size
inventory before edits; capture added, changed and removed paths relative to the
old `9e93fc583` inventory. Reconcile the difference individually, including new
crate/binding sources, generated resources, policies, source/licensing evidence
and test helpers. Do not apply the old deletion list blindly.

Expand each consumer's actual closure: imported modules, subprocess entrypoints,
glob members, result-selected paths, source/checksum manifests, JSON selectors,
component packs, licenses, negative controls and offline packaging resources.
The 709 old declarations and the 24-file snapshot are starting points only.
Every affected path must have an exact disposition and consumer replacement;
unresolved dynamic edges hold their affected files in place.

## 3. Build a reviewable candidate before requesting cut approval

Prepare the old-path-to-resolver consumer diff and exact prospective extraction
manifest. Separate core schema/loader/sample requirements from selected full-pack,
conformance and publication cohorts. Keep original data copies in the shared
checkout while testing the candidate in isolation. Materialize verified external
cohorts in private workspaces outside the core source checkout.

Prepare the selected qualification archive with its trusted lock digest, suite
commit, fixtures, manifests, independent expected outputs, source provenance,
legacy replay corpus and required runtime/toolchain dependencies. The source-lock
builder requires explicit paths/cases; it does not discover this closure for you.
No generated oracle result may replace an independent expectation merely because
both can be reproduced by the same implementation.

Run the following acceptance matrix against the exact candidate tree:

| Environment | Required proof |
| --- | --- |
| Fresh core, cold cache, network disabled | Schema/pack inspection, small samples, core regression and integrity checks, browser-compatible build and required SDK/sdist/wheel resource operations succeed without external corpora or Git history hydration. |
| Selected full packs, initially cold cache | Explicit trusted acquisition verifies every required asset. Full source IDs, document/row counts, exact values, loader inventories and original export bytes correspond to the retained baseline; missing assets cannot be replaced by samples. |
| Same packs, disconnected verified cache | Full pack/family materialization and exports reproduce the online result without source-root fallback; verify component identities/checksums and all source notices. |
| External selected conformance cohort, disconnected | Complete job selectors, independently authored expectations, adapter tests, native oracles, Chromium and installed paths execute with matching case inventories. Missing selectors/inputs refuse before compilation/admission; no silent skips. |
| Offline extracted distribution and qualification archive | Install/run from new empty directories with no sibling source checkout, ambient venv/cache, network or source history; prove required resources and native dependencies were actually packaged. |
| Site generated from clean source | Declared routes/claims, actual inventory, renderer pins/SRI, orphan-claim checks and signatures cover final bytes; original public download URLs resolve to preserved bytes. |
| Negative controls | Wrong suite commit, lock hash or selector; missing/truncated/tampered assets; corrupt cache; unsafe paths/symlinks; media/size mismatch; interrupted transfer and modified export destinations all refuse at the appropriate boundary. |

Use the handoff's actual job commands and selector inventory; do not invent a
new smaller job list that omits hard cases. Record exit status, source/artifact
pins, case counts and expected baseline failures for every job. Already-passed
publication/download tests need not rerun unless source, transport, manifests or
storage changed; candidate consumer and packaging behavior does need new proof.

## 4. Obtain approval bound to the candidate, then apply the cut

Send migration and Rust owners the candidate source/tree, extraction-manifest
SHA-256, old-path-to-resolver diff, suite commit/selector manifest and acceptance
receipts. Their approval must refer to those actual pins and resolve the handoff
freeze. A prior agreement to additive publishing, an old all-pack-local review,
or a general future window is not deletion/default-workflow approval.

After approval, remove only approved core copies, adopt the split default jobs
and the 100,000,000-byte source budget, then commit ordinary forward changes.
No squash, rebase, pruning, force push, old tag movement or asset replacement.

## 5. Measure the actual fresh core checkout

Verify a new managed checkout of the final candidate commit. Keep downloaded
cohorts and caches outside its source tree. Run the revised core size/input guard
and independently measure present tracked/non-ignored files, including all new
locks, indexes, retained samples and policy resources. The budget is strictly
less than 100,000,000 decimal bytes; Git history/dependencies/caches are separately
reported. Do not make required core inputs disappear through `.gitignore` to pass.

For an independent source measurement, set `UMF_CORE_CHECKOUT` to that fresh
managed checkout (not an ancestor repository or an exported directory):

```sh
python3 - "$UMF_CORE_CHECKOUT" <<'PY'
import json, os, subprocess, sys
from pathlib import Path
root = Path(sys.argv[1]).resolve()
actual = Path(subprocess.check_output(
    ['git', 'rev-parse', '--show-toplevel'], cwd=root, text=True).strip()).resolve()
assert actual == root
names = set(subprocess.check_output(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    cwd=root).split(b'\0')) - {b''}
count = total = 0
for name in names:
    path = root / os.fsdecode(name)
    try:
        st = path.lstat()
    except FileNotFoundError:
        continue
    if path.is_symlink() or path.is_file():
        count += 1
        total += st.st_size
print(json.dumps({'files': count, 'sourceBytes': total,
                  'limitExclusive': 100_000_000, 'passed': total < 100_000_000}))
assert total < 100_000_000
PY
```

Record the exact final commit/tree and size output alongside the functional
receipts. A projected inventory, empty stub checkout, missing required inputs,
or merely passing the old 500 MB guard cannot close this gate. Until these
steps pass, the under-100 MB checkout remains **unverified**.
