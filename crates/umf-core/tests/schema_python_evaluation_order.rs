// SPDX-License-Identifier: MIT OR Apache-2.0
use num_bigint::BigInt;
use serde_json::{json, Value as Json};
use umf_core::{
    schema::CompiledSchema,
    serialization::{self, Format},
    Context, PyText, PythonCompiledSchema, PythonConsumerValue as Py, PythonReVersion,
    PythonSchemaEvaluation, PythonSchemaEvaluationMode, PythonSchemaResources,
};

const ORDERED: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-evaluation-order-predecessor.json");
const ORDINARY: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-evaluation-order-ordinary-predecessor.json");
const YIELD_BOUNDARIES: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-yield-boundaries-predecessor.json");
const ANNOTATION_REACH: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-reach-predecessor.json");
const ERROR_METADATA: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-metadata-predecessor.json");
const UNORDERED_TARGETS: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-unordered-targets.json");
const ERROR_SUBJECTS: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-subjects-predecessor.json");
const ERROR_SUBJECT_PHASES: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-error-subject-phases.json");
const ANNOTATION_MECHANISMS: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-mechanism-predecessor.json");
const ANNOTATION_MECHANISMS_2019: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-annotation-mechanism-2019-predecessor.json");
const PYTHON_2019_AP_NATIVE: &str = include_str!(
    "../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-native.json"
);
const PYTHON_2019_AP_TARGET: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/sol-python-schema-2019-ap-target-proposal.json");
const PYTHON_2019_AP_DECISION: &str = include_str!("../../../docs/helix/04-build/evidence/rust-migration/r2/approved-python-schema-2019-ap-correction.json");

fn decode_recipe(recipe: &Json) -> Py {
    match recipe["kind"].as_str().expect("recipe kind") {
        "integer" => Py::Integer(
            BigInt::parse_bytes(recipe["decimal"].as_str().unwrap().as_bytes(), 10)
                .expect("valid integer recipe"),
        ),
        "float" => Py::Float(
            u64::from_str_radix(recipe["bits"].as_str().unwrap(), 16).expect("valid float recipe"),
        ),
        "string" => Py::String(if let Some(points) = recipe["points"].as_array() {
            PyText::from_codepoints(
                points
                    .iter()
                    .map(|point| point.as_u64().expect("codepoint") as u32)
                    .collect(),
            )
            .expect("valid Python codepoints")
        } else {
            PyText::from_utf8(recipe["value"].as_str().unwrap())
        }),
        "null" => Py::Null,
        "bool" | "boolean" => Py::Bool(recipe["value"].as_bool().expect("boolean recipe")),
        "array" => Py::Array(
            recipe["items"]
                .as_array()
                .expect("array recipe")
                .iter()
                .map(decode_recipe)
                .collect(),
        ),
        "object" => Py::Object(
            recipe["members"]
                .as_array()
                .expect("object recipe")
                .iter()
                .map(|member| {
                    (
                        PyText::from_utf8(member[0].as_str().expect("object member key")),
                        decode_recipe(&member[1]),
                    )
                })
                .collect(),
        ),
        other => panic!("unknown recipe kind {other}"),
    }
}

fn instance_value(corpus: &Json, recipe: &Json) -> Py {
    if recipe.get("kind").is_some() {
        return decode_recipe(recipe);
    }
    let value = decode_recipe(&corpus["instanceValues"][recipe["value"].as_str().unwrap()]);
    match recipe["shape"].as_str().unwrap() {
        "scalar" => value,
        "array" => Py::Array(vec![value]),
        "object" => Py::Object(vec![(PyText::from_utf8("x"), value)]),
        other => panic!("unknown instance shape {other}"),
    }
}

fn try_compile_case(
    case: &Json,
    ctx: &mut Context<'_>,
) -> Result<PythonCompiledSchema, umf_core::EngineError> {
    let source = PyText::from_utf8(case["schemaText"].as_str().expect("schemaText"));
    let schema = serialization::read_python_value(&source, Format::Json, ctx)?;
    CompiledSchema::compile_python_source(
        &schema,
        &PythonSchemaResources::default(),
        false,
        PythonReVersion::V3_11,
        ctx,
    )
}

