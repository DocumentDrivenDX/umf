# Logical models and physical bindings

Logical Field, Record, Key and relationship meanings remain separate from how a target stores, compares or enforces them.

Physical bindings carry explicit native identities and layouts. A projection can generate reviewable schemas while reporting source constraints that the target cannot express. Retained source is part of recovery; a target-only schema can have less meaning.

TableSpec, PostgreSQL, SQL Server, Avro and Parquet each have distinct qualified subsets. Metadata declarations, native schema acceptance, instance enforcement, native equivalence and downstream consumer adoption are separate observations. Use the integration record matching the precise operation and profile.
