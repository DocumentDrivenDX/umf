// SPDX-License-Identifier: MIT OR Apache-2.0
//! Line-oriented driver used only by the independent RFC3339 oracle.
use std::io::{self, BufRead};

use umf_core::{rfc3339_exact_instant::parse_rfc3339_exact_instant, Value};

fn main() {
    for line in io::stdin().lock().lines() {
        let token = line.expect("read input line");
        match parse_rfc3339_exact_instant(&Value::string_utf8(&token)) {
            Ok(parsed) => println!(
                "OK|{}|{}|{}|{}|{}",
                token,
                parsed.utc_seconds(),
                parsed.fractional_digits(),
                parsed.original_offset(),
                parsed.local_offset_known()
            ),
            Err(error) => println!("{}", error.name()),
        }
    }
}
