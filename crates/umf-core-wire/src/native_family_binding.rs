//! Closed router for already-validated adapter wire families.
//!
//! This module never decodes a request or creates an adapter runtime. The
//! selected wire implementation receives the original tagged wire and the
//! same cumulative control callback exactly once.
use umf_core::{Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf.native-family-dispatch/1";
pub const FAMILIES: &[&str] = &[
    "field-record-parquet-projection",
    "core-ideal-reports",
    "medical-projection",
    "relationship-extra-projection",
    "relationship-parquet-projection",
    "cardinality-sqlserver-projection",
    "field-record-sqlserver-projection",
    "field-record-avro-projection",
    "avro-cardinality",
    "avro-classification",
    "record-type",
    "nullability-avro-projection",
    "nullability-sqlserver-projection",
    "facets-avro-projection",
    "facets-sqlserver-projection",
    "key-avro-projection",
    "key-sqlserver-projection",
    "avro-relationship-projection",
    "tablespec-relationship-projection",
    "relationship-sqlserver-projection",
    "relationship-postgresql-projection",
    "avro",
    "avro-json-schema-projection",
    "arrow-spark-projection",
    "arrow-flatbuffer-model",
    "avro-tablespec-projection",
    "postgresql-avro-projection",
    "postgresql-json-schema-projection",
    "json-schema-protobuf-projection",
    "tablespec-via-avro-projection",
    "parquet-avro-projection",
    "sqlserver-avro-projection",
    "sqlserver-ddl-projection",
    "binding-sqlserver-planned-index-projection",
    "binding-index-projection",
    "binding-public",
    "dashboard-public",
    "binding-parquet-projection",
    "binding-delta-projection",
    "binding-sqlserver-tables",
    "binding-sqlserver-physical",
    "ddd-json-schema-projection",
    "openapi-json-schema-projection",
    "typespec-smithy-jsonschema-projection",
    "openapi",
    "linkml",
    "odcs",
    "tablespec",
    "jsonld",
    "postgresql",
    "sqlserver",
    "shacl",
    "owl",
    "rdf",
    "iceberg-table",
    "binding-iceberg-projection",
    "delta-schema",
    "delta-table",
    "delta-log",
    "delta-ddl",
    "delta-parquet",
    "spark",
];

fn bad_family() -> String {
    crate::result_envelope(Err(EngineError::new(
        "REQUEST",
        Utf16::default(),
        "Unknown native adapter family",
    )))
}

/// Describe callable family operations without a host-owned profile table.
pub fn metadata_wire(family: &str) -> String {
    let (profile, operations): (&str, &[&str]) = match family {
        "cardinality-sqlserver-projection" => (
            crate::cardinality_sqlserver_projection_binding::PROFILE,
            &[
                "projectCardinalityToSqlServer",
                "recoverCardinalityFromSqlServer",
            ],
        ),
        "field-record-sqlserver-projection" => (
            crate::sqlserver_field_record_projection_binding::PROFILE,
            &[
                "projectFieldToSqlServer",
                "recoverFieldFromSqlServer",
                "projectRecordToSqlServer",
                "recoverRecordFromSqlServer",
            ],
        ),
        "field-record-avro-projection" => (
            crate::avro_field_record_projection_binding::PROFILE,
            &[
                "projectFieldToAvro",
                "recoverFieldFromAvro",
                "projectRecordToAvro",
                "recoverRecordFromAvro",
            ],
        ),
        "avro-cardinality" => (
            crate::avro_cardinality_binding::PROFILE,
            &[
                "projectCardinalityToAvro",
                "recoverCardinalityFromAvro",
                "classifyAvroCardinality",
                "verifyAvroCardinalityClassification",
                "recoverAvroCardinalityBundle",
            ],
        ),
        "avro-classification" => (
            crate::avro_classification_binding::PROFILE,
            &[
                "classifyAvroField",
                "recoverAvroFieldBundle",
                "classifyAvroRecord",
                "recoverAvroRecordBundle",
                "classifyAvroKeys",
                "verifyAvroKeyClassification",
                "recoverAvroKeySource",
                "classifyAvroRelationships",
                "verifyAvroRelationshipClassification",
                "recoverAvroRelationshipSource",
                "classifyAvroNullability",
                "verifyAvroNullabilityClassification",
                "recoverAvroNullabilityBundle",
                "classifyAvroFacets",
                "verifyAvroFacetClassification",
                "recoverAvroFacetSource",
            ],
        ),
        "record-type" => (
            crate::record_type_binding::PROFILE,
            &[
                "classifyAvroRecordType",
                "recoverAvroRecordTypeBundle",
                "classifyParquetRecordType",
                "recoverParquetRecordTypeBytes",
                "classifyParquetRecord",
                "recoverParquetRecordBytes",
                "classifyParquetRelationships",
                "verifyParquetRelationshipClassification",
                "recoverParquetRelationshipSource",
                "projectNullabilityToParquet",
                "recoverNullabilityFromParquet",
                "projectFacetsToParquet",
                "recoverFacetsFromParquet",
                "projectKeysToParquet",
                "verifyKeysParquetProjection",
                "recoverKeysParquetIdeal",
                "classifyParquetNullability",
                "verifyParquetNullabilityClassification",
                "recoverParquetNullabilityBytes",
                "classifyParquetField",
                "verifyParquetFieldClassification",
                "recoverParquetFieldBytes",
                "classifyParquetKeys",
                "verifyParquetKeyClassification",
                "recoverParquetKeySource",
                "classifyParquetCardinality",
                "projectCardinalityToParquet",
                "recoverCardinalityFromParquet",
                "verifyParquetCardinalityClassification",
                "recoverParquetCardinalityBytes",
                "classifyParquetFacets",
                "verifyParquetFacetClassification",
                "recoverParquetFacetSource",
            ],
        ),
        "nullability-avro-projection" => (
            crate::nullability_avro_projection_binding::PROFILE,
            &["projectNullabilityToAvro", "recoverNullabilityFromAvro"],
        ),
        "nullability-sqlserver-projection" => (
            crate::nullability_sqlserver_projection_binding::PROFILE,
            &[
                "projectNullabilityToSqlServer",
                "recoverNullabilityFromSqlServer",
            ],
        ),
        "facets-avro-projection" => (
            crate::facets_avro_projection_binding::PROFILE,
            &["projectFacetsToAvro", "recoverFacetsFromAvro"],
        ),
        "facets-sqlserver-projection" => (
            crate::facets_sqlserver_projection_binding::PROFILE,
            &["projectFacetsToSqlServer", "recoverFacetsFromSqlServer"],
        ),
        "key-avro-projection" => (
            crate::key_avro_projection_binding::PROFILE,
            &[
                "projectKeysToAvro",
                "verifyKeysAvroProjection",
                "recoverKeysAvroIdeal",
            ],
        ),
        "key-sqlserver-projection" => (
            crate::key_sqlserver_projection_binding::PROFILE,
            &[
                "projectKeysToSqlServer",
                "verifyKeysSqlServerProjection",
                "recoverKeysSqlServerIdeal",
            ],
        ),
        "avro-relationship-projection" => (
            crate::avro_relationship_projection_binding::PROFILE,
            &[
                "projectRelationshipToAvro",
                "verifyRelationshipAvroProjection",
                "recoverRelationshipAvroIdeal",
                "recoverRelationshipAvroNative",
            ],
        ),
        "tablespec-relationship-projection" => (
            crate::relationship_tablespec_projection_binding::PROFILE,
            &[
                "projectRelationshipToTableSpec",
                "verifyRelationshipTableSpecProjection",
                "recoverRelationshipTableSpecIdeal",
                "recoverRelationshipTableSpecNativeSources",
            ],
        ),
        "relationship-sqlserver-projection" => (
            crate::relationship_sqlserver_projection_binding::PROFILE,
            &[
                "projectRelationshipToSqlServer",
                "verifyRelationshipSqlServerProjection",
                "recoverRelationshipSqlServerIdeal",
                "recoverRelationshipSqlServerBinding",
                "recoverRelationshipSqlServerNative",
            ],
        ),
        "relationship-postgresql-projection" => (
            crate::relationship_postgresql_projection_binding::PROFILE,
            &[
                "prepareProjectRelationshipsToPostgresql",
                "completeProjectRelationshipsToPostgresql",
                "blockProjectRelationshipsToPostgresql",
                "verifyRelationshipsPostgresqlProjection",
                "recoverRelationshipsPostgresqlIdeal",
                "recoverRelationshipsPostgresqlNative",
            ],
        ),
        "core-ideal-reports" => (
            crate::core_ideal_reports_binding::PROFILE,
            &[
                "inspectFieldClassification",
                "verifyFieldClassificationInspection",
                "inspectFieldProjection",
                "verifyFieldProjectionInspection",
                "inspectRecordProjection",
                "verifyRecordProjectionInspection",
                "inspectStructuredClassification",
                "verifyStructuredClassificationInspection",
            ],
        ),
        "medical-projection" => (
            crate::medical_projection_binding::PROFILE,
            &[
                "projectMedicalFhir",
                "projectCdcMortality",
                "projectDicomMetadata",
                "lookupMedicalTerminology",
            ],
        ),
        "relationship-extra-projection" => (
            crate::relationship_extra_projection_binding::PROFILE,
            &[
                "prepareRelationshipToExtra",
                "completeRelationshipToExtra",
                "classifyRelationshipExtra",
                "verifyRelationshipExtra",
                "recoverRelationshipExtraIdeal",
                "recoverRelationshipExtraNative",
            ],
        ),
        "relationship-parquet-projection" => (
            crate::relationship_parquet_projection_binding::PROFILE,
            &[
                "projectRelationshipToParquet",
                "verifyRelationshipParquetProjection",
                "recoverRelationshipParquetIdeal",
                "recoverRelationshipParquetNative",
            ],
        ),
        "field-record-parquet-projection" => (
            crate::parquet_field_record_projection_binding::PROFILE,
            &[
                "projectFieldToParquet",
                "recoverFieldFromParquet",
                "projectRecordToParquet",
                "recoverRecordFromParquet",
            ],
        ),
        "avro" => (
            crate::avro_binding::PROFILE,
            &[
                "import",
                "inspect",
                "inspectPayload",
                "fields",
                "export",
                "exportBundle",
                "getNode",
                "editNode",
                "proposeNodeEdit",
            ],
        ),
        "avro-json-schema-projection" => (
            crate::avro_json_schema_projection_binding::PROFILE,
            &["projectAvroToJsonSchema"],
        ),
        "arrow-flatbuffer-model" => (
            crate::arrow_flatbuffer_model_binding::PROFILE,
            &[
                "importArrowFlatbufferModel",
                "inspectArrowFlatbufferModel",
                "exportArrowFlatbufferModel",
                "proposeArrowFlatbufferEdit",
                "decodeArrowFlatbuffer",
                "prepareArrowFlatbufferEncoding",
                "verifyArrowFlatbufferEncoding",
            ],
        ),
        "arrow-spark-projection" => (
            crate::arrow_spark_projection_binding::PROFILE,
            &["projectArrowToSpark", "projectSparkToArrow"],
        ),
        "avro-tablespec-projection" => (
            crate::avro_tablespec_projection_binding::PROFILE,
            &["projectAvroToTableSpec", "projectTableSpecToAvro"],
        ),
        "postgresql-avro-projection" => (
            crate::postgresql_avro_projection_binding::PROFILE,
            &["projectPostgresqlToAvro"],
        ),
        "postgresql-json-schema-projection" => (
            crate::postgresql_json_schema_projection_binding::PROFILE,
            &["projectPostgresqlRowToJsonSchema"],
        ),
        "json-schema-protobuf-projection" => (
            crate::json_schema_protobuf_projection_binding::PROFILE,
            &["projectJsonSchemaToProtobuf"],
        ),
        "tablespec-via-avro-projection" => (
            crate::tablespec_via_avro_projection_binding::PROFILE,
            &["projectToTableSpecViaAvro"],
        ),
        "parquet-avro-projection" => (
            crate::parquet_avro_projection_binding::PROFILE,
            &["projectParquetToAvro"],
        ),
        "sqlserver-avro-projection" => (
            crate::sqlserver_avro_projection_binding::PROFILE,
            &["projectSqlServerToAvro"],
        ),
        "sqlserver-ddl-projection" => (
            crate::sqlserver_ddl_projection_binding::PROFILE,
            &["projectSqlServerToDdl"],
        ),
        "binding-sqlserver-planned-index-projection" => (
            crate::binding_sqlserver_planned_indexes_binding::PROFILE,
            &["projectBindingIndexesAgainstSqlServerPlan"],
        ),
        "binding-index-projection" => (
            crate::binding_indexes_binding::PROFILE,
            &[
                "projectBindingIndexesToSqlServer",
                "prepareBindingIndexesToPostgresql",
                "completeBindingIndexesToPostgresql",
            ],
        ),
        "binding-public" => (
            crate::binding_public_binding::PROFILE,
            &[
                "inspectBinding",
                "getBinding",
                "readBindingDocument",
                "writeBindingDocument",
                "projectBindingIndexes",
                "migrateBindingRelationships",
                "rollbackBindingRelationships",
                "validateBindingSemantics",
                "validateBit128Dataset",
            ],
        ),
        "dashboard-public" => (
            crate::dashboard_binding::PROFILE,
            &[
                "inspectDashboard",
                "readDashboardDocument",
                "writeDashboardDocument",
                "getDashboardDefinition",
                "validateDashboardSemantics",
            ],
        ),
        "binding-parquet-projection" => (
            crate::binding_parquet_projection_binding::PROFILE,
            &["projectBindingToParquet"],
        ),
        "binding-sqlserver-tables" => (
            crate::binding_sqlserver_tables_binding::PROFILE,
            &[
                "projectBindingTablesToSqlServer",
                "projectBindingTablesAndIndexesFromPlanToSqlServer",
                "projectBindingTablesAndIndexesToSqlServer",
            ],
        ),
        "binding-sqlserver-physical" => (
            crate::binding_sqlserver_physical_binding::PROFILE,
            &[
                "projectBindingToSqlServer",
                "verifyBindingSqlServerProjection",
                "recoverBindingSqlServerSources",
                "recoverBindingSqlServerNative",
            ],
        ),
        "binding-delta-projection" => (
            crate::binding_delta_projection_binding::PROFILE,
            &["projectBindingToDelta"],
        ),
        "ddd-json-schema-projection" => (
            crate::ddd_json_schema_projection_binding::PROFILE,
            &[
                "projectDddToJsonSchema",
                "dddFieldBinding",
                "inspectDdd",
                "validateDddPayload",
                "getDddDefinition",
                "editDddDefinition",
                "projectDddEntitiesToGraphql",
                "projectDddToGraphql",
                "verifyDddGraphqlProjection",
                "recoverDddFromGraphql",
                "recoverDddGraphqlNative",
                "validateSqlServerRelationshipLayout",
                "validatePostgresqlRelationshipLayout",
                "prepareDddPostgresqlProjection",
                "completeDddPostgresqlProjection",
                "verifyDddPostgresqlProjection",
                "recoverDddPostgresqlIdeal",
                "recoverDddPostgresqlNative",
                "blockDddPostgresqlProjection",
                "prepareDddPostgresqlTables",
                "completeDddPostgresqlTables",
                "blockDddPostgresqlTables",
                "prepareDddPostgresqlTablesAndIndexes",
                "completeDddPostgresqlTablesAndIndexes",
                "prepareDddPostgresqlTablesAndIndexesCombined",
            ],
        ),
        "openapi-json-schema-projection" => (
            crate::openapi_json_schema_projection_binding::PROFILE,
            &["projectOpenapiToJsonSchema"],
        ),
        "typespec-smithy-jsonschema-projection" => (
            crate::typespec_smithy_jsonschema_projection_binding::PROFILE,
            &[
                "prepareTypeSpecJsonSchema",
                "completeTypeSpecJsonSchema",
                "prepareSmithyJsonSchema",
                "completeSmithyJsonSchema",
            ],
        ),
        "openapi" => (
            crate::openapi_binding::PROFILE,
            &[
                "import",
                "validate",
                "inspectPayload",
                "export",
                "exportBundle",
                "getNode",
                "lookupResource",
                "extractSchema",
                "indexSchemas",
                "resolveSchemaReference",
                "resolveDynamicReference",
                "resolveObjectReference",
                "edit",
            ],
        ),
        "linkml" => (
            crate::native_contract_binding::PROFILE,
            &[
                "import",
                "inspect",
                "inspectPayload",
                "export",
                "getNode",
                "editNode",
                "classSlots",
                "slotValues",
                "importContext",
                "importMerge",
            ],
        ),
        "odcs" => (
            crate::native_contract_binding::PROFILE,
            &[
                "import",
                "inspect",
                "inspectPayload",
                "export",
                "getNode",
                "editNode",
                "resolveReference",
                "relationships",
                "renameElement",
            ],
        ),
        "tablespec" => (
            crate::tablespec_binding::PROFILE,
            &[
                "importTableSpec",
                "inspectTableSpec",
                "exportTableSpec",
                "getTableSpecTable",
                "getTableSpecColumn",
                "editTableSpecTable",
                "editTableSpecColumn",
                "importTableSpecBundle",
                "exportTableSpecBundle",
                "classifyTableSpecField",
                "verifyTableSpecFieldClassification",
                "projectFieldToTableSpec",
                "recoverFieldFromTableSpec",
                "classifyTableSpecRecord",
                "verifyTableSpecRecordClassification",
                "projectRecordToTableSpec",
                "recoverRecordFromTableSpec",
                "projectCardinalityToTableSpec",
                "recoverCardinalityFromTableSpec",
                "projectNullabilityToTableSpec",
                "recoverNullabilityFromTableSpec",
                "classifyTableSpecCardinality",
                "verifyTableSpecCardinalityClassification",
                "recoverTableSpecCardinalitySource",
                "classifyTableSpecNullability",
                "verifyTableSpecNullabilityClassification",
                "recoverTableSpecNullabilitySource",
                "classifyTableSpecKeys",
                "verifyTableSpecKeyClassification",
                "recoverTableSpecKeySource",
                "projectKeysToTableSpec",
                "verifyKeysTableSpecProjection",
                "recoverKeysTableSpecIdeal",
                "projectFacetsToTableSpec",
                "recoverFacetsFromTableSpec",
                "classifyTableSpecFacets",
                "verifyTableSpecFacetClassification",
                "recoverTableSpecFacetSource",
                "classifyTableSpecRelationships",
                "verifyTableSpecRelationshipClassification",
                "recoverTableSpecRelationshipSource",
            ],
        ),
        "jsonld" => (
            crate::jsonld_binding::PROFILE,
            &[
                "import",
                "inspectPayload",
                "validate",
                "export",
                "getNode",
                "editNode",
                "expand",
                "flatten",
                "compact",
                "toRdf",
                "fromRdf",
                "fromGeneralizedRdf",
                "frame",
            ],
        ),
        "postgresql" => (
            crate::postgresql_catalog_binding::PROFILE,
            &[
                "import",
                "inspect",
                "inspectPayload",
                "export",
                "columns",
                "getNode",
                "findRelation",
                "edit",
                "proposeCatalogEdit",
                "reconstruction",
                "dependencies",
                "facetCatalog",
                "cardinalityCatalog",
                "cardinalityType",
                "cardinalityCorrelate",
                "keyCatalog",
                "prepareKeyCorrelation",
                "keyCorrelate",
                "facetCorrelate",
                "classifyComposite",
                "verifyCompositeClassification",
                "recoverCompositeCapture",
                "getDdlDeclarations",
                "prepareDdlParserRequest",
                "classifyDdlRecord",
                "verifyDdlKinds",
                "recoverDdlKinds",
                "prepareFieldProjection",
                "completeFieldProjection",
                "recoverFieldProjection",
                "prepareRecordProjection",
                "completeRecordProjection",
                "recoverRecordProjection",
                "prepareFieldRecovery",
                "prepareRecordRecovery",
                "prepareCardinalityProjection",
                "completeCardinalityProjection",
                "prepareCardinalityRecovery",
                "recoverCardinalityProjection",
                "prepareNullabilityProjection",
                "completeNullabilityProjection",
                "prepareNullabilityRecovery",
                "recoverNullabilityProjection",
                "projectFieldWithNativeBackend",
                "recoverFieldWithNativeBackend",
                "projectRecordWithNativeBackend",
                "recoverRecordWithNativeBackend",
                "projectCardinalityWithNativeBackend",
                "recoverCardinalityWithNativeBackend",
                "projectNullabilityWithNativeBackend",
                "recoverNullabilityWithNativeBackend",
                "classifyField",
                "verifyFieldClassification",
                "recoverFieldCapture",
                "classifyRecord",
                "verifyRecordClassification",
                "recoverRecordCapture",
                "classifyCardinality",
                "verifyCardinalityClassification",
                "recoverCardinalitySource",
                "classifyNullability",
                "verifyNullabilityClassification",
                "recoverNullabilitySource",
                "prepareKeyParserRequests",
                "classifyKeys",
                "verifyKeyClassification",
                "recoverKeySource",
                "prepareFacetParserRequests",
                "classifyFacets",
                "verifyFacetClassification",
                "recoverFacetSource",
                "prepareRelationshipParserRequests",
                "classifyRelationships",
                "verifyRelationshipClassification",
                "recoverRelationshipSource",
            ],
        ),
        "sqlserver" => (
            crate::sqlserver_binding::PROFILE,
            &[
                "import",
                "inspect",
                "inspectPayload",
                "export",
                "columns",
                "constraints",
                "indexes",
                "edit",
                "facetType",
                "facetPredicate",
                "facetConstraints",
                "classifyField",
                "verifyFieldClassification",
                "recoverFieldCapture",
                "classifyRecord",
                "verifyRecordClassification",
                "recoverRecordCapture",
                "classifyCardinality",
                "verifyCardinalityClassification",
                "recoverCardinalitySource",
                "classifyNullability",
                "verifyNullabilityClassification",
                "recoverNullabilitySource",
                "classifyKeys",
                "verifyKeyClassification",
                "recoverKeySource",
                "recoverRelationshipSource",
                "verifyRelationshipClassification",
                "classifyRelationships",
                "classifyFacets",
                "verifyFacetClassification",
                "recoverFacetSource",
            ],
        ),
        "shacl" => (
            crate::shacl_owl_binding::SHACL_PROFILE,
            &[
                "import",
                "inspect",
                "inspectPayload",
                "export",
                "getQuads",
                "editQuad",
                "getPropertyPath",
                "evaluatePropertyPath",
                "getTargetNodes",
                "getShapeMetadata",
                "validate",
            ],
        ),
        "owl" => (
            crate::shacl_owl_binding::OWL_PROFILE,
            &[
                "import",
                "inspect",
                "inspectPayload",
                "export",
                "getQuads",
                "editQuad",
                "getOntologyHeaders",
                "getExpressionView",
                "getListAxioms",
                "getSpecialAxioms",
                "getAxiomAnnotations",
                "getDeclarations",
            ],
        ),
        "delta-schema" => (
            crate::delta_schema_table::PROFILE,
            &[
                "import",
                "inspect",
                "inspectPayload",
                "export",
                "getNode",
                "proposeNodeEdit",
            ],
        ),
        "delta-table" => (
            crate::delta_schema_table::PROFILE,
            &[
                "import",
                "inspect",
                "inspectPayload",
                "export",
                "getNode",
                "getSchema",
                "proposeNodeEdit",
                "renameMappedField",
            ],
        ),
        "delta-ddl" => (
            crate::delta_ddl_binding::PROFILE,
            &[
                "defineTable",
                "generate",
                "generateBundle",
                "realizeSparkDelta4",
                "inspectPayload",
            ],
        ),
        "delta-parquet" => (
            crate::parquet_capture_binding::PROFILE,
            &[
                "projectActions",
                "reconcileCheckpoint",
                "reconcileMultipart",
            ],
        ),
        "spark" => (
            crate::spark_binding::PROFILE,
            &[
                "import",
                "inspect",
                "inspectPayload",
                "export",
                "getNode",
                "editNode",
                "renameField",
            ],
        ),
        "delta-log" => (
            crate::delta_log_binding::PROFILE,
            &[
                "capture",
                "export",
                "inspect",
                "inspectActions",
                "reconcileCommits",
                "reconcileCheckpointSidecars",
            ],
        ),
        "binding-iceberg-projection" => (
            crate::binding_iceberg_projection_binding::PROFILE,
            &["projectBindingToIceberg"],
        ),
        "iceberg-table" => (
            crate::iceberg_table_binding::PROFILE,
            &[
                "import",
                "inspect",
                "inspectPayload",
                "export",
                "getNode",
                "editNode",
                "inspectContext",
                "inspectTransforms",
                "inspectTransformType",
                "proposeRename",
                "proposePromotion",
            ],
        ),
        "rdf" => (
            crate::rdf_binding::PROFILE,
            &[
                "importNQuads",
                "importTurtle",
                "importTriG",
                "inspect",
                "getQuads",
                "exportNQuads",
                "exportTurtle",
                "exportTriG",
                "getNamedGraphs",
                "editQuad",
                "renameIri",
                "mergeDatasets",
                "inspectGeneralized",
                "importGeneralizedDataset",
                "exportGeneralizedDataset",
                "getGeneralizedQuads",
                "editGeneralizedQuad",
                "inspectPayload",
            ],
        ),
        _ => return bad_family(),
    };
    let operations = operations
        .iter()
        .map(|operation| {
            let wire_operation = if family == "field-record-sqlserver-projection"
                || family == "field-record-parquet-projection"
                || family == "field-record-avro-projection"
                || family == "cardinality-sqlserver-projection"
                || family == "avro-cardinality"
                || family == "avro-classification"
                || family == "record-type"
            {
                (*operation).to_owned()
            } else if family == "tablespec" {
                (*operation).to_owned()
            } else if family == "iceberg-table" {
                format!("iceberg.table.{operation}")
            } else if family == "delta-schema" {
                format!("delta/schema.{operation}")
            } else if family == "delta-table" {
                format!("delta/table.{operation}")
            } else if family == "delta-log" {
                format!("delta/log.{operation}")
            } else if family == "delta-ddl" {
                format!("delta.ddl.{operation}")
            } else if family == "delta-parquet" {
                format!("delta.parquet.{operation}")
            } else {
                format!("{family}.{operation}")
            };
            (Utf16::from(*operation), Value::string_utf8(&wire_operation))
        })
        .collect();
    let value = Value::Object(vec![
        (Utf16::from("family"), Value::string_utf8(family)),
        (Utf16::from("profile"), Value::string_utf8(profile)),
        (Utf16::from("operations"), Value::Object(operations)),
    ]);
    crate::result_envelope(crate::encode(&value, &mut Context::ordinary()))
}

pub fn execute_wire(family: &str, wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(family, wire, &mut no_control)
}

pub fn execute_wire_with_control(
    family: &str,
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    match family {
        "cardinality-sqlserver-projection" => {
            crate::cardinality_sqlserver_projection_binding::execute_wire_with_control(
                wire, control,
            )
        }
        "field-record-sqlserver-projection" => {
            crate::sqlserver_field_record_projection_binding::execute_wire_with_control(
                wire, control,
            )
        }
        "field-record-avro-projection" => {
            crate::avro_field_record_projection_binding::execute_wire_with_control(wire, control)
        }
        "avro-classification" => {
            crate::avro_classification_binding::execute_wire_with_control(wire, control)
        }
        "avro-cardinality" => {
            crate::avro_cardinality_binding::execute_wire_with_control(wire, control)
        }
        "record-type" => crate::record_type_binding::execute_wire_with_control(wire, control),
        "nullability-avro-projection" => {
            crate::nullability_avro_projection_binding::execute_wire_with_control(wire, control)
        }
        "nullability-sqlserver-projection" => {
            crate::nullability_sqlserver_projection_binding::execute_wire_with_control(
                wire, control,
            )
        }
        "facets-avro-projection" => {
            crate::facets_avro_projection_binding::execute_wire_with_control(wire, control)
        }
        "facets-sqlserver-projection" => {
            crate::facets_sqlserver_projection_binding::execute_wire_with_control(wire, control)
        }
        "key-avro-projection" => {
            crate::key_avro_projection_binding::execute_wire_with_control(wire, control)
        }
        "key-sqlserver-projection" => {
            crate::key_sqlserver_projection_binding::execute_wire_with_control(wire, control)
        }
        "avro-relationship-projection" => {
            crate::avro_relationship_projection_binding::execute_wire_with_control(wire, control)
        }
        "tablespec-relationship-projection" => {
            crate::relationship_tablespec_projection_binding::execute_wire_with_control(
                wire, control,
            )
        }
        "relationship-sqlserver-projection" => {
            crate::relationship_sqlserver_projection_binding::execute_wire_with_control(
                wire, control,
            )
        }
        "relationship-postgresql-projection" => {
            crate::relationship_postgresql_projection_binding::execute_wire_with_control(
                wire, control,
            )
        }
        "core-ideal-reports" => {
            crate::core_ideal_reports_binding::execute_wire_with_control(wire, control)
        }
        "medical-projection" => {
            crate::medical_projection_binding::execute_wire_with_control(wire, control)
        }
        "relationship-extra-projection" => {
            crate::relationship_extra_projection_binding::execute_wire_with_control(wire, control)
        }
        "relationship-parquet-projection" => {
            crate::relationship_parquet_projection_binding::execute_wire_with_control(wire, control)
        }
        "field-record-parquet-projection" => {
            crate::parquet_field_record_projection_binding::execute_wire_with_control(wire, control)
        }
        "avro" => crate::avro_binding::execute_wire_with_control(wire, control),
        "avro-json-schema-projection" => {
            crate::avro_json_schema_projection_binding::execute_wire_with_control(wire, control)
        }
        "arrow-flatbuffer-model" => {
            crate::arrow_flatbuffer_model_binding::execute_wire_with_control(wire, control)
        }
        "arrow-spark-projection" => {
            crate::arrow_spark_projection_binding::execute_wire_with_control(wire, control)
        }
        "avro-tablespec-projection" => {
            crate::avro_tablespec_projection_binding::execute_wire_with_control(wire, control)
        }
        "postgresql-avro-projection" => {
            crate::postgresql_avro_projection_binding::execute_wire_with_control(wire, control)
        }
        "postgresql-json-schema-projection" => {
            crate::postgresql_json_schema_projection_binding::execute_wire_with_control(
                wire, control,
            )
        }
        "json-schema-protobuf-projection" => {
            crate::json_schema_protobuf_projection_binding::execute_wire_with_control(wire, control)
        }
        "tablespec-via-avro-projection" => {
            crate::tablespec_via_avro_projection_binding::execute_wire_with_control(wire, control)
        }
        "parquet-avro-projection" => {
            crate::parquet_avro_projection_binding::execute_wire_with_control(wire, control)
        }
        "sqlserver-avro-projection" => {
            crate::sqlserver_avro_projection_binding::execute_wire_with_control(wire, control)
        }
        "sqlserver-ddl-projection" => {
            crate::sqlserver_ddl_projection_binding::execute_wire_with_control(wire, control)
        }
        "binding-sqlserver-planned-index-projection" => {
            crate::binding_sqlserver_planned_indexes_binding::execute_wire_with_control(
                wire, control,
            )
        }
        "binding-index-projection" => {
            crate::binding_indexes_binding::execute_wire_with_control(wire, control)
        }
        "binding-public" => crate::binding_public_binding::execute_wire_with_control(wire, control),
        "dashboard-public" => crate::dashboard_binding::execute_wire_with_control(wire, control),
        "binding-parquet-projection" => {
            crate::binding_parquet_projection_binding::execute_wire_with_control(wire, control)
        }
        "binding-sqlserver-tables" => {
            crate::binding_sqlserver_tables_binding::execute_wire_with_control(wire, control)
        }
        "binding-sqlserver-physical" => {
            crate::binding_sqlserver_physical_binding::execute_wire_with_control(wire, control)
        }
        "binding-delta-projection" => {
            crate::binding_delta_projection_binding::execute_wire_with_control(wire, control)
        }
        "ddd-json-schema-projection" => {
            crate::ddd_json_schema_projection_binding::execute_wire_with_control(wire, control)
        }
        "openapi-json-schema-projection" => {
            crate::openapi_json_schema_projection_binding::execute_wire_with_control(wire, control)
        }
        "typespec-smithy-jsonschema-projection" => {
            crate::typespec_smithy_jsonschema_projection_binding::execute_wire_with_control(
                wire, control,
            )
        }
        "openapi" => crate::openapi_binding::execute_wire_with_control(wire, control),
        "linkml" => crate::native_contract_binding::execute_linkml_wire_with_control(wire, control),
        "odcs" => crate::native_contract_binding::execute_odcs_wire_with_control(wire, control),
        "tablespec" => crate::tablespec_binding::execute_wire_with_control(wire, control),
        "jsonld" => crate::jsonld_binding::execute_wire_with_control(wire, control),
        "postgresql" => crate::postgresql_catalog_binding::execute_wire_with_control(wire, control),
        "sqlserver" => crate::sqlserver_binding::execute_wire_with_control(wire, control),
        "shacl" => crate::shacl_owl_binding::execute_shacl_wire_with_control(wire, control),
        "owl" => crate::shacl_owl_binding::execute_owl_wire_with_control(wire, control),
        "rdf" => crate::rdf_binding::execute_wire_with_control(wire, control),
        "binding-iceberg-projection" => {
            crate::binding_iceberg_projection_binding::execute_wire_with_control(wire, control)
        }
        "iceberg-table" => crate::iceberg_table_binding::execute_wire_with_control(wire, control),
        "delta-schema" | "delta-table" => {
            crate::delta_schema_table::execute_json_with_control(wire, control)
        }
        "delta-log" => crate::delta_log_binding::execute_json_with_control(wire, control),
        "delta-ddl" => crate::delta_ddl_binding::execute_json_with_control(wire, control),
        "delta-parquet" => crate::parquet_capture_binding::execute_wire_with_control(wire, control),
        "spark" => crate::spark_binding::execute_wire_with_control(wire, control),
        _ => bad_family(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value as Json;
    use umf_core::{Context, Value};

    fn request(profile: &str, op: &str, fields: &[(&str, Value)]) -> String {
        let mut members = vec![
            (Utf16::from("profile"), Value::string_utf8(profile)),
            (Utf16::from("op"), Value::string_utf8(op)),
        ];
        members.extend(
            fields
                .iter()
                .map(|(key, value)| (Utf16::from(*key), value.clone())),
        );
        crate::encode(&Value::Object(members), &mut Context::ordinary()).unwrap()
    }

    #[test]
    fn routes_original_wire_to_a_single_family_and_preserves_native_refusals() {
        let malformed = request(
            "umf.openapi-wire/1",
            "openapi.import",
            &[
                ("source", Value::string_utf8("{}")),
                ("id", Value::string_utf8("x")),
                ("unknown", Value::Null),
            ],
        );
        let response: Json = serde_json::from_str(&execute_wire("openapi", &malformed)).unwrap();
        assert_eq!(response["status"], "error");
        assert_eq!(response["code"], "REQUEST");

        let wire = request(
            "umf.openapi-wire/1",
            "openapi.import",
            &[
                ("source", Value::string_utf8("{}")),
                ("id", Value::string_utf8("x")),
            ],
        );
        let mut refuse = |_: usize| {
            Err(EngineError::new(
                "CANCELLED",
                Utf16::from("/request"),
                "Stopped by host",
            ))
        };
        let response: Json =
            serde_json::from_str(&execute_wire_with_control("openapi", &wire, &mut refuse))
                .unwrap();
        assert_eq!(response["status"], "error");
        assert_eq!(response["code"], "CANCELLED");
        assert_eq!(
            response["pathUnits"],
            serde_json::json!([47, 114, 101, 113, 117, 101, 115, 116])
        );
    }

    #[test]
    fn rejects_unknown_family_without_falling_back_to_another_runtime() {
        let response: Json = serde_json::from_str(&execute_wire("graphql", "{}")).unwrap();
        assert_eq!(response["status"], "error");
        assert_eq!(response["code"], "REQUEST");
    }
}
