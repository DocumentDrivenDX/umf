#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded replay of the frozen TypeScript RDF 1.1 predecessor corpus.
use std::{collections::{BTreeMap, HashMap}, fs, path::PathBuf};

use serde_json::Value as Json;
use sha2::{Digest, Sha256};
use umf_core::{
    context::Context,
    rdf::{self, RdfRuntime},
    Utf16, Value,
};

const RDF_CONTEXT: &str = "RDF 1.1 N-Quads/Turtle/TriG only. Turtle/TriG expands prefixes/base and allocates deterministic local anonymous labels. Blank labels have document-local scope; dataset meaning ignores duplicate occurrences and order. No entailment, datatype value normalization, isomorphism/canonicalization or RDF 1.2 support is asserted. Original bytes remain archived; edited export regenerates syntax.";

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read_json(path: &str) -> Json {
    serde_json::from_str(
        &fs::read_to_string(root().join(path)).unwrap_or_else(|e| panic!("{path}: {e}")),
    )
    .unwrap_or_else(|e| panic!("{path}: {e}"))
}

fn from_json(value: &Json) -> Value {
    match value {
        Json::Null => Value::Null,
        Json::Bool(value) => Value::Bool(*value),
        Json::Number(value) => Value::Number(value.as_f64().expect("fixture number as f64")),
        Json::String(value) => Value::string_utf8(value),
        Json::Array(values) => Value::Array(values.iter().map(from_json).collect()),
        Json::Object(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| (Utf16::from(key.as_str()), from_json(value)))
                .collect(),
        ),
    }
}

fn to_json(value: &Value) -> Json {
    match value {
        Value::Null => Json::Null,
        Value::Bool(value) => Json::Bool(*value),
        Value::Number(value) => {
            Json::Number(serde_json::Number::from_f64(*value).expect("finite RDF fixture number"))
        }
        Value::String(value) => Json::String(value.to_utf8().expect("fixture text is valid UTF-8")),
        Value::Array(values) => Json::Array(values.iter().map(to_json).collect()),
        Value::Object(values) => Json::Object(
            values
                .iter()
                .map(|(key, value)| {
                    (
                        key.to_utf8().expect("fixture key is valid UTF-8"),
                        to_json(value),
                    )
                })
                .collect(),
        ),
    }
}

fn occurrence_counts(terms: &Json) -> BTreeMap<String, usize> {
    terms
        .as_array()
        .expect("RDF terms are an array")
        .iter()
        .map(|term| serde_json::to_string(term).expect("RDF term JSON is serializable"))
        .fold(BTreeMap::new(), |mut counts, term| {
            *counts.entry(term).or_default() += 1;
            counts
        })
}

fn assert_term_occurrences(actual: &Value, expected: &Json, label: &str, format: &str) {
    let actual = to_json(actual);
    assert_eq!(
        occurrence_counts(&actual),
        occurrence_counts(expected),
        "{label}: {format} quad occurrences differ (values, blank identifiers, and multiplicity are significant)"
    );
}

fn assert_nquad_line_occurrences(actual: &str, expected: &str, label: &str) {
    fn counts(source: &str) -> BTreeMap<&str, usize> {
        source.lines().fold(BTreeMap::new(), |mut counts, line| {
            *counts.entry(line).or_default() += 1;
            counts
        })
    }
    assert_eq!(
        counts(actual),
        counts(expected),
        "{label}: canonical N-Quads line occurrences differ"
    );
}

fn expected_blank_labels_after_syntax_roundtrip(terms: &Json) -> Json {
    fn visit(value: &mut Json) {
        match value {
            Json::Array(items) => items.iter_mut().for_each(visit),
            Json::Object(fields) => {
                if fields.get("kind").and_then(Json::as_str) == Some("blank") {
                    if let Some(Json::String(label)) = fields.get_mut("value") {
                        let encoded = label
                            .chars()
                            .map(|c| format!("{:06x}", c as u32))
                            .collect::<String>();
                        *label = format!("e_{encoded}");
                    }
                }
                fields.values_mut().for_each(visit);
            }
            _ => {}
        }
    }
    let mut expected = terms.clone();
    visit(&mut expected);
    expected
}

