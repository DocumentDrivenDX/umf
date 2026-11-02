//! Bounded SQL Server type/check/predicate interpretation shared by core and wire.
use super::*;

fn scalar_int(node: Option<&NativeJsonNode>) -> Option<i64> {
    let NativeJsonNode::Number(token) = node? else {
        return None;
    };
    if !exact_safe_integer(token) {
        return None;
    }
    token.parse::<f64>().ok().map(|value| value as i64)
}
fn scalar_text(node: Option<&NativeJsonNode>) -> Option<String> {
    utf8(node)
}
fn facet_type_meaning(
    native: &NativeJsonNode,
) -> Result<(Option<Value>, Option<&'static str>), EngineError> {
    let NativeJsonNode::Object(_) = native else {
        return Ok((None, Some("Expected catalog column metadata")));
    };
    let name = scalar_text(field(native, "type_name"));
    let system = scalar_int(field(native, "system_type_id"));
    let user = scalar_int(field(native, "user_type_id"));
    let length = scalar_int(field(native, "max_length"));
    let precision = scalar_int(field(native, "precision"));
    let scale = scalar_int(field(native, "scale"));
    if scalar_text(field(native, "type_schema")).as_deref() != Some("sys")
        || !matches!(
            field(native, "is_user_defined"),
            Some(NativeJsonNode::Boolean(false))
        )
        || !matches!(
            field(native, "is_assembly_type"),
            Some(NativeJsonNode::Boolean(false))
        )
        || system.is_none()
        || user != system
        || scalar_text(field(native, "base_type_name")) != name
    {
        return Ok((
            None,
            Some(
                "Only direct, coherent sys scalar base types are decoded; alias and CLR meaning stays native",
            ),
        ));
    }
    let (Some(length), Some(precision), Some(scale)) = (length, precision, scale) else {
        return Ok((
            None,
            Some("Native sizes must be exact supported catalog integers"),
        ));
    };
    let char_type = matches!(
        name.as_deref(),
        Some("varchar" | "char" | "nvarchar" | "nchar")
    );
    if !char_type && !matches!(field(native, "collation_name"), Some(NativeJsonNode::Null)) {
        return Ok((
            None,
            Some("Non-character scalar metadata must have null collation"),
        ));
    }
    let integer = match name.as_deref() {
        Some("tinyint") => Some((48, 1, 3, 8, false)),
        Some("smallint") => Some((52, 2, 5, 16, true)),
        Some("int") => Some((56, 4, 10, 32, true)),
        Some("bigint") => Some((127, 8, 19, 64, true)),
        _ => None,
    };
    if let Some((id, bytes, digits, bits, signed)) = integer {
        if system == Some(id) && length == bytes && precision == digits && scale == 0 {
            return Ok((
                Some(obj(vec![
                    ("family", Value::string_utf8("integer")),
                    ("bits", Value::Number(bits as f64)),
                    ("signed", Value::Bool(signed)),
                ])),
                None,
            ));
        }
    }
    if matches!(
        (name.as_deref(), system),
        (Some("decimal"), Some(106)) | (Some("numeric"), Some(108))
    ) && (1..=38).contains(&precision)
        && (0..=precision).contains(&scale)
        && length
            == if precision <= 9 {
                5
            } else if precision <= 19 {
                9
            } else if precision <= 28 {
                13
            } else {
                17
            }
    {
        return Ok((
            Some(obj(vec![
                ("family", Value::string_utf8("decimal")),
                ("precision", Value::Number(precision as f64)),
                ("scale", Value::Number(scale as f64)),
                ("inputRounding", Value::string_utf8("session-dependent")),
            ])),
            None,
        ));
    }
    if scale == 0
        && matches!(
            (name.as_deref(), system, precision, length),
            (Some("real"), Some(59), 24, 4) | (Some("float"), Some(62), 53, 8)
        )
    {
        let bits = if name.as_deref() == Some("real") {
            32.0
        } else {
            64.0
        };
        return Ok((
            Some(obj(vec![
                ("family", Value::string_utf8("float")),
                ("bits", Value::Number(bits)),
                (
                    "mantissaBits",
                    Value::Number(if bits == 32.0 { 24.0 } else { 53.0 }),
                ),
            ])),
            None,
        ));
    }
    let character = match name.as_deref() {
        Some("varchar") => Some(167),
        Some("char") => Some(175),
        Some("nvarchar") => Some(231),
        Some("nchar") => Some(239),
        _ => None,
    };
    if character.is_some_and(|id| system == Some(id)) && precision == 0 && scale == 0 {
        let unicode = matches!(name.as_deref(), Some("nvarchar" | "nchar"));
        let fixed = matches!(name.as_deref(), Some("char" | "nchar"));
        let collation = scalar_text(field(native, "collation_name"));
        if collation.as_deref().is_none_or(str::is_empty)
            || length == -1 && fixed
            || length != -1 && (length < 1 || length > 8000 || unicode && length % 2 != 0)
        {
            return Ok((
                None,
                Some("Unsupported character size or missing collation"),
            ));
        }
        let max = length == -1;
        let family = if unicode {
            "utf16-code-units"
        } else {
            "collation-dependent"
        };
        return Ok((
            Some(obj(vec![
                ("family", Value::string_utf8("string")),
                (
                    "size",
                    Value::string_utf8(if max { "max" } else { "bounded" }),
                ),
                (
                    "maxBytes",
                    if max {
                        Value::Null
                    } else {
                        Value::Number(length as f64)
                    },
                ),
                (
                    "maxUtf16Units",
                    if unicode && !max {
                        Value::Number((length / 2) as f64)
                    } else {
                        Value::Null
                    },
                ),
                ("representation", Value::string_utf8(family)),
                (
                    "padding",
                    Value::string_utf8(if fixed { "fixed" } else { "variable" }),
                ),
                ("collation", Value::string_utf8(collation.unwrap())),
            ])),
            None,
        ));
    }
    let binary = match name.as_deref() {
        Some("binary") => Some((173, true)),
        Some("varbinary") => Some((165, false)),
        _ => None,
    };
    if let Some((id, fixed)) = binary {
        if system == Some(id) && precision == 0 && scale == 0 {
            if length == -1 && fixed || length != -1 && (length < 1 || length > 8000) {
                return Ok((None, Some("Unsupported binary size")));
            }
            let max = length == -1;
            return Ok((
                Some(obj(vec![
                    ("family", Value::string_utf8("binary")),
                    (
                        "size",
                        Value::string_utf8(if max { "max" } else { "bounded" }),
                    ),
                    (
                        "maxBytes",
                        if max {
                            Value::Null
                        } else {
                            Value::Number(length as f64)
                        },
                    ),
                    (
                        "padding",
                        Value::string_utf8(if fixed { "fixed" } else { "variable" }),
                    ),
                ])),
                None,
            ));
        }
    }
    Ok((
        None,
        Some(
            "Native type identity, precision, scale or storage size is outside the qualified decoding subset",
        ),
    ))
}

