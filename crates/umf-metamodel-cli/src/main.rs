// SPDX-License-Identifier: MIT OR Apache-2.0
//! Source-bound standalone metamodel compiler CLI.
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    io::{self, Read},
};
use umf_core::serialization::Format;
use umf_core::{Context, EngineError, Utf16, Value};

const MAX_REQUEST_BYTES: usize = 32 * 1024 * 1024;

fn main() {
    if let Err(error) = run(std::env::args().skip(1).collect()) {
        eprintln!("{error}");
        std::process::exit(2);
    }
}

fn run(args: Vec<String>) -> Result<(), String> {
    if args.first().map(String::as_str) == Some("reference") {
        return reference_run(&args[1..]);
    }
    if args.first().map(String::as_str) != Some("metamodel") {
        return Err("usage: umf-metamodel <metamodel|reference> ...".into());
    }
    let operation = args
        .get(1)
        .map(String::as_str)
        .ok_or("metamodel operation is required")?;
    let flags = parse_flags(&args[2..])?;
    let mut ctx = Context::ordinary();
    match operation {
        "parse" => {
            let source = if flags.contains_key("stdin-wire") {
                match decode_stdin(&mut ctx)? {
                    Value::String(source) => source.into_units(),
                    _ => return Err("parse wire input must be a UTF-16 string".into()),
                }
            } else if let Some(path) = flags.get("input") {
                String::from_utf8(std::fs::read(path).map_err(|e| e.to_string())?)
                    .map_err(|_| "source is not valid UTF-8".to_owned())?
                    .encode_utf16()
                    .collect()
            } else {
                return Err("--input or --stdin-wire is required".into());
            };
            let model = umf_core::serialization::read_json_value(&source, Format::Yaml, &mut ctx)
                .map_err(|e| e.to_string())?;
            println!(
                "{}",
                encode_transport(&model, &mut ctx).map_err(|e| e.to_string())?
            );
        }
        "compile" => {
            let model = decode_stdin(&mut ctx)?;
            let compiled =
                umf_metamodel::compile_model(&model, &mut ctx).map_err(|e| e.to_string())?;
            println!(
                "{}",
                encode_transport(&compile_result(model, compiled), &mut ctx)
                    .map_err(|e| e.to_string())?
            );
        }
        "shape" => {
            let request = decode_stdin(&mut ctx)?;
            let shape = field(&request, "shape").ok_or("shape input is missing shape")?;
            let targets = match field(&request, "targets") {
                Some(Value::Array(items)) => items
                    .iter()
                    .filter_map(|v| {
                        if let Value::String(s) = v {
                            Some(s.clone())
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>(),
                _ => Vec::new(),
            };
            let result = if matches!(field(&request, "checkOnly"), Some(Value::Bool(true))) {
                umf_metamodel::check_shape_with_context(shape, &mut ctx)
                    .map_err(|e| e.to_string())?;
                Value::Bool(true)
            } else {
                umf_metamodel::emit_shape_with_context(shape, &targets, &mut ctx)
                    .map_err(|e| e.to_string())?
            };
            println!(
                "{}",
                encode_transport(&result, &mut ctx).map_err(|e| e.to_string())?
            );
        }
        "outputs" => outputs(&flags, &mut ctx)?,
        _ => return Err(format!("unknown metamodel operation: {operation}")),
    }
    Ok(())
}

fn outputs(flags: &BTreeMap<String, String>, ctx: &mut Context<'_>) -> Result<(), String> {
    let path = flags.get("input").ok_or("--input is required")?;
    let compiler_sha256 = flags
        .get("compiler-sha256")
        .ok_or("--compiler-sha256 is required")?
        .clone();
    let source = String::from_utf8(std::fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|_| "source is not valid UTF-8".to_owned())?;
    let model_sha256 = sha256(source.as_bytes());
    let model = umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Yaml,
        ctx,
    )
    .map_err(|e| e.to_string())?;
    let compiled = umf_metamodel::compile_model(&model, ctx).map_err(|e| e.to_string())?;
    let provenance = umf_metamodel::CompilerProvenance {
        model_sha256,
        compiler_sha256,
    };
    let outputs = umf_metamodel::render_outputs_with_context(&compiled, &provenance, ctx)
        .map_err(|e| e.to_string())?;
    let output_values = Value::Array(
        outputs
            .into_iter()
            .map(|o| {
                object(vec![
                    ("path", Value::string_utf8(o.path)),
                    ("contents", Value::string_utf8(o.contents)),
                ])
            })
            .collect(),
    );
    let language = umf_core::copy_json(&compiled.language, ctx).map_err(|e| e.to_string())?;
    let result = compile_result(model, compiled);
    let envelope = object(vec![
        ("profile", Value::string_utf8("umf.metamodel.compile/1")),
        ("modelSha256", Value::string_utf8(provenance.model_sha256)),
        (
            "compilerSha256",
            Value::string_utf8(provenance.compiler_sha256),
        ),
        ("language", language),
        ("outputs", output_values),
        ("result", result),
    ]);
    let json = umf_core::serialization::stringify_compact_metered(&envelope, ctx)
        .map_err(|e| e.to_string())?
        .to_utf8()
        .map_err(|_| "invalid output UTF-16".to_owned())?;
    println!("{json}");
    Ok(())
}

fn reference_run(args: &[String]) -> Result<(), String> {
    if args != ["self-model-check", "--stdin-wire"] {
        return Err("usage: umf-metamodel reference self-model-check --stdin-wire".into());
    }
    let mut ctx = Context::ordinary();
    let wire = String::from_utf8(read_limited(MAX_REQUEST_BYTES)?)
        .map_err(|_| "wire input is not valid UTF-8".to_owned())?;
    let mut meter = |n| ctx.charge_work(n, Utf16::default());
    let mut transport = umf_tagged_wire::transport_context().with_meter(&mut meter);
    let request = umf_tagged_wire::decode(&wire, &mut transport).map_err(|e| e.to_string())?;
    let source = match field(&request, "source") {
        Some(Value::String(source)) => {
            ctx.charge_work(source.len(), Utf16::default())
                .map_err(|e| e.to_string())?;
            source
                .to_utf8()
                .map_err(|_| "source is not valid UTF-8".to_owned())?
        }
        _ => return Err("self-model-check request requires a UTF-8 source string".into()),
    };
    let manifest =
        field(&request, "manifest").ok_or("self-model-check request requires manifest")?;
    let result =
        umf_metamodel::reference::admit_self_model_catalog(source.as_bytes(), manifest, &mut ctx)
            .map_err(|e| e.to_string())?;
    println!(
        "{}",
        encode_transport(&result, &mut ctx).map_err(|e| e.to_string())?
    );
    Ok(())
}

fn decode_stdin(ctx: &mut Context<'_>) -> Result<Value, String> {
    let wire = String::from_utf8(read_limited(MAX_REQUEST_BYTES)?)
        .map_err(|_| "wire input is not valid UTF-8".to_owned())?;
    let mut meter = |n| ctx.charge_work(n, Utf16::default());
    let mut transport = umf_tagged_wire::transport_context().with_meter(&mut meter);
    umf_tagged_wire::decode(&wire, &mut transport).map_err(|e| e.to_string())
}
fn encode_transport(value: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let mut meter = |n| ctx.charge_work(n, Utf16::default());
    let mut transport = umf_tagged_wire::transport_context().with_meter(&mut meter);
    umf_tagged_wire::encode(value, &mut transport)
}
fn read_limited(maximum: usize) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    io::stdin()
        .take(maximum.saturating_add(1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > maximum {
        return Err(format!(
            "request exceeds the {maximum}-byte transport limit"
        ));
    }
    Ok(bytes)
}
fn parse_flags(args: &[String]) -> Result<BTreeMap<String, String>, String> {
    let mut out = BTreeMap::new();
    let mut i = 0;
    while i < args.len() {
        let flag = args[i]
            .strip_prefix("--")
            .ok_or_else(|| format!("unexpected argument {}", args[i]))?
            .to_owned();
        if flag == "stdin-wire" {
            out.insert(flag, String::new());
            i += 1;
            continue;
        }
        i += 1;
        let value = args
            .get(i)
            .ok_or_else(|| format!("--{flag} requires a value"))?
            .clone();
        if out.insert(flag.clone(), value).is_some() {
            return Err(format!("duplicate --{flag}"));
        }
        i += 1;
    }
    Ok(out)
}
fn compile_result(model: Value, mut compiled: umf_metamodel::CompiledModel) -> Value {
    let mut take = |key: &str| compiled.resources.remove(key).unwrap_or(Value::Null);
    object(vec![
        ("model", model),
        ("language", compiled.language),
        ("core", take("core")),
        ("reference", take("reference")),
        ("pkg", take("pkg")),
        ("constraints", take("constraints")),
        ("domains", take("domains")),
        ("definitions", take("definitions")),
        (
            "digest",
            Value::string_utf8(compiled.digest.unwrap_or_default()),
        ),
    ])
}
fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = value {
        fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value)
    } else {
        None
    }
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn sha256(bytes: &[u8]) -> String {
    let mut hash = Sha256::new();
    hash.update(bytes);
    format!("{:x}", hash.finalize())
}