fn compile_case(case: &Json, ctx: &mut Context<'_>) -> PythonCompiledSchema {
    try_compile_case(case, ctx).unwrap_or_else(|error| {
        panic!(
            "{} schema admission: {} {}",
            case["id"],
            error.code,
            error.message.to_utf8().unwrap_or_default()
        )
    })
}

fn pointer_segments(path: &PyText) -> Vec<String> {
    let text: String = path
        .codepoints()
        .iter()
        .map(|point| char::from_u32(*point).expect("fixture paths contain scalar text"))
        .collect();
    let pointer = text.strip_prefix('#').unwrap_or(&text);
    if pointer.is_empty() {
        return Vec::new();
    }
    pointer
        .strip_prefix('/')
        .expect("schema diagnostics use JSON Pointer")
        .split('/')
        .map(|segment| segment.replace("~1", "/").replace("~0", "~"))
        .collect()
}

fn error_signature(evaluation: &PythonSchemaEvaluation) -> Vec<Json> {
    evaluation
        .errors
        .iter()
        .map(|error| {
            let keyword = error.keyword.as_ref().map(|value| {
                value
                    .codepoints()
                    .iter()
                    .map(|point| char::from_u32(*point).expect("fixture keyword is scalar text"))
                    .collect::<String>()
            });
            json!({
                "keyword": keyword,
                "instancePath": pointer_segments(&error.instance_path),
                "schemaPath": pointer_segments(&error.schema_path),
            })
        })
        .collect()
}

fn expected_error_signature(errors: &[Json]) -> Vec<Json> {
    errors
        .iter()
        .map(|error| {
            let path = |name: &str| {
                Json::Array(
                    error[name]
                        .as_array()
                        .expect("frozen path array")
                        .iter()
                        .map(|segment| {
                            Json::String(match segment {
                                Json::String(value) => value.clone(),
                                Json::Number(value) => value.to_string(),
                                other => panic!("unexpected frozen path segment {other}"),
                            })
                        })
                        .collect(),
                )
            };
            json!({
                "keyword": error["keyword"],
                "instancePath": path("instancePath"),
                "schemaPath": path("schemaPath"),
            })
        })
        .collect()
}

fn arithmetic_reason(error: &umf_core::EngineError) -> String {
    assert_eq!(error.code, "PYTHON_SCHEMA_ARITHMETIC");
    let reason = error.message.to_utf8().expect("arithmetic reason is UTF-8");
    if matches!(
        reason.as_str(),
        "nan-to-integer" | "infinity-to-integer-ratio" | "integer-to-float-overflow"
    ) {
        reason
    } else {
        panic!("unapproved arithmetic reason: {reason}");
    }
}

fn evaluation_error_message(error: &umf_core::EngineError) -> String {
    assert_eq!(error.code, "PYTHON_SCHEMA_EVALUATION");
    error.message.to_utf8().expect("evaluation reason is UTF-8")
}

fn native_reason(message: &str) -> &'static str {
    match message {
        "cannot convert float NaN to integer" => "nan-to-integer",
        "cannot convert Infinity to integer ratio" => "infinity-to-integer-ratio",
        "int too large to convert to float" => "integer-to-float-overflow",
        other => panic!("unclassified frozen arithmetic exception: {other}"),
    }
}

