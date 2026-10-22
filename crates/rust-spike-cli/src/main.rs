use std::io::{self, BufRead};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_REQUEST_BYTES: usize = 8 * 1024 * 1024;

enum LineError { Capacity, InvalidUtf8 }

fn main() {
    let stdin = io::stdin();
    let mut reader = stdin.lock();
    loop {
        let line = match read_bounded_line(&mut reader) {
            Ok(Some(line)) => line,
            Ok(None) => break,
            Err(error) => {
                eprintln!("failed to read request: {error}");
                std::process::exit(2);
            }
        };
        match line {
            Ok(request) => println!("{}", umf_rust_spike_core::run_with_clock(&request, now_ms, None)),
            Err(LineError::Capacity) => println!("{}", r#"{"ok":false,"code":"CAPACITY","complete":false,"message":"Request exceeds the 8 MiB R1 input capacity","diagnostics":[{"code":"CAPACITY","path":"","severity":"error","message":"Request exceeds the 8 MiB R1 input capacity"}]}"#),
            Err(LineError::InvalidUtf8) => println!("{}", r#"{"ok":false,"code":"INVALID_REQUEST","complete":false,"message":"JSONL request must be UTF-8","diagnostics":[{"code":"INVALID_REQUEST","path":"","severity":"error","message":"JSONL request must be UTF-8"}]}"#),
        }
    }
}

/// Reads one JSONL request while retaining at most the engine's input capacity.
/// Oversized lines are drained without allocating their remaining contents.
fn read_bounded_line(reader: &mut impl BufRead) -> io::Result<Option<Result<String, LineError>>> {
    let mut bytes = Vec::new();
    let mut oversized = false;
    let mut received = false;
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            if !received { return Ok(None); }
            break;
        }
        received = true;
        let newline = available.iter().position(|byte| *byte == b'\n');
        let consumed = newline.map_or(available.len(), |index| index + 1);
        let segment = &available[..newline.unwrap_or(available.len())];
        if !oversized {
            if bytes.len().saturating_add(segment.len()) > MAX_REQUEST_BYTES {
                oversized = true;
                bytes.clear();
            } else {
                bytes.extend_from_slice(segment);
            }
        }
        reader.consume(consumed);
        if newline.is_some() { break; }
    }
    if oversized { return Ok(Some(Err(LineError::Capacity))); }
    if bytes.last() == Some(&b'\r') { bytes.pop(); }
    Ok(Some(String::from_utf8(bytes).map_err(|_| LineError::InvalidUtf8)))
}

fn now_ms() -> Option<u64> {
    SystemTime::now().duration_since(UNIX_EPOCH).ok().map(|duration| duration.as_millis() as u64)
}
