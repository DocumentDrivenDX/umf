// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{
    env, fs,
    io::{self, Read},
    process,
};

use sha2::Digest;
use umf_core::serialization::Format;
use umf_core::{Context, Utf16, Value};

fn main() {
    if env::args().nth(1).as_deref() == Some("core") {
        let args = env::args().skip(2).collect::<Vec<_>>();
        let (profile, baseline_callback) = match parse_core_args(&args) {
            Ok(options) => options,
            Err(error) => {
                println!("{}", umf_core_wire::error_envelope(error));
                return;
            }
        };
        if profile == umf_core::ResourceProfile::HardIsolated {
            println!(
                "{}",
                umf_core_wire::error_envelope(umf_core::EngineError::new(
                    "RESOURCE_PROFILE_UNAVAILABLE",
                    Utf16::default(),
                    "HardIsolated resource profile is unavailable"
                ))
            );
            return;
        }
        let input = match read_stdin()
            .and_then(|bytes| String::from_utf8(bytes).map_err(|error| error.to_string()))
        {
            Ok(input) => input,
            Err(error) => {
                println!(
                    "{}",
                    umf_core_wire::error_envelope(umf_core::EngineError::new(
                        "SOURCE_ENCODING",
                        Utf16::default(),
                        error
                    ))
                );
                return;
            }
        };
        for line in input.lines().filter(|line| !line.is_empty()) {
            println!("{}", core_run(line, profile, baseline_callback));
        }
        return;
    }
    if let Err(error) = run(env::args().skip(1).collect()) {
        eprintln!("{error}");
        process::exit(2);
    }
}

fn parse_core_args(
    args: &[String],
) -> Result<(umf_core::ResourceProfile, bool), umf_core::EngineError> {
    let invalid = || {
        umf_core::EngineError::new(
            "REQUEST",
            Utf16::default(),
            "usage: umf core --stdin-wire [--profile cooperative|hard-isolated]",
        )
    };
    let mut stdin_wire = false;
    let mut profile = None;
    let mut baseline_callback = false;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--test-baseline-callback" if !baseline_callback => baseline_callback = true,
            "--profile" if profile.is_none() => {
                index += 1;
                profile = Some(match args.get(index).map(String::as_str) {
                    Some("cooperative") => umf_core::ResourceProfile::Cooperative,
                    Some("hard-isolated") => umf_core::ResourceProfile::HardIsolated,
                    _ => return Err(invalid()),
                });
            }
            _ => return Err(invalid()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err(invalid());
    }
    Ok((
        profile.unwrap_or(umf_core::ResourceProfile::Cooperative),
        baseline_callback,
    ))
}

/// Line-oriented conformance adapter for the host-independent core API.
/// Every request and successful result uses the private tagged core-wire tree;
/// semantic resources and documents are supplied by the caller.
fn core_run(wire: &str, profile: umf_core::ResourceProfile, baseline_callback: bool) -> String {
    let mut capabilities = BaselineCapabilities {
        enabled: baseline_callback,
    };
    umf_core_wire::execute_request(wire, profile, &mut capabilities)
}

struct BaselineCapabilities {
    enabled: bool,
}
impl umf_core::Capabilities for BaselineCapabilities {
    fn validate_extension(
        &mut self,
        token: u64,
        payload: &Value,
        context: &umf_core::SemanticContext,
    ) -> Result<Vec<umf_core::Diagnostic>, Utf16> {
        if !self.enabled || token == 0 {
            return Err(Utf16::from(
                "No native callback capability is registered for this token",
            ));
        }
        let id = field(&context.document, "id")
            .and_then(value_text)
            .unwrap_or_default();
        let kind = field(payload, "kind")
            .and_then(value_text)
            .unwrap_or_default();
        let mut message = id.units().to_vec();
        message.push(0x3a);
        message.extend(context.scope.encode_utf16());
        message.push(0x3a);
        message.extend(kind.units());
        Ok(vec![umf_core::Diagnostic {
            code: "BASELINE_CALLBACK".into(),
            path: context.path.clone(),
            message: Utf16::new(message),
            severity: umf_core::Severity::Warning,
            python_source_path: false,
            python_text_origin: None,
        }])
    }
}

fn value_text(value: &Value) -> Option<Utf16> {
    if let Value::String(s) = value {
        Some(s.clone())
    } else {
        None
    }
}

