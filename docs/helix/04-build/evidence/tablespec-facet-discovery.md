# TableSpec facet discovery evidence

Execution supplement for [TD-043](../../02-design/technical-designs/TD-043-core-facets.md),
[CONTRACT-040](../../02-design/contracts/CONTRACT-040-core-ideals.md),
[US-043](../../01-frame/user-stories/US-043-core-facets.md) and implementation bead
`umf-97221618-1c44db4c`. This records native discovery and archive compatibility;
it does not close the binding, admit the facet ideal, or claim native equivalence.

## Qualified inputs and results

TableSpec source commit `647e8e566ad78b864282ec65c0b0b2237aa63084`, Pydantic 2.11.10,
PySpark 4.0.1 and Great Expectations 1.15.1 were checked against pinned source
manifests. The new ingest-generator/casting dependencies are captured in
[native/tablespec/facets-runtime](../../../../native/tablespec/facets-runtime/sources.json).
Native evidence covers 44 declarations, 23 values, six Spark type parses, ten
native-generated ingest casts and 18 native-generated GX length validations.

The [native record](../../../../fixtures/validation/facets-tablespec-profile-native.json)
retains raw and normalized input as text, including exact numeric tokens beyond
the UMF safe-integer metadata profile. Generated artifacts and execution results
are separate observations. Neither generator output nor model acceptance alone
establishes enforcement.

| Observation | Consequence for the binding |
| --- | --- |
| The model/schema names `length`; general JSON/SQL generators read `max_length`. Normalization drops unknown `max_length`. | Keep raw and normalized profiles distinct. A native declaration must not silently acquire the other profile's meaning. |
| The general PySpark generator emits StringType without a length bound. GX-generated length rules enforce the tested bound on Spark strings. | Length classification/projection must name the consumer. A Spark schema alone cannot honor the bound. |
| Supplementary Unicode counts as one in tested GX/Spark length checks; a decomposed two-scalar string counts as two. | This supports the tested Unicode-scalar profile, not grapheme, normalization, collation or arbitrary-surrogate claims. |
| GX prefers `max_length` over `length` when both are present. | Retain the conflicting declaration; no automatic replacement of authored core intent. |
| General PySpark DECIMAL output is decimal(10,0), even for precision=5, scale=2. Ingest target/cast uses decimal(5,2); its bare default is decimal(10,2). | Decimal profile and defaults remain explicit. Core precision/scale cannot follow the family name alone. |
| The model/schema accepts scale greater than precision and precision=39. Spark type parsing rejects those declarations. | Metadata acceptance is not target expressibility. Strict projection must block incompatible native types. |
| Ingest decimal casts round 1.235 to 1.24 in both ANSI modes. Overflow throws in ANSI mode and produces null otherwise. | Exact input conversion needs its own loss/refusal rule, even with matching decimal facets. |
| INTEGER schema enforces signed 32-bit range; unknown integerWidth metadata is dropped by normalization and does not narrow the value domain. | Native width is an inferred, profile-qualified domain. Arbitrary authored signedness/width requires an enforcement path or an explicit residual. |
| FLOAT converts binary64 1.0000000000000002 to binary32 1.0. | Retain the permanent exactness counterexample independently of matching scalar families. |
| Model coercion accepts some string/boolean counts rejected by the checked schema. Huge exact integer tokens are also accepted natively. | Never silently coerce or round them into core facet counts. Preserve tokens and report unclassified detail. |

Spark's [decimal type documentation](https://spark.apache.org/docs/4.0.1/api/scala/org/apache/spark/sql/types/DecimalType.html)
and [ANSI behavior](https://spark.apache.org/docs/4.0.1/sql-ref-ansi-compliance.html)
provide external context. The pinned local executions above establish the narrower
TableSpec generator/cast claims.

## Recovery and browser evidence

The existing importer and explicit envelope migrations retain every one of the
44 native inputs through core 0.5.0 without inventing `Element.facets`. JSON and
YAML envelope recovery reproduce the original native text exactly (88 recoveries).
The [Chromium record](../../../../fixtures/validation/facets-tablespec-discovery-browser.json)
repeats that matrix in Chromium 148, checks two unsafe integer tokens and observes
no host globals or external requests. This verifies archive compatibility, not a
new facet classification or projection operation.

Reproduce with:

```sh
bun scripts/core-ideals/facets-tablespec-profile-oracle.ts
bun test ./tests/core-ideals/facets-tablespec-discovery.test.ts
bun run typecheck
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/core-ideals/facets-tablespec-discovery-browser.ts
```

The native command uses the existing TableSpec Python environment and Java 21;
`UMF_TABLESPEC_PYTHON` and `JAVA_HOME` may override their paths. The browser command
uses the current public browser build. No library source changed in this discovery
step; the existing core acceptance bundle was used.

## Remaining implementation

Define a complete versioned extension package and operation schemas before public
APIs. Classifications must retain native source paths and distinguish declared,
inferred, unknown and unsupported meaning. Select the metadata and execution
profile explicitly; do not infer one from a successful import.

Implement strict/report down-projection with complete candidates or atomic blocks,
residuals for unenforced bounds, unknown qualifier/unit preservation, and verified
source-bound receipts for both recovery directions. Profile-specific constraints
must not overwrite existing authored facets. Byte-length, zero maximum, arbitrary
integer width, oversized decimal facets, item/value facets and unknown units remain
required cases, even when a target must refuse them. The discovery matrix is a
starting corpus, not the final binding test matrix.

Run emitted artifact checks, native value checks, both recovery directions and
Chromium parity for the implemented binding. Qualify full ingestion execution
separately: this discovery did not execute table DDL, Delta writes or the complete
ingestion pipeline. Existing native Cardinality bindings still accept core 0.4.0;
composition onto 0.5.0 requires an explicitly qualified path.
