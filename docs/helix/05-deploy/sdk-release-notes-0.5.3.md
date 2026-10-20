---
ddx:
  id: umf.sdk-release-notes-0.5.3
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-079
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: umf.implementation-plan
      kind: informed_by
---

# UMF SDK 0.5.3

## Release Scope

SDK 0.5.3 packages `umf_access==0.1.0.dev 5` and
`umf_codegen==0.1.0a 2`. The compatible compiler remains Weft 0.4.48.
Core Python 0.10.0 wheel/source assets retain their previously published bytes.
New release assets have fresh versions and checksums; previous releases remain
immutable. Release date:2026-10-20. Delivery uses GitHub release assets.

## Audience and Channels

Python application authors receive the embedded generator wheel; native host
embedders receive the optional access runtime. The SDK archive contains the
TypeScript/browser library, schemas and declarations. Generated application
packages require Python 3.11+ standard library only.

## Highlights

- Legacy module/DDD action declarations refuse at their original source paths.
  Graph-write/2 supports optional assignments to absent-allowed fields while
  graph-write/1 preserves required input behavior.
- Generated clients expose synchronous and asynchronous typed action, batch and
  advisory validation methods, named condition enums and explicit 100-item limits.
- Successful receipts acknowledge confirmed commit. Lost/malformed/pending write
  outcomes preserve uncertainty and the invocation key without automatic retries.
- Cancellation retains the original exception and Python control flow. The
  exported `write_outcomes_unknown` helper inspects retained exception chains.

## Changes and Fixes

Unknown condition IDs refuse response admission against the invoked action's
source declaration. Metadata distinguishes local diagnostic categories from
wire error codes; the published batch limit and runtime share one constant.
Atomic and partial stopping rules reject invalid unattempted-item arrangements.
Receipt collections are required, including explicit empty arrays/maps.

The embedded generator, source manifest and release pin are rebuilt together.
The separate graph-write/1 native plan executor is unchanged; generated
method availability does not qualify a host's mutation/authorization behavior.

## Breaking Changes and Required Actions

Regenerate clients and implement the `umf.access/1` host contract before adopting
the new methods. A transport returns definite refusals as matching-schema wire
envelopes; raising `AccessError` after dispatch becomes write uncertainty.
A successful graph receipt requires explicit created/changed/counts collections
and a nonempty consistency token after commit. Atomic uncertain settlement uses
the whole-response uncertainty envelope rather than per-item unknown outcomes.

TaskGroup suppresses cancelled children. Applications needing their recovery keys
capture `write_outcomes_unknown(error)` inside each child before re-raising.
The generated client maintains no outstanding-write registry. The shared
`PreconditionFailed.precondition` remains a string that compares with generated
string Enum values; supplied IDs must be declared by the selected action.

## Migration or Rollback Guidance

Keep original ontology bytes, generated package, generator wheel and host cohort
together. Retain idempotency keys across unknown outcomes and use the host's
explicit recovery operation; do not blindly reapply. Rollback installs the prior
SDK/Python assets and regenerates against the retained source. Do not relabel old
receipts or reuse source identities across deployments. This release performs no
automatic database migration.

## Validation

The focused portable-client tests, actual Chromium byte parity, typecheck,
dependency gates and canonical embedded-builder correspondence pass. Astra's
independent review found no correctness issue in the reviewed runtime. Hosted
Linux checks for the reviewed PR passed, including Python 3.11–3.14 portable
adoption and both supported Pydantic compatibility cohorts. The exact scope and
historical source pins are in the [consumer review receipt](../04-build/evidence/praxis-consumer-review/verification.json).
The release qualification assets record the final packaged versions and bytes.

## Known Issues and Support

The API remains experimental. Complete machine-readable wire schemas, link-key
projection and exhaustive cross-platform/interpreter byte equality remain open.
Local functional testing uses macOS ARM64; CI uses Linux. No new full production
graph-write/2 executor, native authorization/restart recovery, Spark or Databricks
qualification follows from this portable-client release. Additional host actions
require their own conformance evidence. Report issues with the exact source,
generator version, host version and invocation/recovery identity.
