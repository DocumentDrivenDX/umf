// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{PythonReVersion, PythonRegex};

fn codepoints(value: &str) -> Vec<u32> {
    if value.is_empty() {
        return Vec::new();
    }
    value
        .split(',')
        .map(|item| item.parse().expect("decimal codepoint"))
        .collect()
}

#[test]
fn independent_cpython_311_literal_corpus_all_profiles() {
    let source = include_str!("fixtures/cpython-re/independent-outcomes.tsv");
    let mut failures = Vec::new();
    let mut rows = 0usize;
    for line in source.lines() {
        let fields = line.split('\t').collect::<Vec<_>>();
        assert_eq!(fields.len(), 7, "bad fixture row {line:?}");
        rows += 1;
        let (key, version) = match fields[0] {
            "11" => ("3.11", PythonReVersion::V3_11),
            "12" => ("3.12", PythonReVersion::V3_12),
            "13" => ("3.13", PythonReVersion::V3_13),
            "14" => ("3.14", PythonReVersion::V3_14),
            other => panic!("unknown Python minor {other}"),
        };
        let case_id = fields[1];
        let operation = fields[2];
        let status = fields[3];
        let pattern = codepoints(fields[6]);
        let actual = PythonRegex::compile_codepoints(&pattern, version);
        if status == "E" {
            if actual.is_ok() {
                failures.push(format!("{key} {case_id} compiled unexpectedly"));
            }
            continue;
        }
        let Ok(regex) = actual else {
            failures.push(format!("{key} {case_id} compile unexpectedly failed"));
            continue;
        };
        if status != "M" && status != "N" {
            panic!("unknown oracle status {status}");
        }
        if operation == "search" {
            let text = codepoints(fields[5]);
            let span = if fields[4] == "-" {
                None
            } else {
                let (start, end) = fields[4].split_once(',').expect("span");
                Some((start.parse().unwrap(), end.parse().unwrap()))
            };
            let actual_span = regex.find_from_codepoints(&text, 0);
            if actual_span != span {
                failures.push(format!(
                    "{key} {case_id} span: actual={actual_span:?} expected={span:?}"
                ));
            }
        }
    }
    assert_eq!(rows, 6_372 * 4, "independent outcome row count");
    if !failures.is_empty() {
        panic!(
            "{} independent CPython mismatches; first 80:\n{}",
            failures.len(),
            failures
                .iter()
                .take(300)
                .cloned()
                .collect::<Vec<_>>()
                .join("\n")
        );
    }
}