fn run(args: Vec<String>) -> Result<(), String> {
    if args.first().map(String::as_str) != Some("metamodel") {
        return Err("usage: umf metamodel <parse|compile|shape|outputs> ...".into());
    }
    let operation = args
        .get(1)
        .map(String::as_str)
        .ok_or("metamodel operation is required")?;
    let flags = parse_flags(&args[2..])?;
    let mut ctx = Context::ordinary();
    match operation {
        "parse" => {
            let source_units = if flags.contains_key("stdin-wire") {
                let wire = String::from_utf8(read_stdin()?)
                    .map_err(|_| "wire input is not valid UTF-8".to_owned())?;
                match umf_core_wire::decode(&wire, &mut ctx).map_err(|e| e.to_string())? {
                    Value::String(source) => source.into_units(),
                    _ => return Err("parse wire input must be a UTF-16 string".into()),
                }
            } else if let Some(path) = flags.get("input") {
                let bytes = fs::read(path).map_err(|e| e.to_string())?;
                String::from_utf8(bytes)
                    .map_err(|_| "source is not valid UTF-8".to_owned())?
                    .encode_utf16()
                    .collect()
            } else {
                return Err("--input or --stdin-wire is required".into());
            };
            let model =
                umf_core::serialization::read_json_value(&source_units, Format::Yaml, &mut ctx)
                    .map_err(|e| e.to_string())?;
            println!(
                "{}",
                umf_core_wire::encode(&model, &mut ctx).map_err(|e| e.to_string())?
            );
        }
        "compile" => {
            let wire = read_stdin()?;
            let wire =
                String::from_utf8(wire).map_err(|_| "wire input is not valid UTF-8".to_owned())?;
            let model = umf_core_wire::decode(&wire, &mut ctx).map_err(|e| e.to_string())?;
            let compiled =
                umf_metamodel::compile_model(&model, &mut ctx).map_err(|e| e.to_string())?;
            let result = compile_result(model, compiled);
            println!(
                "{}",
                encode_transport(&result, &mut ctx).map_err(|e| e.to_string())?
            );
        }
        "shape" => {
            let wire = read_stdin()?;
            let wire =
                String::from_utf8(wire).map_err(|_| "wire input is not valid UTF-8".to_owned())?;
            let request = decode_transport(&wire, &mut ctx).map_err(|e| e.to_string())?;
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
            if matches!(field(&request, "checkOnly"), Some(Value::Bool(true))) {
                umf_metamodel::check_shape_with_context(shape, &mut ctx)
                    .map_err(|e| e.to_string())?;
                println!(
                    "{}",
                    umf_core_wire::encode(&Value::Bool(true), &mut ctx)
                        .map_err(|e| e.to_string())?
                );
            } else {
                let emitted = umf_metamodel::emit_shape_with_context(shape, &targets, &mut ctx)
                    .map_err(|e| e.to_string())?;
                println!(
                    "{}",
                    umf_core_wire::encode(&emitted, &mut ctx).map_err(|e| e.to_string())?
                );
            }
        }
        "outputs" => {
            let path = flags.get("input").ok_or("--input is required")?;
            let compiler_sha256 = flags
                .get("compiler-sha256")
                .ok_or("--compiler-sha256 is required")?
                .clone();
            let bytes = fs::read(path).map_err(|e| e.to_string())?;
            let source =
                String::from_utf8(bytes).map_err(|_| "source is not valid UTF-8".to_owned())?;
            let model_sha256 = sha256(source.as_bytes());
            let model = umf_core::serialization::read_json_value(
                &source.encode_utf16().collect::<Vec<_>>(),
                Format::Yaml,
                &mut ctx,
            )
            .map_err(|e| e.to_string())?;
            let compiled =
                umf_metamodel::compile_model(&model, &mut ctx).map_err(|e| e.to_string())?;
            let provenance = umf_metamodel::CompilerProvenance {
                model_sha256,
                compiler_sha256,
            };
            let outputs =
                umf_metamodel::render_outputs_with_context(&compiled, &provenance, &mut ctx)
                    .map_err(|e| e.to_string())?;
            let out = Value::Array(
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
            let language = umf_core::copy_json(&compiled.language, &mut ctx)
                .map_err(|error| error.to_string())?;
            let result = compile_result(model, compiled);
            let envelope = object(vec![
                ("profile", Value::string_utf8("umf.metamodel.compile/1")),
                ("modelSha256", Value::string_utf8(provenance.model_sha256)),
                (
                    "compilerSha256",
                    Value::string_utf8(provenance.compiler_sha256),
                ),
                ("language", language),
                ("outputs", out),
                ("result", result),
            ]);
            let json = umf_core::serialization::stringify_compact_metered(&envelope, &mut ctx)
                .map_err(|e| e.to_string())?;
            println!(
                "{}",
                json.to_utf8()
                    .map_err(|_| "invalid output UTF-16".to_owned())?
            );
        }
        _ => return Err(format!("unknown metamodel operation: {operation}")),
    }
    Ok(())
}

fn encode_transport(value: &Value, ctx: &mut Context<'_>) -> Result<String, umf_core::EngineError> {
    let mut meter = |amount| ctx.charge_work(amount, Utf16::default());
    let mut transport = umf_core_wire::transport_context().with_meter(&mut meter);
    umf_core_wire::encode(value, &mut transport)
}

fn decode_transport(wire: &str, ctx: &mut Context<'_>) -> Result<Value, umf_core::EngineError> {
    let mut meter = |amount| ctx.charge_work(amount, Utf16::default());
    let mut transport = umf_core_wire::transport_context().with_meter(&mut meter);
    umf_core_wire::decode(wire, &mut transport)
}

fn parse_flags(args: &[String]) -> Result<std::collections::BTreeMap<String, String>, String> {
    let mut out = std::collections::BTreeMap::new();
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
fn read_stdin() -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    io::stdin()
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}
fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    if let Value::Object(items) = value {
        items
            .iter()
            .find(|(k, _)| k == &Utf16::from(key))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn object(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
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

fn sha256(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let digest = sha2::Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for byte in digest {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use umf_core::Capabilities;

    #[test]
    fn compiler_transport_preserves_independently_admitted_depth() {
        let mut payload = Value::Null;
        for _ in 0..128 {
            payload = Value::Array(vec![payload]);
        }
        let payload = umf_core::copy_json(&payload, &mut Context::ordinary()).unwrap();
        let envelope = object(vec![("model", payload)]);
        assert!(umf_core::copy_json(&envelope, &mut Context::ordinary()).is_err());
        let encoded = encode_transport(&envelope, &mut Context::ordinary()).unwrap();
        assert_eq!(
            decode_transport(&encoded, &mut Context::ordinary()).unwrap(),
            envelope
        );
        let mut deny = |_| {
            Err(umf_core::EngineError::new(
                "WORK_DENIED",
                Utf16::default(),
                "denied",
            ))
        };
        let mut ctx = Context::ordinary().with_meter(&mut deny);
        assert_eq!(
            encode_transport(&envelope, &mut ctx).unwrap_err().code,
            "WORK_DENIED"
        );
    }

    #[test]
    fn startup_profile_admission_is_closed() {
        let parse = |items: &[&str]| {
            parse_core_args(
                &items
                    .iter()
                    .map(|item| (*item).to_owned())
                    .collect::<Vec<_>>(),
            )
        };
        assert_eq!(
            parse(&["--stdin-wire"]).unwrap(),
            (umf_core::ResourceProfile::Cooperative, false)
        );
        assert_eq!(
            parse(&["--profile", "hard-isolated", "--stdin-wire"]).unwrap(),
            (umf_core::ResourceProfile::HardIsolated, false)
        );
        for args in [
            vec!["--stdin-wire", "--profile"],
            vec!["--stdin-wire", "hard-isolated"],
            vec![
                "--stdin-wire",
                "--profile",
                "cooperative",
                "--profile",
                "hard-isolated",
            ],
            vec!["--stdin-wire", "--stdin-wire"],
            vec!["--profile", "cooperative"],
        ] {
            assert_eq!(parse(&args).unwrap_err().code, "REQUEST", "{args:?}");
        }
    }

    #[test]
    fn native_test_callback_is_explicit_and_preserves_utf16() {
        let id = Utf16::new(vec![0xd800]);
        let kind = Utf16::new(vec![0xdc00]);
        let context = umf_core::SemanticContext {
            document: Value::Object(vec![("id".into(), Value::String(id))]),
            source_document: None,
            source_payload: None,
            path: "/extensions/0".into(),
            scope: "document".into(),
        };
        let payload = Value::Object(vec![("kind".into(), Value::String(kind))]);
        assert!(BaselineCapabilities { enabled: false }
            .validate_extension(1, &payload, &context)
            .is_err());
        let result = BaselineCapabilities { enabled: true }
            .validate_extension(1, &payload, &context)
            .unwrap();
        let mut expected = vec![0xd800, 0x3a];
        expected.extend("document".encode_utf16());
        expected.extend([0x3a, 0xdc00]);
        assert_eq!(result[0].message.units(), expected);
    }
}