fn verify_case(corpus: &Json, case: &Json) {
    let mut compile_ctx = Context::ordinary();
    let compiled = compile_case(case, &mut compile_ctx);
    let instance = instance_value(corpus, &case["instanceRecipe"]);

    let mut validity_ctx = Context::ordinary();
    let first = compiled
        .evaluate(
            &instance,
            PythonSchemaEvaluationMode::FirstError,
            &mut validity_ctx,
        )
        .unwrap_or_else(|error| panic!("{} FirstError outer failure: {}", case["id"], error.code));
    let first_errors = error_signature(&first);
    assert!(
        first_errors.len() <= 1,
        "{} FirstError yielded multiple errors",
        case["id"]
    );
    let first_terminal = first
        .terminal_error
        .as_ref()
        .filter(|error| error.code == "PYTHON_SCHEMA_ARITHMETIC")
        .map(arithmetic_reason);
    let expected_validity = &case["methods"]["is_valid"];
    match expected_validity["status"].as_str().unwrap() {
        "validity" => assert_eq!(
            first_errors.is_empty(),
            expected_validity["valid"].as_bool().unwrap(),
            "{} is_valid errors={first_errors:?} terminal={first_terminal:?}",
            case["id"]
        ),
        "arithmetic-error" => assert_eq!(
            first_terminal.as_deref(),
            Some(native_reason(
                expected_validity["message"].as_str().unwrap()
            )),
            "{} is_valid arithmetic",
            case["id"]
        ),
        "evaluation-error" => assert_eq!(
            first
                .terminal_error
                .as_ref()
                .map(evaluation_error_message)
                .as_deref(),
            Some(
                approved_evaluation_message(
                    case,
                    "is_valid",
                    expected_validity["message"].as_str().unwrap()
                )
                .as_str()
            ),
            "{} is_valid evaluation error",
            case["id"]
        ),
        other => panic!("{} unknown is_valid status {other}", case["id"]),
    }

    let mut validate_ctx = Context::ordinary();
    let validated = compiled
        .evaluate(
            &instance,
            PythonSchemaEvaluationMode::FirstError,
            &mut validate_ctx,
        )
        .unwrap_or_else(|error| {
            panic!(
                "{} validate FirstError outer failure: {}",
                case["id"], error.code
            )
        });
    let validate_errors = error_signature(&validated);
    assert!(
        validate_errors.len() <= 1,
        "{} validate yielded multiple errors",
        case["id"]
    );
    let validate_terminal = validated
        .terminal_error
        .as_ref()
        .filter(|error| error.code == "PYTHON_SCHEMA_ARITHMETIC")
        .map(arithmetic_reason);
    let expected_validate = &case["methods"]["validate"];
    match expected_validate["status"].as_str().unwrap() {
        "valid" => {
            assert!(validate_errors.is_empty(), "{} validate errors", case["id"]);
            assert!(
                validate_terminal.is_none(),
                "{} validate terminal",
                case["id"]
            );
        }
        "validation-error" => {
            assert_eq!(
                validate_errors.len(),
                1,
                "{} validate first-error count",
                case["id"]
            );
            assert_eq!(
                validate_errors[0]["keyword"], expected_validate["error"]["keyword"],
                "{} validate keyword",
                case["id"]
            );
            assert_eq!(
                validate_errors,
                expected_error_signature(std::slice::from_ref(&expected_validate["error"])),
                "{} validate paths",
                case["id"]
            );
            assert!(
                validate_terminal.is_none(),
                "{} validate terminal after first error",
                case["id"]
            );
        }
        "arithmetic-error" => assert_eq!(
            validate_terminal.as_deref(),
            Some(native_reason(
                expected_validate["message"].as_str().unwrap()
            )),
            "{} validate arithmetic",
            case["id"]
        ),
        "evaluation-error" => assert_eq!(
            validated
                .terminal_error
                .as_ref()
                .map(evaluation_error_message)
                .as_deref(),
            Some(
                approved_evaluation_message(
                    case,
                    "validate",
                    expected_validate["message"].as_str().unwrap()
                )
                .as_str()
            ),
            "{} validate evaluation error",
            case["id"]
        ),
        other => panic!("{} unknown validate status {other}", case["id"]),
    }

    let mut all_ctx = Context::ordinary();
    let all = compiled
        .evaluate(
            &instance,
            PythonSchemaEvaluationMode::AllErrors,
            &mut all_ctx,
        )
        .unwrap_or_else(|error| panic!("{} AllErrors outer failure: {}", case["id"], error.code));
    let expected_iterate = &case["methods"]["iterate"];
    assert_eq!(
        error_signature(&all),
        expected_error_signature(expected_iterate["prefix"].as_array().unwrap()),
        "{} iterator prefix",
        case["id"]
    );
    match expected_iterate["status"].as_str().unwrap() {
        "end" => assert!(
            all.terminal_error.is_none(),
            "{} unexpected iterator terminal",
            case["id"]
        ),
        "arithmetic-error" => assert_eq!(
            all.terminal_error
                .as_ref()
                .map(arithmetic_reason)
                .as_deref(),
            Some(native_reason(expected_iterate["message"].as_str().unwrap())),
            "{} iterator terminal",
            case["id"]
        ),
        "evaluation-error" => assert_eq!(
            all.terminal_error
                .as_ref()
                .map(evaluation_error_message)
                .as_deref(),
            Some(
                approved_evaluation_message(
                    case,
                    "iterate",
                    expected_iterate["message"].as_str().unwrap()
                )
                .as_str()
            ),
            "{} iterator evaluation error",
            case["id"]
        ),
        other => panic!("{} unknown iterate status {other}", case["id"]),
    }
}

