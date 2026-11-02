# UMF family integration and release audit — 2026-11-02

[The receipt](receipt.json) records fetched refs, merged-PR attribution, worktree
state, source-blob reconciliation and the newly delivered component releases.
It preserves unresolved source candidates and dirty owner work explicitly.

TableSpec 0.0.16 integrates both outstanding feature PRs and is delivered through
GitHub/PyPI with exact archive equality and a fresh public install. Batten storage
0.1.0a1 and Concourse 0.1.0 have qualified GitHub preview deliveries. Concourse's
owner selected MIT OR Apache-2.0. Their original support limits remain in force.

Truss and Arras have dedicated active owners. Truss's fresh-install baseline is
under exact-tag qualification. Arras UI 0.6.5 delivery is verified; its separate
UMF action PR needs successor integration. Ashlar's managed target remains open.
Lakeview reconciliation and current-runtime qualification continue separately.

A stale branch name or an ancestry difference alone does not prove missing code.
The receipt retains exact merged PR heads and source-blob matches for rebased or
squashed work. Historical evidence and unverified snapshots are not silently
promoted to current qualification. No branch/worktree containing unresolved or
dirty work was deleted, and this audit does not claim the entire family is done.
