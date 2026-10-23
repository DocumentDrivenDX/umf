# Weft 0.4.53 published dependency evidence

The 0.4.53 Weft dependency is published at `v0.4.53` and independently
verified against a fresh download. The release tag and merge commit are
`726a840e956e25217d6aeea2674fdfcf3f342a24` (tree
`82913d1be942577389b6568d900cdf7c0ec3a20f`). Release 422347988 was published
at 2026-10-23T22:07:21Z. The successful manual promotion run is 40031490546;
the packaging-only run is 40019944651 at compiler source
`7413c19d16ca5d8d8ce60b62d49ca0a3250544df`.

`root-verification/` retains the fresh GitHub release/tag/run snapshots, exact
notes body, result and actual manual promotion run plus its jobs.
`independent-review/` retains the fresh REST audit snapshot, independent
verifier result and reviewer signoff. Its adjacent
`weft-0.4.53-published/` files retain exact notes, release pins, qualification
receipt and packaging reports. `promotion/` retains the merge proof, pre-release
draft, macOS staging receipt, and automatic tag workflow's terminal and raw
run/job receipts. The automatic push workflow completed as cancelled at
22:06:02Z; the macOS wheel was staged at 22:06:32Z, before successful manual
promotion began at 22:07:00Z.

`asset-inventory.json` contains all nine published asset names, sizes, SHA-256
digests, GitHub IDs and public URLs. The three wheel binaries are omitted from
this repository; downloaded bytes remain at
`/private/tmp/weft-g02-publication-verification/published-726a840e/assets/`
and independently at `/private/tmp/weft-g02-independent-published-726a840e/assets/`.
The non-wheel reports, notes, pins, qualification and checksum bytes are copied
here. `workflow-pin-verification.json` confirms that the current UMF
`.github/workflows/access-boundaries.yml` x86_64 Linux and ARM64 macOS Weft
0.4.53 URLs and digests match the fresh release inventory. It makes no workflow
edit.

Both the root fresh-download verifier and the independent review passed for the
published assets. This verifies the external Weft dependency only: UMF final
current-source CI, cohort integration and release gates remain pending. Linux
G02 native functional execution is not claimed; Weft Linux wheels were
packaging-qualified only.
