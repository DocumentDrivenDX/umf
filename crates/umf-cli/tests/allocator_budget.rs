// SPDX-License-Identifier: MIT OR Apache-2.0
#![cfg(feature = "allocator-test")]

use std::process::Command;

fn worker(args: &[&str], cap: &str, probe: Option<&str>) -> std::process::Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_umf"));
    command
        .args(args)
        .env("UMF_TEST_RUST_ALLOC_CAP", cap)
        .env("PATH", "");
    if let Some(size) = probe {
        command.env("UMF_TEST_RUST_ALLOC_PROBE", size);
    }
    command.output().unwrap()
}

#[test]
fn disposable_codegen_child_exits_with_dedicated_budget_status() {
    let output = worker(
        &["codegen", "__allocator_probe"],
        &((64 * 1024 * 1024u64).to_string()),
        Some(&(80 * 1024 * 1024usize).to_string()),
    );
    assert_eq!(output.status.code(), Some(73));
    assert!(output.stdout.is_empty());
}

#[test]
fn codegen_runs_with_budget_enabled_below_the_cap() {
    let output = worker(
        &["codegen", "--version"],
        &((64 * 1024 * 1024u64).to_string()),
        None,
    );
    assert_eq!(
        output.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(String::from_utf8_lossy(&output.stdout).contains("umf.codegen-cli/1"));
}

#[test]
fn non_codegen_invocation_does_not_enable_or_apply_test_cap() {
    let output = worker(&["--unknown"], "1", None);
    assert_eq!(output.status.code(), Some(2));
}
