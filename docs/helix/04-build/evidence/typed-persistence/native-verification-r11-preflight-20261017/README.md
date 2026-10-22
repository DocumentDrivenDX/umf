# Native target verification and process cache: R11 source preflight

Temporal qualification remains **HELD**. This is a source preflight, not installed-runtime or managed qualification. The later coherent wheel must independently replay its tests and real E2Es.

Three cache unit controls, two native-resolution unit controls, two public sync/async verification controls, ten Unity Catalog runtime fault controls, and six host transport fault controls pass. The transport doubles do not qualify native authentication, a warehouse, or independent principal authorization. Public eager verification maps shape mismatch to TargetMismatch and retains original causes; native permission errors remain native errors.

The real PostgreSQL 18.6 preflight executes the exact catalog metadata SQL, observes database OID/system identity/schema/relation/actor, and proves ALTER TABLE ADD COLUMN changes its complete metadata fingerprint. It cleans its fixtures and stops its owned server. The first sandbox attempt failed initdb at shared-memory allocation, ran zero checks and started no server; its failure is retained separately.

The process cache is bounded with an optional positive lifetime. It only reuses basic type/Key validation after fresh native resolution, locks, actor/RLS admission and complete table/column/type/collation/unique-index/opclass metadata observation. The normal read closes with another fingerprint observation. It never caches grants, current principal admission, native term/projection/relationship programs or action fences. Without the explicit native store/resolution profile the runtime refreshes the existing verification path.

The optional managed host observes SQL/runtime and Spark versions using the documented current_version()/version() metadata functions. See [Databricks current_version](https://docs.databricks.com/aws/en/sql/language-manual/functions/current_version) and [version](https://docs.databricks.com/aws/en/sql/language-manual/functions/version). Exact native version pins and source/UUID/principal/shape checks are required; caller labels alone cannot establish a native version.

Exact source is retained under source/. inventory.json pins all retained bytes. New full-record E2E controls for cross-connection cache reuse, actual nullable DDL invalidation, and revoked table-grant refusal are prepared but not claimed passing here.
