# Full PostgreSQL projections and native verification cache: R11

Fourteen real installed E2E checks pass on PostgreSQL 18.6 with pgvector 0.8.7. Temporal qualification remains **HELD**. This is the exact R11 SDK / R7 compiler cohort, independent of later source changes and separate managed, relationship/FK, engine-performance and release gates.

SDK wheel SHA-256: `b5082cfbad6008567ddd5522de9fd6676bc1ee1e0f813a8bec22d96cbcc3cba5`. Compiler wheel SHA-256: `ccb8d99fd5a138850cdcaa9fb226886bfca6b982af6d7c8eab4686e30ad75095`, native payload `63af72f5015d4082d5f00e465f4a2f1425e7106a49613db80d511a96d4e8ca9f`. The native receipt hashes all installed SDK and Weft payloads before and after. Exact SDK wheel payloads are extracted into runtime-source/, independent of the working tree.

Actual public CLI build/check and authored schema load/instance/codec precede native full-model/tuple/page/stream reads. Returned int64, Decimal38, bytea and native float32 Vector values match independent SQL observations. Two real schemas share one original schema-neutral program; cross-schema continuation reuse, empty wrong-width/wrong-scale tables and unsafe catalog resolution refuse. Sync/async stream limits, natural exhaustion and session reuse pass.

The cache controls instrument the real caller's PostgreSQL cursor. Initial admission performs type/Key checks; subsequent operations and a second physical connection reuse only those validations after fresh native fingerprints. Actual DROP NOT NULL invalidates reuse and refuses the changed shape. Restoring native shape allows reading again. Revoking table SELECT after cache warming still produces the original native permission error; column-only grants cannot satisfy the original LOCK requirement. The cache never confers authorization. Both pre-data and closing native fingerprints execute on a hit.

Installed runtime/compiler bytes and harness remain unchanged. Native fixture schemas, grants and role are removed, and the owned server is stopped. The successful R11 run is native/fixture/projection-result.json; its caller-owned lifecycle is native/result.json. Prior R10 failure/pass runs and R11 source-only metadata preflight remain separately retained, not relabeled as this cohort. Current native original-program coverage does not claim the later full-column-inventory/FK/degree successor has run.

inventory.json independently pins every retained file. Original absolute paths inside raw receipts describe the execution environment, not deployment configuration.
