// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{PythonReVersion, PythonRegex};

fn codepoints(value: &str) -> Vec<u32> {
    if value.is_empty() {
        Vec::new()
    } else {
        value.split(',').map(|item| item.parse().unwrap()).collect()
    }
}

#[test]
fn independent_cpython_hex_escape_corpus_all_profiles() {
    let source = include_str!("fixtures/cpython-re/independent-hex-outcomes.tsv");
    let mut failures = Vec::new();
    let mut rows = 0usize;
    for line in source.lines() {
        let fields = line.split('\t').collect::<Vec<_>>();
        assert_eq!(fields.len(), 7, "bad fixture row {line:?}");
        rows += 1;
        let (version, label) = match fields[0] {
            "11" => (PythonReVersion::V3_11, "3.11"),
            "12" => (PythonReVersion::V3_12, "3.12"),
            "13" => (PythonReVersion::V3_13, "3.13"),
            "14" => (PythonReVersion::V3_14, "3.14"),
            other => panic!("unknown Python minor {other}"),
        };
        let pattern = codepoints(fields[6]);
        let compiled = PythonRegex::compile_codepoints(&pattern, version);
        if fields[3] == "E" {
            if compiled.is_ok() {
                failures.push(format!("{label} {} compiled unexpectedly", fields[1]));
            }
        } else if compiled.is_err() {
            failures.push(format!("{label} {} failed to compile", fields[1]));
        }
    }
    assert_eq!(rows, 2_022 * 4, "independent hex outcome row count");
    assert!(
        failures.is_empty(),
        "{} independent CPython hex mismatches; first 100:\n{}",
        failures.len(),
        failures
            .iter()
            .take(100)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}
