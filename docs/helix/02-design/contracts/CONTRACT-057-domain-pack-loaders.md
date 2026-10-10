---
ddx:
  id: CONTRACT-057
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-009
      kind: informed_by
    - id: SD-026
      kind: informed_by
    - id: CONTRACT-052
      kind: references
    - id: CONTRACT-053
      kind: references
---

# CONTRACT-057: Domain-pack loader companions

**Type:** metadata, host CLI and local publication protocol. **Version:** 1.0.0.

## Purpose

Distribute one reusable acquisition mechanism for building public releases and
operator-scheduled refresh. UMF owns declarations. TableSpec owns the primary native Python acquisition,
offline BagIt handoff and database publication runtime. The published Bun
companion 1.0.0 is a retained compatibility reference. No pack read executes code.

## Scope and Boundaries

The first runner accepts explicit finite source inventories for court PDFs,
SEC filing documents and generic documents. It does not discover court website
links, query PACER, infer S&P membership, extract financial facts, send email or
run model analysis. Users can update inventories programmatically through a
separate collector; source-specific discovery is a later trusted adapter.
Backfill acquires every selected entry; refresh rechecks every selected entry so
older changed postings are not skipped by a timestamp watermark. Replay needs
only retained bytes. This release qualifies local immutable publications;
warehouse and graph loading remain downstream.

## Normative Surface

`loader` is optional extensible domain-pack metadata:
`{version:"1.0.0",id:"umf.document-loader",implementation_version:"1.0.0",
profile:"court-documents"|"sec-filings"|"documents",runtime:"bun",
entrypoint:"run.ts",artifacts:[{reference,sha256}],configuration_schema:"inventory.schema.json",
qualification:nonempty-string}`. Canonical entrypoint and configuration schema names are exact, not overrideable.
All companion files are pack-local, checksum
pinned and exported without executing them. Unknown annotation fields survive.
Unknown versions/IDs/runtime/profile MUST refuse execution, but remain retainable
as ordinary JSON. Portable `inspectDomainPackLoader(input)` returns
`{valid,complete,diagnostics}`; complete means the declared metadata profile is
understood, not native-source qualification. `generateDomainPackLoaderSchema()`
is the structural authority. Existing packs without loader remain unchanged.
A loader-bearing pack is admission-checked by `inspectDomainPack` independently
of its fixture execution_profile; neither profile authorizes the other.

Invocation:
`bun run.ts --pack PACK --inventory INVENTORY --state DIRECTORY --mode backfill|refresh|replay --rights local-use|redistribute`.
Pack, state, mode and rights flags are mandatory; inventory is required for acquisition. Replay uses the committed inventory and permits omission of --inventory; a differing supplied inventory MUST refuse. Output is under state/publications; there is no database
sink. Pack identity/version and exact manifest hash bind the state. Changing pack,
stable inventory ID/profile, rights selection or runner version requires a new state
directory; inventory contents may change between invocations. Inventory identity
is an explicit stable `id`, not its filesystem pathname. Mutable config bytes are
hashed and retained per run. One exclusive lock protects the whole state; lock
recovery after killed processes is a manual operator step only after proving no
runner is active. No automatic stale-lock deletion.

Inventory version 1.0.0 is `{version,id,allowed_hosts,request_interval_ms,
max_bytes,max_total_bytes,max_documents,timeout_ms,retries,entries}`. Entries are
`{id,url,media_type,license:{redistribution:allowed|restricted|unknown},metadata?,expected_sha256?}`. An optional explicit expected_sha256 MUST be a lowercase SHA-256 and MUST match acquired bytes in both backfill and refresh. Uninterpreted metadata checksums are documentary only.
IDs are opaque nonempty strings; distinct URLs cannot share an ID in one inventory.
Media types are `application/pdf`, `text/html`, `application/json`, `text/plain`.
Unknown inventory and entry annotations MUST be retained in the run inventory.
Require HTTPS, no URL credentials/fragments, exact allowed hostname matches,
standard port and no redirects. Literal IP/private/localhost names refuse.
Host allowlisting is operator trust: DNS rebinding is not prevented by this
runner. Court profile selects PDFs and operator-selected `.uscourts.gov` or
state-court hosts; no full court coverage claim. SEC profile allows only
`www.sec.gov` and `data.sec.gov`; `UMF_LOADER_USER_AGENT` MUST be present and
identify an organization/contact. All profiles send the operator's user agent
or the generic runner identifier, never secret-bearing authorization headers.