fn approved_evaluation_message(case: &Json, method: &str, native_message: &str) -> String {
    if native_message == "object of type 'bool' has no len()"
        && matches!(method, "is_valid" | "validate" | "iterate")
    {
        let schema: Json = serde_json::from_str(case["schemaText"].as_str().unwrap())
            .expect("frozen schema text is JSON");
        if schema["$schema"] == "https://json-schema.org/draft/2019-09/schema"
            && schema["items"].is_boolean()
            && schema.get("additionalItems").is_none()
        {
            return "Draft 2019-09 boolean items annotation has no length".to_owned();
        }
    }
    native_message.to_owned()
}

fn verify_corpus(source: &str, expected_cases: usize) {
    let corpus: Json = serde_json::from_str(source).expect("valid frozen evaluation-order corpus");
    assert_eq!(corpus["python"], "3.11.17");
    assert_eq!(corpus["jsonschema"], "4.26.0");
    let cases = corpus["cases"].as_array().expect("case list");
    assert_eq!(cases.len(), expected_cases);
    for case in cases {
        verify_case(&corpus, case);
    }
}

fn verify_yield_boundaries() {
    let corpus: Json =
        serde_json::from_str(YIELD_BOUNDARIES).expect("valid frozen schema yield-boundary corpus");
    assert_eq!(corpus["python"], "3.11.17");
    assert_eq!(corpus["jsonschema"], "4.26.0");
    let cases = corpus["cases"].as_array().expect("case list");
    assert_eq!(cases.len(), 226);
    let mut observations = 0usize;
    let mut schema_refusals = 0usize;
    let mut mismatches = Vec::new();
    for case in cases {
        if case.get("schemaError").is_some() {
            schema_refusals += 1;
            let mut ctx = Context::ordinary();
            assert!(
                try_compile_case(case, &mut ctx).is_err(),
                "{} predecessor refuses schema but Rust compiled it",
                case["id"]
            );
            assert!(case["methods"].as_object().unwrap().is_empty());
            continue;
        }
        let result =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| verify_case(&corpus, case)));
        if let Err(payload) = result {
            let detail = payload
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| {
                    payload
                        .downcast_ref::<&str>()
                        .map(|message| (*message).to_owned())
                })
                .unwrap_or_else(|| "non-string panic".to_owned());
            mismatches.push(format!("{}: {detail}", case["id"]));
        }
        observations += 3;
    }
    assert_eq!(schema_refusals, 1);
    assert_eq!(observations, 675);
    assert!(
        mismatches.is_empty(),
        "{} shaped fixture mismatches; first 40:\n{}",
        mismatches.len(),
        mismatches
            .iter()
            .take(40)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}

fn verify_annotation_reach() {
    let corpus: Json = serde_json::from_str(ANNOTATION_REACH)
        .expect("valid frozen schema annotation-reach corpus");
    assert_eq!(corpus["python"], "3.11.17");
    assert_eq!(corpus["jsonschema"], "4.26.0");
    let cases = corpus["cases"].as_array().expect("case list");
    assert_eq!(cases.len(), 96);
    let mut observations = 0usize;
    let mut schema_refusals = 0usize;
    let mut mismatches = Vec::new();
    for case in cases {
        if case.get("schemaError").is_some() {
            schema_refusals += 1;
            let mut ctx = Context::ordinary();
            assert!(
                try_compile_case(case, &mut ctx).is_err(),
                "{} predecessor refuses schema but Rust compiled it",
                case["id"]
            );
            assert!(case["methods"].as_object().unwrap().is_empty());
            continue;
        }
        let result =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| verify_case(&corpus, case)));
        if let Err(payload) = result {
            let detail = payload
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| {
                    payload
                        .downcast_ref::<&str>()
                        .map(|message| (*message).to_owned())
                })
                .unwrap_or_else(|| "non-string panic".to_owned());
            mismatches.push(format!("{}: {detail}", case["id"]));
        }
        observations += 3;
    }
    assert_eq!(schema_refusals, 1);
    assert_eq!(observations, 285);
    assert!(
        mismatches.is_empty(),
        "{} annotation-reach fixture mismatches; first 40:\n{}",
        mismatches.len(),
        mismatches
            .iter()
            .take(40)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}

