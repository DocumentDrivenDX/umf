# Astra review: private pending report-basis candidate

Disposition: no blocker found for the narrowly qualified native source/value basis and byte recheck. The reviewer inspected SQL and harness changes and independently audited retained observations, exact packet bytes, source pins and ZIPs. Native execution is attributed to the producing agent; this audit executed no native probe, Cargo or producer.

Final PostgreSQL 16.15 receipts:

| Run / native.json | Fixture | Observations | Value rows | Receipt SHA256 |
| --- | --- | ---: | ---: | --- |
| `414ab7ba-fe6f-4c81-b136-2a1314357ca2` | Fresh authored + composite | 478 | 27 | `9397a4c956aad0f909b53166ead60455707bfbf214eadd06ad96ae8dab804335` |
| `c1c09818-788b-46fd-b4b2-433fb7a78dea` | Occupied authored + composite | 486 | 27 | `3babec09e262143b40df83fda5c1003ad69fcc9b993c62cd8af7ddbf787e14f8` |
| `a3ec9ea0-b48d-4e77-9969-e8aed6671963` | Original single-field / no authored relationship | 450 | 23 | `93887690800e75581e7f6112b6bed98fd2a62a5466f75a7c8d4df40a0245ec7a` |
| `1119762c-d289-40f6-9792-46c06d5a51f5` | Composite / no authored relationship | 474 | 25 | `401fea9424cedb4da22d13e007c82551ce9840ba8969b1d5c7aa0210380c5277` |

All observations have unique IDs and type-sensitive expected/observed equality. Each run has 717 current source hashes and exactly 717 unique ZIP entries matching the declared path set and digests; cleanup completed. These checks were repeated before this review was written, including after the concurrent Truss main merge. No current pin drift was observed. The later unrelated Python containment/retirement changes are not qualified by these native fixtures.

Exact decoded bytes from each retained report-basis.json also agree with its digest and independently computed native SHA observation:

| Run | Packet bytes | Packet SHA256 |
| --- | ---: | --- |
| `414ab7ba-fe6f-4c81-b136-2a1314357ca2` | 65895 | `199f814cb6914587ac9fff68c5932a845c89008a1132c4c70ccc708a92d357a7` |
| `c1c09818-788b-46fd-b4b2-433fb7a78dea` | 65895 | `9879ce6a5f73fc6c5f20af279c83201ac720465883498f32a5afeb1e3a7006e2` |
| `a3ec9ea0-b48d-4e77-9969-e8aed6671963` | 57510 | `c8bd78f3dddcacf2d9b96bcbe843605c33c04f55dc181e9999968fb9f4b79207` |
| `1119762c-d289-40f6-9792-46c06d5a51f5` | 63250 | `29aacb10f1751bb9f552b576a1474fac64e31e4ac4f4ac7a564574fe5aca3a77` |

Every packet has the exact candidate profile and ten expected members, including acceptedReportQualified=false. Original input and embedded binding bytes/digests agree, documents match complete native rows, and writer/ordinal/generation/revision match the retained operation. The reviewer independently reconstructed all 27/27/23/25 metadata values from the direct ten-component native snapshots and matched them to the packet images, including original authored lineage and null pending lineage. These are exact selected packet/source observations, not a complete dependency or hermetic runtime proof.

The reported composition blocker is resolved: the composer revalidates the complete value image and compares generation, the full retained operation row, exact binding bytes, full document rows and full image before returning. The interleaved source-collector mutant changes input and binding coherently with unchanged mappings/generation; it reaches the specific 55000 original-operation-changed refusal. Separate source-substitution controls keep the actual operation coordinates and all values identical, accept the new source basis, reject the old basis, and accept the original again after restoration. The isolated internal generation mutation reaches the composer's distinct generation-changed refusal. Single-site assertions, intended diagnostics, zero effects, full-state restoration, original-function restoration and restored positives are retained. These are concrete branch and source-drift controls, not a general concurrent-writer, adversarial-ABA, authenticated current-cut or publication theorem.

Byte substitution, empty/null argument and ordinary-role controls retain their intended refusals. Exactly 8 MiB of deliberately incorrect comparison bytes passes the input length guard and reaches the correspondence refusal; 8 MiB plus one receives the bounded-argument refusal. This qualifies the comparison argument boundary only. It does not demonstrate a successful 8 MiB emitted packet, the emitted-output boundary, image row/byte thresholds, or aggregate allocation/CPU/deadline bounds. Materialization and serialization precede the output cap.

Predecessor eceac6ea (463 observations) lacks final exact packet retention and later controls and remains historical. Failed 7dc07272-b205-441a-8ac4-ba54088b5ecb retains the harness's incorrect void-result expectation at pending-report-basis-current-positive; it is not passing evidence. Earlier source-specific receipts remain unchanged.

The returned bytes are caller-carried comparison data, not an accepted report, credential or readiness token. Original registration/issuer authority, semantic profile completeness, current-cut authentication, persistent report custody, accepted association provenance promotion, protected callable closure, native business-key/incidence/data enforcement and post-head finalization remain open. Authored/composite fixtures have captured UMF core preparation evidence, not fresh Weft ontology authority. Complete inventory and commit gates remain closed; no original case is promoted and the ledger remains 26/132.
