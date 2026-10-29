// SPDX-License-Identifier: MIT OR Apache-2.0
#[cfg(feature = "codegen")]
mod allocator;

use std::{
    env, fs,
    io::{self, Read},
    process,
};

use sha2::Digest;
use umf_core::serialization::Format;
use umf_core::{Context, Utf16, Value};

const MAX_REFERENCE_REQUEST_BYTES: usize = 32 * 1024 * 1024;
const MAX_ICEBERG_REQUEST_BYTES: usize = 32 * 1024 * 1024;
#[cfg(feature = "embedded-adapters")]
const MAX_ARROW_SCHEMA_REQUEST_BYTES: usize = 32 * 1024 * 1024;
#[cfg(feature = "embedded-adapters")]
// A 1 MB source becomes 2 MB of hex, then expands as tagged UTF-16 units.
const MAX_ARROW_IPC_REQUEST_BYTES: usize = 12 * 1024 * 1024;
const MAX_PARQUET_CAPTURE_REQUEST_BYTES: usize = 12 * 1024 * 1024;
const MAX_PROTOBUF_INSPECT_REQUEST_BYTES: usize = 32 * 1024 * 1024;
#[cfg(feature = "embedded-adapters")]
const MAX_AVRO_DOCUMENT_INSPECT_REQUEST_BYTES: usize = 32 * 1024 * 1024;
#[cfg(feature = "embedded-adapters")]
const MAX_PROTOBUF_DESCRIPTOR_INPUT_BYTES: usize = 4_000_000;
#[cfg(feature = "embedded-adapters")]
const PROTOBUF_DESCRIPTOR_READ_CLI_PROFILE: &str = "umf.protobuf-descriptor-read-cli/0.1.0";
#[cfg(feature = "embedded-adapters")]
const PROTOBUF_DESCRIPTOR_WRITE_CLI_PROFILE: &str = "umf.protobuf-descriptor-write-cli/0.1.0";
#[cfg(feature = "embedded-adapters")]
const PROTOBUF_DOCUMENT_EXPORT_CLI_PROFILE: &str = "umf.protobuf-document-export-cli/0.1.0";
#[cfg(feature = "embedded-adapters")]
const MAX_AVRO_CANDIDATE_REQUEST_BYTES: usize = 32 * 1024 * 1024;
const MAX_JSON_SCHEMA_REQUEST_BYTES: usize = 32 * 1024 * 1024;
const MAX_CARDINALITY_REQUEST_BYTES: usize = 32 * 1024 * 1024;
const MAX_CSV_BOOLEAN_LEXICAL_REQUEST_BYTES: usize = 32 * 1024 * 1024;
const MAX_FACETS_REQUEST_BYTES: usize = 32 * 1024 * 1024;
const MAX_ACCESS_RRF_REQUEST_BYTES: usize = 4 * 1024 * 1024;
const SEC_FRAME_MAGIC: &[u8; 8] = b"UMFSEC2\0";
const SEC_MAX_INPUT_UNITS: usize = 4_000_000;
const SEC_MAX_SOURCE_UNITS: usize = 1_024;
const SEC_MAX_FRAME_BYTES: usize = 8 + 4 + SEC_MAX_INPUT_UNITS * 2 + 4 + SEC_MAX_SOURCE_UNITS * 2;

