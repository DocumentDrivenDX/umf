// SPDX-License-Identifier: MIT OR Apache-2.0
//! NDJSON example driver for source-bound domain-pack generation.
use std::io::{self, BufRead};

use umf_codegen::pack_tools::generate_pack_tools;
use umf_core::serialization::{Format, read_json_value, stringify_compact};
use umf_core::{Context, EngineError, Utf16, Value};

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

fn error_value(error: EngineError) -> Value {
    object(vec![
        ("code", Value::string_utf8(error.code)),
        ("path", Value::String(error.path)),
        ("message", Value::String(error.message)),
    ])
}

fn execute(line: &str) -> Value {
    let mut context = Context::ordinary();
    let input = read_json_value(
        &line.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut context,
    );
    match input.and_then(|request| generate_pack_tools(&request, &mut context)) {
        Ok(result) => object(vec![("ok", Value::Bool(true)), ("result", result)]),
        Err(error) => object(vec![
            ("ok", Value::Bool(false)),
            ("error", error_value(error)),
        ]),
    }
}

fn main() {
    for line in io::stdin().lock().lines() {
        let result = match line {
            Ok(line) => execute(&line),
            Err(error) => object(vec![
                ("ok", Value::Bool(false)),
                (
                    "error",
                    error_value(EngineError::new(
                        "HOST_IO",
                        Utf16::default(),
                        error.to_string(),
                    )),
                ),
            ]),
        };
        match stringify_compact(&result).and_then(|encoded| {
            encoded.to_utf8().map_err(|_| {
                EngineError::new("OUTPUT_ENCODING", Utf16::default(), "Invalid output text")
            })
        }) {
            Ok(json) => println!("{json}"),
            Err(_) => println!("{}", r#"{"ok":false,"error":{"code":"OUTPUT_ENCODING","path":"","message":"Could not encode harness response"}}"#),
        }
    }
}
