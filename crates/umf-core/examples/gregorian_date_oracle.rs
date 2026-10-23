// SPDX-License-Identifier: MIT OR Apache-2.0
//! Line-oriented driver used only by the independent Gregorian date oracle.
use std::io::{self, BufRead};

use umf_core::{gregorian_date::parse_gregorian_date, Value};

fn main() {
    for line in io::stdin().lock().lines() {
        let line = line.expect("read input line");
        let token = line.strip_suffix('\r').unwrap_or(&line);
        match parse_gregorian_date(&Value::string_utf8(token)) {
            Ok(date) => println!(
                "OK|{}|{}|{}|{}",
                token,
                date.year(),
                date.month(),
                date.day()
            ),
            Err(error) => println!("{}", error.name()),
        }
    }
}