fn main() {
    let argv = env::args().skip(1).collect::<Vec<_>>();
    if argv.first().map(String::as_str) == Some("sec") {
        match sec_run(&argv[1..]) {
            Ok(output) => println!("{output}"),
            Err((status, output)) => {
                eprintln!("{output}");
                process::exit(status);
            }
        }
        return;
    }
    #[cfg(feature = "codegen")]
    if env::args().nth(1).as_deref() == Some("codegen") {
        #[cfg(feature = "allocator-test")]
        allocator::configure_test_cap_from_env();
        allocator::activate_codegen();
        #[cfg(feature = "allocator-test")]
        if env::args().nth(2).as_deref() == Some("__allocator_probe") {
            allocator::test_probe_from_env();
            return;
        }
        let code = match codegen_run(env::args().skip(2).collect()) {
            Ok(output) => {
                println!("{output}");
                0
            }
            Err((status, output)) => {
                println!("{output}");
                status
            }
        };
        if code != 0 {
            process::exit(code);
        }
        return;
    }
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

fn sec_run(args: &[String]) -> Result<String, (i32, String)> {
    if args.len() == 1 && args[0] == "--version" {
        return Ok(r#"{"profile":"umf.sec-projection/2.0.0","version":"2.0.0"}"#.into());
    }
    if args.len() == 1 && args[0] == "--capabilities" {
        return Ok(r#"{"profile":"umf.sec-projection/2.0.0","inputFormat":"UMFSEC2-UTF16LE/1","operations":["submissions","company-facts"]}"#.into());
    }
    let operation = match args {
        [op, flag]
            if flag == "--stdin-utf16le" && (op == "submissions" || op == "company-facts") =>
        {
            op.as_str()
        }
        _ => {
            return Err((
                2,
                sec_error_json(
                    "Error",
                    None,
                    None,
                    "usage: umf sec <submissions|company-facts> --stdin-utf16le",
                ),
            ))
        }
    };
    let frame = match read_sec_frame() {
        Ok(frame) => frame,
        Err(message) => return Err((2, sec_error_json("Error", None, None, &message))),
    };
    if frame.len() < 16 || &frame[..8] != SEC_FRAME_MAGIC {
        return Err((
            2,
            sec_error_json("Error", None, None, "Invalid SEC UTF-16LE frame header"),
        ));
    }
    let input_units = u32::from_le_bytes(frame[8..12].try_into().unwrap()) as usize;
    if input_units > SEC_MAX_INPUT_UNITS {
        return Err((
            2,
            sec_error_json(
                "UmfError",
                Some("LIMIT"),
                Some(""),
                "Native JSON exceeds text limit",
            ),
        ));
    }
    let input_bytes = match input_units
        .checked_mul(2)
        .and_then(|size| 12usize.checked_add(size))
    {
        Some(end) if end + 4 <= frame.len() => end,
        _ => {
            return Err((
                2,
                sec_error_json("Error", None, None, "Truncated SEC UTF-16LE input"),
            ))
        }
    };
    let source_units =
        u32::from_le_bytes(frame[input_bytes..input_bytes + 4].try_into().unwrap()) as usize;
    let source_bytes = source_units
        .checked_mul(2)
        .and_then(|size| input_bytes.checked_add(4)?.checked_add(size));
    let Some(source_end) = source_bytes else {
        return Err((
            2,
            sec_error_json("Error", None, None, "Invalid SEC UTF-16LE frame length"),
        ));
    };
    if source_end != frame.len() {
        return Err((
            2,
            sec_error_json("Error", None, None, "Invalid SEC UTF-16LE frame length"),
        ));
    }
    let input = sec_units(&frame[12..input_bytes]);
    // Preserve core's parse/root-before-source-identity order without
    // allocating the out-of-range source payload.
    let source = if source_units <= SEC_MAX_SOURCE_UNITS {
        sec_units(&frame[input_bytes + 4..source_end])
    } else {
        Vec::new()
    };
    let result = match operation {
        "submissions" => umf_core::domain_pack_sec::project_sec_submissions(&input, &source),
        "company-facts" => umf_core::domain_pack_sec::project_sec_company_facts(&input, &source),
        _ => unreachable!(),
    };
    result.map_err(|error| {
        (
            1,
            sec_error_json(
                &error.name,
                error.code.as_deref(),
                error.path.as_deref(),
                &error.message,
            ),
        )
    })
}

fn read_sec_frame() -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    io::stdin()
        .take((SEC_MAX_FRAME_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Could not read SEC frame: {e}"))?;
    if bytes.len() > SEC_MAX_FRAME_BYTES {
        return Err("SEC frame exceeds the bounded transport capacity".into());
    }
    Ok(bytes)
}

fn sec_units(bytes: &[u8]) -> Vec<u16> {
    bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect()
}

fn sec_error_json(name: &str, code: Option<&str>, path: Option<&str>, message: &str) -> String {
    fn quote(value: &str) -> String {
        format!(
            "{}",
            serde_json::to_string(value).expect("string serialization")
        )
    }
    format!(
        "{{\"name\":{},\"code\":{},\"path\":{},\"message\":{}}}",
        quote(name),
        code.map(quote).unwrap_or_else(|| "null".into()),
        path.map(quote).unwrap_or_else(|| "null".into()),
        quote(message)
    )
}

#[cfg(feature = "codegen")]
const RESOURCE_PROFILE: &str = "umf.codegen-resources/1";
#[cfg(feature = "codegen")]
const CLI_PROTOCOL: &str = "umf.codegen-cli/1";
#[cfg(feature = "codegen")]
const MAX_REQUEST_BYTES: usize = 32 * 1024 * 1024;
#[cfg(feature = "codegen")]
const RESOURCE_FILES: &[(&str, &[u8])] = &[
    (
        "actions.package.json",
        include_bytes!("../../../spec/extensions/actions/package.json"),
    ),
    (
        "binding.package.json",
        include_bytes!("../../../spec/extensions/binding/package.json"),
    ),
    (
        "core.constraints.json",
        include_bytes!("../../../spec/metamodel/generated/core-constraints.json"),
    ),
    (
        "core.domain-policy.json",
        include_bytes!("../../../spec/metamodel/generated/domain-policy.json"),
    ),
    (
        "core.package-schema.json",
        include_bytes!("../../../spec/core/extension-package.schema.json"),
    ),
    (
        "core.reference-schema.json",
        include_bytes!("../../../spec/core/semantic-type-reference.schema.json"),
    ),
    (
        "core.schema.json",
        include_bytes!("../../../spec/core/schema.json"),
    ),
    (
        "stable-binding.package.json",
        include_bytes!("../../../spec/extensions/binding-stable/package.json"),
    ),
    (
        "tables.package.json",
        include_bytes!("../../../spec/extensions/tables/package.json"),
    ),
];

#[cfg(feature = "codegen")]
fn codegen_run(args: Vec<String>) -> Result<String, (i32, String)> {
    if args.as_slice() == ["--version"] {
        let mut ctx = umf_core_wire::transport_context();
        let value = object(vec![
            ("protocol", Value::string_utf8(CLI_PROTOCOL)),
            ("version", Value::string_utf8(env!("CARGO_PKG_VERSION"))),
            ("profile", Value::string_utf8(RESOURCE_PROFILE)),
            (
                "inputFormat",
                Value::string_utf8("umf.codegen-json-core-admission/1"),
            ),
            ("outputWireProtocol", Value::string_utf8("umf.core-wire/1")),
            (
                "resourceManifestSha256",
                Value::string_utf8(resource_manifest_sha256()),
            ),
        ]);
        return umf_core::serialization::stringify_compact_metered(&value, &mut ctx)
            .and_then(|text| text.to_utf8().map_err(|_| output_encoding_error()))
            .map_err(|error| (1, engine_error(error)));
    }
    if args.as_slice() == ["--capabilities"] {
        let mut ctx = umf_core_wire::transport_context();
        let value = object(vec![
            ("protocol", Value::string_utf8(CLI_PROTOCOL)),
            ("version", Value::string_utf8(env!("CARGO_PKG_VERSION"))),
            ("profile", Value::string_utf8(RESOURCE_PROFILE)),
            (
                "inputFormat",
                Value::string_utf8("umf.codegen-json-core-admission/1"),
            ),
            ("outputWireProtocol", Value::string_utf8("umf.core-wire/1")),
            ("resourceManifest", resource_manifest()),
            (
                "resourceManifestSha256",
                Value::string_utf8(resource_manifest_sha256()),
            ),
        ]);
        return umf_core::serialization::stringify_compact_metered(&value, &mut ctx)
            .and_then(|text| text.to_utf8().map_err(|_| output_encoding_error()))
            .map_err(|error| (1, engine_error(error)));
    }
    let parsed = parse_codegen_args(&args).map_err(|message| (2, cli_error(&message)))?;
    let input =
        read_codegen_request(&parsed.request_path).map_err(|message| (2, cli_error(&message)))?;
    if input.len() > MAX_REQUEST_BYTES {
        return Err((2, cli_error("request exceeds the 32 MiB transport limit")));
    }
    let mut transport = umf_core_wire::transport_context();
    let request = match parsed.input_format.as_str() {
        "json" => {
            let text = String::from_utf8(input)
                .map_err(|error| (2, cli_error(&format!("input is not UTF-8: {error}"))))?;
            umf_core::serialization::read_json_value(
                &text.encode_utf16().collect::<Vec<_>>(),
                Format::Json,
                &mut transport,
            )
            .map_err(|error| (2, engine_error(error)))?
        }
        "wire" => {
            let text = String::from_utf8(input)
                .map_err(|error| (2, cli_error(&format!("wire input is not UTF-8: {error}"))))?;
            umf_core_wire::decode(&text, &mut transport)
                .map_err(|error| (2, engine_error(error)))?
        }
        _ => unreachable!(),
    };

    let mut ctx = Context::ordinary();
    let result = codegen_operation(&parsed.operation, &request, &mut ctx)
        .map_err(|error| (1, engine_error(error)))?;
    let envelope = object(vec![("ok", Value::Bool(true)), ("result", result)]);
    let mut output_transport = umf_core_wire::transport_context();
    let output = match parsed.output_format.as_str() {
        "json" => {
            umf_core::serialization::stringify_compact_metered(&envelope, &mut output_transport)
                .and_then(|text| text.to_utf8().map_err(|_| output_encoding_error()))
                .map_err(|error| (1, engine_error(error)))?
        }
        "wire" => umf_core_wire::encode(&envelope, &mut output_transport)
            .map_err(|error| (1, engine_error(error)))?,
        _ => unreachable!(),
    };
    Ok(output)
}

#[cfg(feature = "codegen")]
fn resource_manifest() -> Value {
    let files = RESOURCE_FILES
        .iter()
        .map(|(name, bytes)| (Utf16::from(*name), Value::string_utf8(sha256(bytes))))
        .collect();
    object(vec![
        ("files", Value::Object(files)),
        ("profile", Value::string_utf8(RESOURCE_PROFILE)),
    ])
}

#[cfg(feature = "codegen")]
fn resource_manifest_sha256() -> String {
    use std::fmt::Write;
    let mut canonical = String::from("{\"files\":{");
    for (index, (name, bytes)) in RESOURCE_FILES.iter().enumerate() {
        if index > 0 {
            canonical.push(',');
        }
        let _ = write!(canonical, "\"{name}\":\"{}\"", sha256(bytes));
    }
    canonical.push_str("},\"profile\":\"umf.codegen-resources/1\"}\n");
    sha256(canonical.as_bytes())
}

#[cfg(feature = "codegen")]
fn output_encoding_error() -> umf_core::EngineError {
    umf_core::EngineError::new(
        "OUTPUT_ENCODING",
        Utf16::default(),
        "Output cannot be represented as UTF-8",
    )
}

#[cfg(feature = "codegen")]
#[derive(Debug)]
struct CodegenArgs {
    operation: String,
    request_path: String,
    input_format: String,
    output_format: String,
}

#[cfg(feature = "codegen")]
fn parse_codegen_args(args: &[String]) -> Result<CodegenArgs, String> {
    let valid_ops = [
        "generate",
        "deployment",
        "verify-deployment",
        "migration",
        "verify-migration",
        "discover-changes",
        "row-scope",
    ];
    let operation = args.first().ok_or("operation is required")?.clone();
    if !valid_ops.contains(&operation.as_str()) {
        return Err(format!("unknown operation {operation}"));
    }
    let mut request_path = None;
    let mut input_format = "json".to_owned();
    let mut output_format = "json".to_owned();
    let mut seen_input = false;
    let mut seen_output = false;
    let mut index = 1;
    while index < args.len() {
        let flag = args[index].as_str();
        index += 1;
        let value = args
            .get(index)
            .ok_or_else(|| format!("{flag} requires a value"))?
            .clone();
        index += 1;
        match flag {
            "--request" if request_path.is_none() => request_path = Some(value),
            "--input-format" if !seen_input => {
                if !["json", "wire"].contains(&value.as_str()) {
                    return Err("--input-format must be json or wire".into());
                }
                input_format = value;
                seen_input = true;
            }
            "--output-format" if !seen_output => {
                if !["json", "wire"].contains(&value.as_str()) {
                    return Err("--output-format must be json or wire".into());
                }
                output_format = value;
                seen_output = true;
            }
            _ => return Err(format!("unexpected or duplicate argument {flag}")),
        }
    }
    Ok(CodegenArgs {
        operation,
        request_path: request_path.ok_or("--request is required")?,
        input_format,
        output_format,
    })
}

#[cfg(feature = "codegen")]
fn codegen_operation(
    operation: &str,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, umf_core::EngineError> {
    let mut resource_ctx = Context::catalog();
    let tables = embedded_json(
        include_str!("../../../spec/extensions/tables/package.json"),
        &mut resource_ctx,
    )?;
    let actions = embedded_json(
        include_str!("../../../spec/extensions/actions/package.json"),
        &mut resource_ctx,
    )?;
    let binding = embedded_json(
        include_str!("../../../spec/extensions/binding/package.json"),
        &mut resource_ctx,
    )?;
    let stable_binding = embedded_json(
        include_str!("../../../spec/extensions/binding-stable/package.json"),
        &mut resource_ctx,
    )?;
    let tables_schema = field(&tables, "schema")
        .cloned()
        .ok_or_else(resource_error)?;
    let actions_schema = field(&actions, "schema")
        .cloned()
        .ok_or_else(resource_error)?;
    let resources = umf_codegen::CodegenResources::new(
        umf_core::ResourceSet::new(
            embedded_json(
                include_str!("../../../spec/core/schema.json"),
                &mut resource_ctx,
            )?,
            embedded_json(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                &mut resource_ctx,
            )?,
            embedded_json(
                include_str!("../../../spec/core/extension-package.schema.json"),
                &mut resource_ctx,
            )?,
            embedded_json(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                &mut resource_ctx,
            )?,
            embedded_json(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                &mut resource_ctx,
            )?,
        ),
        tables,
        tables_schema,
        actions,
        actions_schema,
        binding,
        stable_binding,
        &mut resource_ctx,
    )?;
    let engine = umf_codegen::CodegenEngine::new(&resources);
    match operation {
        "generate" => engine.generate_python_client(request, ctx),
        "deployment" => engine.compile_table_deployment(request, ctx),
        "verify-deployment" => {
            let bundle =
                field(request, "bundle").ok_or_else(|| request_error("bundle is required"))?;
            engine.verify_table_deployment(bundle, ctx)
        }
        "migration" => engine.compile_table_migration(request, ctx),
        "verify-migration" => {
            let plan = field(request, "plan").ok_or_else(|| request_error("plan is required"))?;
            engine.verify_table_migration(plan, ctx)
        }
        "discover-changes" => {
            if !matches!(request, Value::Object(members) if members.len() == 2)
                || field(request, "previous").is_none()
                || field(request, "next").is_none()
            {
                return Err(umf_core::EngineError::new(
                    "MIGRATION_CHANGES_FAILED",
                    Utf16::default(),
                    "Expected exact previous and next deployment bundle members",
                ));
            }
            let previous =
                field(request, "previous").ok_or_else(|| request_error("previous is required"))?;
            let next = field(request, "next").ok_or_else(|| request_error("next is required"))?;
            let changes = engine.discover_table_migration_changes(previous, next, ctx)?;
            Ok(object(vec![("changes", changes)]))
        }
        "row-scope" => engine.normalize_row_scope(request, ctx),
        _ => unreachable!(),
    }
}

#[cfg(feature = "codegen")]
fn embedded_json(source: &str, ctx: &mut Context<'_>) -> Result<Value, umf_core::EngineError> {
    umf_core::serialization::read_json_value(
        &source.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        ctx,
    )
}
#[cfg(feature = "codegen")]
fn resource_error() -> umf_core::EngineError {
    umf_core::EngineError::new(
        "CODEGEN_RESOURCE_INVALID",
        Utf16::default(),
        "Embedded codegen resource is invalid",
    )
}
#[cfg(feature = "codegen")]
fn request_error(message: &str) -> umf_core::EngineError {
    umf_core::EngineError::new("REQUEST", Utf16::default(), message)
}
#[cfg(feature = "codegen")]
fn engine_error(error: umf_core::EngineError) -> String {
    let mut ctx = Context::ordinary();
    let fields = vec![
        ("code", Value::string_utf8(error.code)),
        ("message", Value::String(error.message)),
        ("path", Value::String(error.path)),
    ];
    let error_value = object(fields);
    let envelope = object(vec![("ok", Value::Bool(false)), ("error", error_value)]);
    umf_core::serialization::stringify_compact_metered(&envelope, &mut ctx)
        .and_then(|text| {
            text.to_utf8().map_err(|_| {
                umf_core::EngineError::new(
                    "OUTPUT_ENCODING",
                    Utf16::default(),
                    "Output cannot be represented as UTF-8",
                )
            })
        })
        .unwrap_or_else(|_| "{\"ok\":false,\"error\":{\"code\":\"OUTPUT_ERROR\"}}".into())
}
#[cfg(feature = "codegen")]
fn cli_error(message: &str) -> String {
    let mut ctx = Context::ordinary();
    let envelope = object(vec![
        ("ok", Value::Bool(false)),
        (
            "error",
            object(vec![
                ("code", Value::string_utf8("CLI")),
                ("message", Value::string_utf8(message)),
            ]),
        ),
    ]);
    umf_core::serialization::stringify_compact_metered(&envelope, &mut ctx)
        .and_then(|text| {
            text.to_utf8().map_err(|_| {
                umf_core::EngineError::new(
                    "OUTPUT_ENCODING",
                    Utf16::default(),
                    "Output cannot be represented as UTF-8",
                )
            })
        })
        .unwrap_or_else(|_| "{\"ok\":false,\"error\":{\"code\":\"CLI\"}}".into())
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
    if args.first().map(String::as_str) == Some("domain-pack") {
        let output = domain_pack_schema_output(&args[1..])?;
        print!("{output}");
        return Ok(());
    }
    if args.first().map(String::as_str) == Some("cardinality") {
        return cardinality_run(&args[1..]);
    }
    if args.first().map(String::as_str) == Some("csv-boolean-lexical") {
        return csv_boolean_lexical_run(&args[1..]);
    }
    if args.first().map(String::as_str) == Some("facets") {
        return facets_run(&args[1..]);
    }
    if args.first().map(String::as_str) == Some("reference") {
        return reference_run(&args[1..]);
    }
    #[cfg(feature = "embedded-adapters")]
    if args.first().map(String::as_str) == Some("iceberg") {
        return iceberg_run(&args[1..]);
    }
    #[cfg(feature = "embedded-adapters")]
    if args.first().map(String::as_str) == Some("arrow") {
        return arrow_run(&args[1..]);
    }
    if args.first().map(String::as_str) == Some("parquet-capture") {
        return parquet_capture_run(&args[1..]);
    }
    #[cfg(feature = "embedded-adapters")]
    if args.first().map(String::as_str) == Some("protobuf") {
        return protobuf_run(&args[1..]);
    }
    if args.first().map(String::as_str) == Some("avro") {
        return avro_run(&args[1..]);
    }
    if args.first().map(String::as_str) == Some("access")
        && args.get(1).map(String::as_str) == Some("rrf")
    {
        return access_rrf_run(&args[2..]);
    }
    #[cfg(feature = "embedded-adapters")]
    if args.first().map(String::as_str) == Some("json-schema") {
        return json_schema_run(&args[1..]);
    }
    if args.first().map(String::as_str) != Some("metamodel") {
        return Err(
            "usage: umf <metamodel|domain-pack|reference|cardinality|facets|csv-boolean-lexical|iceberg|arrow|protobuf|avro|json-schema> ...".into(),
        );
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

fn domain_pack_schema_output(args: &[String]) -> Result<String, String> {
    let usage = "usage: umf domain-pack schema --kind <domain-pack|dataset-source> --version 1.0.0 [--pretty]";
    if args.first().map(String::as_str) != Some("schema") {
        return Err(usage.into());
    }

    let mut kind: Option<&str> = None;
    let mut version: Option<&str> = None;
    let mut pretty = false;
    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--kind" if kind.is_none() => {
                kind = Some(
                    args.get(index + 1)
                        .filter(|value| !value.starts_with("--"))
                        .ok_or("--kind requires a value")?
                        .as_str(),
                );
                index += 1;
            }
            "--version" if version.is_none() => {
                version = Some(
                    args.get(index + 1)
                        .filter(|value| !value.starts_with("--"))
                        .ok_or("--version requires a value")?
                        .as_str(),
                );
                index += 1;
            }
            "--pretty" if !pretty => pretty = true,
            _ => return Err(usage.into()),
        }
        index += 1;
    }

    let kind = kind.ok_or(usage)?;
    let version = version.ok_or(usage)?;
    if version != "1.0.0" {
        return Err(format!("unsupported domain-pack schema version: {version}"));
    }
    let schema = match kind {
        "domain-pack" => umf_core::domain_pack_schema::generate_domain_pack_schema(),
        "dataset-source" => umf_core::domain_pack_schema::generate_dataset_source_schema(),
        _ => return Err(format!("unsupported domain-pack schema kind: {kind}")),
    };

    if pretty {
        umf_core::serialization::write_json_value(&schema, Format::Json, &mut Context::ordinary())
            .and_then(|text| text.to_utf8().map_err(|_| output_encoding_error()))
            .map_err(|error| error.to_string())
    } else {
        umf_core::serialization::stringify_compact(&schema)
            .and_then(|text| text.to_utf8().map_err(|_| output_encoding_error()))
            .map(|text| format!("{text}\n"))
            .map_err(|error| error.to_string())
    }
}

fn access_rrf_run(args: &[String]) -> Result<(), String> {
    let profile = umf_core_wire::access_rrf_binding::PROFILE;
    if args == ["--version"] {
        println!(
            "{{\"profile\":\"{profile}\",\"version\":\"{}\"}}",
            env!("CARGO_PKG_VERSION")
        );
        return Ok(());
    }
    if args == ["--capabilities"] {
        println!("{{\"profile\":\"{profile}\",\"operations\":[\"access.rrf.score\"],\"resourceProfile\":\"cooperative\"}}");
        return Ok(());
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                i += 1;
                max_work = Some(
                    args.get(i)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                i += 1;
                timeout_ms = Some(
                    args.get(i)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err("usage: umf access rrf <--version|--capabilities|--stdin-wire [--max-work N] [--timeout-ms N]>".into()),
        }
        i += 1;
    }
    if !stdin_wire {
        return Err("--stdin-wire is required".into());
    }
    let wire = String::from_utf8(read_limited(io::stdin(), MAX_ACCESS_RRF_REQUEST_BYTES)?)
        .map_err(|_| "wire input is not valid UTF-8".to_owned())?;
    let start = std::time::Instant::now();
    let mut left = max_work.unwrap_or(u64::MAX);
    let mut control = |n: usize| {
        let n = n as u64;
        if n > left {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Maximum work exceeded",
            ));
        }
        left -= n;
        if timeout_ms.is_some_and(|ms| start.elapsed() >= std::time::Duration::from_millis(ms)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE_EXCEEDED",
                Utf16::default(),
                "Deadline exceeded",
            ));
        }
        Ok(())
    };
    println!(
        "{}",
        umf_core_wire::access_rrf_binding::execute_wire_with_control(&wire, &mut control)
    );
    Ok(())
}

fn cardinality_run(args: &[String]) -> Result<(), String> {
    const PROFILE: &str = umf_core_wire::CORE_CARDINALITY_BINDING_PROFILE;
    if args == ["--version"] {
        println!(
            "{{\"profile\":\"{PROFILE}\",\"version\":\"{}\"}}",
            env!("CARGO_PKG_VERSION"),
        );
        return Ok(());
    }
    if args == ["--capabilities"] {
        println!(
            "{{\"profile\":\"{PROFILE}\",\"operations\":[\"model/inspectCoreCardinality\",\"model/declareCoreCardinality\",\"model/verifyCoreCardinalityDeclaration\"],\"resourceProfile\":\"cooperative\"}}"
        );
        return Ok(());
    }
    let invalid = || {
        "usage: umf cardinality <--version|--capabilities|--stdin-wire [--max-work N] [--timeout-ms N]>".to_owned()
    };
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or_else(invalid)?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer".to_owned())?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or_else(invalid)?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer".to_owned())?,
                );
            }
            _ => return Err(invalid()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err(invalid());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(io::stdin(), MAX_CARDINALITY_REQUEST_BYTES)?)
        .map_err(|_| "Core Cardinality wire request is not valid UTF-8".to_owned())?;
    // The deadline includes bounded stdin intake; max_work meters the native
    // core-wire operation after intake, not transport bytes or UTF-8 decoding.
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Core Cardinality work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Core Cardinality deadline elapsed",
            ));
        }
        Ok(())
    };
    let mut capabilities = BaselineCapabilities { enabled: false };
    println!(
        "{}",
        umf_core_wire::execute_cardinality_request_with_control(
            &wire,
            umf_core::ResourceProfile::Cooperative,
            &mut capabilities,
            &mut control,
        )
    );
    Ok(())
}

