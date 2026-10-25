#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{cell::Cell, rc::Rc};
use umf_core::{
    protobuf_document,
    protobuf_source::{self, ProtobufCompilerResult, ProtobufSourceCompiler},
    Context, EngineError, Limits, ResourceProfile, Utf16, Value,
};

fn request() -> Value {
    Value::Object(vec![
        (
            Utf16::from("files"),
            Value::Object(vec![(
                Utf16::from("a.proto"),
                Value::string_utf8("syntax = \"proto3\";\nmessage A {}\n"),
            )]),
        ),
        (
            Utf16::from("roots"),
            Value::Array(vec![Value::string_utf8("a.proto")]),
        ),
    ])
}
struct Compiler {
    observed: Option<Value>,
    result: Option<Result<ProtobufCompilerResult, EngineError>>,
    entered: Option<Rc<Cell<bool>>>,
}
impl ProtobufSourceCompiler for Compiler {
    fn supports_cooperative_controls(&self) -> bool {
        true
    }
    fn compile(
        &mut self,
        request: &Value,
        context: &mut Context<'_>,
    ) -> Result<ProtobufCompilerResult, EngineError> {
        self.observed = Some(request.clone());
        if let Some(entered) = &self.entered {
            entered.set(true);
        }
        context.charge_work(1, Utf16::default())?;
        self.result.take().unwrap()
    }
}
impl Compiler {
    fn with(bytes: Vec<u8>) -> Self {
        Self {
            observed: None,
            result: Some(Ok(ProtobufCompilerResult {
                descriptor_set: bytes,
                compiler: Utf16::from("trusted-protoc test"),
            })),
            entered: None,
        }
    }
}
fn get<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(fields) = value else {
        panic!("object expected")
    };
    fields
        .iter()
        .find(|(key, _)| key.to_utf8().is_ok_and(|v| v == name))
        .map(|(_, v)| v)
        .unwrap()
}
fn archived_files(document: &Value) -> &Value {
    let modules = get(document, "modules");
    let Value::Array(modules) = modules else {
        panic!("modules array expected")
    };
    let elements = get(&modules[0], "elements");
    let Value::Array(elements) = elements else {
        panic!("elements array expected")
    };
    let extensions = get(&elements[0], "extensions");
    get(get(extensions, "umf.protobuf"), "sourceArchive")
}
fn archive(document: &Value) -> &Value {
    let modules = get(document, "modules");
    let Value::Array(modules) = modules else {
        panic!("modules array expected")
    };
    let elements = get(&modules[0], "elements");
    let Value::Array(elements) = elements else {
        panic!("elements array expected")
    };
    get(
        get(get(&elements[0], "extensions"), "umf.protobuf"),
        "sourceArchive",
    )
}

#[test]
fn compiler_receives_isolated_request_and_archive_preserves_original_source() {
    let mut input = request();
    let mut compiler = Compiler::with(vec![]);
    let output =
        protobuf_source::import_sources(&input, "proto", &mut compiler, &mut Context::ordinary())
            .unwrap();
    assert_eq!(compiler.observed.as_ref(), Some(&input));
    let archive = archived_files(&output);
    assert_eq!(get(archive, "files"), get(&input, "files"));
    assert_eq!(get(archive, "roots"), get(&input, "roots"));
    assert_eq!(
        get(archive, "compiler"),
        &Value::string_utf8("trusted-protoc test")
    );
    assert!(
        protobuf_document::inspect(&output, &mut Context::ordinary())
            .unwrap()
            .valid
    );
    assert!(
        !protobuf_document::inspect(&output, &mut Context::ordinary())
            .unwrap()
            .complete
    );
    if let Value::Object(fields) = &mut input {
        let files = fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from("files"))
            .unwrap();
        if let Value::Object(files) = &mut files.1 {
            files[0].1 = Value::string_utf8("changed after import");
        }
    }
    assert_eq!(
        get(get(archive, "files"), "a.proto"),
        &Value::string_utf8("syntax = \"proto3\";\nmessage A {}\n")
    );
}

