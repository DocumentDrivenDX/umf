# Action and saga test tightening

**Status: complete.** This evidence accompanies
[PR #76](https://github.com/DocumentDrivenDX/umf/pull/76) and the
[test-tightening plan](../actions-sagas-test-tightening-plan.md).
The selected source is `d5fdfd606660accc9986c7c1c7c7d3929ed5b732`.
[CI run 41228219639](https://github.com/DocumentDrivenDX/umf/actions/runs/41228219639)
passed, and Sol independently accepted its exact retained artifact. PR #76 merged
at [`fde8d981208807a9a65be129935801be6c7eae91`](https://github.com/DocumentDrivenDX/umf/commit/fde8d981208807a9a65be129935801be6c7eae91),
preserving the qualified source tree. All T0–T5 slices and F1–F6 findings are closed.

This work changes tests, qualification tooling, CI allocation and current test
plans. It does not publish another SDK/Python cohort, change the action/saga
language, or qualify a production host. The completed SDK 0.10.0 / Python 0.10.4
[release packet](sagas/README.md) remains a separate historical record.

## Findings and reviewed implementation

| Finding | Implemented check | Review disposition |
| --- | --- | --- |
| F1 — insensitive oracle | Exact independently expected diagnostic code/path/severity inventories; requested edit and unrelated-source preservation assertions; actual verifier mutants for no-op edits, incorrect/extra diagnostics and falsely compatible unknown recovery. | Complete: source reviewed and hosted controls pass. |
| F2 — self-derived claims | Representative complete static action and saga obligation tuples; independent positive claims and missing/duplicate/unsupported/wrong-source/identity controls. | Complete: source reviewed and hosted controls pass. Supplied claims never establish execution; unknown meaning remains unqualified. |
| F3 — missing CI impact | One checked-in impact roster with actual-path existence/exact-flag controls; shared executor/root locks/composed retirement dependencies run the relevant native suites. Python qualification runs the new four helper/version cases and existing six exact-installed-payload cases. | Complete: selected hosted gates and controls pass. |
| F4 — incomplete artifact custody | Five exact host reports with corpus IDs/coverage, input snapshots, tested-byte hashes, copy verification and atomic retention. Python compares the complete installed payload/native extension to the selected wheel before/after vectors under its exact isolated interpreter. SDK compares all seven consumed members with archive/install/manifest bytes and checks stability across probes. | Complete: seven actual local substitutions refuse; fresh hosted cohort and all retained hashes independently accepted. |
| F5 — incomplete native oracle | Shared independent provider observer distinguishes missing/pending/closed noncommit/outcome facts; conflicting/duplicate expected facts refuse. One five-step case verifies reverse unwind and exact original provider outputs, including acknowledgement loss/restart. | Complete: final hosted native/oracle witnesses pass. |
| F6 — misleading allocation | STP-905/906 name retained executable tests and fixture IDs. Component-wide all-AC labels were removed; observations write to cache rather than historical receipts. | Complete: mappings and final evidence independently reviewed. |

The seven consumed SDK members are package.json, manifest.json, dist/umf.js,
dist/loader-contract.js, dist/runtime/wasm/index.js and the runtime's generated
JavaScript/WASM pair. This is a bounded consumed-artifact check, not a claim that
all 1,814 distribution files were semantically exercised. Python's exact installed
checker retains its complete RECORD/payload checks; only the exact known
dist-info/uv_cache.json installer metadata path was added to its allowlist.
Unrelated metadata, changed payloads, unrecorded bytecode and escaped files remain
refused. Interpreter probes use explicit `-I -B`.

## Consolidation and retained witnesses

Eleven overlapping component flows were removed after comparing their assertions
with retained public witnesses. The [plan's removal map](../actions-sagas-test-tightening-plan.md#consolidation-decisions)
records each prior label and replacement. Public protocol tests own lifecycle
composition. Component tests retain distinct gateway authorization, live retry and
whole-ticket finality, original-result immutability, fence/capacity, retained-byte,
namespace and legacy-custody cuts. The composed AC24 native in-flight retirement
tests remain on the selected CI path.

Provider observation queries and owned PostgreSQL preparation are shared;
expectations remain independently authored. The corpus itself is the sole case
ID/coverage authority, with uniqueness and complete bounded coverage checks.
There is no second manually maintained 19-case roster. All-host transport and
installed-artifact proof remains separate from shared Rust semantic checks.

## Frozen hosted qualification

The final Ubuntu 24.04/Linux x86_64 run built the shared engine, N-API addon, native
CLI, WASM/SDK and Python wheel from the qualified source, then rebuilt and
installed its source archive with JavaScript tools blocked. Observed runtimes
were Bun 1.4.3, Chromium 153.0.8010.12, Python 3.13.17 and PostgreSQL 17.9. These
are qualification-consumer observations, not production hosting claims.

| Hosted gate | Observed result |
| --- | --- |
| Native action reference suite | 125 tests / 1,997 assertions, 41 files; 409.61 seconds. |
| Portable actions | 63 tests / 513 assertions, ten files; 50.96 seconds. |
| Saga test glob | 59 tests / 743 assertions, eight files; 168.04 seconds. This includes portable-oracle/custody unit controls and is not 59 native acceptance scenarios. |
| Composed native retirement and output-unwind witnesses | Both admitted-handler retirement tests and the combined five-step original-output unwind passed. |
| Portable hosts | Native N-API, real Chromium WASM, CLI, selected Python and source-rebuilt Python each passed the exact 19-case roster. |
| Installed SDK | Existing 139 consumer cases plus all 19 saga vectors passed. |
| Selected Python consumer | 35 resource tests, four helper/version tests and six exact-installed-payload cases passed under isolated invocation. |
| Impact/boundary | Three table-driven selector tests; inventory 627 modules / 453 scripts; 636 source modules checked, production core pass, zero findings, nine boundary controls and 16 +13 boundary/inventory unit tests passed. |

## Retained artifact review

[Artifact 13053411948](https://github.com/DocumentDrivenDX/umf/actions/runs/41228219639/artifacts/13053411948)
is 97,638,073 bytes. Root and Sol independently reviewed the downloaded packet.

| Retained identity | SHA-256 |
| --- | --- |
| Downloaded artifact ZIP | `23f426eeabf44a99e4397d2737405e5a37b95c9bcc8758077ab106a77b2000e7` |
| custody.json | `a642ae4ea6f66710fd375a868928dc4f921fa4c42ef1c087ae581fdad479b185` |
| SHA256SUMS | `88b9d1ffa746fc0920a66b6eac1b25b4a85b6f35e9629803a6af709c2323c141` |

The custody source is exactly `d5fdfd606660accc9986c7c1c7c7d3929ed5b732`.
All 42 qualification-input hashes match that source. All 23 referenced retained
files and all 24 checksum rows, including custody.json, match their bytes. Each
host report has the exact unique ordered case IDs, coverage and 19 passing results,
with matching corpus/input hashes. The SDK's seven archive and installed member
maps agree, and each consumed dist member also matches the distribution manifest.
The selected Python receipt matches the repaired manylinux_2_34_x86_64 wheel and
the exact source archive used by the rebuilt-wheel probe.

Both hosted Python installations retained 46 installed files / 36 package files.
Their actual wheel payloads independently match the before/after native hashes:

| Python artifact | Wheel SHA-256 | Unchanged installed/native-payload SHA-256 |
| --- | --- | --- |
| Selected repaired wheel | `1f87160d8c51e33877b1aa2c942169c5180743d45228655a4a62ad11b02722a6` | `8a4aa831571508bea799779498bffd47a7db0b5a4f7613b752517278aad62a71` |
| Source-rebuilt wheel | `7e107a09b56ac2f5713202421db076e38b0825070f0183379512c99da1f7aab9` | `a2c08a1a5a3a90037627cc48e64b60079309f1f0cb2ba8b40fc3e7c4b12d2a89` |

The retained source archive SHA-256 is
`0512f8e38c8418fe6daee134de90e49a452ab09699209654986abe5cbccf3b44`.
The SDK archive SHA-256 is
`2fb63dea5ca85b32c6bad823703de526875ac79490234dbfea4a8863c7d5fe6c`.
These are qualification artifacts; no new registry publication is claimed.

## Local observations — earlier preflight

| Observed campaign | Local result and limit |
| --- | --- |
| Portable action suite | 63 tests / 513 assertions across ten isolated files passed earlier in the workstream. |
| Native actions | 125 tests / 1,990 assertions across 41 isolated files passed; 509.38 seconds. This preceded the final verification-input freeze. |
| Six native saga files | 45 tests / 697 assertions passed; 218.18 seconds. This preceded the final verification-input freeze. |
| Focused oracle/custody/workflow controls | Final local combined log records 23 tests / 83 assertions passing. |
| CI impact selector | Three table-driven tests passed: a 20-row primary path/flag matrix plus negative/manual controls. Separate workflow guard: one test / 16 assertions. |
| Rust saga family | Six focused Rust tests passed. |
| Python installed controls | Four helper/version tests and six payload/RECORD controls passed. Root also ran the selected-consumer resource cases and these controls under the final isolated invocation: 35 + 4 + 6 passed. |
| Boundary/inventory | Local boundary and negative-control gates passed; refreshed inventory records 627 source modules / 453 active scripts. The authoritative hosted result is recorded above. |
| Final host preflight | N-API, actual Chromium WASM, CLI, selected Python wheel and source-rebuilt Python wheel each passed 19/19. |
| Installed SDK preflight | Existing 139 consumer cases and all 19 saga vectors passed through the public facade/bundled WASM. |

Local artifacts include existing released production binaries; these observations
exercise the new verifier/custody logic but do not substitute for fresh hosted
builds of the selected source. The local Python profile was Python 3.13.16 on
Darwin arm64. Both selected and rebuilt installations independently matched their
respective wheel payloads before/after vectors: 46 installed files / 36 package
files, unchanged native-extension hashes. The SDK receipt's seven archive and
installed member maps agreed.

Sol independently parsed the restored cohort at source `921c1363bb7e3ba396d06db2ff088af50304bed4`
and verified all 23 retained-file hashes referenced inside its custody record.
Root subsequently collected the same qualification-input/artifact cohort at
`d5fdfd606660accc9986c7c1c7c7d3929ed5b732`; the intervening workflow allocation
does not change those input hashes. These remain local preflight results;
the separately reviewed hosted artifact's identities are recorded above.

## Actual local refusal controls

The actual collector/producer, not a replacement mock, refused each substitution:

| Substitution | Observed refusal |
| --- | --- |
| CLI binary | cli/cliBinary bytes differ from tested bytes. |
| Browser WASM | Browser runtime WASM bytes differ from tested bytes. |
| N-API addon | native/nativeAddon bytes differ from tested bytes. |
| Installed SDK WASM | Exact installed SDK runtime member differs. |
| SDK distribution manifest | SDK install/manifest digest mismatch. |
| Selected-wheel receipt digest | Selected wheel differs from installed/tested wheel. |
| Wrong same-version wheel supplied for an installed Python package | Exact installed payload differs from supplied wheel; version equality does not waive it. |

After restoration, the complete cohort was accepted again. Root's local records
are /private/tmp/umf-tightening-final-controls.log,
/private/tmp/umf-tightening-final-negative-controls.json and the final host/SDK
logs with the same prefix. These temporary paths are operator-local observations,
not durable hosted artifacts. Hosted custody/source/run identities and digests
are recorded separately above; the local mutation campaign is not relabeled as
a hosted mutation run.

## Historical evidence and completion scope

The historical saga release packet, tracked component receipt and formal packet
remain byte unchanged from `f98d650a5`. New observations are written under cache.
The old 43 bounded model checks retain their captured source context; the updated
STP allocation bytes mean the old full packet must not be described as verifying
against this new working-tree context. No model/contract/property change or new
TLC run is claimed. The plan records how to verify the original captured context
with the unchanged verifier if required.

The successful frozen run, exact artifact review and merged PR #76 close this
work. This documentation-only followup does not change qualification inputs or
require another heavy campaign. The native reference consumer remains a bounded
Bun/PostgreSQL profile; support for other providers, production orchestration and
external notification adapters is not established by these results. Test totals
do not replace the retained per-criterion witness allocation.
