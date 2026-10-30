// SPDX-License-Identifier: MIT OR Apache-2.0
// Source-only candidate test. The module is intentionally not registered by
// lib.rs until its pinned OpenAPI validation and adapter-family gates are met.
// Re-export the shared crate modules at this harness crate root so the
// unregistered candidate source is type-checked with its production paths.
pub mod context { pub use umf_core::context::*; }
pub mod engine { pub use umf_core::engine::*; }
pub mod error { pub use umf_core::error::*; }
pub mod native_json { pub use umf_core::native_json::*; }
pub mod json_number { pub use umf_core::json_number::*; }
pub mod registry { pub use umf_core::registry::*; }
pub mod schema { pub use umf_core::schema::*; }
pub mod serialization { pub use umf_core::serialization::*; }
pub mod value { pub use umf_core::value::*; }

#[path = "../src/openapi_adapter.rs"]
mod openapi_adapter;

use openapi_adapter::{
    export_openapi_document, extract_openapi_schema, get_openapi_node, import_openapi_document,
    index_openapi_schemas, lookup_openapi_resource, propose_openapi_edit,
    resolve_openapi_object_reference, resolve_openapi_schema_reference, OpenapiFormat,
    resolve_openapi_dynamic_reference, OpenapiResourceInput, OpenapiRuntime,
};
use umf_core::{context::Context, value::{Utf16, Value}};

fn runtime() -> (std::sync::Arc<OpenapiRuntime>, Context<'static>) {
    // Share only immutable compiled resources. Every operation retains its own
    // fresh context and inputs; resource construction is not a per-case check.
    static RUNTIME: std::sync::OnceLock<std::sync::Arc<OpenapiRuntime>> = std::sync::OnceLock::new();
    let runtime = RUNTIME.get_or_init(|| {
        let mut context = Context::ordinary();
        std::sync::Arc::new(OpenapiRuntime::new(&mut context).expect("candidate runtime setup"))
    });
    (std::sync::Arc::clone(runtime), Context::ordinary())
}

