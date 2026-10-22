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
fn independent_cpython_info_prefilter_corpus_all_profiles() {
    let source = include_str!("fixtures/cpython-re/independent-info-outcomes.tsv");
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
            other => panic!("unknown Python minor {other}"),
        };
        let pattern = codepoints(fields[6]);
        let regex = PythonRegex::compile_codepoints(&pattern, version);
        if fields[3] == "E" {
            if regex.is_ok() {
                failures.push(format!("{label} {} compiled unexpectedly", fields[1]));
            }
            continue;
        }
        let Ok(regex) = regex else {
            failures.push(format!("{label} {} failed to compile", fields[1]));
            continue;
        };
        let text = codepoints(fields[5]);
        let expected = if fields[4] == "-" {
            None
        } else {
            let (start, end) = fields[4].split_once(',').unwrap();
            Some((start.parse().unwrap(), end.parse().unwrap()))
        };
        let actual = regex.find_from_codepoints(&text, 0);
        if actual != expected {
            failures.push(format!(
                "{label} {} span: actual={actual:?} expected={expected:?}",
                fields[1]
            ));
        }
    }
    assert_eq!(rows, 15_120 * 3, "independent INFO outcome row count");
    assert!(
        failures.is_empty(),
        "{} independent CPython INFO mismatches; first 100:\n{}",
        failures.len(),
        failures
            .iter()
            .take(100)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}