Bounds: 1–1000 documents, 1–50 MiB/item, 1–500 MiB/run, 1–60 seconds/request,
0–3 retries; request interval 100–60000 ms (SEC minimum 1000 ms). One process
requests serially, including retries. SEC users MUST externally coordinate their
aggregate rate across separate state directories/machines; this release does
not claim a global distributed limiter. HTTP errors and timeouts are reported;
retry only transient 429/5xx and transport failures, with bounded backoff and
Retry-After capped at 60 seconds. Response streaming enforces item and total consumed byte
budgets including failed attempts/retries; exhaustion MUST refuse every subsequent request.
Limits are enforced on received application chunks, with at most the offending
chunk consumed before refusal, not a physical wire-traffic bound; timeout covers response headers and
the complete streamed body. max_documents is positive capacity; zero selected entries are valid. PDF profile verifies PDF magic; JSON is preserved as bytes, with no
number conversion. Response content-type must match declared media type
(allow charset parameters); mismatches refuse. Restricted rights refuse all
acquisition; unknown rights permit only explicit local-use. Rights declarations
are assertions, not independent legal clearance.

Immutable publication directory contains `manifest.json`, `documents.jsonl`,
`inventory.json` and content-addressed `objects/<sha256>` originals. Each projected
row contains `{id,url,sha256,media_type,bytes,revision,metadata,license}`; revision
identity is the original-byte hash. All successfully seen revisions remain in
manifest history, even if absent from later inventories. No absence is interpreted
as deletion/vacatur. Latest rows are selected only for entries in the retained
inventory, with every revision and source context inspectable. Initial projection
is metadata-only, never PDF text extraction or a Company Facts numeric projection.
A row MUST retain opaque metadata; exact number content stays in originals.

Each successful acquisition MUST retain a retrieval observation with run ID, source ID, byte hash, URL, exact inventory hash, retrieval time, metadata and rights. Deduplicate document objects and identical historical rows, but retain observations even for unchanged bytes; current row selection follows the latest successful selected observation, including A→B→A. Preserve exact historical inventory texts by hash. Bound snapshots to 500 MiB unique original bytes, 10000 historical rows/configuration revisions and 100000 observations, with a 100 MiB manifest metadata cap; exceeding bounds refuses without pruning.

Run receipt in `runs/<run-id>.json` names operation/version, pack hash, inventory
hash, mode, rights, start/finish, scope IDs, per-item outcomes and overall status.
Item failures use stable stages/codes without raw secrets. Failure receipts may
retain archive attempts, but MUST NOT advance the published pointer. A successful
empty inventory is allowed with scope [] and remains distinct from failure.
`manifest.json` version 1.0.0 MUST bind pack identity/hash, implementation, rights, profile and stable inventory ID; inventory, projection and prepared complete-receipt hashes; projection version; historical rows, exact prior inventories and retrieval observations. `current.json` version 1.0.0 names a contained publication manifest and its hash. Replay verifies the entire committed closure and uses the retained inventory, never an implicitly changed external selection.

`current.json` is atomically renamed after a complete immutable publication is
written; it points to that manifest. It is the only authoritative checkpoint,
so interruption before pointer rename retains the prior publication. Publication
orphans are safe to retain and may be inspected; no exactly-once remote sink claim.
Prepare the complete receipt inside the publication before pointer rename. Rename is the commit point; post-commit receipt-index/lock cleanup problems MUST preserve success with a cleanup warning. Process interruption is qualified separately from power-loss durability.
Exit 0 means complete publication/replay; 1 means failure/refusal; 2 means usage.
No per-item partial success is a complete release. Refresh keeps previous
revision history and rechecks bytes; replay verifies every retained object hash
and projection before publishing, without requests or environment user agent.

### Verified publication-to-projection bridge

