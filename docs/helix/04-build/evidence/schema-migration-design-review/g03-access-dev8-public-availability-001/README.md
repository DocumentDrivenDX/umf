# Access dev8 public bytes and runtime-identity follow-up

The exact `umf-access==0.1.0.dev8` wheel was served without authentication at
`2026-10-30T01:21:10.089041Z`: HTTP 200, 580,062 bytes, SHA-256
`1a21c1ddd59f6b23e9f0b33228280564af0e96bb4d13699b89616d5143e4fd23`.
The retained normal PyPI version response identifies the same single non-yanked
wheel. The body was measured in memory and was not retained. These are dated
observations, not a fresh download or a guarantee of later index availability.

The [accepted subject](subject.json), [independent disposition](independent-review.md)
and [later custody audit](custody/later-audit.json) support a point-in-time public
byte observation with separate later input custody. The audit ran from
`2026-10-30T01:28:25.350686Z` to `01:29:13.488613Z`; it matched all 57 fixed
references and the complete 1,423-file publishing-tool inventory to the recorded
pre-snapshot. It does not establish uninterrupted immutability between the HTTP
observation and that later audit.

| Original operation | Preserved disposition |
| --- | --- |
| Upload006 | Upload process exited zero; its bounded public readback failed. |
| Read-only owner003 | `PUBLICATION_READONLY_CHECKER_NOT_COMPLETED` |
| Read-only checker002 | `PUBLIC_BYTES_NOT_VERIFIED`; original input postcheck remains `null`. |

The public body observation completed before the checker exhausted its custody
deadline. The independent review accepted that measured fact and the later
physical audit separately. This packet preserves both original failures; it
does not turn them into a completed original transaction. No upload, HTTP call,
credential lookup, installation or runtime check was repeated to create it.

## Runtime identity defect and successor source

Public availability does not establish compatibility. A separate
[static wheel comparison](runtime-identity-static-comparison.json) checks the
retained wheel's metadata and literal identity without importing it. The immutable dev8
distribution reports package version `0.1.0.dev8`, while its runtime identity
still names `0.1.0.dev0`. Genuine generated models pinned to dev8 therefore
encounter the existing `CATALOG_STALE` equality guard. The default compatibility
profile also retained the stale runtime pin. UMF Access owns this defect; the
guard and the generator's explicit runtime-version pin remain intact.

The successor source uses one inert `_version.py` authority for Hatch package
versioning and `types.RUNTIME_IDENTITY`, and selects `0.1.0.dev9`. Production
fix `b9299935b3ff482c7ecb2f29952241bbdf9543fb` is followed by the independently
reviewed harness-only build callback at
`fdb27b875046d227e0cbb353ed90ab69f54ebdf3`. Its selected Linux profile is
CPython 3.11.17, Pydantic 2.13.5 and pydantic-core 2.46.5; the existing default
CPython 3.14.8/Pydantic 2.14.1 profile remains separate. This records committed
source preparation, not a built, installed, merged or released dev9 artifact.

Pending qualification must build the actual wheel from the reviewed source,
generate the Commerce `OrderIdentity` model with the genuine current generator,
and exercise real `weft-sql==0.4.51` compilation and Access catalog admission/load,
including dev0 rejection before target access. `weft-sql` is a distinct
distribution from the separately released `umf-weft==0.4.56`. The focused
identity check dispatches no database operation and cannot qualify a Truss
distribution or native migration lifecycle. Its execution admission, result
review, normal merge, publication and public-byte verification remain open.

The dev8 bytes in SDK 0.5.7/0.5.8 remain immutable. This packet changes neither
those assets nor their frozen release notes. GitHub Actions and macOS CI remain
off; built macOS artifacts retain build/static-only evidence. Consumer runtime,
managed acceptance, full G03 and G04–G11 completion remain unproven. No Praxis
code or consumer workload is changed here.

## Copy custody

[`custody.json`](custody.json) maps the ten byte-identical copies (325,234 bytes)
to their original paths, sizes, digests and roles. Original absolute references,
statuses and null fields remain unchanged. Lower-level files and tool binaries
remain at their original locations unless listed; no artifact body or missing
postcheck was reconstructed. `SHA256SUMS` covers every packet file except itself.

Read the [metadata observation](public/observation.json), [PyPI version body](public/version.json),
[upload owner](original-upload/owner-result.json), [intent](original-upload/intent.json),
[outcome](original-upload/outcome.json), [read-only owner](read-only-attempt/owner-result.json)
and [checker result](read-only-attempt/checker-result.json) with the independent
disposition and their original scopes.
