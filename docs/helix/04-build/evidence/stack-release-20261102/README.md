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
accounts for three more superseded branches. Total: 343 refs and four worktrees
removed by this audit, separate from the delegated Truss/Arras cleanup. Exact source
heads, current-main or merged-PR proof, and execution results are retained.
Open PRs, registered worktree heads, active checkouts and unresolved unique work
were protected. The superseded TableSpec PR48 worktree was also removed after
clean-state and ignored-cache inspection. Arras and Truss cleanup is managed by
their dedicated owners and is reported separately.

TableSpec 0.0.16 and Truss 0.0.53 are delivered on GitHub/PyPI; Arras UI 0.6.5
is delivered on npm. Batten storage 0.1.0a1 and Concourse 0.1.1 are qualified
GitHub previews, with their original support limits. Concourse uses the owner's
selected MIT OR Apache-2.0 license and includes the complete jose notice.

The owner's policy is to delete fully superseded work and integrate genuine
feature or implementation gaps. Lakeview and handler timing/browser assertions
are being integrated into the current Rust UMF successor. Arras action 0.7.0,
Truss temporal work, Ashlar managed-target qualification, other historical unique
tips and active dirty owner work remain explicitly open. Historical qualification
is not current release acceptance; this audit does not claim the family is done.
