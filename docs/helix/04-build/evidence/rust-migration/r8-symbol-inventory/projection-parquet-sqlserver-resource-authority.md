---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.projection-parquet-sqlserver-resource-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: CONTRACT-019
      kind: informed_by
    - id: TD-019
      kind: informed_by
    - id: TD-043
      kind: informed_by
    - id: TD-049
      kind: informed_by
---

# R8 resource authority: projection, Parquet IDL, and SQL Server schemas

## Findings and proposed ledger dispositions

Four resources have specific present authority: three are directly named by
their governing technical design sections, and the Parquet IDL descriptor is
the output of a pinned deterministic writer. Keep the Parquet relationship
classification schema `authority-unresolved`: no exact writer or governing
artifact clause naming that resource was found.

| Resource | Current SHA-256 | Proposed authority | Basis |
| --- | --- | --- | --- |
| `spec/projections/ddd-graphql.schema.json` | `1a550add6922767237364b6ecc0184d165c08c0c34a7208a7db7ad423f9a0042` | `authored-known` | TD-049 § Complete 0.7.0 projection names this exact policy/result schema. |
| `spec/core/facets-sqlserver-projection.schema.json` | `6c92fee8e2bdaad0991e846d72786d259364ee3bc901503db90609d278885f2d` | `authored-known` | TD-043 § SQL Server authored facet projection names this exact schema. |
| `spec/extensions/parquet/idl.json` | `9e3b9b3c8c24e9c1e22b89f02c8dcce708e37434813ad40bec4e8bb95197a4fb` | `generated-known` | CONTRACT-019 § Pinned IDL and named metadata describes `scripts/parquet-idl.py`, pinned sources, compiler version, and output structure. |
| `spec/core/parquet-relationship-classification.schema.json` | `c89561ab5f492c1242b7d425bcba063b82c13296931f12566414c535360478ca` | Keep `authority-unresolved` | No exact writer or exact-file governing clause was found. Related Parquet relationship semantics and consumer imports do not prove schema authority. |
| `spec/core/sqlserver-facet-classification.schema.json` | `b2db09ae9cd6877aa6ac8e3fc2fa267ebf2c530fa9d2c2867f1de21c38cc67f5` | `authored-known` | TD-043 § SQL Server facet classification API names this exact receipt schema. |

These are resource-source classifications only. They do not claim installed
archive custody, runtime parity, operation retirement, or native execution.

## Directly named schemas

TD-049 explicitly identifies `spec/projections/ddd-graphql.schema.json` as the
complete policy/result schema for its versioned DDD GraphQL projection. The
resource was introduced in `dcc8c540b` and later changed in
`8706814a9`. Its current hash is therefore pinned separately from its
introducing blob; the design specifies the policy/result boundary, while the
metamodel-current-definition edit supplies the current core-reference form.
No schema writer for this exact file was found.

TD-043 identifies both SQL Server resources by exact path: the classification
receipt schema in § SQL Server facet classification API and the authored
projection schema in § SQL Server authored facet projection. They were
introduced with their respective implementation work and later changed in
`8706814a9`. The implementation, oracle, and browser scripts consume or
validate them; no exact schema writer was found. The exact path references and
section-specific schema roles support `authored-known`, while the hash pins
below preserve the distinction between original authored blobs and current
bytes.

## Parquet IDL writer proof and control

CONTRACT-019 § Pinned IDL and named metadata names the pinned Apache
parquet-format commit `219e3f12a62f9476e830c21e26d030d231f7c017`, the local
source manifest, `scripts/parquet-idl.py`, and thriftpy2 0.5.3. The script
checks each manifest SHA-256, loads the pinned `parquet.thrift`, derives all
declared enum/struct/union descriptors from thriftpy2's compiled classes, and
writes `spec/extensions/parquet/idl.json`. The output records the source commit
and compiler version. The contract records 69 declarations and 176 fields.

At commit `fc77c010af979f3708261f9526c7e69072a25438`, the output hash was
already `9e3b9b3c8c24e9c1e22b89f02c8dcce708e37434813ad40bec4e8bb95197a4fb`,
the same as the current output. The current writer differs from its checkpoint
version only by the SPDX header added in the licensing commit; its current
hash is `c20b851373cd4e9daa88840276b1d35c3d3c31ffa49e0e7f9229a9d1311fd947`.
The pinned source manifest hash is
`ff7b49a02e8ec39a048fb5cdd151784ab7cc8c603165fa72d729c4391d4303d9`.
Its six files are individually pinned there; the IDL hash is
`e77109d446f5c436cc272d38be2f34238529abf9a8bd0361bb684387bb8e8736`.

