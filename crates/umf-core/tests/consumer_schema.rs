// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-089-AC20 @covers US-089-AC24
// Independent consumer controls for previously accepted JSON Schema mechanics.
// Dynamic recursion/evaluation semantics: JSON Schema 2020-12 core Appendix C,
// https://json-schema.org/draft/2020-12/json-schema-core#appendix-C
use umf_core::schema::{CompiledSchema, SchemaResources};
use umf_core::serialization::{read_json_value, Format};
use umf_core::{Context, Utf16, Value};
fn json(text: &str) -> Value {
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap()
}
fn compile(text: &str, resources: SchemaResources) -> CompiledSchema {
    CompiledSchema::compile(&json(text), &resources, &mut Context::catalog()).unwrap()
}
fn valid(schema: &CompiledSchema, text: &str) -> bool {
    schema
        .validate(&json(text), &mut Context::ordinary())
        .unwrap()
        .is_empty()
}

#[test]
fn evaluated_properties_cross_refs_and_only_successful_combinator_branches() {
    let referenced = compile(
        r##"{"$defs":{"known":{"properties":{"x":true}}},"allOf":[{"$ref":"#/$defs/known"}],"unevaluatedProperties":false}"##,
        SchemaResources::default(),
    );
    assert!(valid(&referenced, r#"{"x":1}"#));
    assert!(!valid(&referenced, r#"{"x":1,"y":2}"#));
    let branches = compile(
        r#"{"anyOf":[{"properties":{"x":{"type":"number"}}},{"properties":{"y":{"type":"string"}}}],"unevaluatedProperties":false}"#,
        SchemaResources::default(),
    );
    assert!(valid(&branches, r#"{"x":1}"#));
    assert!(valid(&branches, r#"{"y":"ok"}"#));
    assert!(!valid(&branches, r#"{"x":"bad"}"#));
    assert!(!valid(&branches, r#"{"x":1,"z":true}"#));
}

#[test]
fn unevaluated_items_honors_prefix_and_contains_annotations() {
    let prefix = compile(
        r#"{"prefixItems":[true],"unevaluatedItems":false}"#,
        SchemaResources::default(),
    );
    assert!(valid(&prefix, "[1]"));
    assert!(!valid(&prefix, "[1,2]"));
    let contains = compile(
        r#"{"contains":{"const":1},"unevaluatedItems":false}"#,
        SchemaResources::default(),
    );
    assert!(valid(&contains, "[1,1]"));
    assert!(!valid(&contains, "[1,2]"));
    assert!(!valid(&contains, "[]"));
}

#[test]
fn dynamic_recursion_rebinds_to_strict_outer_resource() {
    let base = json(
        r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://fixture.example/tree","$dynamicAnchor":"node","type":"object","properties":{"label":true,"nodes":{"type":"array","items":{"$dynamicRef":"#node"}}}}"##,
    );
    let schema = compile(
        r#"{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://fixture.example/strict-tree","$dynamicAnchor":"node","$ref":"tree","unevaluatedProperties":false}"#,
        SchemaResources {
            entries: vec![(Utf16::from("https://fixture.example/tree"), base)],
        },
    );
    assert!(valid(
        &schema,
        r#"{"label":"root","nodes":[{"label":"leaf"}]}"#
    ));
    assert!(!valid(&schema, r#"{"nodes":[{"unexpected":1}]}"#));
    assert!(!valid(&schema, r#"{"unexpected":1}"#));
}

#[test]
fn draft7_ref_siblings_are_ignored_and_2020_siblings_apply() {
    let old = compile(
        r##"{"$schema":"http://json-schema.org/draft-07/schema#","definitions":{"any":true},"$ref":"#/definitions/any","type":"string"}"##,
        SchemaResources::default(),
    );
    assert!(valid(&old, "7"));
    let current = compile(
        r##"{"$schema":"https://json-schema.org/draft/2020-12/schema","$defs":{"any":true},"$ref":"#/$defs/any","type":"string"}"##,
        SchemaResources::default(),
    );
    assert!(!valid(&current, "7"));
    assert!(valid(&current, r#""ok""#));
}
