// SPDX-License-Identifier: MIT OR Apache-2.0
use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn hard_isolated_refuses_before_reading_stdin() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["core", "--stdin-wire", "--profile", "hard-isolated"])
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    // Keep stdin open: an implementation that reads before refusing will block.
    let input = child.stdin.take().unwrap();
    let started = std::time::Instant::now();
    while child.try_wait().unwrap().is_none() {
        if started.elapsed() > std::time::Duration::from_secs(5) {
            child.kill().unwrap();
            let _ = child.wait();
            panic!("HardIsolated attempted to read stdin before refusal");
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    let output = child.wait_with_output().unwrap();
    drop(input);
    assert!(output.status.success());
    assert!(String::from_utf8(output.stdout)
        .unwrap()
        .contains("RESOURCE_PROFILE_UNAVAILABLE"));
}

#[test]
fn invalid_utf8_transport_is_refused_without_replacement() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_umf"))
        .args(["core", "--stdin-wire"])
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(&[0xff, 0x0a])
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert!(String::from_utf8(output.stdout)
        .unwrap()
        .contains("SOURCE_ENCODING"));
}
