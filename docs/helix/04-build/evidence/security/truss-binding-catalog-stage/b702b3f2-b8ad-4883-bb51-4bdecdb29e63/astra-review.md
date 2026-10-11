# Astra review: value-bearing pending association metadata

Disposition: no blocker found for landing this private metadata component within its stated scope. The reviewer inspected the SQL/harness changes and independently audited retained receipts, source hashes, ZIP contents and native value observations. Native execution is attributed to the producing agent; this review ran no native probe, Cargo or producer.

Final PostgreSQL 16.15 evidence:

| Run / native.json | Fixture | Observations | Value rows | SHA256 |
| --- | --- | ---: | ---: | --- |
| `e3f53aa5-823f-4284-9d6f-1736481d4068` | Fresh authored + composite | 430 | 27 | `266899a98b16866bf114ce3d91f4840ce7190329b33671d60fa03163c0a1bce7` |
| `b702b3f2-b8ad-4883-bb51-4bdecdb29e63` | Occupied authored + composite | 438 | 27 | `c77ffdd34fb04a25281820cdc6c36cd52323499a322deb5b353046013565b8a6` |
| `9e6039d1-2c9c-4460-91cc-de46343fbfc4` | Original single-field / no authored relationship | 402 | 23 | `a912f09dd35ae9f5c7297887250caa4f6f928d3f43e31a614b66434b63cadb84` |
| `e4ad6de0-006b-42ab-9fc8-a802f7f89963` | Composite / no authored relationship | 426 | 25 | `cae2d5b7ee83d1d1f955e72ab88f2af548d92d2be04d7ce7bfbd04e2339df306` |

All four receipts have unique observation IDs and type-sensitive equality between expected and observed values. Each declares 717 source pins, all matching current files and exactly 717 unique ZIP entries with matching bytes. Required cleanup completed in every run. These checks were repeated immediately before saving this review. Native SQL source SHA256: `786497bf04a1ae1dd523abd627a54fde00472bceaa0a14e80484650e5a768fd2`.

The collector calls the existing source/semantic effect verifier before assembling values, requires exact identity correspondence, applies its output-image capacity checks, and rechecks the admitted operation generation before emission. The reviewer independently reconstructed all 27/27/23/25 rows from the retained direct native ten-component snapshots, using the actual type, property, key, relationship, endpoint and lineage rows. They match the full collector image and identity inventory. Authored relationships retain their complete lineage row; pending associations retain null lineage and their original mapping bytes/provenance. This establishes the observed new metadata image, not completeness of the entire physical database or independent semantic validation of every possible field.

Both earlier precision findings are resolved: the final return has explicit C-collation ordering, and function-local bytea_output=hex removes the caller's escape-output dependence. Native-order equality, unchanged values under caller escape mode, restoration of that caller setting, and complete state restoration all pass. The fixed bytea representation is not a general canonical cross-version report encoder.

The generation counterexample replaces exactly one original effect-collector emission site with an increment immediately before emission. The outer value collector returns the specific 55000 generation-changed refusal. Nested rollback leaves zero effects; outer rollback restores all ten components and the exact original function body, independently compared with the captured SQL body. The restored collector returns the same positive image. This isolates the refusal branch; it is not a concurrent-writer, complete observer-closure or coherent-publication proof. Ordinary-role denial and all eight storage/owner/name/orientation/missing-endpoint/extra-endpoint/fabricated-lineage/core-field refusals remain observed through the new collector with restored state.

Predecessors `e9506a23-cfc1-4a86-b63b-77197168e1de` (420) and `3a34c08a-373c-4bfd-bfee-c78ad8df3970` (428) preceded explicit ordering/GUC corrections. `de80e268-81dc-4e24-a621-5eeb1ba40c80` (424) preceded generation-branch isolation. Their captured successful evidence remains historical and is not silently refreshed.

The 16,384-row/1 MiB checks bound the returned serialized image after aggregation; exact threshold execution, aggregate allocation/CPU/deadline accounting and enclosing resource limits remain open. Authored/composite fixtures undergo the captured UMF core preparation path, not fresh Weft ontology admission. Registered interpretation, authenticated owner/current-cut authority, accepted association lineage promotion, business-key/incidence/data enforcement, complete reports, source promotion and post-head finalization remain unqualified. Registered complete inventory still refuses with 0A000 and the complete commit barrier remains closed. No acceptance case is promoted; the original ledger remains 26/132.
