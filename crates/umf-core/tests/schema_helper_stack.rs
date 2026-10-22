// SPDX-License-Identifier: MIT OR Apache-2.0
use std::thread;
use umf_core::schema::CompiledSchema;
use umf_core::serialization::{read_python_value, Format};
use umf_core::{
    Context, PyText, PythonConsumerValue as P, PythonReVersion, PythonSchemaEvaluationMode,
};

fn run_family(
    body: &'static str,
    array: bool,
    nodes: usize,
    expected_limit: bool,
    root_reference: bool,
) {
    thread::Builder::new().name("schema-helper-depth-2m".into()).stack_size(2 * 1024 * 1024).spawn(move || {
        let root_body = if root_reference {r##""$ref":"#/$defs/node""##} else {body};
        let source = format!(r##"{{"$schema":"https://json-schema.org/draft/2020-12/schema","$defs":{{"node":{{{body}}}}},{root_body}}}"##);
        let value = read_python_value(&PyText::from_utf8(&source),Format::Json,&mut Context::ordinary()).unwrap();
        let compiled = CompiledSchema::compile_python_source(&value,&Default::default(),false,PythonReVersion::V3_11,&mut Context::ordinary()).unwrap();
        let mut instance = if array {P::Array(Vec::new())} else {P::Object(Vec::new())};
        for _ in 1..nodes {
            instance = if array {P::Array(vec![instance])} else {P::Object(vec![(PyText::from_utf8("child"),instance)])};
        }
        let result = compiled.evaluate(&instance,PythonSchemaEvaluationMode::FirstError,&mut Context::ordinary());
        if expected_limit {assert_eq!(result.unwrap_err().code,"LIMIT")} else {
            let result=result.expect("admitted helper recursion must fit normal stack");
            assert!(result.errors.is_empty());assert!(result.terminal_error.is_none());
        }
    }).unwrap().join().expect("helper recursion must not overflow normal stack");
}
#[test]
fn additional_properties_reference_chain_fits_normal_stack() {
    let body = r##""type":"object","additionalProperties":{"$ref":"#/$defs/node"}"##;
    run_family(body, false, 65, false, false);
    run_family(body, false, 66, true, false);
}
#[test]
fn items_reference_chain_fits_normal_stack() {
    let body = r##""type":"array","items":{"$ref":"#/$defs/node"}"##;
    run_family(body, true, 65, false, false);
    run_family(body, true, 66, true, false);
}
#[test]
fn pattern_annotation_reference_chain_fits_normal_stack() {
    let body = r##""type":"object","patternProperties":{"^child$":{"$ref":"#/$defs/node"}},"unevaluatedProperties":false"##;
    run_family(body, false, 65, false, false);
    run_family(body, false, 66, true, false);
}
#[test]
fn combinator_reference_chain_fits_normal_stack() {
    let body = r##""allOf":[{"type":"object","properties":{"child":{"$ref":"#/$defs/node"}}}]"##;
    // Root reference + 42 recursive three-edge steps + final allOf reaches 128.
    run_family(body, false, 43, false, true);
    run_family(body, false, 44, true, true);
}
