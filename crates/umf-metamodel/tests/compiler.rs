// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-089-AC20, US-089-AC24
use umf_core::{
    context::Context,
    engine::{Capabilities, ResourceSet, SemanticContext},
    Diagnostic, Engine, Registry, Utf16, Value,
};
use umf_metamodel::{compile_model, parse_model};

fn canonical_model() -> Value {
    let source = include_str!("../../../spec/metamodel/umf.yaml");
    parse_model(
        &source.encode_utf16().collect::<Vec<_>>(),
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(members) => members
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(members) => members
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn compiled_engine(model: &Value) -> Engine {
    let compiled = compile_model(model, &mut Context::ordinary()).unwrap();
    let resource = |name: &str| compiled.resources.get(name).unwrap().clone();
    Engine::new(
        ResourceSet::new(
            resource("core"),
            resource("reference"),
            resource("pkg"),
            resource("constraints"),
            resource("domains"),
        ),
        &mut Context::ordinary(),
    )
    .unwrap()
}

fn valid_document() -> Value {
    Value::Object(vec![
        (Utf16::from("umf"), Value::string_utf8("0.10.0")),
        (Utf16::from("id"), Value::string_utf8("x")),
        (Utf16::from("vocabularies"), Value::Object(vec![])),
        (Utf16::from("modules"), Value::Array(vec![])),
    ])
}

struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(vec![])
    }
}

fn replace_string(value: &mut Value, old: &str, new: &str) {
    match value {
        Value::String(text) if text == &Utf16::from(old) => *text = Utf16::from(new),
        Value::Array(items) => items
            .iter_mut()
            .for_each(|item| replace_string(item, old, new)),
        Value::Object(items) => items
            .iter_mut()
            .for_each(|(_, item)| replace_string(item, old, new)),
        _ => {}
    }
}

fn operation_outputs(model: &Value) -> Vec<umf_metamodel::Output> {
    let compiled = compile_model(model, &mut Context::ordinary()).unwrap();
    umf_metamodel::render_outputs(
        &compiled,
        &umf_metamodel::CompilerProvenance {
            model_sha256: "test-model".into(),
            compiler_sha256: "test-compiler".into(),
        },
    )
    .unwrap()
}

fn resources_mut(model: &mut Value) -> &mut Vec<Value> {
    get_mut(
        get_mut(get_mut(model, "extensions").unwrap(), "umf.metamodel").unwrap(),
        "resources",
    )
    .and_then(|value| match value {
        Value::Array(items) => Some(items),
        _ => None,
    })
    .unwrap()
}

#[test]
fn operation_resources_match_frozen_bytes_and_follow_declaration_order() {
    let model = canonical_model();
    let outputs = operation_outputs(&model);
    let operation: Vec<_> = outputs
        .iter()
        .filter(|output| output.path.contains("operation-v"))
        .collect();
    assert_eq!(operation.len(), 2);
    assert_eq!(
        operation[0].path,
        "spec/core/facet-operation-v3.schema.json"
    );
    assert_eq!(
        operation[1].path,
        "spec/core/cardinality-operation-v4.schema.json"
    );
    assert_eq!(
        operation[0].contents,
        include_str!("../../../spec/core/facet-operation-v3.schema.json")
    );
    assert_eq!(
        operation[1].contents,
        include_str!("../../../spec/core/cardinality-operation-v4.schema.json")
    );

    let mut reversed = model;
    resources_mut(&mut reversed).reverse();
    let outputs = operation_outputs(&reversed);
    let operation: Vec<_> = outputs
        .iter()
        .filter(|output| output.path.contains("operation-v"))
        .collect();
    assert_eq!(
        operation[0].path,
        "spec/core/cardinality-operation-v4.schema.json"
    );
    assert_eq!(
        operation[1].path,
        "spec/core/facet-operation-v3.schema.json"
    );
}