fn csv_boolean_lexical_run(args: &[String]) -> Result<(), String> {
    const PROFILE: &str = umf_core_wire::CSV_BOOLEAN_LEXICAL_BINDING_PROFILE;
    if args == ["--version"] {
        println!(
            "{{\"profile\":\"{PROFILE}\",\"version\":\"{}\"}}",
            env!("CARGO_PKG_VERSION"),
        );
        return Ok(());
    }
    if args == ["--capabilities"] {
        println!(
            "{{\"profile\":\"{PROFILE}\",\"operations\":[\"model/validateCsvBooleanLexical\",\"model/verifyCsvBooleanLexical\"],\"resourceProfile\":\"cooperative\"}}"
        );
        return Ok(());
    }
    let invalid = || {
        "usage: umf csv-boolean-lexical <--version|--capabilities|--stdin-wire [--max-work N] [--timeout-ms N]>".to_owned()
    };
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or_else(invalid)?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer".to_owned())?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or_else(invalid)?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer".to_owned())?,
                );
            }
            _ => return Err(invalid()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err(invalid());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(
        io::stdin(),
        MAX_CSV_BOOLEAN_LEXICAL_REQUEST_BYTES,
    )?)
    .map_err(|_| "CSV Boolean lexical wire request is not valid UTF-8".to_owned())?;
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "CSV Boolean lexical work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "CSV Boolean lexical deadline elapsed",
            ));
        }
        Ok(())
    };
    let mut capabilities = BaselineCapabilities { enabled: false };
    println!(
        "{}",
        umf_core_wire::execute_csv_boolean_lexical_request_with_control(
            &wire,
            umf_core::ResourceProfile::Cooperative,
            &mut capabilities,
            &mut control,
        )
    );
    Ok(())
}

