# Installed PostgreSQL full projections, R12

Temporal qualification remains **HELD**. This is the PostgreSQL 18.6 / pgvector
0.8.7 full-record, projection, verification and stream cohort governed by
CONTRACT-071/072. It does not close the remaining engine or managed-target gates.

The immutable SDK wheel is SHA-256
`c9ce3e3e201c0312e0e41f3d19eeffc1aafe0fad896e7e1446607335d2c4f3d7`,
source `3a8ba1719496ceb2d0e08bc410be74a68f51d871`. The immutable Weft wheel is
`d1da1acb7dcb0838bef9fb1d48f0c7e3db4f166802da2ec8fc2de9ade006fcd1`,
source `2aacd6fdc4ec95ddd428e2656c0181fc3de93dcf`. The separate
[frontend packet](../frontend-r12-20261017/README.md) retains the exact SDK
payloads and installed static/unit qualification. Later live source changes are
not substituted for this wheel.

The fixture was regenerated with Bun 1.4.2. The public catalog CLI builds and
checks three generated declarations on Python 3.14.8. The native campaign passes
**16 checks**: authored schema load and instance/codec creation; complete model
and tuple outputs with signed64, Decimal38, Binary and float32 Vector values;
two physical schemas; original schema-neutral SQL; stream limits and natural
exhaustion; cross-schema continuation refusal; async cleanup and session reuse.

Native verification controls warm the process cache across connections, then
exercise changed nullability, revoked grants, inherited rows and an unexpected
native column. Each invalid state refuses; restoring the native state recovers
the read. Column-only SELECT privileges independently fail the original LOCK
prerequisite. Empty tables with incorrect width or scale also refuse. A
pg_catalog-first search path is required.

[The result](result.json) records successful owned-server shutdown and unchanged
frozen harness. [The native receipt](fixture/projection-result.json) records all
checks, unchanged installed SDK/compiler bytes and completed schema/role/grant
cleanup. Inputs, generated catalog, original programs and raw logs are retained;
`inventory.json` hashes every retained file except itself.