#[test]
fn operation_resource_bindings_and_fragment_scope_are_closed() {
    let mut swapped_id = canonical_model();
    *get_mut(&mut resources_mut(&mut swapped_id)[0], "id").unwrap() =
        Value::string_utf8("urn:umf:core:cardinality-operation:4.0.0");
    assert_eq!(
        compile_model(&swapped_id, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "METAMODEL_RESOURCE_PATH"
    );

    let mut escaped_fragment = canonical_model();
    let first = &mut resources_mut(&mut escaped_fragment)[0];
    *get_mut(first, "root").unwrap() = Value::Object(vec![
        (Utf16::from("tag"), Value::string_utf8("object-fragment")),
        (
            Utf16::from("required"),
            Value::Array(vec![Value::string_utf8("x")]),
        ),
    ]);
    assert_eq!(
        compile_model(&escaped_fragment, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "METAMODEL_RESOURCE_FRAGMENT_SCOPE"
    );

    let mut inert_constant = canonical_model();
    *get_mut(&mut resources_mut(&mut inert_constant)[0], "root").unwrap() = Value::Object(vec![
        (Utf16::from("tag"), Value::string_utf8("constant")),
        (
            Utf16::from("value"),
            Value::Object(vec![
                (Utf16::from("tag"), Value::string_utf8("object-fragment")),
                (Utf16::from("type"), Value::string_utf8("literal-type")),
                (
                    Utf16::from("required"),
                    Value::string_utf8("literal-required"),
                ),
            ]),
        ),
    ]);
    let output = operation_outputs(&inert_constant)
        .into_iter()
        .find(|item| item.path == "spec/core/facet-operation-v3.schema.json")
        .unwrap();
    let generated = umf_core::serialization::read_json_value(
        &output.contents.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap();
    let Value::Object(constant_members) = get(&generated, "const").unwrap() else {
        panic!("root constant should remain a JSON object");
    };
    assert_eq!(constant_members[0].0, Utf16::from("tag"));
    assert_eq!(constant_members[1].0, Utf16::from("type"));
    assert_eq!(constant_members[2].0, Utf16::from("required"));
}

#[test]
fn ordinary_constant_data_is_not_scanned_as_resource_shape_metadata() {
    let mut model = canonical_model();
    let module = get_mut(&mut model, "modules")
        .and_then(|value| match value {
            Value::Array(items) => items.first_mut(),
            _ => None,
        })
        .unwrap();
    let element = get_mut(module, "elements")
        .and_then(|value| match value {
            Value::Array(items) => items
                .iter_mut()
                .find(|item| get(item, "id") == Some(&Value::string_utf8("id"))),
            _ => None,
        })
        .unwrap();
    let annotation = get_mut(get_mut(element, "extensions").unwrap(), "umf.metamodel").unwrap();
    *get_mut(annotation, "shape").unwrap() = Value::Object(vec![
        (Utf16::from("tag"), Value::string_utf8("constant")),
        (
            Utf16::from("value"),
            Value::Object(vec![(
                Utf16::from("tag"),
                Value::string_utf8("object-fragment"),
            )]),
        ),
    ]);
    assert!(compile_model(&model, &mut Context::ordinary()).is_ok());
}

#[test]
fn authored_field_shape_mutation_changes_the_rust_compiled_schema() {
    let mut changed = canonical_model();
    let modules = get_mut(&mut changed, "modules")
        .and_then(|value| match value {
            Value::Array(items) => items.first_mut(),
            _ => None,
        })
        .unwrap();
    let elements = get_mut(modules, "elements")
        .and_then(|value| match value {
            Value::Array(items) => items
                .iter_mut()
                .find(|element| get(element, "id") == Some(&Value::string_utf8("id"))),
            _ => None,
        })
        .unwrap();
    let annotations = get_mut(elements, "extensions").unwrap();
    let annotation = get_mut(annotations, "umf.metamodel").unwrap();
    let shape = get_mut(annotation, "shape").unwrap();
    *get_mut(shape, "min").unwrap() = Value::Number(2.0);

    let original = compiled_engine(&canonical_model());
    let mutated = compiled_engine(&changed);
    let document = valid_document();
    assert!(original
        .core_structure_diagnostics(&document, &mut Context::ordinary())
        .unwrap()
        .is_empty());
    let diagnostics = mutated
        .core_structure_diagnostics(&document, &mut Context::ordinary())
        .unwrap();
    assert!(
        !diagnostics.is_empty(),
        "the authored min-length change must reach the generated schema"
    );
    assert!(diagnostics
        .iter()
        .any(|diagnostic| diagnostic.path == Utf16::from("/id")));
}

#[test]
fn authored_constraint_program_mutation_changes_rust_engine_diagnostics() {
    let mut changed = canonical_model();
    replace_string(&mut changed, "UNKNOWN_CORE_FIELD", "AUTHORED_UNKNOWN_FIELD");
    let engine = compiled_engine(&changed);
    let mut document = valid_document();
    if let Value::Object(members) = &mut document {
        members.push((Utf16::from("futureField"), Value::Bool(true)));
    }
    let diagnostics = engine
        .run_core_constraints(
            &document,
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap();
    assert!(diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == Utf16::from("AUTHORED_UNKNOWN_FIELD")));
}