fn facets_run(args: &[String]) -> Result<(), String> {
    const PROFILE: &str = umf_core_wire::CORE_FACETS_BINDING_PROFILE;
    if args == ["--version"] {
        println!(
            "{{\"profile\":\"{PROFILE}\",\"version\":\"{}\"}}",
            env!("CARGO_PKG_VERSION"),
        );
        return Ok(());
    }
    if args == ["--capabilities"] {
        println!(
            "{{\"profile\":\"{PROFILE}\",\"operations\":[\"model/inspectCoreFacets\",\"model/declareCoreFacets\",\"model/verifyCoreFacetDeclaration\",\"model/historicalCoreFacetPatch\"],\"resourceProfile\":\"cooperative\"}}"
        );
        return Ok(());
    }
    let invalid = || {
        "usage: umf facets <--version|--capabilities|--stdin-wire [--max-work N] [--timeout-ms N]>"
            .to_owned()
    };
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or_else(invalid)?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer".to_owned())?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or_else(invalid)?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer".to_owned())?,
                );
            }
            _ => return Err(invalid()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err(invalid());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(io::stdin(), MAX_FACETS_REQUEST_BYTES)?)
        .map_err(|_| "Core Facets wire request is not valid UTF-8".to_owned())?;
    // The deadline includes bounded stdin intake; max_work meters Rust
    // core-wire work after transport intake, not the bytes read from stdin.
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Core Facets work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Core Facets deadline elapsed",
            ));
        }
        Ok(())
    };
    let mut capabilities = BaselineCapabilities { enabled: false };
    println!(
        "{}",
        umf_core_wire::execute_core_facets_request_with_control(
            &wire,
            umf_core::ResourceProfile::Cooperative,
            &mut capabilities,
            &mut control,
        )
    );
    Ok(())
}

