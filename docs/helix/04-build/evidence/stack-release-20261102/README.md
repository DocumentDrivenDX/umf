# UMF family integration and release audit — 2026-11-02

[Current receipt](receipt.json) records delivered releases and actual cleanup.
[Pre-cleanup inventory](inventory-before-cleanup.json) preserves the original
ref/worktree observations and source-blob reconciliation, with its own timestamp.
[Deletion receipt](branch-cleanup-result.json) records all 333 verified redundant
refs removed across eight repositories: 164 local and 169 remote. A further
four Parquet candidate heads and the extracted visual topic were deleted after
semantic reconciliation (338 refs total; 168 local and 170 remote). Their
[adoption proof](semantic-supersession-cleanup.json) and
[released extraction proof](visual-extraction-cleanup.json) are separate.

[Further worktree cleanup](obsolete-worktree-cleanup.json) removes three clean
obsolete copies and two associated branches. [Praxis reconciliation](praxis-adoption-cleanup.json)
accounts for three more superseded branches. Total: 374 refs (195 local,
179 remote) and four worktrees removed by this audit, separate from the delegated Truss/Arras cleanup. Exact source
heads, current-main or merged-PR proof, and execution results are retained.
[Historical delivery cleanup](obsolete-proof-cleanup.json) accounts for seven
more superseded refs; [completed release cleanup](completed-primary-branch-cleanup.json)
accounts for four merged TableSpec/Concourse topic refs.
[Recovery alias cleanup](consolidation-alias-cleanup.json),
[CLI adoption](cli-transport-adoption-cleanup.json) and
[G02 staged-index adoption](g02-index-adoption-cleanup.json) account for six
additional local refs. One [abandoned initialization registration](stale-initialization-cleanup.json)
was removed after proving its checkout/index absent, lock unowned and HEAD merged.
Open PRs, registered worktree heads, active checkouts and unresolved unique work
were protected. The superseded TableSpec PR48 worktree was also removed after
clean-state and ignored-cache inspection. Arras and Truss cleanup is managed by
their dedicated owners and is reported separately.

TableSpec 0.0.16 and Truss 0.0.54 are delivered on GitHub/PyPI; Arras UI 0.6.5
is delivered on npm. Batten storage 0.1.0a1 and Concourse 0.1.1 are qualified
GitHub previews, with their original support limits. Concourse uses the owner's
selected MIT OR Apache-2.0 license and includes the complete jose notice.

The owner's policy is to delete fully superseded work and integrate genuine
feature or implementation gaps. Lakeview and handler timing/browser assertions
are being integrated into the current Rust UMF successor. Arras action 0.7.0
is delivered on GitHub, PyPI and npm, with independent fresh public installs
verified. Truss temporal work, Ashlar managed-target qualification, other
historical unique tips and active dirty owner work remain explicitly open. Historical qualification
is not current release acceptance; this audit does not claim the family is done.

The newly authorized Arras embedding/vocabulary and Truss temporal programs are
active, separately owned work. Their worker checkouts are protected until review,
integration and release; completed component releases do not qualify those changes.

[Microsite squash cleanup](microsite-squash-cleanup.json) removes six further refs
for three exact patches adopted by main through PR85–87. Each source/adoption
identity and stable patch ID is retained; remote deletion used exact-head leases.

[Avro candidate reconciliation](avro-adoption-cleanup.json) removes two local
candidate branches. All unique Cardinality and performance changes reached main;
the four differing first-port blobs contain additional Parquet work on main.

[Remaining Praxis embedder adoption](praxis-embedder-adoption-cleanup.json) removes
four local G01/host/packaging branches after mapping every unique commit to main.
The few differing blobs add current guide/parser interfaces or reflect retired
Access candidate version metadata; no implementation is missing.

[Historical release-alignment cleanup](release-alignment-adoption-cleanup.json)
removes two refs after all 18 source blobs matched their merged PR71 adoption.

Batten `runtime-v0.1.0a1` is also delivered: PR3 merged, all 20 public assets
independently downloaded and checked against GitHub digests and SHA256SUMS.
All seven Batten wheels carry both licenses and NOTICE.
[Public verification](batten-runtime-public-verification.json) preserves the
GitHub-only local-runtime scope and original UMF dependency cohort.