pub fn inspect_sqlserver_facet_type(
    input: &Value,
    ctx: &mut CoreContext<'_>,
) -> Result<Value, EngineError> {
    let native = crate::copy_json(input, ctx)?;
    let tree = NativeJsonTree::from_tagged_value(input, ctx)?;
    let (meaning, reason) = facet_type_meaning(tree.root())?;
    let mut fields = vec![
        (key("native"), native),
        (
            key("state"),
            Value::string_utf8(if meaning.is_some() {
                "observed"
            } else {
                "unsupported"
            }),
        ),
    ];
    if let Some(meaning) = meaning {
        fields.push((key("meaning"), meaning));
    }
    if let Some(reason) = reason {
        fields.push((key("reason"), Value::string_utf8(reason)));
    }
    Ok(Value::Object(fields))
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum TokenKind {
    Word,
    Identifier,
    Number,
    String,
    Punct,
}
#[derive(Clone, Debug)]
struct Token {
    kind: TokenKind,
    value: String,
}
fn tokenize_sql(text: &str) -> Option<Vec<Token>> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut at = 0;
    while at < chars.len() {
        let c = chars[at];
        if c.is_ascii_whitespace() {
            at += 1;
            continue;
        }
        if out.len() >= 4096 || c == '-' && chars.get(at + 1) == Some(&'-') {
            return None;
        }
        if c == '[' {
            at += 1;
            let mut value = String::new();
            let mut closed = false;
            while at < chars.len() {
                if chars[at] == ']' {
                    if chars.get(at + 1) == Some(&']') {
                        value.push(']');
                        at += 2;
                        continue;
                    }
                    at += 1;
                    closed = true;
                    break;
                }
                value.push(chars[at]);
                at += 1;
            }
            if !closed || value.is_empty() {
                return None;
            }
            out.push(Token {
                kind: TokenKind::Identifier,
                value,
            });
            continue;
        }
        if (c == 'N' || c == 'n') && chars.get(at + 1) == Some(&'\'') {
            at += 2;
            let mut value = String::new();
            let mut closed = false;
            while at < chars.len() {
                if chars[at] == '\'' {
                    if chars.get(at + 1) == Some(&'\'') {
                        value.push('\'');
                        at += 2;
                        continue;
                    }
                    at += 1;
                    closed = true;
                    break;
                }
                value.push(chars[at]);
                at += 1;
            }
            if !closed {
                return None;
            }
            out.push(Token {
                kind: TokenKind::String,
                value,
            });
            continue;
        }
        if c.is_ascii_alphabetic() || c == '_' {
            let start = at;
            at += 1;
            while at < chars.len() && (chars[at].is_ascii_alphanumeric() || chars[at] == '_') {
                at += 1;
            }
            out.push(Token {
                kind: TokenKind::Word,
                value: chars[start..at].iter().collect(),
            });
            continue;
        }
        if c.is_ascii_digit() {
            let start = at;
            at += 1;
            while at < chars.len() && chars[at].is_ascii_digit() {
                at += 1;
            }
            if at - start > 1 && chars[start] == '0' {
                return None;
            }
            if at < chars.len() && chars[at] == '.' {
                at += 1;
                let fraction = at;
                while at < chars.len() && chars[at].is_ascii_digit() {
                    at += 1;
                }
                if fraction == at {
                    return None;
                }
            }
            let value: String = chars[start..at].iter().collect();
            if value.len() > 4096 {
                return None;
            }
            out.push(Token {
                kind: TokenKind::Number,
                value,
            });
            continue;
        }
        let pair = if at + 1 < chars.len() {
            Some(chars[at..at + 2].iter().collect::<String>())
        } else {
            None
        };
        if matches!(pair.as_deref(), Some(">=" | "<=")) {
            out.push(Token {
                kind: TokenKind::Punct,
                value: pair.unwrap(),
            });
            at += 2;
            continue;
        }
        if "(),=+-".contains(c) {
            out.push(Token {
                kind: TokenKind::Punct,
                value: c.to_string(),
            });
            at += 1;
            continue;
        }
        return None;
    }
    Some(out)
}

