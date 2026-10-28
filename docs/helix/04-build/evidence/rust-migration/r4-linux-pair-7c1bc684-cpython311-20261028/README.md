---
ddx:
  id: umf.evidence.rust-migration.r4-linux-pair-7c1bc684-cpython311-20261028
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r4-delivery
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-release-pair-readiness
      kind: informed_by
---

# R4 Linux CPython 3.11.17 pair attempt

## Result

**Blocked before build.** This record captures an exact Linux runtime probe and
an immutable source archive for commit
`7c1bc684ced6042d87c42c7ff75011fa5f9701d2`. It does not qualify an installed
`umf-core`/`umf-codegen` pair: no wheel or sdist was built, no pair was
installed, and no package or source tests ran.

## Source custody

The source snapshot was created with `git archive` from the pinned commit. It
contains the commit's tracked top-level paths except `docs/`; the build,
package, verifier, Rust, binding, specification, and fixture trees are present.
The docs tree at that commit contains 4,915,921,818 bytes of historical
artifacts. The resulting archive is 392,325,120 bytes, mode `0444`, and has
SHA-256
`ae687241541b5ec2e8914b4e8762970db8be1d3b7b246fa8e4a66087d94df7db`.
It is retained outside the repository at
`/private/tmp/umf-linux-pair-7c1bc684-311/umf-source.tar`; it is not mounted as
a writable source tree.

The shared worktree had unrelated pre-existing source and documentation edits
at capture time. The archive comes from the immutable commit object and does
not include those edits. No shared implementation source was changed for this
attempt.

## Offline environment probes

The cached `python:3.11.17-slim` image (image ID
`sha256:b7a9e5f6a93d6d4a31f129bbd4bdee69efccb6ded0fb230d78aafaf37af98377`)
ran with `--platform linux/amd64 --network none` and reported `x86_64` and
CPython `3.11.17`. It is Debian 13 and has pip 24.0, setuptools 79.0.1, and
wheel 0.46.3, but no `cc`, `gcc`, `ld`, or `make` and none of the pinned
`build`, `hatchling`, `twine`, `pydantic`, or `pytest` packages.

The cached `umf-r8-sdk-linux-x64:latest` image (image ID
`sha256:fca0948c034dbc1cb150a041113c120bfbf577262dfc1c88727f732e46c426f7`)
ran as Linux `x86_64` on Debian 12. It provides `rustc 1.90.0`, Cargo
`1.90.0`, GCC, and a 164 MiB Cargo home, but its Python is `3.11.2`; the
required packaging and test distributions were absent. It therefore cannot
stand in for the exact 3.11.17 cohort.

The cached `ghcr.io/pyo3/maturin:v1.9.6` image is Linux arm64 (image ID
`sha256:8b1adbcdc912ea215e6f45e1838006f234b17412c9234918a85c4865ea910258`).
Its Python 3.11.13 environment has `build==1.3.0`, but does not provide the
required pinned Hatchling/Twine/Pydantic/pytest set and is the wrong
architecture. The repository's macOS development venv has Hatchling 1.32.4,
Pydantic 2.14.1, and pytest 9.1.1; `build` and `twine` are missing, so it also
does not match the coordinated workflow's pins.

## Build gate and blocker

The coordinated workflow requires Rust 1.90.0, `build==1.3.0`,
`hatchling==1.27.0`, and `twine==6.2.0` for artifact construction and checks,
then installs the pair with `pydantic==2.11.9` and `pytest==8.4.2`. The exact
Python image lacks the compiler and packages; the available compiler image
lacks the exact interpreter and packages.

A disposable image build was submitted to auto-review. It used only cached base
images, had no repository source or output mounts, and proposed installing
`build-essential` plus the pinned Python build/test packages. Auto-review
rejected that command because package installation required network access and
the build would create a persistent local image; its reason said this
conflicted with the prior instruction not to retry network-capable Docker work
and was not specifically authorized. The command did not execute. The rejection
also directs the operator not to bypass it through another route, so this
record makes no attempt to install the same packages through another Docker
command.

## Qualification boundary and next route

The only passing result here is that the cached CPython 3.11.17 image runs as
Linux x86_64. The source archive and toolchain probes establish preparation,
not pair build, installation, sdist rebuild, API/CLI behavior, installed test
results, or release qualification. CPython 3.12.15 and 3.13.16 were not
attempted.

The next safe route is a prebuilt offline Linux x86_64 image containing the
workflow-pinned compiler, build, and test tools, or a separately reviewed
approval for a disposable network-enabled tool bootstrap. Then run the
coordinated pair gate against this archive (or a new archive of the approved
source revision), with the archive mounted read-only or copied into the
container and all artifacts and receipts directed to a separate writable
output directory. The existing hosted coordinated workflow remains the
repository's complete six-cohort qualification path.
