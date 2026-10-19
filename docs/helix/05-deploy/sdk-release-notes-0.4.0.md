---
ddx:
  id: umf.sdk-release-notes-0.4.0
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.implementation-plan
      kind: informed_by
    - id: FEAT-033
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
---

# UMF SDK 0.4.0

## Release Scope

`umf-v0.4.0`, prepared 2026-10-18, delivers the unified generated Python API for
UMF 0.10.0 schemas. The bundle contains the browser-compatible TypeScript SDK
and the experimental `umf_access` 0.1.0.dev1 host wheel. Weft 0.4.43 supplies
UMF 0.10 table compilation as a separate compiler release.
The accompanying delivery manifest identifies exact source and asset hashes.

## Audience and Channels

| Audience | Change | Channel |
| --- | --- | --- |
| Python application developers | One generated API for tables and ontologies | Generated stdlib-only package |
| Metadata consumers | Public generatePythonClient entrypoint | Attached umf-sdk.tgz archive |
| Table hosts | Unified transport adapter using Weft | Attached experimental Python wheel |

## Highlights

- Compose `Model.objects.filter(...)`, typed key reads, ordering, paging and
  named forward/inverse relationship traversal directly. Applications use the
  same calls with table and ontology transports.
- Invoke generated typed Actions methods. Entity parameters use generated keys;
  hosts retain execution, authorization and commit policy.
- Generate from the current UMF schema without authored access views. UUID,
  opaque 128-bit values and exact decimal carriers retain their meaning.
- Generated Python requires only Python 3.11+ and its standard library. The
  separately installed host adapter reuses the existing table compiler in Weft.

## Required Actions Summary

Install the attached SDK archive for TypeScript generation, and the attached
wheel for a table host. Regenerate clients from UMF 0.10.0 source. Use the updated
Weft 0.4.43 build for native table reads; the generator and generated clients
contain no SQL compiler. No npm or PyPI publication is part of this release.

## Changes and Fixes

The generator emits typed frozen rows/keys, column and relationship builders,
Actions, codecs, a transport Protocol, source/description metadata, `py.typed`
and a manifest. The CLI reuses atomic generation and read-only drift checks.

The host adapter delegates raw and related reads to Weft, validates source and
carrier identity, binds values as parameters and authenticates query-scoped
cursors. It supports dotted Action identities, sole declared identities and
field-referenced scalar Action inputs. Lost write responses report an uncertain
outcome without automatic retry.

The exact shared application passes on the independent ontology graph fixture
and PostgreSQL 18.6 through genuine Weft SQL. Shared tests cover inverse traversal,
get-many ordering/duplicates/missing slots, resumed paging, parameter injection,
UUID/bits128 round-trips and action error paths. Chromium generation parity,
Python import isolation and mypy/pyright/ty checks pass.

## Breaking Changes and Required Actions

The new generator accepts UMF 0.10.0. Source meaning that cannot be represented
refuses explicitly. Runtime schemas must match the source digest used for
generation. Regenerate packages and retain source/runtime/compiler versions
together. The host wheel remains experimental; its dependencies are distinct
from the stdlib-only generated package.

## Migration or Rollback Guidance

Follow the [usage guide](../04-build/guides/unified-python-access.md). Install
and pin release assets using SHA256SUMS. Test your authoritative transport before
adopting it. Preserve the previous complete package/compiler cohort for rollback;
no database migration is performed by this release.

## Known Issues and Support

This release implements Python reads, traversal and single Actions with no
business outputs. Action batches, TypeScript client emission, synchronous and
remote transport conformance, compatibility diffing and production ontology
adoption remain open. The graph host and native executor/action callbacks are
test fixtures. No production authorization, durable idempotency or managed-service
qualification is claimed. Earlier target qualification limits remain in force.

## References

- [Unified API contract](../02-design/contracts/CONTRACT-079-unified-python-access.md)
- [Usage guide](../04-build/guides/unified-python-access.md)
- [Implementation evidence](../04-build/evidence/unified-python-access.md)
- [Native execution receipt](../04-build/evidence/unified-access-native.json)
