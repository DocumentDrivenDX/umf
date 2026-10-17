# Resource identity API authority (not native observations)

Inspected official API references2026-10-17:

- [Endpoint API](https://docs.databricks.com/api/vector-search/v1/endpoint): native Endpoint.id, creation_timestamp, creator, exactname/type; documented create/get/delete routes. This establishes fields to inspect, not witnessed identity or conditional-delete behavior.
- [Unity Catalog Table API](https://docs.databricks.com/api/uc-tables/v1/table): native table_id is the table identifier. Get supports include_manifest_capabilities. TABLE_ONLINE_VECTOR_INDEX_DIRECT is an enum of securable_kind_manifest.securable_kind, **not** table_type. VECTOR_INDEX_FORMAT is a data_source_format value. Source candidate now reads these exact fields; missing native mapping refuses. Docs alone do not prove that a given workspace exposes all of them for a directindex.
- [Databricks app AI Search resource guide](https://docs.databricks.com/gcp/en/dev-tools/databricks-apps/vector-search): direct and replicated vectorindexes are UCtable objects. Candidate uses an actual UCtable-ID observation; it never fabricates indexUUID.
- [Vector Index API](https://docs.databricks.com/api/vector-search/v1/index): directaccess schema/spec and GET/POST/DELETE/upsert/query routes. Its documented VectorIndex object does not expose a separate immutableUUID. No conditionaldelete/ETag guarantee was found in these route schemas; before/after checks retain that unresolved ABA boundary.
- [SCIM API /Me](https://docs.databricks.com/api/scim/v1/create-user): native current-user route for same-token observedidentity. Source requires native userName/id and exact current_user equality, not guessed email/SP mapping. Missing403/alternateidentity refuses.

The source accepts empty successful response bodies only for exact known DELETEendpoint/index and POSTnativecancel/warehouseStop ACK routes. Create, query and SQLstatement POST still require strict JSON/nativeidentity; missing originalStatementId is uncertainty. Native HTTP status/rawbody remains journaled. API docs generally illustrate {} ACK, so this is bounded transport accommodation for actual empty2xx/204 responses, not a fabricated native receipt.