#[cfg(feature = "embedded-adapters")]
fn iceberg_run(args: &[String]) -> Result<(), String> {
    if args == ["schema", "--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            umf_core_wire::ICEBERG_SCHEMA_PROFILE,
            env!("CARGO_PKG_VERSION"),
        );
        return Ok(());
    }
    if args == ["schema", "--capabilities"] {
        println!(
            "{{\"profile\":\"{}\",\"operations\":[\"iceberg.schema.import\",\"iceberg.schema.export\",\"iceberg.schema.inspect\",\"iceberg.schema.getNode\",\"iceberg.schema.proposeNodeEdit\"],\"resourceProfile\":\"cooperative\"}}",
            umf_core_wire::ICEBERG_SCHEMA_PROFILE,
        );
        return Ok(());
    }
    if args.first().map(String::as_str) != Some("schema") {
        return Err("usage: umf iceberg schema <--version|--capabilities|--stdin-wire [--max-work N] [--timeout-ms N]>".into());
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err("invalid Iceberg schema option".into()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err("--stdin-wire is required".into());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(io::stdin(), MAX_ICEBERG_REQUEST_BYTES)?)
        .map_err(|_| "Iceberg wire request is not valid UTF-8".to_owned())?;
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Iceberg work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Iceberg deadline elapsed",
            ));
        }
        Ok(())
    };
    println!(
        "{}",
        umf_core_wire::execute_iceberg_wire_with_control(&wire, &mut control)
    );
    Ok(())
}

#[cfg(feature = "embedded-adapters")]
fn arrow_run(args: &[String]) -> Result<(), String> {
    if args.first().map(String::as_str) == Some("ipc") {
        return arrow_ipc_run(&args[1..]);
    }
    if args == ["schema", "--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            umf_core_wire::ARROW_SCHEMA_PROFILE,
            env!("CARGO_PKG_VERSION"),
        );
        return Ok(());
    }
    if args == ["schema", "--capabilities"] {
        println!(
            "{{\"profile\":\"{}\",\"operations\":[\"arrow.schema.import\",\"arrow.schema.inspect\",\"arrow.schema.export\",\"arrow.schema.getNode\",\"arrow.schema.proposeNodeEdit\"],\"resourceProfile\":\"cooperative\"}}",
            umf_core_wire::ARROW_SCHEMA_PROFILE,
        );
        return Ok(());
    }
    if args.first().map(String::as_str) != Some("schema") {
        return Err("usage: umf arrow schema <--version|--capabilities|--stdin-wire [--max-work N] [--timeout-ms N]>".into());
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err("invalid Arrow schema option".into()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err("--stdin-wire is required".into());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(io::stdin(), MAX_ARROW_SCHEMA_REQUEST_BYTES)?)
        .map_err(|_| "Arrow schema wire request is not valid UTF-8".to_owned())?;
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Arrow schema work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Arrow schema deadline elapsed",
            ));
        }
        Ok(())
    };
    println!(
        "{}",
        umf_core_wire::execute_arrow_schema_wire_with_control(&wire, &mut control)
    );
    Ok(())
}

#[cfg(feature = "embedded-adapters")]
fn arrow_ipc_run(args: &[String]) -> Result<(), String> {
    if args == ["--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            umf_core_wire::ARROW_IPC_PROFILE,
            env!("CARGO_PKG_VERSION"),
        );
        return Ok(());
    }
    if args == ["--capabilities"] {
        println!(
            "{{\"profile\":\"{}\",\"operations\":[\"arrow.ipc.capture\",\"arrow.ipc.export\",\"arrow.ipc.inspect\"],\"resourceProfile\":\"cooperative\",\"maxSourceBytes\":1000000}}",
            umf_core_wire::ARROW_IPC_PROFILE,
        );
        return Ok(());
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err("invalid Arrow IPC option".into()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err("usage: umf arrow ipc <--version|--capabilities|--stdin-wire [--max-work N] [--timeout-ms N]>".into());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(io::stdin(), MAX_ARROW_IPC_REQUEST_BYTES)?)
        .map_err(|_| "Arrow IPC wire request is not valid UTF-8".to_owned())?;
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Arrow IPC work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Arrow IPC deadline elapsed",
            ));
        }
        Ok(())
    };
    println!(
        "{}",
        umf_core_wire::execute_arrow_ipc_wire_with_control(&wire, &mut control)
    );
    Ok(())
}

fn parquet_capture_run(args: &[String]) -> Result<(), String> {
    if args == ["--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            umf_core_wire::PARQUET_CAPTURE_PROFILE,
            env!("CARGO_PKG_VERSION"),
        );
        return Ok(());
    }
    if args == ["--capabilities"] {
        println!(
            "{{\"profile\":\"{}\",\"operations\":[\"parquet.capture\",\"parquet.importSchema\",\"parquet.export\",\"parquet.inspectFraming\",\"parquet.decodeFooter\",\"parquet.inspectMetadata\",\"parquet.inspectSchema\",\"parquet.inspectLogicalTypes\",\"parquet.inspectContainers\",\"parquet.getFieldMetadata\"],\"resourceProfile\":\"cooperative\",\"maxSourceBytes\":1000000}}",
            umf_core_wire::PARQUET_CAPTURE_PROFILE,
        );
        return Ok(());
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err("invalid Parquet capture option".into()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err("usage: umf parquet-capture <--version|--capabilities|--stdin-wire [--max-work N] [--timeout-ms N]>".into());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(io::stdin(), MAX_PARQUET_CAPTURE_REQUEST_BYTES)?)
        .map_err(|_| "Parquet capture wire request is not valid UTF-8".to_owned())?;
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Parquet capture work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Parquet capture deadline elapsed",
            ));
        }
        Ok(())
    };
    println!(
        "{}",
        umf_core_wire::execute_parquet_capture_wire_with_control(&wire, &mut control)
    );
    Ok(())
}

#[cfg(feature = "embedded-adapters")]
fn protobuf_run(args: &[String]) -> Result<(), String> {
    if args.first().map(String::as_str) == Some("descriptor") {
        return protobuf_descriptor_run(&args[1..]);
    }
    if args == ["inspect", "--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            umf_core_wire::PROTOBUF_INSPECT_PROFILE,
            env!("CARGO_PKG_VERSION"),
        );
        return Ok(());
    }
    if args == ["inspect", "--capabilities"] {
        println!(
            "{{\"profile\":\"{}\",\"operations\":[\"protobuf.descriptor.inspect\"],\"resourceProfile\":\"cooperative\"}}",
            umf_core_wire::PROTOBUF_INSPECT_PROFILE,
        );
        return Ok(());
    }
    if args.first().map(String::as_str) != Some("inspect") {
        return Err("usage: umf protobuf inspect <--version|--capabilities|--stdin-wire [--max-work N] [--timeout-ms N]>".into());
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err("invalid Protobuf inspect option".into()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err("--stdin-wire is required".into());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(
        io::stdin(),
        MAX_PROTOBUF_INSPECT_REQUEST_BYTES,
    )?)
    .map_err(|_| "Protobuf inspect wire request is not valid UTF-8".to_owned())?;
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Protobuf inspect work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Protobuf inspect deadline elapsed",
            ));
        }
        Ok(())
    };
    println!(
        "{}",
        umf_core_wire::execute_protobuf_inspect_wire_with_control(&wire, &mut control)
    );
    Ok(())
}

