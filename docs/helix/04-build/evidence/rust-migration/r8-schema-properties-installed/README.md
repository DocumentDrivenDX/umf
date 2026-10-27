---
ddx:
  id: umf.evidence.rust-migration.r8-schema-properties-installed
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-049
      kind: implements
    - id: umf.evidence.rust-migration.r5-schema-properties
      kind: informed_by
---

# R8 Schema Properties installed-route replay

This packet defines a source-pinned replay for the four Schema Properties
operations selected by the default package root: `inspectCoreSchemaProperties`,
`declareCoreSchemaProperties`, `validateCoreFieldValue`, and
`resolveCoreDefault`. The runner takes a freshly packaged Rust-default SDK tar
archive and an explicit expected source-closure SHA-256. It verifies the
archive manifest, fixed-point source closure, package export map, and every
listed archive-member digest before importing the installed package.

The installed `@umf/core` root and installed `@umf/core/reference` package
subpath are imported by package name in Node, Bun, and Chromium. The frozen
packets contain 72 fixed-output outcomes (nine inspect/declaration successes
and refusals, 39 Field Value returned validations, and 24 Default outcomes)
plus 11 host-specific thrown TypeError outcomes, for 83 total. Those 11
TypeErrors are compared between the installed root and `./reference` inside
each host so native error text is not incorrectly treated as a cross-runtime
constant; the frozen thrown envelope is additionally checked on Bun.
Additional controls
exercise caller-owned Proxy trap identity for each operation and declaration
copy isolation. The replay also compares eight frozen crossed source/identity/
patch/field/default admission-order cases and preserves strict thrown-object
identity across eleven host callback stages covering every operand position
for the four operations. Accessor/proxy controls verify host reflection does
not invoke caller getters and preserves caller-thrown values. These controls
are reported separately from the 83 frozen outcomes. Chromium must load a WASM
member and must not expose Node
`process` or `Buffer` globals.

## Run after fixed-point archive is available

```sh
bun scripts/rust-migration/r8/schema-properties-installed.mjs \
  /path/to/fresh/umf-sdk.tgz \
  <expected-source-closure-sha256> \
  docs/helix/04-build/evidence/rust-migration/r8-schema-properties-installed/receipt.json
```

Do not use an archive from before the current source freeze. The expected
closure is deliberately mandatory so a historical package cannot be mistaken
for source-current qualification. A successful run writes the archive and
manifest hashes, verified member count, three frozen-packet hashes, host
versions, route totals, and browser WASM observation to the receipt.

The generated probes can be checked without an SDK archive:

```sh
bun scripts/rust-migration/r8/schema-properties-installed.mjs --check-generated
```

This verifies packet-path substitution, presence of all eight crossed-order
cases and eleven caller-thrown identity stages, and generated JavaScript syntax
for both the Node/Bun and browser probes. The archive, closure, export-map and
member checks remain mandatory for an installed replay.

## First installed replay and correction

The first corrected replay used archive SHA-256
`ca9fac7cc3f65d8a1012546a8041d8cb701d5fdcee855d57e162337806d1c9b0`, source
closure SHA-256
`5d23bf0e234cfe212a5bbad4f5695b2025dc68670e04fad2a2b2e88d82e925d3`, and
reported zero generated transforms. In Node, the installed root, installed
`./reference`, and frozen predecessor agreed for Schema Properties and Default
cases and for Field Value cases that return validation outcomes. Eleven Field
Value cases that throw host-native `TypeError` still differ in error class or
message, so the combined route is not qualified.

An earlier run reported 42 mismatches. That count is superseded: the harness
used shared `f.source` and `d.source` for all Field Value and Default cases
instead of each case's optional `c.source` override; the schema unknown-
qualifier comparison also exercised the wrong operation fixture. The runner
now uses per-case sources and the correct fixtures. Do not use the earlier 42
count as production mismatch evidence.

The replay stopped at the Node gate. A subsequent source fix moved the
malformed string-carrier count into the host JSON event loop on admitted
copies and corrected zero-count literal identity. The compiler-only build
retains its minimal feature closure through a local non-host shim.

## Current fixed-point installed replay

