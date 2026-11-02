---
ddx:
  id: umf.plan.rust-migration
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: ADR-004
      kind: references
    - id: ADR-005
      kind: references
    - id: CONTRACT-080
      kind: references
    - id: TP-001
      kind: informed_by
    - id: umf.implementation-plan
      kind: references
---

# Shared Rust port plan

## Objective and decisions

UMF-owned executable semantics have one Rust owner. The Rust library, native CLI,
Python extension, Node/Bun addon and browser WebAssembly interfaces execute that
implementation. Wrappers admit host values, transport explicit capabilities and
present results. ADR-006, the PRD, cross-cutting requirements, architecture, TP-001
and the affected contracts govern behavior.

Core documents remain at 0.10.0. Rust/CLI 0.1.0, SDK 0.10.2 and Python 0.10.6 ship
together under `umf-rust-v0.1.0`. Preserve native values, unknown content, receipts,
resource controls and caller capabilities required by the current APIs.

## Implementation

Rust owns core/model/registry operations; native formats and schema adapters;
RDF, JSON-LD, SHACL and OWL; TypeSpec and Smithy compiler routes; authored targets
and core-ideal classifiers; binding, DDD and physical SQL projections; Bit128,
medical and dataset operations; Actions, plans, Saga and security; dashboard,
catalog, lifecycle, inventory and migration operations; row scope, digests and
reports; Arrow, Parquet, Delta, Protobuf and Relationship Extra archive import.

Public Node and browser roots route callable operations and validation to Rust.
Python calls the native extension and bundled Rust CLI without a JavaScript
subprocess. The default SDK excludes retired reference/candidate executable
exports and drivers. Required schemas, metamodel programs and runtime resources
are packaged explicitly, with current versions and dependent pins aligned.

Host resource registration, explicit compiler/worker factories and pointer
formatting remain host responsibilities. Callback identity, order and configured
controls are retained. Each Rust operation uses its passed Context; a Context
object does not cross the JavaScript boundary.

## Implementation and test discipline

Luna agents implement and test independent capabilities in parallel; Sol plans,
reviews and integrates their source cuts. Give each capability a concrete public
operation and an ordinary normal/refusal workflow, with recovery where relevant.
Repair observed failures and rerun affected workflows. A passing capability stays
closed unless its implementation or dependencies change. Batch native compilation
and retain incremental build outputs. Preserve user `.tmp/`.

All testing and CI work runs locally. Do not wait for GitHub Actions or dispatch
publication builds. Publish the locally tested binaries directly.

## Completed verification

Focused Rust capability baselines and the affected public integration workflows
pass. Source checks pass for generated resources, TypeScript, compile and import
boundaries, strict whole-source access policy with negative controls, Rust core
authority, coupled release versions and SDK packaging.

An independent Cargo consumer builds from the source archive with locked offline
dependencies and executes RDF and GraphQL exact round trips plus native PostgreSQL
import/export/reparse. The macOS CLI parses an ordinary YAML document with an
empty PATH and returns the expected tagged document.

The macOS SDK archive SHA-256 is
`785de2c4db18b030c9462c7f55f52d012db50a4d4b3c608a4dc3aa6f5fa0d39b`.
Its fixed-point source closure is
`f7261a691247692a1ac18b7a2072ae879e99d9216c7f5661dd422ef18984b68c`.
The installed archive passes ordinary document validation/read/write/refusal,
OpenAPI round trip and Avro projection/recovery workflows in Node 26.12.1,
Bun 1.4.3 and Chromium 153. The browser runs without Node globals.

Python 0.10.6 current wheel and sdist exact-source integrity checks pass. The
installed macOS ABI3 wheel passes its public consumer on CPython 3.14.8 with
JavaScript absent from PATH, including PostgreSQL edit/export/reparse and refusal.
The completed source-distribution native rebuild and installed rebuilt-wheel
consumer also pass; the final archive retains the verified native build inputs.
macOS native builds consistently target macOS 11.0 on arm64.

The Linux x86_64 ABI3 wheel passes exact installed-file verification and the
ordinary public/native PostgreSQL consumer on CPython 3.11.17, 3.12.15 and 3.13.16,
with JavaScript absent from PATH. Its SHA-256 is
`9a4fc6e739fb9c0c80e22916490484fb41b6f00985afc53fb81dcca2d72029b9`.
The Linux CLI passes the same empty-PATH YAML workflow as macOS.

The Linux SDK archive SHA-256 is
`0e210969dc6d585d73b0e70d35660421b40c141746389118f7181c54bfcff943`.
Assembly retains the same fixed-point source closure and 2,063 unchanged common
assets, with the Linux native addon and recorded build provenance. The installed
archive passes the document, OpenAPI and Avro workflows on Node 26.12.1 and
Bun 1.4.3 in the cached Linux x86_64 runtime.

Sol has reviewed the implementation, host routing, source/resource closure and
release preparation and the completed Linux artifact results.

## Integration and release

Refresh main before integrating PR61. Preserve tested artifact inputs; account for
actual incoming source changes without reopening unrelated passing capabilities.
Publish one [umf-rust-v0.1.0 release](https://github.com/DocumentDrivenDX/umf/releases/tag/umf-rust-v0.1.0)
containing the Rust source library, macOS arm64 and Linux x86_64 CLI archives,
matching SDK archives, two Python ABI3 wheels, the Python sdist and SHA256SUMS.
Bind the Rust source archive and tag to the merged revision. Retain native build
provenance and the SDK archive verifier's source and member integrity checks.

Use the Rust-tag dispatcher exclusions; do not run GitHub Actions. Verify the
published revision, exact asset roster and downloaded checksums. The distributed
Rust crates retain `publish = false`.

## Acceptance

Every UMF-owned executable operation exposed by the current public interfaces has
a Rust owner and passes its capability baseline. Library, CLI, Python, Node/Bun and
browser entry points execute that owner while preserving current meaning, unknown
content, caller callbacks and controls. Installed artifact checks pass, review is
resolved, main is integrated, and the published artifacts contain the completed
port. Publication and verification close the goal.
