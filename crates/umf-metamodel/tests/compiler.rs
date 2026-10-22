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
