#![cfg(feature = "codegen")]
// SPDX-License-Identifier: MIT OR Apache-2.0
use std::io::Write;
use std::process::{Command, Stdio};
use sha2::{Digest, Sha256};
use umf_core::serialization::{read_json_value, stringify_compact_metered, Format};
use umf_core::{Context, Utf16, Value};

fn run(args: &[&str], input: &[u8]) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(args)
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(input).unwrap();
    child.wait_with_output().unwrap()
}

fn parse_json(text: &str) -> Value {
    read_json_value(
        &text.encode_utf16().collect::<Vec<_>>(),
        Format::Json,
        &mut Context::catalog(),
    )
    .unwrap()
}

fn member<'a>(value: &'a Value, name: &str) -> &'a Value {
    let Value::Object(items) = value else {
        panic!("object expected")
    };
    items
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
        .unwrap_or_else(|| panic!("missing member {name}"))
}

fn compact_json(value: &Value) -> String {
    stringify_compact_metered(value, &mut Context::catalog())
        .unwrap()
        .to_utf8()
        .unwrap()
}

fn run_json_operation(operation: &str, request: &Value) -> Value {
    let input = compact_json(request);
    let output = run(&["codegen", operation, "--request", "-"], input.as_bytes());
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stdout)
    );
    let text = String::from_utf8(output.stdout).unwrap();
    let envelope = parse_json(text.trim());
    assert_eq!(member(&envelope, "ok"), &Value::Bool(true));
    member(&envelope, "result").clone()
}

fn large_scope_request() -> Value {
    let payload = "x".repeat(2_100_000);
    Value::Object(vec![
        (
            Utf16::from("input"),
            Value::Object(vec![
                (Utf16::from("left"), Value::string_utf8(&payload)),
                (Utf16::from("right"), Value::string_utf8(&payload)),
            ]),
        ),
        (Utf16::from("context"), Value::Object(vec![])),
    ])
}

#[test]
fn malformed_codegen_input_returns_closed_error_envelope_and_exit_two() {
    let output = run(&["codegen", "row-scope", "--request", "-"], b"{broken");
    assert_eq!(output.status.code(), Some(2));
    let text = String::from_utf8(output.stdout).unwrap();
    assert!(text.contains("\"ok\":false"));
    assert!(text.contains("\"error\":"));
    assert!(!text.contains("\"result\":"));
}

#[test]
fn malformed_codegen_cli_is_reported_as_json_with_exit_two() {
    let output = run(
        &[
            "codegen",
            "row-scope",
            "--request",
            "-",
            "--input-format",
            "yaml",
        ],
        b"{}",
    );
    assert_eq!(output.status.code(), Some(2));
    let envelope = String::from_utf8(output.stdout).unwrap();
    assert!(envelope.contains("\"ok\":false"));
    assert!(envelope.contains("\"code\":\"CLI\""));
}