#[test]
fn rejects_unknown_request_fields_and_bad_roots_before_compiler_call() {
    let mut bad = request();
    if let Value::Object(fields) = &mut bad {
        fields.push((Utf16::from("future"), Value::Bool(true)));
    }
    let mut compiler = Compiler::with(vec![]);
    assert_eq!(
        protobuf_source::import_sources(&bad, "proto", &mut compiler, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "PROTOBUF_SOURCE"
    );
    assert!(compiler.observed.is_none());
    assert_eq!(
        protobuf_source::import_sources(&request(), "", &mut compiler, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "PROTOBUF_DOCUMENT"
    );
    let duplicate_roots = Value::Object(vec![
        (
            Utf16::from("files"),
            Value::Object(vec![(Utf16::from("a.proto"), Value::string_utf8("x"))]),
        ),
        (
            Utf16::from("roots"),
            Value::Array(vec![
                Value::string_utf8("a.proto"),
                Value::string_utf8("a.proto"),
            ]),
        ),
    ]);
    assert_eq!(
        protobuf_source::prepare_source_import(&duplicate_roots, "proto", &mut Context::ordinary())
            .err()
            .unwrap()
            .code,
        "PROTOBUF_SOURCE"
    );
    let mut duplicate_request = request();
    if let Value::Object(fields) = &mut duplicate_request {
        fields.push((
            Utf16::from("roots"),
            Value::Array(vec![Value::string_utf8("a.proto")]),
        ));
    }
    assert_eq!(
        protobuf_source::prepare_source_import(
            &duplicate_request,
            "proto",
            &mut Context::ordinary()
        )
        .err()
        .unwrap()
        .code,
        "DUPLICATE_KEY"
    );
    assert_eq!(
        protobuf_source::prepare_source_import(
            &request(),
            "proto",
            &mut Context::with_limits(
                ResourceProfile::Cooperative,
                Limits {
                    max_text_units: 8,
                    ..Limits::ordinary()
                }
            )
            .unwrap()
        )
        .err()
        .unwrap()
        .code,
        "LIMIT"
    );
    let aggregate = Value::Object(vec![
        (
            Utf16::from("files"),
            Value::Object(vec![
                (Utf16::from("a"), Value::string_utf8("1234")),
                (Utf16::from("b"), Value::string_utf8("5678")),
            ]),
        ),
        (
            Utf16::from("roots"),
            Value::Array(vec![Value::string_utf8("a")]),
        ),
    ]);
    let limits = Limits {
        max_text_units: 10,
        ..Limits::ordinary()
    };
    assert_eq!(
        protobuf_source::prepare_source_import(
            &aggregate,
            "p",
            &mut Context::with_limits(ResourceProfile::Cooperative, limits).unwrap()
        )
        .err()
        .unwrap()
        .code,
        "LIMIT"
    );
}

#[test]
fn copy_shape_unknown_and_field_refusals_keep_predecessor_order() {
    let unsafe_number_and_unknown = Value::Object(vec![
        (
            Utf16::from("files"),
            Value::Object(vec![(Utf16::from("a.proto"), Value::string_utf8("x"))]),
        ),
        (
            Utf16::from("roots"),
            Value::Array(vec![Value::string_utf8("a.proto")]),
        ),
        (Utf16::from("future"), Value::Number(f64::INFINITY)),
    ]);
    assert_eq!(
        protobuf_source::prepare_source_import(
            &unsafe_number_and_unknown,
            "id",
            &mut Context::ordinary()
        )
        .err()
        .unwrap()
        .code,
        "NUMBER"
    );

    let missing_shape_and_unknown = Value::Object(vec![(Utf16::from("future"), Value::Bool(true))]);
    let shape = protobuf_source::prepare_source_import(
        &missing_shape_and_unknown,
        "id",
        &mut Context::ordinary(),
    )
    .err()
    .unwrap();
    assert_eq!(shape.code, "PROTOBUF_SOURCE");
    assert!(shape.message.to_utf8().unwrap().contains("Expected files"));

    let unknown_before_bad_field = Value::Object(vec![
        (
            Utf16::from("files"),
            Value::Object(vec![(Utf16::from("a.proto"), Value::Bool(true))]),
        ),
        (
            Utf16::from("roots"),
            Value::Array(vec![Value::string_utf8("a.proto")]),
        ),
        (Utf16::from("future"), Value::Bool(true)),
    ]);
    assert!(protobuf_source::prepare_source_import(
        &unknown_before_bad_field,
        "id",
        &mut Context::ordinary()
    )
    .err()
    .unwrap()
    .message
    .to_utf8()
    .unwrap()
    .contains("Unknown source"));
}

#[test]
fn serialized_request_bound_counts_json_escaping_before_compiler_dispatch() {
    let request = Value::Object(vec![
        (
            Utf16::from("files"),
            Value::Object(vec![(
                Utf16::from("a.proto"),
                Value::String(Utf16::new(vec![0; 700_000])),
            )]),
        ),
        (
            Utf16::from("roots"),
            Value::Array(vec![Value::string_utf8("a.proto")]),
        ),
    ]);
    let mut compiler = Compiler::with(vec![]);
    assert_eq!(
        protobuf_source::import_sources(&request, "id", &mut compiler, &mut Context::ordinary())
            .unwrap_err()
            .code,
        "LIMIT"
    );
    assert!(compiler.observed.is_none());
}

#[test]
fn preserves_utf16_source_keys_and_refuses_noncooperative_compiler_before_dispatch() {
    let name = Utf16::new(vec![b'a' as u16, 0xd800]);
    let source = Utf16::new(vec![b'm' as u16, 0xdfff]);
    let input = Value::Object(vec![
        (
            Utf16::from("files"),
            Value::Object(vec![(name.clone(), Value::String(source.clone()))]),
        ),
        (
            Utf16::from("roots"),
            Value::Array(vec![Value::String(name.clone())]),
        ),
    ]);
    let mut compiler = Compiler::with(vec![]);
    let document =
        protobuf_source::import_sources(&input, "proto", &mut compiler, &mut Context::ordinary())
            .unwrap();
    assert_eq!(compiler.observed.as_ref(), Some(&input));
    assert_eq!(source.len(), 2);

    struct NonCooperative;
    impl ProtobufSourceCompiler for NonCooperative {
        fn supports_cooperative_controls(&self) -> bool {
            false
        }
        fn compile(
            &mut self,
            _: &Value,
            _: &mut Context<'_>,
        ) -> Result<ProtobufCompilerResult, EngineError> {
            panic!("must not dispatch")
        }
    }
    assert_eq!(
        protobuf_source::import_sources(
            &request(),
            "proto",
            &mut NonCooperative,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "COMPILER_CONTROL_UNAVAILABLE"
    );
    assert_eq!(get(archive(&document), "files"), get(&input, "files"));
    assert_eq!(get(archive(&document), "roots"), get(&input, "roots"));
}

#[test]
fn compiler_identity_and_descriptor_input_bound_are_checked() {
    let missing_identity = ProtobufCompilerResult {
        descriptor_set: vec![],
        compiler: Utf16::default(),
    };
    let mut compiler = Compiler {
        observed: None,
        result: Some(Ok(missing_identity)),
        entered: None,
    };
    assert_eq!(
        protobuf_source::import_sources(
            &request(),
            "proto",
            &mut compiler,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "PROTOBUF_SOURCE"
    );
    let too_large = ProtobufCompilerResult {
        descriptor_set: vec![0; 4_000_001],
        compiler: Utf16::from("compiler"),
    };
    let mut compiler = Compiler {
        observed: None,
        result: Some(Ok(too_large)),
        entered: None,
    };
    assert_eq!(
        protobuf_source::import_sources(
            &request(),
            "proto",
            &mut compiler,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "LIMIT"
    );
    let malformed = ProtobufCompilerResult {
        descriptor_set: vec![0x80],
        compiler: Utf16::from("compiler"),
    };
    let mut compiler = Compiler {
        observed: None,
        result: Some(Ok(malformed)),
        entered: None,
    };
    assert_eq!(
        protobuf_source::import_sources(
            &request(),
            "proto",
            &mut compiler,
            &mut Context::ordinary()
        )
        .unwrap_err()
        .code,
        "PROTOBUF_BINARY"
    );
}

#[test]
fn callback_host_control_failure_propagates_and_stops_finalization() {
    let entered = Rc::new(Cell::new(false));
    let during_callback = entered.clone();
    let mut meter = move |_amount: usize| {
        if during_callback.get() {
            Err(EngineError::new(
                "HOST_LIMIT",
                Utf16::default(),
                "meter stop",
            ))
        } else {
            Ok(())
        }
    };
    let mut context = Context::ordinary().with_meter(&mut meter);
    let mut compiler = Compiler::with(vec![]);
    compiler.entered = Some(entered);
    let result = protobuf_source::import_sources(&request(), "proto", &mut compiler, &mut context);
    assert_eq!(result.unwrap_err().code, "HOST_LIMIT");
    assert!(
        compiler.observed.is_some(),
        "control failure should occur inside the compiler callback"
    );
}

#[test]
fn compiler_error_is_not_reclassified() {
    let mut compiler = Compiler {
        observed: None,
        result: Some(Err(EngineError::new(
            "COMPILER_SYNTAX",
            Utf16::from("a.proto"),
            "invalid source",
        ))),
        entered: None,
    };
    let result = protobuf_source::import_sources(
        &request(),
        "proto",
        &mut compiler,
        &mut Context::ordinary(),
    );
    assert_eq!(result.unwrap_err().code, "COMPILER_SYNTAX");
    assert!(compiler.observed.is_some());
}