#[cfg(feature = "embedded-adapters")]
fn protobuf_descriptor_run(args: &[String]) -> Result<(), String> {
    if args.first().map(String::as_str) == Some("write") {
        return protobuf_descriptor_write_run(&args[1..]);
    }
    if args.first().map(String::as_str) == Some("export") {
        return protobuf_document_export_run(&args[1..]);
    }
    if args == ["read", "--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            PROTOBUF_DESCRIPTOR_READ_CLI_PROFILE,
            env!("CARGO_PKG_VERSION"),
        );
        return Ok(());
    }
    if args == ["read", "--capabilities"] {
        println!(
            "{{\"profile\":\"{}\",\"operations\":[\"protobuf.descriptor.read\"],\"input\":\"raw FileDescriptorSet bytes\",\"maxInputBytes\":{},\"output\":\"umf.core-wire/1 tagged descriptor tree\",\"resourceProfile\":\"cooperative\"}}",
            PROTOBUF_DESCRIPTOR_READ_CLI_PROFILE,
            MAX_PROTOBUF_DESCRIPTOR_INPUT_BYTES,
        );
        return Ok(());
    }
    if args.first().map(String::as_str) != Some("read") {
        return Err(
            "usage: umf protobuf descriptor read --input PATH [--max-work N] [--timeout-ms N]"
                .into(),
        );
    }
    let mut input_path = None;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--input" if input_path.is_none() => {
                index += 1;
                input_path = Some(args.get(index).ok_or("--input requires a path")?.clone());
            }
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err("invalid Protobuf descriptor read option".into()),
        }
        index += 1;
    }
    let input_path = input_path.ok_or("--input is required")?;
    let started = std::time::Instant::now();
    let mut file = fs::File::open(&input_path).map_err(|error| error.to_string())?;
    // Check metadata before reserving or reading caller bytes, then cap the
    // read itself as protection against a concurrent file growth.
    if file.metadata().map_err(|error| error.to_string())?.len()
        > MAX_PROTOBUF_DESCRIPTOR_INPUT_BYTES as u64
    {
        println!(
            "{}",
            umf_core_wire::result_envelope(Err(umf_core::EngineError::new(
                "LIMIT",
                Utf16::default(),
                "Descriptor input exceeds limit",
            )))
        );
        return Ok(());
    }
    let mut bytes = Vec::new();
    file.by_ref()
        .take((MAX_PROTOBUF_DESCRIPTOR_INPUT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > MAX_PROTOBUF_DESCRIPTOR_INPUT_BYTES {
        println!(
            "{}",
            umf_core_wire::result_envelope(Err(umf_core::EngineError::new(
                "LIMIT",
                Utf16::default(),
                "Descriptor input exceeds limit",
            )))
        );
        return Ok(());
    }

    let request = object(vec![("op", Value::string_utf8("protobuf.descriptor.read"))]);
    let request_wire = umf_core_wire::encode(&request, &mut Context::ordinary())
        .map_err(|error| engine_error(error))?;
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Protobuf descriptor read work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Protobuf descriptor read deadline elapsed",
            ));
        }
        Ok(())
    };
    let response = umf_core_wire::protobuf_document::execute(&request_wire, &bytes, &mut control);
    println!("{}", response.wire_envelope);
    Ok(())
}

#[cfg(feature = "embedded-adapters")]
fn protobuf_document_export_run(args: &[String]) -> Result<(), String> {
    if args == ["--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            PROTOBUF_DOCUMENT_EXPORT_CLI_PROFILE,
            env!("CARGO_PKG_VERSION"),
        );
        return Ok(());
    }
    if args == ["--capabilities"] {
        println!(
            "{{\"profile\":\"{}\",\"operations\":[\"protobuf.document.export\"],\"input\":\"umf.core-wire/1 document request on stdin\",\"output\":\"raw FileDescriptorSet bytes on stdout\",\"maxOutputBytes\":{},\"resourceProfile\":\"cooperative\"}}",
            PROTOBUF_DOCUMENT_EXPORT_CLI_PROFILE, MAX_PROTOBUF_DESCRIPTOR_INPUT_BYTES,
        );
        return Ok(());
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(args.get(index).ok_or("--max-work requires a value")?
                    .parse::<u64>().map_err(|_| "--max-work requires a nonnegative integer")?);
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(args.get(index).ok_or("--timeout-ms requires a value")?
                    .parse::<u64>().map_err(|_| "--timeout-ms requires a nonnegative integer")?);
            }
            _ => return Err("usage: umf protobuf descriptor export --stdin-wire [--max-work N] [--timeout-ms N]".into()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err("--stdin-wire is required".into());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(
        io::stdin(),
        MAX_PROTOBUF_INSPECT_REQUEST_BYTES,
    )?)
    .map_err(|_| "Protobuf document export wire request is not valid UTF-8".to_owned())?;
    let mut admission_context = Context::ordinary();
    let request = match admission_context
        .with_tagged_transport_limit(|transport| umf_core_wire::decode(&wire, transport))
    {
        Ok(request) => request,
        Err(error) => {
            println!("{}", umf_core_wire::result_envelope(Err(error)));
            return Ok(());
        }
    };
    let operation = field(&request, "op").and_then(|value| match value {
        Value::String(operation) => operation.to_utf8().ok(),
        _ => None,
    });
    if operation.as_deref() != Some("protobuf.document.export") {
        println!(
            "{}",
            umf_core_wire::result_envelope(Err(umf_core::EngineError::new(
                "REQUEST",
                Utf16::from("/op"),
                "Protobuf document export operation is required",
            )))
        );
        return Ok(());
    }
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Protobuf document export work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Protobuf document export deadline elapsed",
            ));
        }
        Ok(())
    };
    let response = umf_core_wire::protobuf_document::execute(&wire, &[], &mut control);
    let envelope = umf_core::serialization::read_json_value(
        &response.wire_envelope.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .map_err(|error| error.to_string())?;
    let status = field(&envelope, "status").and_then(|value| match value {
        Value::String(status) => status.to_utf8().ok(),
        _ => None,
    });
    match status.as_deref() {
        Some("error") => println!("{}", response.wire_envelope),
        Some("ok") if response.binary.len() <= MAX_PROTOBUF_DESCRIPTOR_INPUT_BYTES => {
            use std::io::Write;
            io::stdout()
                .write_all(&response.binary)
                .map_err(|error| error.to_string())?;
        }
        Some("ok") => println!(
            "{}",
            umf_core_wire::result_envelope(Err(umf_core::EngineError::new(
                "LIMIT",
                Utf16::default(),
                "Descriptor output exceeds limit",
            )))
        ),
        _ => println!(
            "{}",
            umf_core_wire::result_envelope(Err(umf_core::EngineError::new(
                "OUTPUT_PROTOCOL",
                Utf16::default(),
                "Protobuf document exporter returned an invalid response envelope",
            )))
        ),
    }
    Ok(())
}

#[cfg(feature = "embedded-adapters")]
fn protobuf_descriptor_write_run(args: &[String]) -> Result<(), String> {
    if args == ["--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            PROTOBUF_DESCRIPTOR_WRITE_CLI_PROFILE,
            env!("CARGO_PKG_VERSION"),
        );
        return Ok(());
    }
    if args == ["--capabilities"] {
        println!(
            "{{\"profile\":\"{}\",\"operations\":[\"protobuf.descriptor.write\"],\"input\":\"umf.core-wire/1 descriptor tree request\",\"output\":\"raw FileDescriptorSet bytes on stdout\",\"maxOutputBytes\":{},\"resourceProfile\":\"cooperative\"}}",
            PROTOBUF_DESCRIPTOR_WRITE_CLI_PROFILE,
            MAX_PROTOBUF_DESCRIPTOR_INPUT_BYTES,
        );
        return Ok(());
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err(
                "usage: umf protobuf descriptor write --stdin-wire [--max-work N] [--timeout-ms N]"
                    .into(),
            ),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err("--stdin-wire is required".into());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(
        io::stdin(),
        MAX_PROTOBUF_INSPECT_REQUEST_BYTES,
    )?)
    .map_err(|_| "Protobuf descriptor write wire request is not valid UTF-8".to_owned())?;
    let mut admission_context = Context::ordinary();
    let request = match admission_context
        .with_tagged_transport_limit(|transport| umf_core_wire::decode(&wire, transport))
    {
        Ok(request) => request,
        Err(error) => {
            println!("{}", umf_core_wire::result_envelope(Err(error)));
            return Ok(());
        }
    };
    let operation = field(&request, "op").and_then(|value| match value {
        Value::String(operation) => operation.to_utf8().ok(),
        _ => None,
    });
    if operation.as_deref() != Some("protobuf.descriptor.write") {
        println!(
            "{}",
            umf_core_wire::result_envelope(Err(umf_core::EngineError::new(
                "REQUEST",
                Utf16::from("/op"),
                "Protobuf descriptor write operation is required",
            )))
        );
        return Ok(());
    }
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Protobuf descriptor write work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Protobuf descriptor write deadline elapsed",
            ));
        }
        Ok(())
    };
    let response = umf_core_wire::protobuf_document::execute(&wire, &[], &mut control);
    let envelope = umf_core::serialization::read_json_value(
        &response.wire_envelope.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::ordinary(),
    )
    .map_err(|error| error.to_string())?;
    let status = field(&envelope, "status").and_then(|value| match value {
        Value::String(status) => status.to_utf8().ok(),
        _ => None,
    });
    match status.as_deref() {
        Some("error") => println!("{}", response.wire_envelope),
        Some("ok") if response.binary.len() <= MAX_PROTOBUF_DESCRIPTOR_INPUT_BYTES => {
            use std::io::Write;
            io::stdout()
                .write_all(&response.binary)
                .map_err(|error| error.to_string())?;
        }
        Some("ok") => println!(
            "{}",
            umf_core_wire::result_envelope(Err(umf_core::EngineError::new(
                "LIMIT",
                Utf16::default(),
                "Descriptor output exceeds limit"
            )))
        ),
        _ => println!(
            "{}",
            umf_core_wire::result_envelope(Err(umf_core::EngineError::new(
                "OUTPUT_PROTOCOL",
                Utf16::default(),
                "Protobuf descriptor writer returned an invalid response envelope"
            )))
        ),
    }
    Ok(())
}

