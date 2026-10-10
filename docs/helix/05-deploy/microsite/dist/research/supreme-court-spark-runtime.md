---
ddx:
  id: umf.evidence.supreme-court-spark-runtime
  type: implementation-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.supreme-court-mirror
      kind: references
    - id: umf.build.supreme-court-mirror
      kind: references
---

# Collection engine Spark runtime qualification

Observed October 9, 2026 America/New_York, ending October 10 at 00:48:17 UTC.
Local Spark is qualified for the bounded native Python driver collection and
Delta publication path below. Databricks remains unexecuted and unqualified.

## Executed boundary

Python 3.12.15, Spark 4.0.1, Delta 4.0.0 and Java 21.0.12.1 ran released
TableSpec 0.0.9 and UMF core 0.8.1 wheels. Collector engine 0.0.8 and companion
1.0.0 are separately versioned; package and engine versions are not interchangeable.
The central TableSpec `create_delta_spark_session` factory created a local
two-worker-thread session. Three official Questions Presented PDFs were acquired
serially on the Python driver while that session was active. This does not
qualify distributed executor downloads or production collection throughput.

The [machine receipt](supreme-court-spark-runtime.json) records successful fresh
acquisition, exact original SHA-256 parity, unchanged refresh without revisions,
replay, BagIt validation and fixity, Delta replace with complete row/object
read-back, repeated merge retaining three rows, and schema-mismatch refusal.
The refusal preserved the valid table's exact rows and original object hashes.
Publication ran with Python source HTTPS calls forbidden by mocks. This proves
publication independence from those calls, not an operating-system network
isolation test or Databricks egress-policy qualification.

Targets were temporary local `spark_catalog.umf_collector_qualification.documents`
and `spark_catalog.umf_collector_qualification.wrong_schema`. Original publication
objects were under `/tmp/umf-spark-collector-qualification-081/published-objects`.
No shared catalog or remote workspace was modified. Source rights remain unknown;
the collection used explicit local-use policy.

## Reproduction and dependency custody

The [observed probe](../../../../scripts/qualification/supreme-court-spark-observed.py)
preserves the exact executed script and local paths. It is an execution record,
not a portable Databricks entry point; it creates and replaces temporary local
targets. The [three-document inventory](supreme-court-spark-inventory.json) retains
source URLs and expected hashes. Reproduction requires the mirror batch/state
paths named in the probe, extracted release wheels on PYTHONPATH, and the two
Delta JARs. Dependency artifacts were downloaded to `/tmp` from official releases
and Maven Central, without modifying TableSpec source.

| Artifact | SHA-256 |
| --- | --- |
| TableSpec 0.0.9 wheel | `8258bf0c129dc872e9ba4bd5aedaadd1ea909b34cb4746cfc879acd931a08a0b` |
| UMF core 0.8.1 wheel | `b712eb6ea8cfd27694e37aaa7603c109063a3820bd11696e642300f2c26f7b84` |
| delta-spark_2.13 4.0.0 JAR | `538511702aae0ef6973a6a70af3d4543c9009f8edbed786a00737e2d3cd7f04e` |
| delta-storage 4.0.0 JAR | `9bdb9fb450f1e119eba53feb427f331b0d09072d26485b8273883ad72c9a2e1d` |

The preliminary run inherited UMF 0.8.0. The linked final receipt supersedes it
for the released-dependency qualification. No claim covers other runtime versions.

## Databricks qualification still required

Use the active runtime Spark session in process, with a caller-designated scratch
Unity Catalog table, separate wrong-schema test table, and writable volume path.
Do not select existing application tables automatically. Test driver HTTPS access,
collection state locking and filesystem operations, original-byte custody,
Delta replace/merge and exact read-back, refresh/replay, and failure visibility.
If volume semantics cannot support collector state, stage state on driver-local
storage and qualify the durable preservation handoff independently.

A SQL warehouse alone does not establish the Python driver collection boundary.
Serverless and classic Databricks compute need separate evidence, including their
network and filesystem policies. No live Databricks run has occurred; dedicated
targets remain pending user selection. Scheduling, notification delivery, and
high-volume court coverage remain outside this three-document qualification.
