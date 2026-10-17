# Ranked keyword configuration: repeatable-read coherence failure

This is a successful reproduction of an unsafe source profile, not a qualification pass. On owned PostgreSQL 18.6/pgvector 0.8.7, the exact original Rust-produced guard admitted English configuration. A constrained NOSUPERUSER/NOBYPASSRLS reader began a read-only repeatable-read transaction. The unchanged original keyword SQL matched body `running` against query `run`.

A separate owned administrator changed only English `asciiword` mapping to `pg_catalog.simple`. The same-snapshot original SQL catalog guard remained TRUE, while the same original keyword business statement returned no row. A fresh-snapshot guard returned FALSE. Configuration OID/name and the original GIN expression stayed unchanged. Restoring `english_stem` recovered both guard and business result; the owned server stopped. The five-second mutation fence was unchanged and did not block ALTER.

The copied source packet was produced from Weft source 76d5f56cf916438c78b744971f0a1b19b69a6586 (packet SHA a4c7b1fc79741e305ea42aedf4f3b13b87d708ef3d71513679a4ba8fe7e8ab04). Native protocol executes its exact $1 business SQL; its exact retained DBAPI admission SQL is also unchanged. No SDK SQL parsing or rewriting was used. No wheel/release/managed qualification transfers. Temporal qualification remains HELD.

A native coherence/fencing correction and a fresh original source/runtime replay are required. Merely checking the same MVCC catalog snapshot before and after cannot establish current native text-search semantics.

The bounded object-address follow-up also reproduced the failure. Native `pg_locks` showed a granted AccessShareLock on the exact English configuration object after `pg_get_object_address`. Mapping ALTER nevertheless succeeded; the original same-snapshot guard stayed TRUE and original keyword output changed. Therefore this object lock is not a mapping fence. Its SELECT also assigns the reader snapshot, which is recorded rather than hidden. Restoration, recovery and owned-server cleanup passed.