fn avro_run(args: &[String]) -> Result<(), String> {
    if args.first().map(String::as_str) == Some("document-inspect") {
        #[cfg(feature = "embedded-adapters")]
        {
            return avro_document_inspect_run(&args[1..]);
        }
        #[cfg(not(feature = "embedded-adapters"))]
        {
            return Err("Avro document-inspect requires the embedded-adapters CLI feature".into());
        }
    }
    if args.first().map(String::as_str) == Some("candidate-edit") {
        #[cfg(feature = "embedded-adapters")]
        {
            return avro_candidate_run(&args[1..]);
        }
        #[cfg(not(feature = "embedded-adapters"))]
        {
            return Err("Avro candidate-edit requires the embedded-adapters CLI feature".into());
        }
    }
    if args == ["inspect", "--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            umf_core_wire::AVRO_INSPECT_PROFILE,
            env!("CARGO_PKG_VERSION")
        );
        return Ok(());
    }
    if args == ["inspect", "--capabilities"] {
        println!("{{\"profile\":\"{}\",\"operations\":[\"avro.schema.inspect\"],\"semanticCompleteness\":false,\"resourceProfile\":\"cooperative\"}}", umf_core_wire::AVRO_INSPECT_PROFILE);
        return Ok(());
    }
    if args.first().map(String::as_str) != Some("inspect") {
        return Err("usage: umf avro <inspect|document-inspect|candidate-edit> ...".into());
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err("invalid Avro inspect option".into()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err("--stdin-wire is required".into());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(
        io::stdin(),
        MAX_PROTOBUF_INSPECT_REQUEST_BYTES,
    )?)
    .map_err(|_| "Avro inspect wire request is not valid UTF-8".to_owned())?;
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Avro inspect work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Avro inspect deadline elapsed",
            ));
        }
        Ok(())
    };
    println!(
        "{}",
        umf_core_wire::execute_avro_inspect_wire_with_control(&wire, &mut control)
    );
    Ok(())
}

#[cfg(feature = "embedded-adapters")]
fn avro_document_inspect_run(args: &[String]) -> Result<(), String> {
    if args == ["--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            umf_core_wire::AVRO_DOCUMENT_INSPECT_PROFILE,
            env!("CARGO_PKG_VERSION")
        );
        return Ok(());
    }
    if args == ["--capabilities"] {
        println!("{{\"profile\":\"{}\",\"operations\":[\"avro.document.inspect\"],\"semanticCompleteness\":false,\"resourceProfile\":\"cooperative\"}}", umf_core_wire::AVRO_DOCUMENT_INSPECT_PROFILE);
        return Ok(());
    }
    if args.iter().any(|arg| arg == "--help") {
        return Err(
            "usage: umf avro document-inspect --stdin-wire [--max-work N] [--timeout-ms N]".into(),
        );
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err("invalid Avro document-inspect option".into()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err("--stdin-wire is required".into());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(
        io::stdin(),
        MAX_AVRO_DOCUMENT_INSPECT_REQUEST_BYTES,
    )?)
    .map_err(|_| "Avro document-inspect wire request is not valid UTF-8".to_owned())?;
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Avro document-inspect work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Avro document-inspect deadline elapsed",
            ));
        }
        Ok(())
    };
    println!(
        "{}",
        umf_core_wire::execute_avro_document_inspect_wire_with_control(&wire, &mut control)
    );
    Ok(())
}

#[cfg(feature = "embedded-adapters")]
fn avro_candidate_run(args: &[String]) -> Result<(), String> {
    if args == ["--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            umf_core_wire::AVRO_CANDIDATE_PROFILE,
            env!("CARGO_PKG_VERSION")
        );
        return Ok(());
    }
    if args == ["--capabilities"] {
        println!(
            "{{\"profile\":\"{}\",\"operations\":[\"avro.schema.proposeNodeEdit\"],\"semanticCompleteness\":false,\"resourceProfile\":\"cooperative\"}}",
            umf_core_wire::AVRO_CANDIDATE_PROFILE
        );
        return Ok(());
    }
    if args.iter().any(|arg| arg == "--help") {
        return Err("usage: umf avro candidate-edit <--version|--capabilities|--stdin-wire [--max-work N] [--timeout-ms N]>".into());
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err("invalid Avro candidate-edit option".into()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err("--stdin-wire is required".into());
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(io::stdin(), MAX_AVRO_CANDIDATE_REQUEST_BYTES)?)
        .map_err(|_| "Avro candidate-edit wire request is not valid UTF-8".to_owned())?;
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "Avro candidate-edit work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "Avro candidate-edit deadline elapsed",
            ));
        }
        Ok(())
    };
    println!(
        "{}",
        umf_core_wire::execute_avro_candidate_wire_with_control(&wire, &mut control)
    );
    Ok(())
}

#[cfg(feature = "embedded-adapters")]
fn json_schema_run(args: &[String]) -> Result<(), String> {
    if args == ["--version"] {
        println!(
            "{{\"profile\":\"{}\",\"version\":\"{}\"}}",
            umf_core_wire::JSON_SCHEMA_PROFILE,
            env!("CARGO_PKG_VERSION")
        );
        return Ok(());
    }
    if args == ["--capabilities"] {
        println!(
            "{{\"profile\":\"{}\",\"operations\":[\"importJsonSchema\",\"inspectJsonSchema\",\"exportJsonSchema\",\"exportJsonSchemaResources\",\"exportJsonSchemaBundle\",\"getJsonSchemaNode\",\"walkJsonSchema\"],\"resourceProfile\":\"cooperative\"}}",
            umf_core_wire::JSON_SCHEMA_PROFILE);
        return Ok(());
    }
    let mut stdin_wire = false;
    let mut max_work = None;
    let mut timeout_ms = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--stdin-wire" if !stdin_wire => stdin_wire = true,
            "--max-work" if max_work.is_none() => {
                index += 1;
                max_work = Some(
                    args.get(index)
                        .ok_or("--max-work requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--max-work requires a nonnegative integer")?,
                );
            }
            "--timeout-ms" if timeout_ms.is_none() => {
                index += 1;
                timeout_ms = Some(
                    args.get(index)
                        .ok_or("--timeout-ms requires a value")?
                        .parse::<u64>()
                        .map_err(|_| "--timeout-ms requires a nonnegative integer")?,
                );
            }
            _ => return Err("invalid JSON Schema option".into()),
        }
        index += 1;
    }
    if !stdin_wire {
        return Err(
            "usage: umf json-schema <--version|--capabilities|--stdin-wire [--max-work N] [--timeout-ms N]>"
                .into(),
        );
    }
    let started = std::time::Instant::now();
    let wire = String::from_utf8(read_limited(io::stdin(), MAX_JSON_SCHEMA_REQUEST_BYTES)?)
        .map_err(|_| "JSON Schema wire request is not valid UTF-8".to_owned())?;
    let mut remaining = max_work.unwrap_or(u64::MAX);
    let mut control = |amount: usize| {
        let amount = amount as u64;
        if amount > remaining {
            return Err(umf_core::EngineError::new(
                "RESOURCE_LIMIT",
                Utf16::default(),
                "JSON Schema work budget exhausted",
            ));
        }
        remaining -= amount;
        if timeout_ms.is_some_and(|limit| started.elapsed().as_millis() >= u128::from(limit)) {
            return Err(umf_core::EngineError::new(
                "DEADLINE",
                Utf16::default(),
                "JSON Schema deadline elapsed",
            ));
        }
        Ok(())
    };
    println!(
        "{}",
        umf_core_wire::execute_json_schema_wire_with_control(&wire, &mut control)
    );
    Ok(())
}