#[test]
fn exact_yaml_source_copied_nodes_and_existing_node_edits() {
    let (runtime, mut ctx) = runtime();
    let source = Utf16::from(include_str!("../../../fixtures/openapi/orders.yaml"));
    let document = import_openapi_document(
        &source,
        &Utf16::from("orders"),
        OpenapiFormat::Yaml,
        None,
        &[],
        &runtime,
        &mut ctx,
    )
    .expect("bounded preservation import");
    assert_eq!(
        export_openapi_document(&document, None, &runtime, &mut ctx).unwrap(),
        source
    );

    let copied = get_openapi_node(
        &document,
        &Utf16::from("/info/title"),
        None,
        &runtime,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        copied.render_compact(&mut ctx).unwrap(),
        Utf16::from("\"Orders API\"")
    );

    let (candidate, validation) = propose_openapi_edit(
        &document,
        &Utf16::from("/info/title"),
        &Utf16::from("\"Updated Orders\""),
        None,
        &runtime,
        &mut ctx,
    )
    .unwrap();
    assert!(validation.valid);
    assert!(!validation.complete);
    let edited_title = get_openapi_node(
        &candidate,
        &Utf16::from("/info/title"),
        None,
        &runtime,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(edited_title.render_compact(&mut ctx).unwrap(), Utf16::from("\"Updated Orders\""));
    let changed_json = export_openapi_document(
        &candidate,
        Some(OpenapiFormat::Json),
        &runtime,
        &mut ctx,
    )
    .unwrap();
    assert!(changed_json.to_utf8().unwrap().contains("Updated Orders"));
    assert_eq!(
        export_openapi_document(&document, None, &runtime, &mut ctx).unwrap(),
        source
    );
}

#[test]
fn explicit_resource_lookup_stays_literal_and_does_not_fetch() {
    let (runtime, mut ctx) = runtime();
    let root = Utf16::from(
        "{\"openapi\":\"3.2.1\",\"info\":{\"title\":\"T\",\"version\":\"1\"},\"paths\":{}}",
    );
    let fragment = Utf16::from("{\"name\":\"retained\"}");
    let document = import_openapi_document(
        &root,
        &Utf16::from("bundle"),
        OpenapiFormat::Json,
        Some(&Utf16::from("https://example.test/openapi.json")),
        &[OpenapiResourceInput {
            uri: Utf16::from("https://example.test/schema.json"),
            source: fragment,
            format: OpenapiFormat::Json,
        }],
        &runtime,
        &mut ctx,
    )
    .expect("explicit-resource import");
    let result = lookup_openapi_resource(
        &document,
        &Utf16::from("schema.json#/name"),
        Some(&Utf16::from("https://example.test/openapi.json")),
        &runtime,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(result.uri, Utf16::from("https://example.test/schema.json"));
    assert_eq!(result.pointer, Utf16::from("/name"));
    assert_eq!(result.interpretation, "literal-document-pointer-only");
    let validation = runtime.inspect_document(&document, &mut ctx).unwrap();
    assert!(validation.diagnostics.iter().any(|diagnostic| diagnostic.code == Utf16::from("OPENAPI_RESOURCE_CONTEXT")));
}

#[test]
fn pinned_openapi_object_schema_rejects_missing_required_members() {
    let (runtime, mut ctx) = runtime();
    let source = Utf16::from(r#"{"openapi":"3.2.1","paths":{}}"#);
    let result = import_openapi_document(
        &source,
        &Utf16::from("invalid-openapi"),
        OpenapiFormat::Json,
        None,
        &[],
        &runtime,
        &mut ctx,
    );
    let error = result.expect_err("official OpenAPI schema should reject missing info");
    assert_eq!(error.code, "OPENAPI_DOCUMENT");
    assert!(error.message.to_utf8().unwrap().contains("OPENAPI_OBJECT_SCHEMA"));

    let malformed_schema = Utf16::from(r#"{"openapi":"3.2.1","info":{"title":"Bad schema","version":"1"},"paths":{},"components":{"schemas":{"Bad":{"type":17}}}}"#);
    let error = import_openapi_document(
        &malformed_schema,
        &Utf16::from("invalid-schema-keyword"),
        OpenapiFormat::Json,
        None,
        &[],
        &runtime,
        &mut ctx,
    ).expect_err("embedded Schema Object meta-schema should reject a numeric type");
    assert!(error.message.to_utf8().unwrap().contains("OPENAPI_SCHEMA_META"));

    let recursive_meta = Utf16::from(r##"{"openapi":"3.2.1","info":{"title":"Meta","version":"1"},"paths":{},"components":{"schemas":{"RecursiveMeta":{"$dynamicRef":"#meta"}}}}"##);
    let document=import_openapi_document(&recursive_meta,&Utf16::from("standalone-meta"),OpenapiFormat::Json,None,&[],&runtime,&mut ctx).unwrap();
    assert!(runtime.inspect_document(&document,&mut ctx).unwrap().valid);
}

#[test]
fn schema_context_extraction_static_index_and_reference_role_resolution() {
    let (runtime, mut ctx) = runtime();
    let source = Utf16::from(include_str!("../../../fixtures/openapi/orders-3.2.json"));
    let base = Utf16::from("https://example.test/orders.json");
    let document = import_openapi_document(
        &source,
        &Utf16::from("orders-context"),
        OpenapiFormat::Json,
        Some(&base),
        &[],
        &runtime,
        &mut ctx,
    ).unwrap();
    let schema_pointer = Utf16::from("/components/schemas/Order");
    let extracted = extract_openapi_schema(&document, &schema_pointer, None, &runtime, &mut ctx).unwrap();
    assert_eq!(extracted.dialect_origin, "openapi-default");
    assert_eq!(extracted.dialect, Utf16::from("https://spec.openapis.org/oas/3.2/dialect/2026-02-26"));

    let index = index_openapi_schemas(&document, &[], &runtime, &mut ctx).unwrap();
    assert!(index.locations.iter().any(|entry| entry.pointer == schema_pointer));
    let resolved = resolve_openapi_schema_reference(
        &document,
        &Utf16::from("/paths/~1orders~1{id}/get/responses/200/content/application~1json/schema"),
        &Utf16::from("#/components/schemas/Order"),
        None,
        &[],
        &runtime,
        &mut ctx,
    ).unwrap();
    assert_eq!(resolved.target.pointer, schema_pointer);

    let refs = Utf16::from(r##"{"openapi":"3.2.1","info":{"title":"Refs","version":"1"},"paths":{},"components":{"parameters":{"P":{"name":"q","in":"query","schema":{"type":"string"}}}},"x-use":{"$ref":"#/components/parameters/P"}}"##);
    let refs = import_openapi_document(
        &refs,
        &Utf16::from("reference-role"),
        OpenapiFormat::Json,
        Some(&base),
        &[],
        &runtime,
        &mut ctx,
    ).unwrap();
    let resolved = resolve_openapi_object_reference(
        &refs,
        &Utf16::from("/x-use"),
        &Utf16::from("parameter"),
        None,
        &runtime,
        &mut ctx,
    ).unwrap();
    assert_eq!(resolved.target.pointer, Utf16::from("/components/parameters/P"));
    assert_eq!(resolved.chain.len(), 1);
    assert!(resolved.effective_annotations.summary.is_none());
    assert!(resolved.effective_annotations.description.is_none());
    let dto = resolved.to_value(&mut ctx).unwrap();
    let result_schema_text = include_str!("../../../spec/extensions/openapi/reference-result.schema.json");
    let result_schema_units = result_schema_text.encode_utf16().collect::<Vec<_>>();
    let result_schema = serialization::read_json_value(&result_schema_units, serialization::Format::Json, &mut ctx).unwrap();
    let result_validator = schema::CompiledSchema::compile_consumer(&result_schema,&schema::SchemaResources::default(),false,&mut ctx).unwrap();
    assert!(result_validator.validate(&dto,&mut ctx).unwrap().is_empty());

    let dynamic_source = Utf16::from(r##"{"openapi":"3.2.1","info":{"title":"Dynamic","version":"1"},"paths":{},"components":{"schemas":{"Tree":{"$id":"https://example.test/tree","$dynamicAnchor":"node","type":"object","properties":{"children":{"type":"array","items":{"$dynamicRef":"#node"}}}}}}}"##);
    let dynamic_document = import_openapi_document(
        &dynamic_source,
        &Utf16::from("dynamic-context"),
        OpenapiFormat::Json,
        Some(&base),
        &[],
        &runtime,
        &mut ctx,
    ).unwrap();
    let dynamic = resolve_openapi_dynamic_reference(
        &dynamic_document,
        &Utf16::from("/components/schemas/Tree/properties/children/items"),
        None,
        &[],
        &[Utf16::from("https://example.test/tree")],
        &runtime,
        &mut ctx,
    ).unwrap();
    assert_eq!(dynamic.resolution, "dynamic");
    assert_eq!(dynamic.target.pointer, Utf16::from("/components/schemas/Tree"));
}

#[test]
fn exact_numbers_warn_and_unrelated_document_metadata_survives_edits() {
    let (runtime, mut ctx) = runtime();
    let exact_source = Utf16::from(r#"{"openapi":"3.2.1","info":{"title":"Exact","version":"1"},"paths":{},"components":{"schemas":{"N":{"minimum":9007199254740993}}}}"#);
    let exact_document = import_openapi_document(&exact_source,&Utf16::from("exact-number"),OpenapiFormat::Json,None,&[],&runtime,&mut ctx).unwrap();
    let validation = runtime.inspect_document(&exact_document,&mut ctx).unwrap();
    assert!(validation.diagnostics.iter().any(|diagnostic| diagnostic.code == Utf16::from("OPENAPI_NUMERIC")));
    assert_eq!(export_openapi_document(&exact_document,None,&runtime,&mut ctx).unwrap(),exact_source);

    let source = Utf16::from(include_str!("../../../fixtures/openapi/orders-3.2.json"));
    let mut document = import_openapi_document(&source,&Utf16::from("unrelated-metadata"),OpenapiFormat::Json,None,&[],&runtime,&mut ctx).unwrap();
    if let Value::Object(fields)=&mut document {
        if let Some((_,Value::Array(modules)))=fields.iter_mut().find(|(key,_)|key==&Utf16::from("modules")) {
            modules.push(Value::Object(vec![
                (Utf16::from("id"),Value::string_utf8("unrelated")),
                (Utf16::from("namespace"),Value::string_utf8("urn:unrelated:")),
                (Utf16::from("elements"),Value::Array(Vec::new())),
            ]));
        }
    }
    let (edited,_) = propose_openapi_edit(&document,&Utf16::from("/info/title"),&Utf16::from("\"Edited\""),None,&runtime,&mut ctx).unwrap();
    let modules=match &edited { Value::Object(fields)=>fields.iter().find(|(key,_)|key==&Utf16::from("modules")).and_then(|(_,value)|if let Value::Array(items)=value{Some(items)}else{None}).unwrap(), _=>panic!("document object") };
    assert!(modules.iter().any(|module|matches!(module,Value::Object(fields) if fields.iter().any(|(key,value)|key==&Utf16::from("id")&&value==&Value::string_utf8("unrelated")))));
}

#[test]
fn schema_position_pointers_preserve_unpaired_utf16_code_units() {
    let (runtime, mut ctx) = runtime();
    let source = Utf16::from(r#"{"openapi":"3.2.1","info":{"title":"UTF16","version":"1"},"paths":{},"components":{"schemas":{"\ud800":{"type":"string"}}}}"#);
    let document=import_openapi_document(&source,&Utf16::from("utf16-pointer"),OpenapiFormat::Json,None,&[],&runtime,&mut ctx).unwrap();
    let mut pointer="/components/schemas/".encode_utf16().collect::<Vec<_>>();
    pointer.push(0xd800);
    let schema=extract_openapi_schema(&document,&Utf16::new(pointer),None,&runtime,&mut ctx).unwrap();
    assert_eq!(schema.schema.render_compact(&mut ctx).unwrap(),Utf16::from(r#"{"type":"string"}"#));
}
