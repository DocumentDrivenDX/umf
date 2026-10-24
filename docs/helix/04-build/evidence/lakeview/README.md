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
| Existing metamodel tests | 58 passed; clean-room generation hit its 120-second timeout. Source-bound generated-resource freshness passes separately; no full 59-test pass claimed |
| Generic kind installed parity | 15 cases across CLI, Node, Bun, Python and Chromium; zero mismatches in the refreshed [kind receipt](../extension-kinds/receipt.json) |
| Extension and JSON Schema audits | 72/72 packages and 382/382 schemas pass |
| Library type checking, generated-resource check, Rust boundary checker and controls | Pass; 28 boundary/inventory/transport controls pass; combined tools typecheck retains the #46 baseline limitation |
| Core authority, compilation boundaries and acceptance traceability | Authority/boundary checks and ledger freshness pass; 841 criteria. Ledger unit reruns encountered the preparation/time-budget limits below |

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
at `1a1d234833c74ff35799030e01d8824011b5e25e`. Generic kind admission,
discovery and interpretation remain in that prerequisite; this PR owns the
Lakeview package, adapter/runtime integration and original-byte tests. Receipts
are refreshed on the stacked source cohort and qualify local built artifacts,
not hosted CI, a package release or native workspace acceptance.

Combined `bun run typecheck` retains the prerequisite baseline error in unchanged
`scripts/rust-core/full-conformance.ts:50`; library `tsc --noEmit` passes.
Initial metamodel and acceptance-ledger unit runs timed out during compiler
preparation and filesystem-backed source scans while other builds were running.
The metamodel semantic rerun uses the freshly built native CLI; generated-resource
freshness is independently source-bound and passes. Timeout runs do not count as
a full metamodel or ledger-unit pass.
