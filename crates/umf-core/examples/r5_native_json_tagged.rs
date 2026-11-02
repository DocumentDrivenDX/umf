// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{native_json::NativeJsonTree, Context};

fn main() {
    let source = r#"{"z":1.2300,"10":-0,"2":"\ud800","x":[true,null]}"#;
    let tree = NativeJsonTree::parse_json(
        &source.encode_utf16().collect::<Vec<_>>(),
        &mut Context::ordinary(),
    )
    .expect("native JSON fixture parses");
    let tagged = tree
        .render_tagged(&mut Context::ordinary())
        .expect("tagged fixture renders");
    println!(
        "{}",
        tagged
            .to_utf8()
            .expect("tag output is ASCII-safe for isolated surrogates")
    );
}
