# Core concepts: a shared vocabulary

UMF keeps shared schema metadata alongside native and unfamiliar meaning. A valid envelope is a container for those meanings; it is not proof that every payload was interpreted.

A Document declares its identity, vocabularies and modules. Set umf to "0.10.0". Modules provide naming context. Elements have stable module/element identities; display names and namespaces do not merge identities. Core references point to those exact identities.

Fields describe values. Records declare membership and Keys. Groups organize declarations. Nullability describes ideal availability, independently of a database NULL, a missing writer input, a default or a reader result. Cardinality describes one/array/map shape, separately from relationship multiplicity.

Facets refine declared domains: width, precision/scale, length, ranges and collection size retain explicit units. Exact integer and decimal literals use text carriers. Titles, aliases, examples, allowed values and defaults describe schema properties. bits128 and UUID describe exact 16-byte values; those value families do not certify native byte order or storage layouts.

A Key is a named, ordered tuple of Field identities. A relationship names keyed Records, participation and lifecycle intent. Neither is a bare unique-index flag or a promise of referential enforcement. Native comparison, NULL, collation, filtered-index and enforcement-state details stay in bindings.

Use the Core page to follow properties and definitions. Use the workbench to inspect a current Orders example. Structural schema differences show changed representation; migration, semantic compatibility and native equivalence need their own contracts and evidence.

Semantic references name an external vocabulary, literal release and term. No catalog is fetched and no validator is inferred. Explicit validators and missing/unknown results stay separate from native enforcement. The semantic example retains both exact value declarations and semantic metadata.
