# G03 inherited table and Truss lanes — private checkpoint proposal

This folder is a source-only, reviewable checkpoint proposal assembled from the accepted local table lane and the preserved table/Truss attempts. It is not yet adopted into the repository, committed, or a release record. `copy-map.json`, `exclusions.json`, and `custody.json` enumerate copied evidence, deliberately omitted payloads, and exact local-file hashes.

## Table lane

Table operator 011 has two distinct `FAIL_OR_UNKNOWN` attempts retained under `actual/table011/`: attempt 8119 failed after the native compiler returned successfully because the generated executable exceeded the then-applied file cap; attempt 8889 failed during prepare/native-compiler capture. Neither is a pass. Table operator 012 is the accepted `LOCAL_TABLE_OPERATIONS_BOUNDARY_PASS` (246.421 s), with its complete result, phase receipts, raw bounded logs, browser/native reports, and the 56-case corpus retained. The corpus has 24 compiled cases and 32 blocked cases. The accepted boundary covers the exact installed 18-distribution Linux cohort, PostgreSQL 18.6 observations, native/WASM comparison and the real Linux ARM64 Chromium browser run described in the packet and independent reviews. It reports `nativeExecutionQualified: false`; it does not establish a production executor, durable replay, authorization cursors, generated methods, other adapters, managed Lakebase, or release readiness.

The table lane remained within its reviewed boundaries: 2,035,016 public bytes, 50,486 raw capture bytes, and 54,449,411 software bytes; the per-file public limit was 1 MiB, aggregate public evidence limit 8 MiB, and software limit 256 MiB. The executable `compile_table_operation` was removed with the owned target after the lane. Its recorded identity is in the result and class plan; this checkpoint does not claim the removed binary was rehashed after removal.

## Truss lane

Truss007, Truss008, and Truss009 are all preserved as `FAIL_OR_UNKNOWN`, not passes. Truss007 failed owned-container mount custody. Truss008 and Truss009 failed at the bounded `browser-facts` child; the observed close/termination does not prove a cause. For Truss009 the bounded guest work, 5,901-row source postcheck, and owned cleanup completed, but `browser-facts` failed after 152.048 s. Its independent source review accepted source closure only; root reports the actual lane as failed, with finite diagnosis still pending. The immutable raw output is retained separately for each attempt.

## Scope and omissions

This evidence is Linux-specific. The table browser result is Linux ARM64 Chromium, and the Truss attempts use their recorded Linux toolchain/browser images. No macOS runtime, Apple Silicon native execution, or general ARM runtime claim is made here. No attempt proves the full G03 release gates or public publication.

Large compiled artifacts, wheels, the Cargo cache archive, and the closed P56 source archive are not copied. Their paths, observed sizes, and SHA-256 references are in `exclusions.json`; the accepted cache checkpoint and operator results retain their detailed inventories. Each 2,537,368-byte table browser corpus is evidence data and is copied with its respective run.

`custody.json` hashes the checkpoint files except itself. This proposal preserves failure evidence rather than replacing or relabeling it.