[`receipt-current-7144ad5a.json`](receipt-current-7144ad5a.json) records a
passing installed replay on the fixed-point archive SHA-256
`23be02c51926c48e3426f189d64570d5dc514447fa1c8830bcb74dfeda72c5fe`,
source closure SHA-256
`7144ad5a682b32501db6692177b348ae1760a224585394f19f450e41dd4518c7`
over 3,435 live inputs, zero generated transforms, and 1,788 verified
members. Node 26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12 each
passed 72 fixed-output and 11 host-specific thrown outcomes, eight crossed
admission cases, eleven caller-thrown identity stages, and copy isolation.
The installed root agreed with the installed `./reference` subpath on these
cases. Chromium requested a WASM member and reported no `process` or `Buffer`
globals. The independent generated-probe check also passed.

This qualifies the four source-selected operations for this bounded private
installed cohort. It does not qualify Python, other V4 routes, input orders
outside these packets, logical declaration retirement, or a public release.
Subsequent opt-in Rust graph-validator edits changed the checkout source
closure; this receipt remains a passing historical cohort and must be rerun
against a new fixed-point archive before current-source aggregate claims.
The frozen predecessor packets are preserved under the R5 evidence
directories and are never regenerated by this harness.

## Current fixed-point installed replay — 2026-10-26

The raw [current receipt](../r8-installed-route-evidence/current-61cbaf0a/raw/schema-properties.json)
passes against archive SHA-256
`c1ecf9cea81c3767e281820a93294b85a45ab052862a9fcd8b0b493057302263` and
source closure SHA-256
`61cbaf0ae7a0359e9ae49d2aa4c436727f2122e4174d84999efb20f42d2c3b01` over
3,435 inputs, with zero generated transforms and 1,788 verified archive
members. Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 each pass the
same four route families, 83 frozen outcomes, host-specific TypeError parity,
crossed admission, caller-thrown identity, and copy-isolation checks. The
[current route gate](../r8-installed-route-evidence/schema-properties-route-gate-current-61cbaf0a.json)
reopens the pinned receipt and preflight, verifies the complete member map, and
recomputes the current live source closure. It relies on that separate
preflight for archive-byte verification. This remains bounded private route
evidence; it does not establish broader parity, retirement, or release
qualification.

## Later source cut and separate route gate — 2026-10-26

The [new installed receipt](receipt-current-b2f816d7.json) reruns all four
routes on archive SHA-256
`b2f816d7f7bd3b57df1ecea536ceece4396a3625b2a641eb0991d135037de892`
and current source closure
`0e6de413298318b0e8bcb03cac522872452b8c1e548f18a26f226d28967ce5c0`.
Node 26.12.1, Bun 1.4.3 and Chromium 153.0.8010.12 pass the same 83
outcome cases per host, including 11 host-native `TypeError` parity cases;
crossed admission, caller-thrown identity, copy isolation and browser WASM
checks pass. The [separate route gate](route-gate-current-b2f816d7.json)
reopens the hashed receipt and archive preflight, checks the exact host fields,
and recomputes all 3,435 current source inputs. Its five focused positive and
negative tests pass. It accepts four bounded routes while preserving 922
logical retirement gaps. Archive bytes were independently reopened by the
shared preflight; this route gate uses its pinned attestation. The existing
five-family aggregate remains a separate 24-operation result.

## Opt-in Python binding source addition — 2026-10-27

The current source now adds `umf.rust_schema_properties`, an explicitly
imported Python module for the same four operations. A dedicated core-wire
entrypoint whitelists exactly those operation names before dispatch, and the
PyO3 surface exposes its versioned capability identifier plus bounded work and
deadline controls. The module does not change `umf`'s default exports. Its
focused tests use the frozen `schema-properties/valid` document for inspect,
declaration, Field Value validation and Default resolution, with control
validation cases.

Focused verification completed after using the host's absolute Rust toolchain
paths. `cargo test --locked --offline -p umf-core-wire --test
r5_schema_properties_wire` passed 5/5; `cargo build --locked --offline -p
umf-core-python` succeeded in isolated target directory
`/private/tmp/umf-schema-properties-target`. The built extension was copied to
a private temporary package tree and the new test file passed 7/7 under the
existing CPython 3.13.16 venv. Ruff and Python syntax checks also pass. The
first pytest collection attempt found an incorrect fixture root in the new
test; that path was corrected before the passing run. The installed receipts
above do not cover Python and predate these source edits. No source-current
installed replay, wheel, CLI, retirement or release claim follows from this
addition.