fn verify_annotation_mechanisms(
    source: &str,
    expected_cases: usize,
    expected_refusals: usize,
    ap_target: Option<&Json>,
    selected_ap_methods: &std::collections::BTreeMap<String, Vec<String>>,
) {
    let corpus: Json =
        serde_json::from_str(source).expect("valid frozen schema annotation-mechanism corpus");
    assert_eq!(corpus["python"], "3.11.17");
    assert_eq!(corpus["jsonschema"], "4.26.0");
    let cases = corpus["cases"].as_array().expect("case list");
    assert_eq!(cases.len(), expected_cases);
    let mut observations = 0usize;
    let mut refusals = 0usize;
    let mut mismatches = Vec::new();
    for case in cases {
        if case.get("schemaError").is_some() {
            refusals += 1;
            let mut ctx = Context::ordinary();
            assert!(
                try_compile_case(case, &mut ctx).is_err(),
                "{} predecessor refuses schema but Rust compiled it",
                case["id"]
            );
            assert!(case["methods"].as_object().unwrap().is_empty());
            continue;
        }
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut effective_case = case.clone();
            if let Some(target) = ap_target {
                if let Some(target_case) = target["cases"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|target_case| target_case["id"] == case["id"])
                {
                    assert_eq!(case["schemaText"], target_case["schemaText"]);
                    assert_eq!(case["instanceRecipe"], target_case["instanceRecipe"]);
                    if let Some(methods) = selected_ap_methods.get(case["id"].as_str().unwrap()) {
                        for method in methods {
                            effective_case["methods"][method] =
                                target_case["methods"][method].clone();
                        }
                    }
                }
            }
            verify_case(&corpus, &effective_case)
        }));
        if let Err(payload) = result {
            let detail = payload
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| {
                    payload
                        .downcast_ref::<&str>()
                        .map(|message| (*message).to_owned())
                })
                .unwrap_or_else(|| "non-string panic".to_owned());
            mismatches.push(format!("{}: {detail}", case["id"]));
        }
        observations += 3;
    }
    assert_eq!(refusals, expected_refusals);
    assert_eq!(observations, (expected_cases - expected_refusals) * 3);
    assert!(
        mismatches.is_empty(),
        "{} annotation-mechanism fixture mismatches; first 40:\n{}",
        mismatches.len(),
        mismatches
            .iter()
            .take(40)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}

