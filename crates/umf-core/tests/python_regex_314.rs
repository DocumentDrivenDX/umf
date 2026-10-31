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
fn independent_cpython_314_regex_corpus() {
    let source = include_str!("fixtures/cpython-re/outcomes-3.14.tsv");
    let mut rows = 0;
    let mut failures = Vec::new();
    for (line_number, line) in source.lines().enumerate() {
        let fields = line.split('\t').collect::<Vec<_>>();
        assert_eq!(fields.len(), 6, "bad 3.14 oracle row {}", line_number + 1);
        rows += 1;
        let pattern = codepoints(fields[3]);
        let text = codepoints(fields[4]);
        match fields[0] {
            "E" => {
                if PythonRegex::compile_codepoints(&pattern, PythonReVersion::V3_14).is_ok() {
                    failures.push(format!("row {} unexpectedly compiled", line_number + 1));
                }
            }
            "N" | "M" => match PythonRegex::compile_codepoints(&pattern, PythonReVersion::V3_14) {
                Err(error) => failures.push(format!(
                    "row {} unexpectedly rejected: {}",
                    line_number + 1,
                    error.message()
                )),
                Ok(regex) => {
                    let actual = regex.find_from_codepoints(&text, 0);
                    let expected = if fields[0] == "N" {
                        None
                    } else {
                        Some((fields[1].parse().unwrap(), fields[2].parse().unwrap()))
                    };
                    if actual != expected {
                        failures.push(format!(
                            "row {} ({}) span: actual={actual:?} expected={expected:?}",
                            line_number + 1,
                            fields[5]
                        ));
                    }
                }
            },
            other => panic!("unknown oracle status {other}"),
        }
    }
    assert_eq!(rows, 412, "independent CPython 3.14 oracle row count");
    assert!(
        failures.is_empty(),
        "{} CPython 3.14 regex mismatches:\n{}",
        failures.len(),
        failures
            .iter()
            .take(100)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}