fn reference_run(args: &[String]) -> Result<(), String> {
    if args.len() != 2 || args[0] != "self-model-check" || args[1] != "--stdin-wire" {
        return Err("usage: umf reference self-model-check --stdin-wire".into());
    }
    let mut ctx = Context::ordinary();
    let wire = String::from_utf8(read_reference_request()?)
        .map_err(|_| "wire input is not valid UTF-8".to_owned())?;
    let request = decode_transport(&wire, &mut ctx).map_err(|error| error.to_string())?;
    let source = match field(&request, "source") {
        Some(Value::String(source)) => {
            ctx.charge_work(source.len(), Utf16::default())
                .map_err(|error| error.to_string())?;
            source
                .to_utf8()
                .map_err(|_| "source is not valid UTF-8".to_owned())?
        }
        _ => return Err("self-model-check request requires a UTF-8 source string".into()),
    };
    let manifest =
        field(&request, "manifest").ok_or("self-model-check request requires manifest")?;
    let catalog =
        umf_metamodel::reference::admit_self_model_catalog(source.as_bytes(), manifest, &mut ctx)
            .map_err(|error| error.to_string())?;
    println!(
        "{}",
        encode_transport(&catalog, &mut ctx).map_err(|error| error.to_string())?
    );
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
fn read_reference_request() -> Result<Vec<u8>, String> {
    read_limited(io::stdin(), MAX_REFERENCE_REQUEST_BYTES)
}
fn read_limited(mut reader: impl Read, maximum: usize) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader
        .by_ref()
        .take(maximum.saturating_add(1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > maximum {
        return Err(format!(
            "request exceeds the {maximum}-byte transport limit"
        ));
    }
    Ok(bytes)
}
#[cfg(feature = "codegen")]
fn read_codegen_request(path: &str) -> Result<Vec<u8>, String> {
    if path == "-" {
        let mut bytes = Vec::new();
        io::stdin()
            .take((MAX_REQUEST_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err("request exceeds the 32 MiB transport limit".into());
        }
        return Ok(bytes);
    }
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_REQUEST_BYTES as u64 {
        return Err("request exceeds the 32 MiB transport limit".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|error| error.to_string())?
        .take((MAX_REQUEST_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > MAX_REQUEST_BYTES {
        return Err("request exceeds the 32 MiB transport limit".into());
    }
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
    use super::domain_pack_schema_output;

    const DOMAIN_PACK_SCHEMA: &str =
        include_str!("../../../spec/extensions/domain-pack/schema.json");
    const DATASET_SOURCE_SCHEMA: &str =
        include_str!("../../../spec/extensions/dataset-source/schema.json");

    fn domain_schema(args: &[&str]) -> Result<String, String> {
        domain_pack_schema_output(&args.iter().map(|arg| (*arg).to_owned()).collect::<Vec<_>>())
    }

    fn compact_json(source: &str) -> String {
        let mut output = String::with_capacity(source.len());
        let mut in_string = false;
        let mut escaped = false;
        for ch in source.chars() {
            if in_string {
                output.push(ch);
                if escaped {
                    escaped = false;
                } else if ch == '\\' {
                    escaped = true;
                } else if ch == '"' {
                    in_string = false;
                }
            } else if ch == '"' {
                output.push(ch);
                in_string = true;
            } else if !ch.is_whitespace() {
                output.push(ch);
            }
        }
        output
    }

    #[test]
    fn domain_pack_cli_emits_canonical_pretty_schema_json_for_both_kinds() {
        assert_eq!(
            domain_schema(&[
                "schema",
                "--kind",
                "domain-pack",
                "--version",
                "1.0.0",
                "--pretty"
            ])
            .unwrap(),
            DOMAIN_PACK_SCHEMA
        );
        assert_eq!(
            domain_schema(&[
                "schema",
                "--kind",
                "dataset-source",
                "--version",
                "1.0.0",
                "--pretty"
            ])
            .unwrap(),
            DATASET_SOURCE_SCHEMA
        );
    }

    #[test]
    fn domain_pack_cli_emits_canonical_compact_schema_json_with_final_newline() {
        assert_eq!(
            domain_schema(&["schema", "--kind", "domain-pack", "--version", "1.0.0"]).unwrap(),
            format!("{}\n", compact_json(DOMAIN_PACK_SCHEMA))
        );
        assert_eq!(
            domain_schema(&["schema", "--version", "1.0.0", "--kind", "dataset-source"]).unwrap(),
            format!("{}\n", compact_json(DATASET_SOURCE_SCHEMA))
        );
    }

    #[test]
    fn domain_pack_cli_refuses_unknown_versions_kinds_and_arguments() {
        for args in [
            vec!["schema"],
            vec!["schema", "--kind", "domain-pack"],
            vec!["schema", "--version", "1.0.0"],
            vec!["schema", "--kind", "domain-pack", "--version", "2.0.0"],
            vec!["schema", "--kind", "unknown", "--version", "1.0.0"],
            vec![
                "schema",
                "--kind",
                "domain-pack",
                "--version",
                "1.0.0",
                "--version",
                "1.0.0",
            ],
            vec![
                "schema",
                "--kind",
                "domain-pack",
                "--version",
                "1.0.0",
                "--pretty",
                "--pretty",
            ],
            vec![
                "schema",
                "--kind",
                "domain-pack",
                "--version",
                "1.0.0",
                "--format",
                "json",
            ],
            vec!["schema", "--kind", "--version", "1.0.0"],
            vec!["schema", "--version", "--kind", "domain-pack"],
            vec!["wrong", "--kind", "domain-pack", "--version", "1.0.0"],
        ] {
            assert!(domain_schema(&args).is_err(), "accepted {args:?}");
        }
    }

    use super::*;
    use std::io::Cursor;
    use umf_core::Capabilities;

    #[test]
    fn reference_request_reader_caps_bytes_before_wire_decode() {
        assert!(read_limited(Cursor::new(b"12345"), 4)
            .unwrap_err()
            .contains("4-byte"));
        assert_eq!(read_limited(Cursor::new(b"1234"), 4).unwrap(), b"1234");
    }

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

    #[test]
    #[cfg(feature = "codegen")]
    fn codegen_cli_requires_one_request_and_accepts_only_closed_formats() {
        let parse = |args: &[&str]| {
            parse_codegen_args(&args.iter().map(|s| (*s).into()).collect::<Vec<_>>())
        };
        assert_eq!(
            parse(&["generate", "--request", "-"]).unwrap().input_format,
            "json"
        );
        assert_eq!(
            parse(&[
                "deployment",
                "--request",
                "x",
                "--input-format",
                "wire",
                "--output-format",
                "wire"
            ])
            .unwrap()
            .output_format,
            "wire"
        );
        for args in [
            vec!["generate"],
            vec!["generate", "--request", "-", "--request", "x"],
            vec!["generate", "--request", "-", "--input-format", "yaml"],
            vec!["unknown", "--request", "-"],
            vec!["generate", "-"],
        ] {
            assert!(parse(&args).is_err(), "accepted {args:?}");
        }
    }

    #[test]
    #[cfg(feature = "codegen")]
    fn codegen_cli_reports_the_nine_source_resource_manifest() {
        assert_eq!(RESOURCE_FILES.len(), 9);
        let digest = resource_manifest_sha256();
        assert_eq!(digest.len(), 64);
        assert!(digest.bytes().all(|byte| byte.is_ascii_hexdigit()));
    }
}
