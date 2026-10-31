use crate::context::TransportUsage;
use crate::{Context, Utf16, Value};

use super as protocol;

#[test]
fn async_parser_continuation_rejects_wrong_ast_version_and_is_single_use() {
    let mut session = protocol::ParserSession::default();
    let mut context = Context::ordinary();
    let (token, request) = session
        .prepare_parse(
            Utf16::from("SELECT 1"),
            Value::Null,
            TransportUsage::default(),
            &mut context,
        )
        .unwrap();
    assert_eq!(request.ast_version, 170004);
    let invalid = Value::Object(vec![
        (Utf16::from("version"), Value::Number(170005.0)),
        (Utf16::from("stmts"), Value::Array(Vec::new())),
    ]);
    let error = session
        .complete(
            token,
            protocol::ParserResponse::Parsed { tree: invalid },
            &mut Context::ordinary(),
        )
        .unwrap_err();
    assert_eq!(error.code, "POSTGRESQL_AST_VERSION");
    let repeated = session
        .complete(
            token,
            protocol::ParserResponse::Parsed { tree: Value::Null },
            &mut Context::ordinary(),
        )
        .unwrap_err();
    assert_eq!(repeated.code, "POSTGRESQL_PARSER_TOKEN");
}