fn assert_stored_quads(document: &Value, getter: &Value, label: &str) {
    let document = to_json(document);
    let stored = document
        .pointer("/modules/0/elements/0/extensions/umf.rdf/quads")
        .expect("RDF quad array is stored in the extension payload");
    assert_eq!(&to_json(getter), stored, "{label}: getter differs from stored quad array");
}

fn assert_stored_named_graphs(document: &Value, getter: &Value, label: &str) {
    let document = to_json(document);
    let stored = document
        .pointer("/modules/0/elements/0/extensions/umf.rdf/namedGraphs")
        .expect("RDF named graph inventory is stored in the extension payload");
    assert_eq!(&to_json(getter), stored, "{label}: named graph getter differs from stored inventory");
}

fn matching_occurrence_index(actual: &Json, frozen_target: &Json, label: &str) -> usize {
    actual
        .as_array()
        .expect("RDF terms are an array")
        .iter()
        .position(|term| term == frozen_target)
        .unwrap_or_else(|| panic!("{label}: frozen edit target occurrence is absent from stored terms"))
}

fn assert_indexed_edit_preserves_others(
    original: &Json,
    edited: &Value,
    expected: &Json,
    index: usize,
    label: &str,
) {
    let original = original.as_array().expect("RDF terms are an array");
    let edited = to_json(edited);
    let edited = edited.as_array().expect("RDF terms are an array");
    let expected = expected.as_array().expect("RDF terms are an array");
    assert_eq!(edited.len(), original.len(), "{label}: indexed edit changed quad count");
    assert_eq!(edited[index], expected[index], "{label}: indexed edit missed its stored occurrence");
    for (i, (before, after)) in original.iter().zip(edited).enumerate() {
        if i != index {
            assert_eq!(after, before, "{label}: indexed edit moved or changed stored occurrence {i}");
        }
    }
}

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn original_source(document: &Value) -> &Utf16 {
    let payload = field(
        field(
            field(
                field(document, "modules")
                    .and_then(|v| match v {
                        Value::Array(a) => a.first(),
                        _ => None,
                    })
                    .unwrap(),
                "elements",
            )
            .and_then(|v| match v {
                Value::Array(a) => a.first(),
                _ => None,
            })
            .unwrap(),
            "extensions",
        )
        .unwrap(),
        "umf.rdf",
    )
    .unwrap();
    match field(payload, "originalSource").unwrap() {
        Value::String(value) => value,
        _ => panic!("RDF original source must be retained as UTF-16"),
    }
}

fn manifest_hashes(path: &str) -> HashMap<String, String> {
    read_json(path)["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|file| {
            (
                file["path"].as_str().unwrap().to_owned(),
                file["sha256"].as_str().unwrap().to_owned(),
            )
        })
        .collect()
}

fn assert_source_hash(source_path: &str, hashes: &HashMap<String, String>, label: &str) {
    let expected = hashes
        .get(source_path)
        .unwrap_or_else(|| panic!("{label}: missing pinned source hash for {source_path}"));
    let bytes = fs::read(root().join(source_path)).unwrap_or_else(|e| panic!("{label}: {e}"));
    let actual = format!("{:x}", Sha256::digest(bytes));
    assert_eq!(
        &actual, expected,
        "{label}: pinned upstream source hash changed"
    );
}

fn assert_context(validation: &umf_core::Validation, label: &str) {
    assert!(
        validation.valid,
        "{label}: valid corpus source should inspect successfully"
    );
    assert!(
        !validation.complete,
        "{label}: RDF scope must remain explicitly incomplete"
    );
    let context = validation
        .diagnostics
        .first()
        .unwrap_or_else(|| panic!("{label}: missing RDF_CONTEXT diagnostic"));
    assert_eq!(
        context.code,
        Utf16::from("RDF_CONTEXT"),
        "{label}: context diagnostic must retain predecessor order"
    );
    assert_eq!(
        context.path,
        Utf16::default(),
        "{label}: context diagnostic path"
    );
    assert_eq!(
        context.message.to_utf8().unwrap(),
        RDF_CONTEXT,
        "{label}: exact predecessor context message"
    );
    assert_eq!(
        context.severity,
        umf_core::Severity::Warning,
        "{label}: context diagnostic severity"
    );
}