A source-mutation negative control was run in an isolated temporary copy. I
appended a comment to `parquet.thrift` without changing its manifest digest.
`scripts/parquet-idl.py` stopped at its source-hash assertion with exit code 1,
before attempting `thriftpy2.load`; the mutation could not be accepted as a
valid generator input. The control demonstrates source-pin enforcement, not
the correctness of the compiler output.

A full current byte-for-byte generator rerun was unavailable: neither system
Python nor `python/.venv` has `thriftpy2` installed (`ModuleNotFoundError`).
The source manifest, exact writer, recorded generated output hash, and
CONTRACT-019 pin support `generated-known`, but this review does not claim a
fresh compiler reproduction. The pinned compiler dependency is listed as
`thriftpy2==0.5.3` in `docker/core-replay/oracle-requirements.txt`.

## Unresolved Parquet relationship schema

`spec/core/parquet-relationship-classification.schema.json` is consumed by
`src/core-ideals/relationship-parquet.ts`, and its history shows incremental
relationship-classifier work followed by current-core-reference edits. The
search found no exact writer. CONTRACT-019 governs Parquet native metadata and
wire meaning, while TD-045's classifier design covers Avro relationship
classification; neither names this exact Parquet relationship schema as a
directly authored resource. Keep the current row unresolved. Consumer use,
neighboring classifier schemas, and history do not fill this authority gap.

## Historical and source pins

| Resource | Introducing commit | Introducing blob SHA-256 | Current SHA-256 |
| --- | --- | --- | --- |
| `spec/projections/ddd-graphql.schema.json` | `dcc8c540b` | `8a4a5686d67ee70a8adc3bde0abdae4989e1437aa389fccce6c0a62b2592cb21` | `1a550add6922767237364b6ecc0184d165c08c0c34a7208a7db7ad423f9a0042` |
| `spec/core/facets-sqlserver-projection.schema.json` | `e1c5bb2df` | `a539e3fd69967c44c60f8a4757a0d8aeb743e889a41a4532699380230a3d7ef8` | `6c92fee8e2bdaad0991e846d72786d259364ee3bc901503db90609d278885f2d` |
| `spec/extensions/parquet/idl.json` | `fc77c010a` | `9e3b9b3c8c24e9c1e22b89f02c8dcce708e37434813ad40bec4e8bb95197a4fb` | `9e3b9b3c8c24e9c1e22b89f02c8dcce708e37434813ad40bec4e8bb95197a4fb` |
| `spec/core/parquet-relationship-classification.schema.json` | `f69d1a7c7` | `0252fa2f9485cf5b9a5f9dd77cff61789430ef8c84895f03fc11a04d701c8e7e` | `c89561ab5f492c1242b7d425bcba063b82c13296931f12566414c535360478ca` |
| `spec/core/sqlserver-facet-classification.schema.json` | `0749e74fa` | `fe3f7f430bd8682f8ab6ad8f71a4606c1b43a469a412352e3ee4cb6684e331c2` | `b2db09ae9cd6877aa6ac8e3fc2fa267ebf2c530fa9d2c2867f1de21c38cc67f5` |

The governing-source pins are:

| Source | SHA-256 |
| --- | --- |
| `docs/helix/02-design/contracts/CONTRACT-019-parquet.md` | `e47f7bf0ab24b0d3a65808c70a2c53867bbf24f9a992ce11485c10f078eab696` |
| `docs/helix/02-design/technical-designs/TD-019-parquet.md` | `67a2e20ba60cf544b986cc0d9f4b4e5263dc87a6cdb26371e25de2d864db91ac` |
| `docs/helix/02-design/technical-designs/TD-043-core-facets.md` | `35e2644c8def7c7dac0e571b3d0a51006b60e924310b67dd526cb4597eeab37f` |
| `docs/helix/02-design/technical-designs/TD-049-ddd-graphql.md` | `2ede2a67446062b90786c048eb95eacc2d5c266ed99a42b1ef061c95eb206473` |
| `scripts/parquet-idl.py` | `c20b851373cd4e9daa88840276b1d35c3d3c31ffa49e0e7f9229a9d1311fd947` |
| `native/parquet/sources/manifest.json` | `ff7b49a02e8ec39a048fb5cdd151784ab7cc8c603165fa72d729c4391d4303d9` |
| `native/parquet/sources/parquet.thrift` | `e77109d446f5c436cc272d38be2f34238529abf9a8bd0361bb684387bb8e8736` |
| `docker/core-replay/oracle-requirements.txt` | `628a69f8b70f84c9d1a9a67082976e4b36a7272430a9f69130461c6894c4f094` |

No ledger or inventory snapshot was regenerated. No package archive or
installed-route receipt was reviewed for these five resources.
