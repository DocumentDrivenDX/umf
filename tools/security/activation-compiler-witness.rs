//! Calls the actual owner compiler; this witness neither installs nor authorizes.
use std::io::{Read, Write};
use serde_json::Value;
use weft_core::{compile::Compiler, error::Diagnostic};

fn main() {
    let mut bytes = Vec::new();
    std::io::stdin().take(16_777_217).read_to_end(&mut bytes).unwrap();
    assert!(bytes.len() <= 16_777_216, "Witness input bound");
    let request: Value = serde_json::from_slice(&bytes).unwrap();
    let mut invoked = false;
    let response = Compiler::default().compile_json_with_factory(
        &request.to_string(),
        &mut |_, _, _| {
            invoked = true;
            Err(Diagnostic::new("UMF-WITNESS-FACTORY", "composition", "Observed backend factory boundary"))
        },
    );
    let response: Value = serde_json::from_str(&response).unwrap();
    let result = serde_json::json!({"backendFactoryInvoked": invoked, "response": response});
    writeln!(std::io::stdout(), "{result}").unwrap();
}
