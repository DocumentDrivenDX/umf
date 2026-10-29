# G03 module 0.2 local Linux evidence

The five-case probe of public Weft 0.4.55 establishes a compiler capability gap.
Both expected module-envelope 0.2 accepts fail with `operation module version differs`.
Legacy absent-default admission succeeds; legacy logical-default source refuses;
the mismatched default receives its located deployment refusal. No database lease
or effect is claimed. [Actual review](reviews/probe-actual002.md) preserves all results.
The earlier noexec provisioning failure remains [separately reviewed](reviews/probe-actual001.md).

The [reviewed successor source](reviews/weft-source002.md) adds explicit Weft
module-envelope 0.2 admission in the shared Rust compiler. Ordinary UMF declarations
remain 0.1. It admits only matching non-null, missing-only logical/native defaults
for six existing scalar families, retains legacy/direct API admission, and does
not fill omitted arguments or change SQL. The semantic patch is retained separately
from the held local candidate package version `0.4.55+g03.a96e4f29262e`.
This version is not a published successor or a reservation of a future release.

[Build attempt001](build-attempt001/result.json) failed before dependencies/tests:
rustup attempted to update its read-only home. Cleanup and source closure passed.
The [reviewed operator002 correction](reviews/build-operator002-and-actual001.md)
selects the existing installed Rust 1.90.0 toolchain explicitly. The corrected [attempt002](build-attempt002/result.json) passed setup, then
reported 865 passing tests and one failed declared-query control across 29
reported test binaries. The test command failed; no wheel build ran. The new
six-family pipeline test passed. Cleanup and source closure passed. The failed
query control was corrected without changing production admission or nullability.
[Attempt003](build-attempt003/result.json) then exposed a test assertion confusing
prepared-program status with the separate bind API; that failure is retained.
The [reviewed repair](reviews/query-api003.md) uses each actual API's contract.
[Attempt004](build-attempt004/result.json) passed the entire 27-test integration
target and built a held full-feature Linux wheel. [Actual review](reviews/build-actual004.md)
accepted this scoped artifact and cleanup, not a complete Rust or G03 release gate.

The held wheel SHA-256 is
`51d607f851c72cffbc0dc45a969237f23d90b59185826b9eda56a791e799533e`
(14,373,430 bytes), tagged `cp39-abi3-manylinux_2_34_x86_64`. The narrower
platform tag does not inherit public 0.4.55's manylinux2_17 support. Its actual source
is pinned by [the current semantic diff](weft-source/current-semantic003.patch),
independent of the initial prototype package label. The [held cohort review](reviews/held-cohort001.md)
confirms all 17 other selected distributions, wheel rows and bytes unchanged.
The [held installed probe](reviews/probe-actual003.md) subsequently passed all five
cases with the actual Access-to-Weft wrapper, exact offline installed member
correspondence, unchanged legacy program hash and zero leases. This closes
compiler admission only. The [complete core/PostgreSQL command](reviews/build-actual005.md)
then passed 892 tests across 33 result summaries, with source, log bounds and
cleanup independently verified. This is not full workspace/runtime coverage;
the separate inherited runtime command then passed 69 tests, with
[independent actual review](reviews/runtime-actual006.md). Candidate/qualified
workspace conformance then passed both inherited profiles: 1,117 candidate and
1,118 qualified tests, with zero failures or ignored tests. These overlapping
counts are not summed. [Actual review](reviews/workspace-actual007.md) retains
the exact features, optimization settings and local Python 3.11 substitution.

The [standalone N12 actual review](reviews/n12-actual004.md) accepts 71 checks
for the held Linux wheel: ordinary sync/async operations, omission versus NULL,
profile/source/cursor/occupied-slot isolation, rollback and lost-COMMIT recovery,
and approved generation 1-to-2 default changes with unchanged historical rows.
Independent catalog observations retain integer storage (OID 23) and the raw
numeric-cast default expressions. Distinct logical schema authority roots keep
the existing external-authority guard intact. Earlier attempts 001–003 and their
fixture/custody failures remain recorded. Owned databases, eight roles, containers,
volumes and network were removed and absence verified.

The prototype N12 result remains scoped to its held Linux wheel. Final successor
source is now frozen at Weft `973d864c8d26b2bc173a411eac8368da5efc1ab3`
(tree `8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff`), local version 0.4.56,
without publication. Genuine manylinux2_17 x86_64 and aarch64 wheels were built.
The [x86_64 review](reviews/final-x64-build002-audit003.md) accepts the original
build plus a separate audit-only continuation: the original receipt retains its
failed compressed-tag oracle. The [ARM review](reviews/final-arm64-build003.md)
accepts build/static checks only, without installed ARM execution.

The [final 18-wheel cohort review](reviews/final-cohort003.md) accepts reconstructed
metadata and unchanged bytes for the other 17 distributions. Its combined glibc
minimum remains 2.34 because of the selected Core wheel; Weft alone is 2.17.
[Fresh installed preparation](reviews/final-installed-prep001.md) accepts the exact
Linux Python 3.11 snapshot and all five compiler-admission cases, with zero leases.
It does not qualify PostgreSQL/native behavior.

The first [full campaign attempt](full14-attempt001/operator-result.json) failed
before guest startup: a nested packet mount could not create its target beneath
a read-only operator directory. No scenario ran; cleanup passed. The
[reviewed mount repair](reviews/full14-mount-repair001.md) keeps the packet bytes,
14-case/19-scenario roster, 180-second child limit and 1,800-second aggregate limit.
The separate [macOS attempt](macos-build001/result.json) failed at preflight before
compilation because the build interpreter reported absent header paths. Its
[measurement repair plan](reviews/macos-preflight-repair002.md) selects actual
CLT bundle identities while retaining raw sysconfig anomalies; no macOS artifact
or runtime qualification follows from that plan.

The complete serial native campaign, inherited installed/CLI/WASM/browser gates,
macOS build/static-only artifact, independent final review, normal merge,
immutable release and fresh public proof remain open. GitHub Actions and macOS
CI remain off. G02 release evidence keeps its own scope. No managed consumer,
additional backend, new macOS feature qualification or Praxis change follows.

[custody.json](custody.json) records exact source paths, bytes and SHA-256 hashes.
Retained scripts are evidence copies and contain original operator paths; they are
not a relocatable execution package. No wheel, installed environment or build cache
is included in this packet.