The same companion ships `read-publication.ts`. Invoke
`bun read-publication.ts --state DIRECTORY --selection FILE --output NEW_DIRECTORY`.
Selection is a JSON array of at most 1000 unique `{id,revision?}` pairs; revision
is an optional byte hash. Missing selections refuse. Omitted revision selects
current rows; an explicit revision selects all retained source/context rows for
that ID and byte hash, without collapsing competing contexts. Verify the full
committed closure before returning/writing any selected data. The read-only host
API `readLoaderPublication(state,selection)` returns selected row copies and
independent original byte arrays, with a preflight 500 MiB aggregate selected-copy cap counting every context before cloning, plus manifest/pack/inventory hashes, projection
version, rights and scope selected-originals-only. The command writes exact
content-addressed objects and selection.json into a staged new directory; existing
outputs refuse. It does not fetch, change acquisition state, parse bodies, perform
financial/legal filtering or clear redistribution rights. Domain builders own
bounded exact-token/filter projections and new domain-corpus publication.

## Precedence and Compatibility

Published implementation 1.0.0 bytes MUST remain immutable after release; changed code or companion artifacts require a new exact version and separately qualified state. Development snapshots may change before publication and MUST be identified as pre-release.

Loader metadata is an additive annotation with its own schema/version; core and
`umf.domain-pack` stay 1.0.0. Export validates all declared companion checksums,
paths and source rights before copying. The trusted builder/exporter MUST compare the declared closure against its independently installed canonical release, snapshot verified bytes once, reject canonical path/prefix collisions, and publish a staged export to an absent or empty destination. Existing exports use --check. A changed supplied runner with a matching changed pack checksum MUST refuse export. The invoked standalone runner checks installation consistency; executing arbitrary downloaded code remains outside this guarantee. Pack checksums establish integrity, not executable trust. Existing profile
and source export rules still apply. The runtime is trusted and unsandboxed;
metadata cannot choose a module to execute.

## Error Semantics

Invalid config, profile, paths, checksum, rights or state identity refuse before
network access/publication. Concurrent state use refuses. Source failures yield
nonzero status and coverage receipts; interrupted runs preserve prior current.
Disk/full/permission errors may prevent receipt writing and exit nonzero; the
operator must treat absence of a final receipt as failure. Recovery is rerunning
with the same state after resolving failure or safely removing an abandoned lock.

## Examples

A court inventory selects PDF URLs and unknown rights with `--rights local-use`.
A SEC inventory selects accession-qualified filing URLs with allowed rights and
an externally supplied organization/contact user agent. Both run the same CLI;
a daily cron entry invokes `--mode refresh` with absolute paths. Preserve prior
source IDs when inventory URLs change; changed bytes create retained revisions.

## Non-Normative Notes

SEC source guidance checked 2026-10-09:
[API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
and [developer guidance](https://www.sec.gov/about/developer-resources).
Submissions discovery and Company Facts projections require subsequent profiles.
The first companion is published as a downloadable source bundle on GitHub Pages;
installation requires Bun, no npm publication or running hosted service.

### Source annotations for companion artifacts

A source record may independently annotate a canonical companion reference.
Export retains that record in the manifest and emits one artifact only after
canonical trust, source rights and both byte-hash declarations agree. Other
artifact path collisions still refuse.


## Preservation profile and native Python consumer

`preservation` is optional extensible metadata with exact required fields:
`version:1.0.0`, `handoff:BagIt-1.0`, `fixity:sha256`,
`events:PREMIS-3.0-semantic-mapping`, `provenance:PROV-O-JSON-LD`,
`originals:authoritative-immutable-bytes`, `primary_runtime:tablespec-python`.
Unknown annotations survive. Unsupported known values refuse profile admission.
Optional `derivations` entries name a resolvable pack schema ID, explicit
`source_identity` and qualification; they do not infer source-revision bindings.

TableSpec 0.0.8 executes the installed canonical inventory/admission contract in
Python without invoking the compatibility runner. `loader.runtime:bun` remains
the historical companion declaration; preservation.primary_runtime identifies
the primary consumer. Pack and loader contract versions remain separate from
the Python implementation agent version. Its native state layout differs from
TS state: only original bytes and revision hashes are parity claims.

Complete [BagIt 1.0](https://www.rfc-editor.org/rfc/rfc8493.html) directories MUST
checksum payload and tags, including the retained pack closure, PREMIS semantic
JSON and PROV-O JSON-LD. The semantic mapping MUST retain every media/context
assertion and inventory rights without inferring legal clearance. PREMIS XML,
OCFL repository layout and WARC HTTP capture are not implied support claims.
See [preservation operator guidance](../../05-deploy/document-preservation.md).
