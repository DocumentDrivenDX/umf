# Prepared source reuse

Each native reader/writer owns its copied bundle, reference and binding. Its
first call verifies source and binding correspondence, parses the document and
indexes commands. Subsequent calls reuse those private values while resolving
the current registered subject and creating a fresh principal/audience probe.
No lease, native observation or data result is cached. Replacing the frozen
session policy invalidates preparation; an inherited-process reader refuses
before entering its source lock. Failed preparation is not cached.

Ten unit checks pass with installed optional dependencies and in the minimal
environment: snapshot consistency, fresh person/batch rebinding, unknown
subjects, policy invalidation, failed preparation, concurrent cold calls and
process guarding. The local dev4 wheel contains exactly80 current source modules
and MIT OR Apache-2.0 metadata. Installed PostgreSQL18.6 execution passes180
assertions across six driver/pool variants and nested generated association
methods; all98 leases return. Existing live correspondence steps are retained.

The source verification/parsing cost now follows reader/writer preparation,
rather than request count. This is not a whole-request performance claim:
redundant native catalog probes and per-item mutation dispatch remain open.
The full Praxis lifecycle, fixed-method port and release gates remain open.

[Receipt](receipt.json), [six-driver native](native.json),
[nested sync/async native](nested-native.json).
