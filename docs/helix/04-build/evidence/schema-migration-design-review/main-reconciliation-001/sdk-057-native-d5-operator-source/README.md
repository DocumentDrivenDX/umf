# Isolated native Linux D5 operator source

This checkpoint introduces one manually dispatched standard Ubuntu 24.04 job for the existing MIG-G02 D5 gate. It does not run or qualify the gate. The producer remains e4299aff8e87e9d211f9d86df2f2013ab9c95945, tree 8b98c0d895983ba2b7637dd3aea567dab0943883; the actual workflow commit Q and run identity are separate.

The original 30 commands, 37 cases in 16 groups, 19 no-default checks, three fault scenarios and all child/aggregate/log/evidence limits remain unchanged. The job has a 45-minute outer allocation for acquisition, setup and finalization; D5 retains its 1,800-second aggregate limit. There is no matrix, automatic trigger, macOS job, paid larger runner or retry.

The reviewed Python archive and PostgreSQL digest are fixed in the bundle. An existing Python prefix must match the archive exactly under the recorded rules; a mismatch stops before D5 and requires an explicit new disposition. Source reviews establish code acceptance only, not execution success.

The raw bundle's null workflow/transport identities record its held preparation state. The temporary carrier draft remains unpublished; uploading its 99 MB archive is separately awaiting explicit human export authorization after automatic approval review rejected that upload. No upload approval or Actions exception is conferred by committing this workflow. The earlier instruction to release without Actions remains in force pending an explicit exception for this isolated job.

SDK 0.5.7 remains held until complete D5 acceptance, final review, normal merge, immutable publication and fresh public-install proof. Built Mac dependency artifacts retain their historical macOS 15.7.9 arm64/Python 3.11 limits; no fresh Mac migration or Mac Python 3.14 qualification is claimed. UMF owns meaning/plans, Weft owns admission/SQL lowering, and the host owns authority/effects/recovery. No Praxis changes.

See [frozen bundle](native-d5-bundle.json), [initial review](source-review001.md) and [final source closure](source-closure002.md). Standard public Linux runner resources are documented by [GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