#[test]
fn capabilities_reports_the_pinned_resource_manifest() {
    let output = run(&["codegen", "--capabilities"], b"");
    assert!(output.status.success());
    let envelope = String::from_utf8(output.stdout).unwrap();
    assert!(envelope.contains("umf.codegen-resources/1"));
    assert!(envelope.contains("umf.codegen-cli/1"));
    assert!(envelope.contains("umf.codegen-json-core-admission/1"));
    assert!(envelope.contains("umf.core-wire/1"));
    let capabilities = parse_json(&envelope);
    let digest = compact_json(member(&capabilities, "resourceManifestSha256"));
    assert_eq!(digest.len(), 66);
    assert!(digest.starts_with('"') && digest.ends_with('"'));
    assert!(digest[1..65].bytes().all(|byte| byte.is_ascii_hexdigit()));
    assert_eq!(
        member(member(&capabilities, "resourceManifest"), "profile"),
        &Value::string_utf8("umf.codegen-resources/1")
    );
    let manifest = member(&capabilities, "resourceManifest");
    let Value::Object(files) = member(manifest, "files") else {
        panic!("resource file map expected")
    };
    let sources: &[(&str, &[u8])] = &[
        ("actions.package.json", include_bytes!("../../../spec/extensions/actions/package.json")),
        ("binding.package.json", include_bytes!("../../../spec/extensions/binding/package.json")),
        ("core.constraints.json", include_bytes!("../../../spec/metamodel/generated/core-constraints.json")),
        ("core.domain-policy.json", include_bytes!("../../../spec/metamodel/generated/domain-policy.json")),
        ("core.package-schema.json", include_bytes!("../../../spec/core/extension-package.schema.json")),
        ("core.reference-schema.json", include_bytes!("../../../spec/core/semantic-type-reference.schema.json")),
        ("core.schema.json", include_bytes!("../../../spec/core/schema.json")),
        ("stable-binding.package.json", include_bytes!("../../../spec/extensions/binding-stable/package.json")),
        ("tables.package.json", include_bytes!("../../../spec/extensions/tables/package.json")),
    ];
    assert_eq!(files.len(), sources.len());
    for &(name, source) in sources {
        let expected = format!("{:x}", Sha256::digest(source));
        assert_eq!(member(member(manifest, "files"), name), &Value::string_utf8(&expected));
    }
    let canonical = format!("{}\n", compact_json(manifest));
    let expected_digest = format!("{:x}", Sha256::digest(canonical.as_bytes()));
    assert_eq!(
        member(&capabilities, "resourceManifestSha256"),
        &Value::string_utf8(&expected_digest)
    );
    assert!(envelope.contains("stable-binding.package.json"));
}

#[test]
fn version_reports_cli_protocol_version_and_resource_digest() {
    let output = run(&["codegen", "--version"], b"");
    assert!(output.status.success());
    let envelope = String::from_utf8(output.stdout).unwrap();
    assert!(envelope.contains("umf.codegen-cli/1"));
    assert!(envelope.contains("umf.codegen-json-core-admission/1"));
    assert!(envelope.contains("umf.core-wire/1"));
    assert!(envelope.contains("\"version\":\"0.1.0\""));
    let version = parse_json(&envelope);
    let capabilities = run(&["codegen", "--capabilities"], b"");
    assert!(capabilities.status.success());
    let capabilities = parse_json(&String::from_utf8(capabilities.stdout).unwrap());
    assert_eq!(
        member(&version, "resourceManifestSha256"),
        member(&capabilities, "resourceManifestSha256")
    );
}

