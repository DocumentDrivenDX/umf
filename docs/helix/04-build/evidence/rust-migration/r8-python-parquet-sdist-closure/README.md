# Python Parquet source-archive closure correction

The real d62 local producer reached native wheel compilation from its source
archive and failed at `include_str!` for `spec/extensions/parquet/idl.json`.
The corrected Hatch source list and independent verifier membership both carry
that exact resource. Executable verifier/helper pins, including the workflow
finalizer checked locally, match the revised helper. Historical evidence stays
unchanged; no GitHub Actions job was dispatched or awaited.

The existing literal-include audit still scans all Rust spec references. Four
small test-only spec inputs exposed by that audit are also included explicitly:
the scoped SEC submissions/company-facts JSON inputs and the two version 1.0.0
loader-companion schemas (32,960 bytes combined). No source resource bytes were
changed, and no conditional-code filter narrows the audit.

[Independent Sol review](sol-review.md) approves the composed correction.
[Reviewed inputs](reviewed-inputs.json) records the exact files.
[Fresh archive verification](sdist-verification.json) matches all 1,165 files
and the Parquet IDL bytes against the reviewed private source. The first broad
test run passed 133 tests and exposed the stale finalizer pin; after its repair,
the [seven finalizer controls](finalizer-tests.log) pass. The complete integrated
packaging suites pass [all 134 tests](integrated-tests.log).

The [offline wheel rebuild](wheel-build.log) succeeds from that verified source
archive. A fresh CPython 3.11.17 environment installs the Darwin-arm64 ABI3 wheel
and passes [both installed Parquet tests](installed-parquet-tests.log).
[Native dependency inspection](installed-binary-closure.json) finds only the
allowed system loads for the extension and CLI; the packaged CLI also executes
with an empty `PATH`. Its [capabilities](installed-cli-capabilities.json) report
Rust CLI package version 0.1.0, separately from Python distribution 0.11.0.
The local producer prototype must validate these distinct version authorities.

[Artifact and observation hashes](wheel-observation.json) bind this wheel to the
original archive and [complete source membership](source-archive-inputs.json).
The original archive was reopened into a fresh directory after building and
again matched committed source `4dc0d1dae`; generated build files in the
build-used extraction were preserved. This bounded evidence establishes one
installed Python cohort. It does not qualify the full interpreter/OS matrix,
default SDK routes, retirement, publication, or any release.
