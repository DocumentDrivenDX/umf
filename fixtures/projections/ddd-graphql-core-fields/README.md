# DDD fields paired with core Field ideals

This relationship-independent fixture pairs every selected DDD scalar field
with an exact core Field in a UMF 0.5.0 document. Core Nullability determines
outer SDL non-null, and an explicit array item Field determines item non-null.
The report keeps DDD identity, unsupported facets, unspecified availability,
custom-scalar coercion and absent-versus-null distinctions. It does not infer a
relationship from a DDD concept field or generate resolvers.

`generated.graphql` passes the `umf.graphql` schema-mode adapter, GraphQL.js
17.0.2, GraphQL-core 3.2.12 and Chromium. Regenerate with the matching
`scripts/projections/ddd-graphql-core-fields-*` scripts.
