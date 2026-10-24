# Lakeview kinds and original-byte reconstruction — 2026-10-23

Implements [CONTRACT-082 0.2](../../../02-design/contracts/CONTRACT-082-lakeview-dashboard-interchange.md)
and [US-093](../../../01-frame/user-stories/US-093-lakeview-dashboard-interchange.md),
using [CONTRACT-906 kinds](../../../02-design/contracts/CONTRACT-906-extension-defined-kinds.md).
See the [usage guide](../../../05-deploy/lakeview.md).

## Change and rationale

The source PR is [#42](https://github.com/DocumentDrivenDX/umf/pull/42), inspected
at head `27e36277376b18fd7cbf0a80fb3d3e2b57ba22c8`. Its committed marketing input
is imported unchanged. Its SHA-256 is
`ee1f95917a936051063a08c617099d34b33df5a5604ab2f4d1d8aafdf56643d5`, verified
against that Git blob and the current original file.

The new native representation uses seven extension-owned kinds: dashboard,
data, page, dataset, layout-item, query-result and field. Dataset and query-result
owners are core Records, with ordered core Fields and qualified graph references.
They carry explicit native declarations, not inferred SQL types or a physical
table assertion. The root and layout objects remain Lakeview compositions.
The default document has no parallel field dictionary or `umf.dashboard` 0.1
projection. PR42's unchanged projection helper is explicitly named as a legacy
compatibility view; its narrower field model is not silently presented as core.

Rust owns native parsing, partition, shape derivation, original-source consistency
and untouched export. The native builder shares the bounded JSON scanner and
preserves numeric lexemes as strings. Byte APIs strictly decode UTF-8 while
preserving an optional BOM. A raw source archive preserves lexical information
that the split tree alone cannot: whitespace, string escape spelling and all
native member order. Export compares the current representation with a fresh
derivation from that source and refuses unqualified edits.

The built-in native validator is selected only through trusted registration.
Unknown/mismatched validators and simultaneous callbacks reject atomically;
putting its name into package metadata does not activate code. Native source
semantics remain incomplete even after consistency and byte recovery pass.

## Direct original comparisons

[`browser.json`](browser.json) records actual Chromium WASM execution, with no
external requests or page errors. All three files recover directly and through
both UMF JSON and YAML. Tests compare every output byte to the original bytes;
SHA-256 receipts additionally bind results to the committed originals.
Generic discovery finds 163 attachments on the marketing fixture and ordinary
selection resolves `ds_metric` to its core `Metric Value` Field.

[`installed.json`](installed.json) records the packed Node binding under Node
and Bun, plus the native CLI with empty PATH. All three hosts agree with zero
mismatches. Both UMF serialization paths in this harness use the Rust serializers,
not JavaScript normalization. Each host makes nine direct original comparisons
(three files × direct/JSON/YAML). The CLI needs no JavaScript executable.

The files are the PR42 original (54,077 bytes), a 772-byte synthetic lexical
fixture and a 79-byte empty-section fixture. The lexical case includes BOM,
CRLF/trailing whitespace, numeric/integer-like and prototype-like keys,
non-ASCII UTF-8, alternate escapes, an escaped isolated surrogate, negative zero,
huge integers, an inexact-binary64 decimal and `1e400`. Neither side of a byte
assertion is compacted or normalized.
The fixture paths have `-text` Git attributes so checkout/commit filtering cannot
normalize CRLF or trailing whitespace. Filtered and unfiltered Git blob hashes
are checked for equality before handoff.

## Verification

Qualification uses macOS arm64, Rust 1.90.0, Bun 1.4.3, Node 26.12.1 and Chromium
153.0.8010.12. The native Node/CLI and WASM artifacts use optimized release builds;
macOS native modules retain symbols to avoid the already documented linker
stripping issue. The ordinary test prerequisite builds/stages that Node artifact.

| Check | Result |
| --- | --- |
| Lakeview tests plus existing kind/core/dashboard suites | 193 passed, 4,217 assertions |
| Rust core/wire libraries and integration tests | 221 passed across 30 result groups, including four native Lakeview tests, eight kind tests and frozen runtime/schema corpora |
| Installed Python core, Rust compatibility and kinds tests | 212 passed on Python 3.13.16/Pydantic 2.14.1; generic regression, not a new Python Lakeview API claim |
| Existing metamodel tests | 59 passed, 405 assertions; source-only cold compilation, fixed point, no-write and extra-output rejection all pass |
| Generic kind installed parity | 15 cases across CLI, Node, Bun, Python and Chromium; zero mismatches in the refreshed [kind receipt](../extension-kinds/receipt.json) |
| Extension and JSON Schema audits | 72/72 packages and 382/382 schemas pass |
| Combined type checking, Python lint, generated-resource check and Rust boundary controls | Pass; 28 Python controls plus linked-dependency resolution regression pass |
| Core authority, compilation boundaries and acceptance traceability | Pass; 841 criteria; 5 ledger tests with 1,272 assertions pass |

The shared interpreter is unchanged from the #46 prerequisite; current main
already shares immutable lexical snapshots. Native/core edits, broken members
or references, unknown wrappers, malformed source, duplicate decoded JSON keys,
invalid UTF-8 and work-budget failures have explicit negative controls.

## Limits

The recorded corpus qualifies untouched original-source preservation and explicit
metadata composition. It does not establish a published Databricks format/schema
version, live workspace acceptance, rendering, query execution, inferred source
types, a complete row schema, edited native rewrites or cross-BI equivalence.
No private dashboard is used as passing evidence. Native fragment root shape is
structurally checked; full nested consistency requires the explicitly selected
Rust validator. Missing capabilities remain incomplete, not implicitly trusted.

This revision builds on [PR #46](https://github.com/DocumentDrivenDX/umf/pull/46)
with shared validation fixes at `07598886f762e896781977148083a3dae74363ca`. Generic kind admission,
discovery and interpretation remain in that prerequisite; this PR owns the
Lakeview package, adapter/runtime integration and original-byte tests. Receipts
are refreshed on the stacked source cohort and qualify local built artifacts,
not hosted CI, a package release or native workspace acceptance.

## Clean-validation follow-up — 2026-10-23

The earlier metamodel/ledger timeouts and command-redaction type error are
resolved in the shared prerequisite. This stacked revision passes combined
`bun run typecheck`, all 59 metamodel tests (405 assertions, 120.60 seconds
including cold preparation), and all five ledger tests (1,272 assertions,
7.67 seconds). The scanner reads fresh files with bounded concurrency rather
than serializing more than a thousand reads. No ledger classifications change.

Semantic assertions use an immutable compiler freshly qualified from source.
Clean-room compilation still copies the declared sources and removes any
installed-compiler override. Its cold preparation, existing fixed-point/no-write
assertion budget and native temporary-tree cleanup are bounded separately; all
assertions and negative controls remain enabled. Both subprocess pipes drain
concurrently. This is the same fix exercised by #46, with no Lakeview-specific
exception or skipped test.

Python lint, logical dependency census paths, reference graph identity checks and
the regenerated Bun 1.4.3 compiler payload also pass. Core/package versions are
unchanged. The 193-test Lakeview/kind/core/dashboard suite, 212 installed Python
regressions, nine CLI transport controls, five-host kind parity and four-host
original-byte reconstruction pass again. The native engine and Lakeview source
semantics are unchanged by these build/test fixes.

These results qualify the existing PR stack. Newer main release work at 259bf1e
is not integrated here; hosted checks and current-main merge validation remain
separate gates before merging.