fn verify_approved_2019_ap_targets() {
    let native: Json = serde_json::from_str(PYTHON_2019_AP_NATIVE).unwrap();
    let target: Json = serde_json::from_str(PYTHON_2019_AP_TARGET).unwrap();
    let decision: Json = serde_json::from_str(PYTHON_2019_AP_DECISION).unwrap();
    assert_eq!(decision["id"], "R2-SOL-CORRECTION-001-AMENDMENT-001");
    assert_eq!(decision["selector"]["dialect"], "Draft2019-09");
    assert_eq!(decision["selector"]["keyword"], "additionalProperties");
    assert_eq!(decision["selector"]["schemaKind"], "Object only");
    assert_eq!(
        native["profile"],
        "umf.r2-sol-python-schema-2019-ap-native/1"
    );
    assert_eq!(
        target["profile"],
        "umf.r2-sol-python-schema-2019-ap-target/1"
    );
    assert_eq!(native["cases"].as_array().unwrap().len(), 37);
    assert_eq!(target["cases"].as_array().unwrap().len(), 37);
    let mut selected = std::collections::BTreeMap::<String, Vec<String>>::new();
    for row in decision["selectedChangedRows"].as_array().unwrap() {
        selected.insert(
            row["id"].as_str().unwrap().to_owned(),
            row["methods"]
                .as_array()
                .unwrap()
                .iter()
                .map(|method| method.as_str().unwrap().to_owned())
                .collect(),
        );
    }
    assert_eq!(selected.len(), 8);
    assert_eq!(selected.values().map(Vec::len).sum::<usize>(), 21);
    for native_case in native["cases"].as_array().unwrap() {
        let target_case = target["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|case| case["id"] == native_case["id"])
            .expect("target includes every native case");
        assert_eq!(native_case["schemaText"], target_case["schemaText"]);
        assert_eq!(native_case["instanceRecipe"], target_case["instanceRecipe"]);
        let changed = selected.get(native_case["id"].as_str().unwrap());
        for method in ["is_valid", "validate", "iterate"] {
            if changed.is_none_or(|methods| !methods.iter().any(|m| m == method)) {
                assert_eq!(
                    native_case["methods"][method],
                    target_case["methods"][method]
                );
            }
        }
    }
    verify_annotation_mechanisms(PYTHON_2019_AP_TARGET, 37, 1, None, &selected);
    verify_annotation_mechanisms(PYTHON_2019_AP_NATIVE, 37, 1, Some(&target), &selected);
}

fn path_segments(expected: &Json) -> Vec<String> {
    expected
        .as_array()
        .expect("frozen path array")
        .iter()
        .map(|segment| match segment {
            Json::String(value) => value.clone(),
            Json::Number(value) => value.to_string(),
            other => panic!("unexpected frozen path segment {other}"),
        })
        .collect()
}

fn value_at_instance_path<'a>(value: &'a Py, path: &[String]) -> Option<&'a Py> {
    let mut current = value;
    for segment in path {
        current = match current {
            Py::Array(values) => values.get(segment.parse::<usize>().ok()?)?,
            Py::Object(fields) => {
                let key = PyText::from_utf8(segment);
                &fields.iter().find(|(name, _)| name == &key)?.1
            }
            _ => return None,
        };
    }
    Some(current)
}