#[test]
fn public_cli_dispatch_matches_the_seven_codegen_operation_shapes() {
    let migration_fixture = parse_json(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r3/sol-implementation-closure/frozen.json"
    ));
    let cases = member(&migration_fixture, "cases");
    let Value::Array(cases) = cases else {
        panic!("fixture cases expected")
    };
    let migration_case = &cases[0];
    let migration_request = member(migration_case, "request").clone();
    let previous = member(&migration_request, "previous").clone();
    let next = member(&migration_request, "next").clone();

    let generation_fixture = parse_json(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r3/generation-unified-names-review/frozen.json"
    ));
    let generation_case = &match member(&generation_fixture, "cases") {
        Value::Array(cases) => cases,
        _ => panic!("fixture cases expected"),
    }[0];
    let generation_request = member(generation_case, "request").clone();
    let generation_input = compact_json(&generation_request);
    let generation_output = run(
        &["codegen", "generate", "--request", "-"],
        generation_input.as_bytes(),
    );
    assert_eq!(generation_output.status.code(), Some(1));
    let generation_error = String::from_utf8(generation_output.stdout).unwrap();
    assert!(generation_error.contains("\"code\":\"ACCESS_UNSUPPORTED\""));
    assert!(generation_error.contains("\"message\":"));
    assert!(generation_error.contains("\"path\":"));
    assert!(!generation_error.contains("pathUnits"));
    assert!(!generation_error.contains("messageUnits"));

    let deployment_fixture = parse_json(include_str!(
        "../../../docs/helix/04-build/evidence/rust-migration/r3/sol-second-numeric-keys-review/frozen.json"
    ));
    let deployment_case = &match member(&deployment_fixture, "cases") {
        Value::Array(cases) => cases,
        _ => panic!("fixture cases expected"),
    }[0];
    let deployment_request = member(deployment_case, "request").clone();
    assert_eq!(
        run_json_operation("deployment", &deployment_request),
        *member(member(deployment_case, "expected"), "result")
    );

    let verify_deployment_request = vec![(Utf16::from("bundle"), previous.clone())];
    let verified_bundle = run_json_operation(
        "verify-deployment",
        &Value::Object(verify_deployment_request),
    );
    assert_eq!(verified_bundle, previous);

    let compiled_migration = run_json_operation("migration", &migration_request);
    assert_eq!(
        member(&compiled_migration, "status"),
        &Value::string_utf8("compiled")
    );
    let plan = member(&compiled_migration, "plan").clone();
    let verified_plan = run_json_operation(
        "verify-migration",
        &Value::Object(vec![(Utf16::from("plan"), plan.clone())]),
    );
    assert_eq!(verified_plan, plan);

    let changes = run_json_operation(
        "discover-changes",
        &Value::Object(vec![
            (Utf16::from("previous"), previous),
            (Utf16::from("next"), next),
        ]),
    );
    assert!(matches!(member(&changes, "changes"), Value::Array(_)));

    let row = run_json_operation(
        "row-scope",
        &Value::Object(vec![
            (
                Utf16::from("input"),
                Value::Object(vec![(Utf16::from("unknown"), Value::Bool(true))]),
            ),
            (Utf16::from("context"), Value::Object(vec![])),
        ]),
    );
    assert!(matches!(member(&row, "valid"), Value::Bool(_)));
}

#[test]
fn row_scope_returns_one_complete_success_envelope_for_semantic_results() {
    let output = run(
        &["codegen", "row-scope", "--request", "-"],
        br#"{"input":{"unknown":true},"context":{}}"#,
    );
    assert!(output.status.success());
    let envelope = String::from_utf8(output.stdout).unwrap();
    assert!(envelope.starts_with("{\"ok\":true,\"result\":"));
    assert!(!envelope.contains("resourceManifest"));
    assert!(envelope.ends_with('\n'));
}

#[test]
fn discovery_refuses_extra_request_members_before_engine_work() {
    let output = run(
        &["codegen", "discover-changes", "--request", "-"],
        br#"{"previous":{},"next":{},"extra":true}"#,
    );
    assert_eq!(output.status.code(), Some(1));
    let response = String::from_utf8(output.stdout).unwrap();
    assert!(response.contains("\"code\":\"MIGRATION_CHANGES_FAILED\""));
    assert!(!response.contains("\"result\""));
}

#[test]
fn aggregate_json_request_and_json_result_can_exceed_four_million_units() {
    let request = large_scope_request();
    let input = compact_json(&request);
    assert!(input.len() > 4_000_000);
    let output = run(
        &["codegen", "row-scope", "--request", "-"],
        input.as_bytes(),
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stdout[..output.stdout.len().min(1024)])
    );
    let text = String::from_utf8(output.stdout).unwrap();
    assert!(text.len() > 4_000_000);
    assert!(text.starts_with("{\"ok\":true,"));
}

#[test]
fn aggregate_wire_request_and_wire_result_can_exceed_four_million_units() {
    let request = large_scope_request();
    let input = umf_core_wire::encode(&request, &mut umf_core_wire::transport_context()).unwrap();
    assert!(input.len() > 4_000_000);
    let output = run(
        &[
            "codegen",
            "row-scope",
            "--request",
            "-",
            "--input-format",
            "wire",
            "--output-format",
            "wire",
        ],
        input.as_bytes(),
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stdout[..output.stdout.len().min(1024)])
    );
    let wire = String::from_utf8(output.stdout).unwrap();
    assert!(wire.len() > 4_000_000);
    let envelope = umf_core_wire::decode(&wire, &mut umf_core_wire::transport_context()).unwrap();
    assert_eq!(member(&envelope, "ok"), &Value::Bool(true));
}
