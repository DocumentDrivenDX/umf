// SPDX-License-Identifier: MIT OR Apache-2.0
//! RFC 6902 transformations through the same Rust entry point all hosts call.
use umf_codegen::{CodegenEngine, CodegenResources};
use umf_core::{serialization::{read_json_value, Format}, Context, EngineError, Utf16, Value};
fn parse(text: &str) -> Value {
    read_json_value(&text.encode_utf16().collect::<Vec<_>>(), Format::Json, &mut Context::catalog()).unwrap()
}
#[test]
fn all_six_operations_pointers_root_and_json_equality() {
    let resources = CodegenResources::release(&mut Context::catalog()).unwrap();
    let engine = CodegenEngine::new(&resources);
    for (request, expected) in [
        (r#"{"document":{"a":[1,3]},"patch":[{"op":"add","path":"/a/1","value":2},{"op":"add","path":"/a/-","value":4}]}"#,r#"{"present":true,"value":{"a":[1,2,3,4]}}"#),
        (r#"{"document":{"a":1},"patch":[{"op":"replace","path":"/a","value":null}]}"#,r#"{"present":true,"value":{"a":null}}"#),
        (r#"{"document":{"a":{"nested":1}},"patch":[{"op":"copy","from":"/a","path":"/b"},{"op":"replace","path":"/a/nested","value":2}]}"#,r#"{"present":true,"value":{"a":{"nested":2},"b":{"nested":1}}}"#),
        (r#"{"document":{"a":[0,1,2]},"patch":[{"op":"move","from":"/a/0","path":"/a/2"},{"op":"remove","path":"/a/0"}]}"#,r#"{"present":true,"value":{"a":[2,0]}}"#),
        (r#"{"document":{"a/b":{"~key":1}},"patch":[{"op":"replace","path":"/a~1b/~0key","value":2}]}"#,r#"{"present":true,"value":{"a/b":{"~key":2}}}"#),
        (r#"{"document":{"~1":1},"patch":[{"op":"test","path":"/~01","value":1}]}"#,r#"{"present":true,"value":{"~1":1}}"#),
        (r#"{"document":{"":1,"01":2,"-":3},"patch":[{"op":"replace","path":"/","value":4},{"op":"remove","path":"/01"}]}"#,r#"{"present":true,"value":{"":4,"-":3}}"#),
        (r#"{"document":{"a":1,"b":[false,null]},"patch":[{"op":"test","path":"","value":{"b":[false,null],"a":1.0},"ignored":true}]}"#,r#"{"present":true,"value":{"a":1,"b":[false,null]}}"#),
        (r#"{"document":null,"patch":[{"op":"remove","path":""}]}"#,r#"{"present":false}"#),
        (r#"{"document":1,"patch":[{"op":"remove","path":""},{"op":"add","path":"","value":[2]}]}"#,r#"{"present":true,"value":[2]}"#),
        (r#"{"document":{},"patch":[{"op":"add","path":"/__proto__","value":{"safe":true}}]}"#,r#"{"present":true,"value":{"__proto__":{"safe":true}}}"#),
    ] {
        let request = parse(request);
        let original = request.clone();
        let actual = engine.apply_json_patch(&request, &mut Context::ordinary()).unwrap();
        assert_eq!(actual, parse(expected));
        assert_eq!(request, original, "input changed");
    }
}
#[test]
fn failures_never_return_or_publish_a_partial_document() {
    let resources = CodegenResources::release(&mut Context::catalog()).unwrap();
    let engine = CodegenEngine::new(&resources);
    for patch in [
        r#"[{"op":"add","path":"/x","value":1},{"op":"test","path":"/a","value":99}]"#,
        r#"[{"op":"replace","path":"/missing","value":1}]"#,
        r#"[{"op":"add","path":"/missing/child","value":1}]"#,
        r#"[{"op":"move","from":"","path":"/a/child"}]"#,
        r#"[{"op":"add","path":"/items/01","value":1}]"#,
        r#"[{"op":"remove","path":"/items/-"}]"#,
        r#"[{"op":"add","path":"/items/3","value":1}]"#,
        r#"[{"op":"add","path":"/~2","value":1}]"#,
        r#"[{"op":"add","path":"/new"}]"#,
        r#"[{"op":"copy","from":"/missing","path":"/new"}]"#,
        r#"[{"op":"test","path":"/a","value":"1"}]"#,
        r#"[{"op":"test","path":"/items","value":[2,1]}]"#,
    ] {
        let request = parse(&format!(r#"{{"document":{{"a":1,"items":[1,2]}},"patch":{patch}}}"#));
        let original = request.clone();
        assert_eq!(engine.apply_json_patch(&request, &mut Context::ordinary()).unwrap_err().code, "JSON_PATCH");
        assert_eq!(original, request);
    }
}
#[test]
fn cooperative_control_errors_keep_their_origin() {
    let resources = CodegenResources::release(&mut Context::catalog()).unwrap();
    let engine = CodegenEngine::new(&resources);
    let request = parse(r#"{"document":{"a":1},"patch":[]}"#);
    let mut meter = |_| Err(EngineError::new("METER_FAILURE", Utf16::from("/host"), "stop"));
    let error = engine.apply_json_patch(&request, &mut Context::ordinary().with_meter(&mut meter)).unwrap_err();
    assert_eq!(error.code, "METER_FAILURE");
    assert_eq!(error.path, Utf16::from("/host"));
}