fn verify_error_metadata_fixture(
    source: &str,
    expected_cases: usize,
    expected_errors: usize,
    expected_refusals: usize,
    runtime_error_ids: &[&str],
    phase_source: Option<&str>,
) {
    let corpus: Json =
        serde_json::from_str(source).expect("valid frozen schema error-metadata corpus");
    assert_eq!(corpus["python"], "3.11.17");
    assert_eq!(corpus["jsonschema"], "4.26.0");
    let cases = corpus["cases"].as_array().expect("case list");
    assert_eq!(cases.len(), expected_cases);
    let phase_receipt = phase_source.map(|source| {
        let receipt: Json = serde_json::from_str(source).expect("valid frozen phase receipt");
        assert_eq!(
            receipt["id"],
            "R2-SOL-PYTHON-SCHEMA-ERROR-SUBJECT-PHASES-001"
        );
        assert_eq!(
            receipt["originalFixture"],
            "sol-python-schema-error-subjects-predecessor.json"
        );
        assert_eq!(
            receipt["originalFixtureSha256"],
            "e93bac66f68c16acef799beec894638bf8733d8107347f2e062dd075de7f13b1"
        );
        assert_eq!(receipt["targetMapping"]["code"], "PYTHON_SCHEMA_EVALUATION");
        assert_eq!(
            receipt["targetMapping"]["message"],
            "Draft 3 reference target is not an object schema"
        );
        receipt
    });
    let phase_cases = phase_receipt
        .as_ref()
        .and_then(|receipt| receipt["cases"].as_array())
        .cloned()
        .unwrap_or_default();
    if phase_receipt.is_some() {
        assert_eq!(phase_cases.len(), 13);
        let receipt_ids = phase_cases
            .iter()
            .map(|record| record["id"].as_str().unwrap())
            .collect::<std::collections::BTreeSet<_>>();
        let oracle_ids = cases
            .iter()
            .filter(|case| case.get("schemaError").is_some())
            .map(|case| case["id"].as_str().unwrap())
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(
            receipt_ids, oracle_ids,
            "phase receipt covers the original mislabeled cases"
        );
    }
    let mut error_count = 0usize;
    let mut schema_refusals = 0usize;
    let mut runtime_errors = 0usize;
    let mut mismatches = Vec::new();
    for case in cases {
        let attempt = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let schema = decode_recipe(&case["schemaRecipe"]);
            let instance = decode_recipe(&case["instanceRecipe"]);
            let mut compile_ctx = Context::ordinary();
            let compiled = CompiledSchema::compile_python_source(
                &schema,
                &PythonSchemaResources::default(),
                false,
                PythonReVersion::V3_11,
                &mut compile_ctx,
            );
            if case.get("schemaError").is_some() {
                let case_id = case["id"].as_str().expect("case id");
                if runtime_error_ids.contains(&case_id) {
                    let phase = phase_cases
                        .iter()
                        .find(|record| record["id"] == case["id"])
                        .unwrap_or_else(|| panic!("{case_id} missing from frozen phase receipt"));
                    assert_eq!(phase["phase"], "iteration", "{case_id} phase");
                    assert_eq!(phase["construction"], "accepted", "{case_id} construction");
                    let compiled = compiled.unwrap_or_else(|error| {
                        panic!(
                            "{case_id} is an evaluation failure, not admission refusal: {error:?}"
                        )
                    });
                    let instance = decode_recipe(&case["instanceRecipe"]);
                    for (mode, method) in [
                        (PythonSchemaEvaluationMode::FirstError, "is_valid"),
                        (PythonSchemaEvaluationMode::FirstError, "validate"),
                        (PythonSchemaEvaluationMode::AllErrors, "iter_errors"),
                    ] {
                        let expected = &phase["methods"][method];
                        assert_eq!(
                            expected["status"], "error",
                            "{case_id} frozen {method} status"
                        );
                        assert_eq!(
                            expected["error"]["type"], "TypeError",
                            "{case_id} frozen {method} type"
                        );
                        assert_eq!(
                            expected["error"]["message"], "argument of type 'bool' is not iterable",
                            "{case_id} frozen {method} message"
                        );
                        if method == "iter_errors" {
                            assert!(
                                expected["prefix"].as_array().unwrap().is_empty(),
                                "{case_id} frozen iterator prefix"
                            );
                        }
                        let mut ctx = Context::ordinary();
                        let result = compiled
                            .evaluate(&instance, mode, &mut ctx)
                            .expect("runtime evaluation failures are represented in the result");
                        assert!(
                            result.errors.is_empty(),
                            "{case_id} {method} runtime error has no structural errors; errors={:?}, terminal={:?}",
                            result.errors,
                            result.terminal_error
                        );
                        let error = result
                            .terminal_error
                            .as_ref()
                            .expect("expected the frozen predecessor runtime TypeError");
                        assert_eq!(
                            error.code, "PYTHON_SCHEMA_EVALUATION",
                            "{case_id} {method} runtime code"
                        );
                        assert_eq!(
                            error.message.to_utf8().unwrap(),
                            "Draft 3 reference target is not an object schema",
                            "{case_id} {method} runtime message"
                        );
                    }
                    runtime_errors += 1;
                    return;
                }
                schema_refusals += 1;
                assert!(compiled.is_err(), "{} expected schema refusal", case["id"]);
                return;
            }
            let compiled = compiled.unwrap_or_else(|error| {
                panic!("{} unexpected schema refusal: {}", case["id"], error.code)
            });
            let mut ctx = Context::ordinary();
            let result = compiled
                .evaluate(&instance, PythonSchemaEvaluationMode::AllErrors, &mut ctx)
                .unwrap_or_else(|error| panic!("{} evaluation error: {}", case["id"], error.code));
            let expected = case["errors"].as_array().expect("expected error list");
            assert_eq!(
                result.errors.len(),
                expected.len(),
                "{} error count",
                case["id"]
            );
            for (actual, expected) in result.errors.iter().zip(expected) {
                assert_eq!(
                    actual
                        .keyword
                        .as_ref()
                        .map(|value| value.codepoints().to_vec()),
                    expected["keyword"]
                        .as_str()
                        .map(|value| value.chars().map(u32::from).collect::<Vec<_>>()),
                    "{} keyword",
                    case["id"]
                );
                assert_eq!(
                    actual.validator_value,
                    decode_recipe(&expected["validatorValue"]),
                    "{} validatorValue",
                    case["id"]
                );
                let instance_path = pointer_segments(&actual.instance_path);
                assert_eq!(
                    instance_path,
                    path_segments(&expected["instancePath"]),
                    "{} instancePath",
                    case["id"]
                );
                let actual_instance =
                    if let Some(override_value) = actual.instance_override.as_ref() {
                        Some(override_value)
                    } else {
                        value_at_instance_path(
                            &instance,
                            &pointer_segments(&actual.physical_instance_path),
                        )
                    };
                let expected_instance = decode_recipe(&expected["instance"]);
                assert_eq!(
                    actual_instance,
                    Some(&expected_instance),
                    "{} instance",
                    case["id"]
                );
                assert_eq!(
                    pointer_segments(&actual.schema_path),
                    path_segments(&expected["schemaPath"]),
                    "{} schemaPath",
                    case["id"]
                );
                error_count += 1;
            }
        }));
        if let Err(payload) = attempt {
            let detail = payload
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| {
                    payload
                        .downcast_ref::<&str>()
                        .map(|message| (*message).to_owned())
                })
                .unwrap_or_else(|| "non-string panic".to_owned());
            mismatches.push(format!("{}: {detail}", case["id"]));
        }
    }
    assert_eq!(error_count, expected_errors);
    assert_eq!(schema_refusals, expected_refusals);
    assert_eq!(runtime_errors, runtime_error_ids.len());
    if phase_receipt.is_some() {
        assert_eq!(schema_refusals + runtime_errors, phase_cases.len());
    }
    assert!(
        mismatches.is_empty(),
        "{} error-metadata fixture mismatches; first 40:\n{}",
        mismatches.len(),
        mismatches
            .iter()
            .take(40)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}