fn edited_quad(terms: &Json, index: usize) -> Value {
    let mut quad = from_json(&terms[index]);
    let Value::Object(fields) = &mut quad else {
        panic!("fixture quad must be object")
    };
    let object = Value::Object(vec![
        (Utf16::from("kind"), Value::string_utf8("literal")),
        (
            Utf16::from("value"),
            Value::string_utf8("UMF reviewed literal"),
        ),
        (
            Utf16::from("datatype"),
            Value::string_utf8("http://www.w3.org/2001/XMLSchema#string"),
        ),
    ]);
    let (_, target) = fields
        .iter_mut()
        .find(|(key, _)| key == &Utf16::from("object"))
        .unwrap();
    *target = object;
    quad
}

fn expect_export_files(
    result: &Json,
    candidate: &Value,
    export: impl Fn(&Value, &mut Context<'_>) -> Result<Utf16, umf_core::EngineError>,
    label: &str,
) {
    let exports = result["exports"].as_array().unwrap();
    assert!(
        !exports.is_empty(),
        "{label}: corpus edit must have frozen export outcomes"
    );
    for output in exports {
        let expected = fs::read_to_string(root().join(output["path"].as_str().unwrap())).unwrap();
        let actual = export(candidate, &mut Context::ordinary())
            .unwrap()
            .to_utf8()
            .unwrap();
        assert_eq!(
            actual, expected,
            "{label}: edited syntax output differs from frozen fixture {}",
            output["path"]
        );
    }
}

fn expect_export_semantics(
    runtime: &RdfRuntime,
    result: &Json,
    candidate: &Value,
    expected_terms: &Json,
    expected_named_graphs: Option<&Json>,
    export: impl Fn(&Value, &mut Context<'_>) -> Result<Utf16, umf_core::EngineError>,
    import: impl Fn(&str) -> Result<Value, umf_core::EngineError>,
    label: &str,
) {
    for output in result["exports"].as_array().unwrap() {
        let mut ctx = Context::ordinary();
        let source = export(candidate, &mut ctx)
            .unwrap_or_else(|e| panic!("{label}: regenerated syntax: {e}"))
            .to_utf8()
            .unwrap();
        let parsed = import(&source)
            .unwrap_or_else(|e| panic!("{label}: regenerated syntax {} did not parse: {e}", output["path"]));
        let mut ctx = Context::ordinary();
        let terms = rdf::get_rdf_quads(runtime, &parsed, &mut ctx)
            .unwrap_or_else(|e| panic!("{label}: regenerated syntax quad inspection: {e}"));
        let roundtrip_terms = expected_blank_labels_after_syntax_roundtrip(expected_terms);
        assert_term_occurrences(&terms, &roundtrip_terms, label, "regenerated syntax");
        if let Some(expected_graphs) = expected_named_graphs {
            let mut ctx = Context::ordinary();
            let graphs = rdf::get_rdf_named_graphs(runtime, &parsed, &mut ctx)
                .unwrap_or_else(|e| panic!("{label}: regenerated syntax graph inspection: {e}"));
            let roundtrip_graphs = expected_blank_labels_after_syntax_roundtrip(expected_graphs);
            assert_term_occurrences(&graphs, &roundtrip_graphs, label, "regenerated named graphs");
        }
    }
}

#[test]
fn turtle_and_trig_imports_store_repeatable_quad_order() {
    let mut ctx = Context::ordinary();
    let runtime = RdfRuntime::new(&mut ctx).expect("RDF runtime");
    let turtle = "@prefix ex: <https://example.test/> . ex:s ex:p (1 2) .";
    let trig = "@prefix ex: <https://example.test/> . { ex:s ex:p (1 2) . }";
    let turtle_import = |source: &str| {
        rdf::import_rdf_turtle(
            &runtime,
            &source.encode_utf16().collect::<Vec<_>>(),
            &Utf16::from("repeatable-turtle"),
            &Utf16::from("https://example.test/base"),
            None,
            &mut Context::ordinary(),
        )
        .unwrap()
    };
    let trig_import = |source: &str| {
        rdf::import_rdf_trig(
            &runtime,
            &source.encode_utf16().collect::<Vec<_>>(),
            &Utf16::from("repeatable-trig"),
            &Utf16::from("https://example.test/base"),
            None,
            &mut Context::ordinary(),
        )
        .unwrap()
    };
    for (first, second, label) in [
        (turtle_import(turtle), turtle_import(turtle), "Turtle"),
        (trig_import(trig), trig_import(trig), "TriG"),
    ] {
        let mut ctx = Context::ordinary();
        let first_terms = rdf::get_rdf_quads(&runtime, &first, &mut ctx).unwrap();
        let mut ctx = Context::ordinary();
        let second_terms = rdf::get_rdf_quads(&runtime, &second, &mut ctx).unwrap();
        assert_eq!(to_json(&first_terms), to_json(&second_terms), "{label} import order");
        assert_stored_quads(&first, &first_terms, label);
        assert_stored_quads(&second, &second_terms, label);
        let mut ctx = Context::ordinary();
        let first_graphs = rdf::get_rdf_named_graphs(&runtime, &first, &mut ctx).unwrap();
        let mut ctx = Context::ordinary();
        let second_graphs = rdf::get_rdf_named_graphs(&runtime, &second, &mut ctx).unwrap();
        assert_eq!(to_json(&first_graphs), to_json(&second_graphs), "{label} graph order");
        if label == "TriG" {
            assert_stored_named_graphs(&first, &first_graphs, label);
            assert_stored_named_graphs(&second, &second_graphs, label);
        } else {
            assert_eq!(to_json(&first_graphs), Json::Array(Vec::new()));
        }
    }
}

#[test]
fn frozen_nquads_turtle_and_trig_corpora_match_complete_predecessor_outcomes() {
    let mut setup = Context::ordinary();
    let runtime = RdfRuntime::new(&mut setup).expect("single RDF runtime for corpus process");
    let nquads = read_json("fixtures/rdf/nquads/results.json");
    let turtle = read_json("fixtures/rdf/turtle/results.json");
    let trig = read_json("fixtures/rdf/trig/results.json");
    let nquads_hashes = manifest_hashes("native/rdf/sources/manifest.json");
    let turtle_hashes = manifest_hashes("native/rdf/turtle-sources/manifest.json");
    let trig_hashes = manifest_hashes("native/rdf/trig-sources/manifest.json");

    let mut checked = 0usize;
    let mut failures = Vec::new();
    // Each fixture remains independent. Retain bounded failure summaries while
    // testing all pinned inputs; one mismatch must not hide later parser gaps.
    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    for case in nquads["results"].as_array().unwrap() {
        checked += 1;
        let fixture_label = case["id"].as_str().unwrap();
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let label = case["id"].as_str().unwrap();
            let path = case["path"].as_str().unwrap();
            let source =
                fs::read_to_string(root().join(path)).unwrap_or_else(|e| panic!("{label}: {e}"));
            if case["type"] != "authored" {
                assert_source_hash(path, &nquads_hashes, label);
            }
            let mut ctx = Context::ordinary();
            if !case["positive"].as_bool().unwrap() {
                assert!(
                    rdf::import_rdf_nquads(
                        &runtime,
                        &source.encode_utf16().collect::<Vec<_>>(),
                        &Utf16::from(label),
                        None,
                        &mut ctx
                    )
                    .is_err(),
                    "{label}: expected N-Quads refusal"
                );
                return;
            }
            let document = rdf::import_rdf_nquads(
                &runtime,
                &source.encode_utf16().collect::<Vec<_>>(),
                &Utf16::from(label),
                None,
                &mut ctx,
            )
            .unwrap_or_else(|e| panic!("{label}: {e}"));
            let mut ctx = Context::ordinary();
            let terms = rdf::get_rdf_quads(&runtime, &document, &mut ctx).unwrap();
            assert_eq!(
                to_json(&terms),
                case["terms"],
                "{label}: ordered N-Quads terms differ"
            );
            let mut ctx = Context::ordinary();
            assert_context(
                &rdf::inspect_rdf_document(&runtime, &document, &mut ctx).unwrap(),
                label,
            );
            assert_eq!(
                original_source(&document),
                &Utf16::from(source.as_str()),
                "{label}: original source changed"
            );
            let mut ctx = Context::ordinary();
            assert_eq!(
                rdf::export_rdf_nquads(&runtime, &document, None, &mut ctx)
                    .unwrap()
                    .to_utf8()
                    .unwrap(),
                source,
                "{label}: source-preserving N-Quads export"
            );
            let edit_index = case["editIndex"].as_i64().unwrap();
            if edit_index >= 0 {
                let replacement = edited_quad(&case["terms"], edit_index as usize);
                let mut ctx = Context::ordinary();
                let (candidate, _) = rdf::propose_rdf_quad_edit(
                    &runtime,
                    &document,
                    edit_index as usize,
                    &replacement,
                    &mut ctx,
                )
                .unwrap_or_else(|e| panic!("{label}: edit: {e}"));
                expect_export_files(
                    case,
                    &candidate,
                    |candidate, ctx| rdf::export_rdf_nquads(&runtime, candidate, None, ctx),
                    label,
                );
            }
        }));
        if let Err(failure) = outcome {
            let message = failure
                .downcast_ref::<String>()
                .map(String::as_str)
                .or_else(|| failure.downcast_ref::<&str>().copied())
                .unwrap_or("non-string panic");
            failures.push(format!(
                "{fixture_label}: {}",
                message.chars().take(600).collect::<String>()
            ));
        }
    }

    for case in turtle["results"].as_array().unwrap() {
        checked += 1;
        let fixture_label = case["id"].as_str().unwrap();
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let label = case["id"].as_str().unwrap();
            let path = case["path"].as_str().unwrap();
            assert_source_hash(path, &turtle_hashes, label);
            let source =
                fs::read_to_string(root().join(path)).unwrap_or_else(|e| panic!("{label}: {e}"));
            let base = case["baseIRI"].as_str().unwrap();
            let mut ctx = Context::ordinary();
            if !case["positive"].as_bool().unwrap() {
                assert!(
                    rdf::import_rdf_turtle(
                        &runtime,
                        &source.encode_utf16().collect::<Vec<_>>(),
                        &Utf16::from(label),
                        &Utf16::from(base),
                        None,
                        &mut ctx
                    )
                    .is_err(),
                    "{label}: expected Turtle refusal"
                );
                return;
            }
            let document = rdf::import_rdf_turtle(
                &runtime,
                &source.encode_utf16().collect::<Vec<_>>(),
                &Utf16::from(label),
                &Utf16::from(base),
                None,
                &mut ctx,
            )
            .unwrap_or_else(|e| panic!("{label}: {e}"));
            let mut ctx = Context::ordinary();
            let terms = rdf::get_rdf_quads(&runtime, &document, &mut ctx).unwrap();
            assert_term_occurrences(&terms, &case["terms"], label, "Turtle");
            assert_stored_quads(&document, &terms, label);
            let mut ctx = Context::ordinary();
            assert_context(
                &rdf::inspect_rdf_document(&runtime, &document, &mut ctx).unwrap(),
                label,
            );
            assert_eq!(
                original_source(&document),
                &Utf16::from(source.as_str()),
                "{label}: original source changed"
            );
            let mut ctx = Context::ordinary();
            assert_eq!(
                rdf::export_rdf_turtle(&runtime, &document, &mut ctx)
                    .unwrap()
                    .to_utf8()
                    .unwrap(),
                source,
                "{label}: source-preserving Turtle export"
            );
            let mut ctx = Context::ordinary();
            let canonical = rdf::export_rdf_nquads(&runtime, &document, None, &mut ctx)
                .unwrap()
                .to_utf8()
                .unwrap();
            assert_nquad_line_occurrences(
                &canonical,
                &fs::read_to_string(root().join(case["outputPath"].as_str().unwrap())).unwrap(),
                label,
            );
            let edit_index = case["editIndex"].as_i64().unwrap();
            if edit_index >= 0 {
                let terms_json = to_json(&terms);
                let actual_index = matching_occurrence_index(
                    &terms_json,
                    &case["terms"][edit_index as usize],
                    label,
                );
                let replacement = edited_quad(&terms_json, actual_index);
                let mut expected_edited = terms_json.clone();
                expected_edited[actual_index] = to_json(&replacement);
                let mut ctx = Context::ordinary();
                let (candidate, _) = rdf::propose_rdf_quad_edit(
                    &runtime,
                    &document,
                    actual_index,
                    &replacement,
                    &mut ctx,
                )
                .unwrap_or_else(|e| panic!("{label}: edit: {e}"));
                let mut ctx = Context::ordinary();
                let edited_terms = rdf::get_rdf_quads(&runtime, &candidate, &mut ctx).unwrap();
                assert_term_occurrences(&edited_terms, &expected_edited, label, "edited Turtle");
                assert_indexed_edit_preserves_others(&terms_json, &edited_terms, &expected_edited, actual_index, label);
                assert_stored_quads(&candidate, &edited_terms, label);
                expect_export_semantics(
                    &runtime,
                    case,
                    &candidate,
                    &expected_edited,
                    None,
                    |candidate, ctx| rdf::export_rdf_turtle(&runtime, candidate, ctx),
                    |s| rdf::import_rdf_turtle(&runtime, &s.encode_utf16().collect::<Vec<_>>(), &Utf16::from(label), &Utf16::from(base), None, &mut Context::ordinary()),
                    label,
                );
            }
        }));
        if let Err(failure) = outcome {
            let message = failure
                .downcast_ref::<String>()
                .map(String::as_str)
                .or_else(|| failure.downcast_ref::<&str>().copied())
                .unwrap_or("non-string panic");
            failures.push(format!(
                "{fixture_label}: {}",
                message.chars().take(600).collect::<String>()
            ));
        }
    }

    for case in trig["results"].as_array().unwrap() {
        checked += 1;
        let fixture_label = case["id"].as_str().unwrap();
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let label = case["id"].as_str().unwrap();
            let path = case["path"].as_str().unwrap();
            if case["type"] != "authored" {
                assert_source_hash(path, &trig_hashes, label);
            }
            let source =
                fs::read_to_string(root().join(path)).unwrap_or_else(|e| panic!("{label}: {e}"));
            let base = case["baseIRI"].as_str().unwrap();
            let mut ctx = Context::ordinary();
            if !case["positive"].as_bool().unwrap() {
                assert!(
                    rdf::import_rdf_trig(
                        &runtime,
                        &source.encode_utf16().collect::<Vec<_>>(),
                        &Utf16::from(label),
                        &Utf16::from(base),
                        None,
                        &mut ctx
                    )
                    .is_err(),
                    "{label}: expected TriG refusal"
                );
                return;
            }
            let document = rdf::import_rdf_trig(
                &runtime,
                &source.encode_utf16().collect::<Vec<_>>(),
                &Utf16::from(label),
                &Utf16::from(base),
                None,
                &mut ctx,
            )
            .unwrap_or_else(|e| panic!("{label}: {e}"));
            let mut ctx = Context::ordinary();
            let terms = rdf::get_rdf_quads(&runtime, &document, &mut ctx).unwrap();
            assert_term_occurrences(&terms, &case["terms"], label, "TriG");
            assert_stored_quads(&document, &terms, label);
            let mut ctx = Context::ordinary();
            let graphs = rdf::get_rdf_named_graphs(&runtime, &document, &mut ctx).unwrap();
            assert_term_occurrences(&graphs, &case["namedGraphs"], label, "named graph inventory");
            assert_stored_named_graphs(&document, &graphs, label);
            let mut ctx = Context::ordinary();
            assert_context(
                &rdf::inspect_rdf_document(&runtime, &document, &mut ctx).unwrap(),
                label,
            );
            assert_eq!(
                original_source(&document),
                &Utf16::from(source.as_str()),
                "{label}: original source changed"
            );
            let mut ctx = Context::ordinary();
            assert_eq!(
                rdf::export_rdf_trig(&runtime, &document, &mut ctx)
                    .unwrap()
                    .to_utf8()
                    .unwrap(),
                source,
                "{label}: source-preserving TriG export"
            );
            if let Some(nquads_path) = case["nquadsPath"].as_str() {
                let mut ctx = Context::ordinary();
                let canonical = rdf::export_rdf_nquads(&runtime, &document, None, &mut ctx)
                        .unwrap()
                        .to_utf8()
                        .unwrap();
                assert_nquad_line_occurrences(
                    &canonical,
                    &fs::read_to_string(root().join(nquads_path)).unwrap(),
                    label,
                );
            } else {
                let mut ctx = Context::ordinary();
                assert!(
                    rdf::export_rdf_nquads(&runtime, &document, None, &mut ctx).is_err(),
                    "{label}: empty named graph loss must be refused"
                );
            }
            let edit_index = case["editIndex"].as_i64().unwrap();
            if edit_index >= 0 {
                let terms_json = to_json(&terms);
                let actual_index = matching_occurrence_index(
                    &terms_json,
                    &case["terms"][edit_index as usize],
                    label,
                );
                let replacement = edited_quad(&terms_json, actual_index);
                let mut expected_edited = terms_json.clone();
                expected_edited[actual_index] = to_json(&replacement);
                let mut ctx = Context::ordinary();
                let (candidate, _) = rdf::propose_rdf_quad_edit(
                    &runtime,
                    &document,
                    actual_index,
                    &replacement,
                    &mut ctx,
                )
                .unwrap_or_else(|e| panic!("{label}: edit: {e}"));
                let mut ctx = Context::ordinary();
                let edited_terms = rdf::get_rdf_quads(&runtime, &candidate, &mut ctx).unwrap();
                assert_term_occurrences(&edited_terms, &expected_edited, label, "edited TriG");
                assert_indexed_edit_preserves_others(&terms_json, &edited_terms, &expected_edited, actual_index, label);
                assert_stored_quads(&candidate, &edited_terms, label);
                let mut ctx = Context::ordinary();
                let edited_graphs = rdf::get_rdf_named_graphs(&runtime, &candidate, &mut ctx).unwrap();
                assert_term_occurrences(&edited_graphs, &case["namedGraphs"], label, "edited named graph inventory");
                assert_stored_named_graphs(&candidate, &edited_graphs, label);
                expect_export_semantics(
                    &runtime,
                    case,
                    &candidate,
                    &expected_edited,
                    Some(&case["namedGraphs"]),
                    |candidate, ctx| rdf::export_rdf_trig(&runtime, candidate, ctx),
                    |s| rdf::import_rdf_trig(&runtime, &s.encode_utf16().collect::<Vec<_>>(), &Utf16::from(label), &Utf16::from(base), None, &mut Context::ordinary()),
                    label,
                );
            }
        }));
        if let Err(failure) = outcome {
            let message = failure
                .downcast_ref::<String>()
                .map(String::as_str)
                .or_else(|| failure.downcast_ref::<&str>().copied())
                .unwrap_or("non-string panic");
            failures.push(format!(
                "{fixture_label}: {}",
                message.chars().take(600).collect::<String>()
            ));
        }
    }
    std::panic::set_hook(previous_hook);
    eprintln!("RDF corpus: {checked} cases, {} failures; first 20:\n{}", failures.len(), failures.iter().take(20).cloned().collect::<Vec<_>>().join("\n"));
    assert_eq!(checked, 759, "87 official + 1 authored N-Quads, 313 Turtle and 358 TriG cases must execute");
    assert!(
        failures.is_empty(),
        "{} of {checked} RDF cases failed; first 20:\n{}",
        failures.len(),
        failures
            .iter()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}
