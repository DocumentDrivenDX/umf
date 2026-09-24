# Smithy native JSON Schema conversion corpus

All 25 resources from [smithy-jsonschema's test resources](https://github.com/smithy-lang/smithy/tree/dd2d50a93db313ee21b41916af158442e14669e1/smithy-jsonschema/src/test/resources/software/amazon/smithy/jsonschema)
are retained unchanged with hashes and LICENSE. The complete recursive repository tree
was used for selection. Source model resources and upstream expected JSON Schemas are
both retained; their original native configurations differ. The expected schemas are
not presented as expected outputs of UMF's named profile.

`bun scripts/smithy-jsonschema-oracle.ts` checks every declared data-shape root in every
source resource, plus authored `../domain.json` and `../emission.smithy`. Native service,
operation, resource and member roots are outside this profile. The converter is pinned
`smithy-jsonschema:1.73.0`; `native-defaults-2020-12` uses a new native config, changes
only its dialect to Draft 2020-12, and adds the canonical `$schema` document extension.
All other native defaults remain in force. Models first survive UMF YAML round trips.

All 52 tested roots match the unmodified JVM's schema text or conversion exception.
Ten projections are blocked: eight native conversion failures (mixin member/name
conflicts) and two emitted schemas whose recursive root references cannot resolve.
Their native output/failure remains evidence, not a usable target. Forty-two projections
produce usable target schemas under explicit allow-reported-loss policy. Strict policy
blocks any target because exhaustive source-semantic equivalence is not established.

`../emission-vectors.json` checks generated target behavior, including required fields,
length/range/enum/union/map constraints and the native fractional-long behavior.
`scripts/smithy-jsonschema-oracle.py` independently validates these 12 cases and confirms
the dangling recursive reference using Python jsonschema. This is target-behavior
verification, not proof of Smithy instance/protocol equivalence.

Custom config/mappers, worker emission, service lowering and repairs for native root
references/name collisions remain work. No evidence is discarded to improve coverage.

The root-definition follow-up adds authored `../recursive-emission.smithy`, expanding
the matrix to 55 roots without changing upstream files. The original profile and the
explicit `native-root-definition-2020-12` profile have separate result reports. The
latter registers the root through native SchemaDocument APIs and yields 47 targets;
eight native failures remain blocked. Original and adapted output remain separate.
Target schemas also round-trip through UMF YAML with exact tagged-tree comparison.
The root-definition Python oracle checks 47 target meta-schemas, 13 recursive instance
vectors, an exact integer default and literal `$ref` text inside a string default.

Service-context mode adds authored `../service-context.json`, then compares the data-root /
service cross product within each source that declares services. All 40 combinations
match the JVM, including ten outside-context rejections. Thirty targets pass independent
meta-schema checks. Eleven instance vectors verify different same-named Customer shapes
and different enum domains in separate services. Qualified identities remain in source;
output aliases come only from native declared service context. The result report is
`../jsonschema-service-context-results.json`.