fn verify_unordered_targets() {
    let corpus: Json = serde_json::from_str(UNORDERED_TARGETS)
        .expect("valid reviewed unordered-target schema corpus");
    assert_eq!(corpus["python"], "3.11.17");
    assert_eq!(corpus["jsonschema"], "4.26.0");
    let cases = corpus["cases"].as_array().expect("case list");
    assert_eq!(cases.len(), 36);
    let mut observations = 0usize;
    let mut mismatches = Vec::new();
    for case in cases {
        let result =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| verify_case(&corpus, case)));
        if let Err(payload) = result {
            let detail = payload
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| {
                    payload
                        .downcast_ref::<&str>()
                        .map(|message| (*message).to_owned())
                })
                .unwrap_or_else(|| "non-string panic".to_owned());
            mismatches.push(format!("{}: {detail}", case["id"]));
        }
        observations += 3;
    }
    assert_eq!(observations, 108);
    assert!(
        mismatches.is_empty(),
        "{} unordered-target fixture mismatches; first 40:\n{}",
        mismatches.len(),
        mismatches
            .iter()
            .take(40)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}

#[test]
fn python_schema_evaluation_order_matches_frozen_predecessor() {
    verify_corpus(ORDERED, 792);
    verify_corpus(ORDINARY, 264);
    verify_yield_boundaries();
}

#[test]
fn python_schema_annotation_reach_matches_frozen_predecessor() {
    verify_annotation_reach();
}

#[test]
fn python_schema_annotation_mechanisms_match_frozen_profiles() {
    verify_annotation_mechanisms(ANNOTATION_MECHANISMS, 140, 9, None, &Default::default());
    let target: Json = serde_json::from_str(PYTHON_2019_AP_TARGET).unwrap();
    let decision: Json = serde_json::from_str(PYTHON_2019_AP_DECISION).unwrap();
    let selected = decision["selectedChangedRows"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            (
                row["id"].as_str().unwrap().to_owned(),
                row["methods"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|method| method.as_str().unwrap().to_owned())
                    .collect(),
            )
        })
        .collect::<std::collections::BTreeMap<_, _>>();
    verify_annotation_mechanisms(ANNOTATION_MECHANISMS_2019, 28, 1, Some(&target), &selected);
    verify_approved_2019_ap_targets();
}

#[test]
fn python_schema_error_metadata_matches_frozen_predecessor() {
    verify_error_metadata_fixture(ERROR_METADATA, 63, 51, 1, &[], None);
}

#[test]
fn python_schema_error_subjects_match_frozen_predecessor() {
    verify_error_metadata_fixture(
        ERROR_SUBJECTS,
        63,
        38,
        11,
        &[
            "draft0-property-ref-false-subject",
            "draft0-item-ref-false-subject",
        ],
        Some(ERROR_SUBJECT_PHASES),
    );
}

#[test]
fn python_schema_unordered_target_matches_approved_correction() {
    verify_unordered_targets();
}