#[derive(Clone, Debug)]
enum Expr {
    Column(String),
    Number(String),
    String(String),
    Call(String, Vec<Expr>),
    Binary(String, Box<Expr>, Box<Expr>),
}
fn parse_sql(tokens: &[Token]) -> Option<Expr> {
    fn expression(tokens: &[Token], at: &mut usize, min: u8, depth: usize) -> Option<Expr> {
        if depth > 64 {
            return None;
        }
        let token = tokens.get(*at)?.clone();
        *at += 1;
        let mut left = match token.kind {
            TokenKind::Punct if token.value == "(" => {
                let e = expression(tokens, at, 0, depth + 1)?;
                if tokens.get(*at)?.value != ")" {
                    return None;
                }
                *at += 1;
                e
            }
            TokenKind::Punct if token.value == "-" => {
                let e = expression(tokens, at, 4, depth + 1)?;
                match e {
                    Expr::Number(value) if !value.starts_with('-') => {
                        Expr::Number(format!("-{value}"))
                    }
                    _ => return None,
                }
            }
            TokenKind::Number => Expr::Number(token.value),
            TokenKind::String => Expr::String(token.value),
            TokenKind::Identifier => Expr::Column(token.value),
            TokenKind::Word => {
                if tokens
                    .get(*at)
                    .is_some_and(|t| t.kind == TokenKind::Punct && t.value == "(")
                {
                    *at += 1;
                    let mut args = Vec::new();
                    if !tokens.get(*at).is_some_and(|t| t.value == ")") {
                        loop {
                            if args.len() >= 3 {
                                return None;
                            }
                            args.push(expression(tokens, at, 0, depth + 1)?);
                            if !tokens.get(*at).is_some_and(|t| t.value == ",") {
                                break;
                            }
                            *at += 1;
                        }
                    }
                    if !tokens.get(*at).is_some_and(|t| t.value == ")") {
                        return None;
                    }
                    *at += 1;
                    Expr::Call(token.value.to_ascii_lowercase(), args)
                } else {
                    Expr::Column(token.value)
                }
            }
            _ => return None,
        };
        loop {
            let Some(next) = tokens.get(*at) else { break };
            let operator = if next.kind == TokenKind::Word && next.value.eq_ignore_ascii_case("AND")
            {
                "AND"
            } else if next.kind == TokenKind::Punct {
                next.value.as_str()
            } else {
                ""
            };
            let priority = if operator == "AND" {
                1
            } else if matches!(operator, ">=" | "<=" | "=") {
                2
            } else if matches!(operator, "+" | "-") {
                3
            } else {
                0
            };
            if priority == 0 || priority < min {
                break;
            }
            let op = operator.to_owned();
            *at += 1;
            let right = expression(tokens, at, priority + 1, depth + 1)?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
        Some(left)
    }
    let mut at = 0;
    let value = expression(tokens, &mut at, 0, 0)?;
    if at == tokens.len() {
        Some(value)
    } else {
        None
    }
}

#[derive(Clone, Debug)]
enum Candidate {
    Bound {
        operator: String,
        literal: String,
    },
    Length {
        measure: String,
        operator: String,
        limit: String,
    },
    Scale {
        scale: String,
    },
}
impl Candidate {
    fn value(&self) -> Value {
        match self {
            Candidate::Bound { operator, literal } => obj(vec![
                ("kind", Value::string_utf8("bound")),
                ("operator", Value::string_utf8(operator)),
                ("literal", Value::string_utf8(literal)),
            ]),
            Candidate::Length {
                measure,
                operator,
                limit,
            } => obj(vec![
                ("kind", Value::string_utf8("length")),
                ("measure", Value::string_utf8(measure)),
                ("operator", Value::string_utf8(operator)),
                ("limit", Value::string_utf8(limit)),
            ]),
            Candidate::Scale { scale } => obj(vec![
                ("kind", Value::string_utf8("scale")),
                ("functionName", Value::string_utf8("round")),
                ("scale", Value::string_utf8(scale)),
                ("truncate", Value::Bool(true)),
            ]),
        }
    }
}
fn column_is(expr: &Expr, name: &str) -> bool {
    matches!(expr,Expr::Column(value) if value==name)
}
fn unsigned(expr: &Expr) -> Option<&str> {
    if let Expr::Number(value) = expr {
        if value.bytes().all(|b| b.is_ascii_digit())
            && (!value.is_empty())
            && (!value.starts_with('0') || value == "0")
        {
            Some(value)
        } else {
            None
        }
    } else {
        None
    }
}
fn predicate_term(expr: &Expr, column: &str) -> Option<Candidate> {
    let Expr::Binary(op, left, right) = expr else {
        return None;
    };
    if matches!(op.as_str(), ">=" | "<=") && column_is(left, column) {
        if let Expr::Number(value) = right.as_ref() {
            return Some(Candidate::Bound {
                operator: op.clone(),
                literal: value.clone(),
            });
        }
    }
    if op == "=" && column_is(left, column) {
        if let Expr::Call(name, args) = right.as_ref() {
            if name == "round"
                && args.len() == 3
                && column_is(&args[0], column)
                && unsigned(&args[2]) == Some("1")
            {
                if let Some(scale) = unsigned(&args[1]) {
                    return Some(Candidate::Scale {
                        scale: scale.to_owned(),
                    });
                }
            }
        }
    }
    let limit = unsigned(right)?;
    if !(op == "<=" || op == "=" && limit == "0") {
        return None;
    }
    if let Expr::Call(name, args) = left.as_ref() {
        if matches!(name.as_str(), "len" | "datalength")
            && args.len() == 1
            && column_is(&args[0], column)
        {
            return Some(Candidate::Length {
                measure: name.clone(),
                operator: op.clone(),
                limit: limit.to_owned(),
            });
        }
    }
    if let Expr::Binary(minus, left, one) = left.as_ref() {
        if minus == "-" && unsigned(one) == Some("1") {
            if let Expr::Call(len, args) = left.as_ref() {
                if len == "len" && args.len() == 1 {
                    if let Expr::Binary(plus, arg, sentinel) = &args[0] {
                        if plus == "+"
                            && column_is(arg, column)
                            && matches!(sentinel.as_ref(),Expr::String(value) if value=="x")
                        {
                            return Some(Candidate::Length {
                                measure: "len-with-sentinel".to_owned(),
                                operator: op.clone(),
                                limit: limit.to_owned(),
                            });
                        }
                    }
                }
            }
        }
    }
    None
}
fn collect_candidates(expr: &Expr, column: &str, out: &mut Vec<Candidate>, depth: usize) -> bool {
    if depth > 64 || out.len() >= 128 {
        return false;
    }
    if let Expr::Binary(op, left, right) = expr {
        if op == "AND" {
            return collect_candidates(left, column, out, depth + 1)
                && collect_candidates(right, column, out, depth + 1);
        }
    }
    if let Some(value) = predicate_term(expr, column) {
        out.push(value);
        true
    } else {
        false
    }
}
pub fn inspect_sqlserver_facet_predicate(
    input: &Value,
    column_name: &Utf16,
    ctx: &mut CoreContext<'_>,
) -> Result<Value, EngineError> {
    let native = crate::copy_json(input, ctx)?;
    ctx.charge_text(column_name.len(), Utf16::default())?;
    let mut candidates = Vec::new();
    let supported_name = column_name
        .to_utf8()
        .ok()
        .filter(|name| !name.is_empty() && column_name.len() <= 128 && !name.contains('\0'));
    let parse_result = if let Value::String(source) = input {
        if source.len() > 65536 {
            None
        } else {
            ctx.charge_text(source.len(), Utf16::default())?;
            match source.to_utf8() {
                Ok(text) => match tokenize_sql(&text) {
                    Some(tokens) if tokens.len() <= 4096 => {
                        ctx.charge_work(tokens.len(), Utf16::default())?;
                        parse_sql(&tokens)
                    }
                    _ => None,
                },
                Err(_) => None,
            }
        }
    } else {
        None
    };
    let candidate = match (supported_name, parse_result) {
        (Some(name), Some(expr)) if collect_candidates(&expr, &name, &mut candidates, 0) => true,
        _ => false,
    };
    ctx.charge_work(candidates.len(), Utf16::default())?;
    let candidate_values = candidates.iter().map(Candidate::value).collect();
    Ok(obj(vec![
        ("native", native),
        (
            "state",
            Value::string_utf8(if candidate {
                "candidate"
            } else {
                "unsupported"
            }),
        ),
        ("candidates", Value::Array(candidate_values)),
        (
            "requires",
            Value::string_utf8("catalog-type-association-enforcement-and-collation-evidence"),
        ),
    ]))
}

fn facet_type_unsupported(
    native: &Value,
    reason: &str,
    ctx: &mut CoreContext<'_>,
) -> Result<Value, EngineError> {
    Ok(obj(vec![
        ("native", crate::copy_json(native, ctx)?),
        ("state", Value::string_utf8("unsupported")),
        ("reason", Value::string_utf8(reason)),
    ]))
}
fn value_int(value: Option<&Value>) -> Option<i64> {
    match value {
        Some(Value::Number(n))
            if n.is_finite() && n.fract() == 0.0 && n.abs() <= 9_007_199_254_740_991.0 =>
        {
            Some(*n as i64)
        }
        _ => None,
    }
}
fn diagnostic_fact(kind: &str, fields: Vec<(&str, Value)>) -> Value {
    let mut result = vec![("kind", Value::string_utf8(kind))];
    result.extend(fields);
    Value::Object(result.into_iter().map(|(k, v)| (key(k), v)).collect())
}

pub fn inspect_sqlserver_facet_constraints(
    document: &Value,
    column_path: &Utf16,
    ctx: &mut CoreContext<'_>,
) -> Result<Value, EngineError> {
    let catalog = catalog_from_document(document, ctx)?;
    // This API is a narrow interpreter of pinned observations; it does not
    // claim a complete or authenticated SQL Server constraint inventory.
    let _ = export_document(document, ctx)?;
    let columns = catalog.column_metadata(ctx)?;
    let column = columns
        .iter()
        .find(|column| column.path == *column_path)
        .ok_or_else(|| err("SQLSERVER_FACET_COLUMN", "Unknown captured column path"))?;
    let tables = catalog.constraint_metadata(ctx)?;
    let table_index = column
        .path
        .to_utf8()
        .ok()
        .and_then(|path| path.split('/').nth(2)?.parse::<usize>().ok())
        .ok_or_else(|| err("SQLSERVER_FACET_COLUMN", "Unknown captured table path"))?;
    let table = tables
        .tables
        .get(table_index)
        .ok_or_else(|| err("SQLSERVER_FACET_COLUMN", "Missing captured table"))?;
    let root = catalog.root.root();
    let supported = scalar_text(field(root, "profile")).as_deref() == Some("sqlserver-catalog-v3")
        && scalar_text(field(root, "serverVersion")).as_deref() == Some("16.0.4295.3")
        && scalar_text(field(root, "state")).as_deref() == Some("captured");
    let type_value = if supported {
        inspect_sqlserver_facet_type(&column.native_column, ctx)?
    } else {
        facet_type_unsupported(
            &column.native_column,
            "Source is outside the pinned captured v3 SQL Server profile",
            ctx,
        )?
    };
    let table_value = match table {
        Value::Object(fields) => fields,
        _ => return Err(err("SQLSERVER_FACET_COLUMN", "Expected table metadata")),
    };
    let get_table = |name: &str| {
        table_value
            .iter()
            .find(|(k, _)| k == &key(name))
            .map(|(_, v)| v)
    };
    let checks_available = matches!(
        get_table("available").and_then(|v| value_field(v, "checks")),
        Some(Value::Bool(true))
    );
    let checks = match get_table("checks") {
        Some(Value::Array(items)) => items,
        _ => return Err(err("SQLSERVER_FACET_COLUMN", "Missing check observations")),
    };
    let native_root = field(root, "tables")
        .and_then(|node| array(Some(node)))
        .and_then(|tables| tables.get(table_index))
        .ok_or_else(|| err("SQLSERVER_FACET_COLUMN", "Missing source table"))?;
    let profile_v3 = supported;
    let type_meaning = value_field(&type_value, "meaning");
    let family = value_string(type_meaning.and_then(|v| value_field(v, "family")))
        .and_then(|v| v.to_utf8().ok());
    let type_state = value_string(value_field(&type_value, "state")).and_then(|v| v.to_utf8().ok());
    let native_column = NativeJsonTree::from_tagged_value(&column.native_column, ctx)?;
    let column_id = scalar_int(field(native_column.root(), "column_id"));
    let mut observations = Vec::new();
    for (index, native_check) in checks.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let base_path = format!("/tables/{table_index}/checks/{index}");
        let residual = |reason: &str,
                        candidates: Vec<Value>,
                        ctx: &mut CoreContext<'_>|
         -> Result<Value, EngineError> {
            Ok(obj(vec![
                ("path", Value::string_utf8(&base_path)),
                ("native", crate::copy_json(native_check, ctx)?),
                ("state", Value::string_utf8("residual")),
                ("reason", Value::string_utf8(reason)),
                ("candidates", Value::Array(candidates)),
                ("facts", Value::Array(Vec::new())),
            ]))
        };
        if !profile_v3 {
            observations.push(residual(
                "Source is outside the pinned captured v3 SQL Server profile",
                Vec::new(),
                ctx,
            )?);
            continue;
        }
        if type_state.as_deref() != Some("observed")
            || !matches!(
                field(native_root, "columns")
                    .and_then(|node| array(Some(node)))
                    .and_then(|cols| cols.get(
                        column
                            .path
                            .to_utf8()
                            .ok()?
                            .split('/')
                            .nth(4)?
                            .parse::<usize>()
                            .ok()?
                    ))
                    .and_then(|c| field(c, "is_computed")),
                Some(NativeJsonNode::Boolean(false))
            )
            || column_id.is_none_or(|id| id < 1)
        {
            observations.push(residual(
                "Direct noncomputed scalar type and column identity are required",
                Vec::new(),
                ctx,
            )?);
            continue;
        }
        let check = NativeJsonTree::from_tagged_value(native_check, ctx)?;
        let Some(parent_id) = scalar_int(field(check.root(), "parent_column_id")) else {
            observations.push(residual("Expected CHECK metadata", Vec::new(), ctx)?);
            continue;
        };
        if Some(parent_id) != column_id {
            observations.push(residual(
                if parent_id == 0 {
                    "Table-wide CHECK association remains unresolved"
                } else {
                    "CHECK belongs to a different or unresolved column"
                },
                Vec::new(),
                ctx,
            )?);
            continue;
        }
        let Some(definition) = text(field(check.root(), "definition")) else {
            observations.push(residual("CHECK definition unavailable", Vec::new(), ctx)?);
            continue;
        };
        ctx.charge_text(definition.len(), Utf16::default())?;
        let empty_name = Utf16::default();
        let column_name = value_field(&column.element, "name")
            .and_then(|value| value_string(Some(value)))
            .unwrap_or(&empty_name);
        let parsed = inspect_sqlserver_facet_predicate(
            &Value::String(definition.clone()),
            column_name,
            ctx,
        )?;
        if value_string(value_field(&parsed, "state"))
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("candidate")
        {
            observations.push(residual(
                "Whole CHECK expression is outside the bounded syntax subset",
                Vec::new(),
                ctx,
            )?);
            continue;
        }
        let candidates = match value_field(&parsed, "candidates") {
            Some(Value::Array(items)) => {
                ctx.charge_work(items.len(), Utf16::default())?;
                let mut copied = Vec::with_capacity(items.len());
                for item in items {
                    copied.push(crate::copy_json(item, ctx)?);
                }
                copied
            }
            _ => Vec::new(),
        };
        let bool_field = |name: &str| {
            matches!(
                field(check.root(), name),
                Some(NativeJsonNode::Boolean(true))
            )
        };
        let disabled = field(check.root(), "is_disabled");
        let untrusted = field(check.root(), "is_not_trusted");
        let replica = field(check.root(), "is_not_for_replication");
        let collation = field(check.root(), "uses_database_collation");
        if ![disabled, untrusted, replica, collation]
            .iter()
            .all(|v| matches!(v, Some(NativeJsonNode::Boolean(_))))
        {
            observations.push(residual(
                "CHECK enforcement or collation flags unavailable",
                candidates,
                ctx,
            )?);
            continue;
        }
        if bool_field("is_disabled") {
            observations.push(residual(
                "Disabled CHECK supplies no enforced bound",
                candidates,
                ctx,
            )?);
            continue;
        }
        let mut facts = Vec::new();
        let Value::Array(parsed_candidates) = value_field(&parsed, "candidates").unwrap() else {
            unreachable!()
        };
        let mut unsupported = false;
        for candidate in parsed_candidates {
            let kind = value_string(value_field(candidate, "kind")).and_then(|v| v.to_utf8().ok());
            match kind.as_deref() {
                Some("bound") if family.as_deref() == Some("integer") => {
                    let operator = value_string(value_field(candidate, "operator"))
                        .and_then(|v| v.to_utf8().ok())
                        .unwrap_or_default();
                    let literal = value_string(value_field(candidate, "literal"))
                        .and_then(|v| v.to_utf8().ok())
                        .unwrap_or_default();
                    let digits = literal.strip_prefix('-').unwrap_or(&literal);
                    if matches!(operator.as_str(), ">=" | "<=")
                        && !digits.is_empty()
                        && (digits == "0" || !digits.starts_with('0'))
                        && digits.bytes().all(|b| b.is_ascii_digit())
                        && digits.len() <= 38
                    {
                        facts.push(diagnostic_fact(
                            "integer-bound",
                            vec![
                                ("operator", Value::string_utf8(operator)),
                                ("literal", Value::string_utf8(literal)),
                            ],
                        ));
                    } else {
                        unsupported = true;
                    }
                }
                Some("length")
                    if value_string(value_field(candidate, "measure"))
                        .and_then(|v| v.to_utf8().ok())
                        .as_deref()
                        == Some("datalength")
                        && family.as_deref() == Some("binary") =>
                {
                    let limit = value_string(value_field(candidate, "limit"))
                        .and_then(|v| v.to_utf8().ok())
                        .unwrap_or_default();
                    if limit.len() <= 19 && limit.parse::<u64>().is_ok_and(|v| v <= i64::MAX as u64)
                    {
                        facts.push(diagnostic_fact(
                            "binary-byte-bound",
                            vec![("maximum", Value::string_utf8(limit))],
                        ));
                    } else {
                        unsupported = true;
                    }
                }
                Some("length")
                    if value_string(value_field(candidate, "measure"))
                        .and_then(|v| v.to_utf8().ok())
                        .as_deref()
                        == Some("datalength")
                        && value_string(value_field(candidate, "limit"))
                            .is_some_and(|v| v == &Utf16::from("0"))
                        && family.as_deref() == Some("string") =>
                {
                    if value_string(type_meaning.and_then(|v| value_field(v, "padding")))
                        .is_some_and(|v| v == &Utf16::from("variable"))
                    {
                        facts.push(diagnostic_fact("unicode-empty", Vec::new()));
                    } else {
                        unsupported = true;
                    }
                }
                Some("scale") if family.as_deref() == Some("decimal") => {
                    let scale = value_string(value_field(candidate, "scale"))
                        .and_then(|v| v.to_utf8().ok())
                        .unwrap_or_default();
                    let expected = value_int(type_meaning.and_then(|v| value_field(v, "scale")));
                    if scale.len() <= 2 && scale.parse::<i64>().ok() == expected {
                        facts.push(diagnostic_fact(
                            "decimal-stored-scale",
                            vec![
                                ("scale", Value::string_utf8(scale)),
                                ("inputExactness", Value::Bool(false)),
                            ],
                        ));
                    } else {
                        unsupported = true;
                    }
                }
                _ => unsupported = true,
            }
        }
        if unsupported {
            observations.push(residual(
                "Predicate/type combination requires additional native or collation qualification",
                candidates,
                ctx,
            )?);
            continue;
        }
        let scope = if bool_field("is_not_trusted") || bool_field("is_not_for_replication") {
            "ordinary-checked-write-non-null"
        } else {
            "stored-and-ordinary-checked-write-non-null"
        };
        let reason = if bool_field("is_not_for_replication") {
            "Replication bypass remains native; only ordinary checked writes are interpreted"
        } else if bool_field("is_not_trusted") {
            "Existing rows are unverified; only ordinary checked writes are interpreted"
        } else {
            "Trusted enabled CHECK on the observed non-null scalar domain"
        };
        observations.push(obj(vec![
            ("path", Value::string_utf8(base_path)),
            ("native", crate::copy_json(native_check, ctx)?),
            ("state", Value::string_utf8("interpreted")),
            ("reason", Value::string_utf8(reason)),
            ("candidates", Value::Array(candidates)),
            ("facts", Value::Array(facts)),
            ("scope", Value::string_utf8(scope)),
        ]));
    }
    Ok(obj(vec![
        (
            "nativeColumn",
            crate::copy_json(&column.native_column, ctx)?,
        ),
        ("type", type_value),
        ("observations", Value::Array(observations)),
        ("checksAvailable", Value::Bool(checks_available)),
        ("complete", Value::Bool(false)),
        ("sourceAuthenticity", Value::string_utf8("unverified")),
    ]))
}
