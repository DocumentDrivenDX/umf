// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned Avro ↔ TableSpec schema projection composition.
use crate::{
    avro_document,
    context::Context,
    error::EngineError,
    native_json::{NativeJsonNode, NativeJsonTree},
    serialization::{read_json_value, write_json_value, Format},
    tablespec_adapter::{TableSpecFormat, TableSpecRuntime},
    value::{copy_json, Utf16, Value},
};

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn array(value: Option<&Value>) -> Option<&[Value]> {
    match value {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(fields.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn string(value: &str) -> Value {
    Value::string_utf8(value)
}
fn str_value(value: Option<&Value>) -> Option<String> {
    text(value).and_then(|s| s.to_utf8().ok())
}
fn num(value: Option<&Value>) -> Option<i64> {
    match value {
        Some(Value::Number(number)) if number.is_finite() && number.fract() == 0.0 => {
            Some(*number as i64)
        }
        _ => None,
    }
}
fn ascii_alpha(unit: u16) -> bool {
    (65..=90).contains(&unit) || (97..=122).contains(&unit)
}
fn ascii_digit(unit: u16) -> bool {
    (48..=57).contains(&unit)
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn pointer_segment(value: &Utf16) -> Utf16 {
    let mut out = Vec::new();
    for unit in value.units() {
        match *unit {
            0x7e => out.extend([b'~' as u16, b'0' as u16]),
            0x2f => out.extend([b'~' as u16, b'1' as u16]),
            other => out.push(other),
        }
    }
    Utf16::new(out)
}
fn path(base: &Utf16, name: &Utf16) -> Utf16 {
    let mut out = base.units().to_vec();
    out.push(b'/' as u16);
    out.extend(pointer_segment(name).into_units());
    Utf16::new(out)
}
fn indexed(base: &Utf16, name: &str, index: usize) -> Utf16 {
    path(&path(base, &key(name)), &Utf16::from(index.to_string()))
}
fn issue(path: Utf16, code: &str, class: &str, detail: &str) -> Value {
    obj(vec![
        ("path", Value::String(path)),
        ("code", string(code)),
        ("classification", string(class)),
        ("detail", string(detail)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn issue_utf16(path: Utf16, code: Utf16, class: &str, detail: Utf16) -> Value {
    obj(vec![
        ("path", Value::String(path)),
        ("code", Value::String(code)),
        ("classification", string(class)),
        ("detail", Value::String(detail)),
        ("retainedInSource", Value::Bool(true)),
    ])
}
fn push_issue(issues: &mut Vec<Value>, path: Utf16, code: &str, class: &str, detail: &str) {
    issues.push(issue(path, code, class, detail));
}
fn is_ascii_ident(value: &Utf16) -> bool {
    let units = value.units();
    !units.is_empty()
        && (units[0] == b'_' as u16 || ascii_alpha(units[0]))
        && units[1..]
            .iter()
            .all(|u| *u == b'_' as u16 || ascii_digit(*u) || ascii_alpha(*u))
}
fn is_table_name(value: &Utf16) -> bool {
    let units = value.units();
    !units.is_empty()
        && units.len() <= 128
        && ascii_alpha(units[0])
        && units[1..]
            .iter()
            .all(|u| *u == b'_' as u16 || ascii_digit(*u) || ascii_alpha(*u))
}
fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::Number(n)) => *n != 0.0 && !n.is_nan(),
        Some(Value::String(s)) => !s.is_empty(),
        _ => true,
    }
}
fn policy_copy(
    input: &Value,
    direction: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let policy = copy_json(input, ctx)?;
    let fields = match &policy {
        Value::Object(fields) => fields,
        _ => {
            return Err(err(
                if direction == "avro" {
                    "AVRO_TABLESPEC_POLICY"
                } else {
                    "TABLESPEC_AVRO_POLICY"
                },
                "Expected a projection policy object",
            ))
        }
    };
    let allowed: &[&str] = if direction == "avro" {
        &["id", "tableName", "fields", "lossPolicy"]
    } else {
        &[
            "id",
            "recordName",
            "namespace",
            "context",
            "fields",
            "lossPolicy",
        ]
    };
    if fields
        .iter()
        .any(|(name, _)| !allowed.iter().any(|allowed| name == &key(allowed)))
    {
        return Err(err(
            if direction == "avro" {
                "AVRO_TABLESPEC_POLICY"
            } else {
                "TABLESPEC_AVRO_POLICY"
            },
            "Unknown projection policy field",
        ));
    }
    let id = text(get(&policy, "id")).filter(|id| !id.is_empty());
    let loss = str_value(get(&policy, "lossPolicy"));
    let bindings = match get(&policy, "fields") {
        Some(Value::Object(bindings)) if !bindings.is_empty() => bindings,
        _ => {
            return Err(err(
                if direction == "avro" {
                    "AVRO_TABLESPEC_POLICY"
                } else {
                    "TABLESPEC_AVRO_POLICY"
                },
                "Explicit field bindings are required",
            ))
        }
    };
    if id.is_none() || !matches!(loss.as_deref(), Some("strict" | "allow-reported-loss")) {
        return Err(err(
            if direction == "avro" {
                "AVRO_TABLESPEC_POLICY"
            } else {
                "TABLESPEC_AVRO_POLICY"
            },
            "Explicit target id and loss policy are required",
        ));
    }
    if direction == "avro" {
        let table = text(get(&policy, "tableName"));
        if table.is_none_or(|name| !is_table_name(name)) {
            return Err(err(
                "AVRO_TABLESPEC_POLICY",
                "Explicit valid TableSpec table name required",
            ));
        }
        let mut names = Vec::new();
        for (_, binding) in bindings {
            let value = match binding {
                Value::Object(fields) => fields,
                _ => return Err(err("AVRO_TABLESPEC_POLICY", "Invalid column binding")),
            };
            if value.iter().any(|(name, _)| {
                !["name", "representation"]
                    .iter()
                    .any(|allowed| name == &key(allowed))
            }) {
                return Err(err("AVRO_TABLESPEC_POLICY", "Unknown column binding field"));
            }
            let name = text(get(binding, "name")).filter(|name| is_table_name(name));
            let repr = str_value(get(binding, "representation"));
            if name.is_none()
                || !matches!(
                    repr.as_deref(),
                    Some(
                        "string"
                            | "integer32"
                            | "float32"
                            | "boolean"
                            | "decimal"
                            | "date"
                            | "timestamp"
                            | "local-timestamp"
                            | "hex-text"
                            | "json-text"
                    )
                )
            {
                return Err(err(
                    "AVRO_TABLESPEC_POLICY",
                    "Invalid, duplicate or incomplete column binding",
                ));
            }
            let name = name.unwrap();
            if names.contains(name) {
                return Err(err(
                    "AVRO_TABLESPEC_POLICY",
                    "Invalid, duplicate or incomplete column binding",
                ));
            }
            names.push(name.clone());
        }
    } else {
        let record = text(get(&policy, "recordName"));
        let namespace = text(get(&policy, "namespace"));
        let context = text(get(&policy, "context"));
        if record.is_none_or(|name| !is_ascii_ident(name))
            || namespace.is_none_or(|ns| {
                ns.is_empty()
                    || ns
                        .units()
                        .split(|u| *u == b'.' as u16)
                        .any(|part| !is_ascii_ident(&Utf16::new(part.to_vec())))
            })
            || (get(&policy, "context").is_some() && context.is_none_or(|name| name.is_empty()))
        {
            return Err(err(
                "TABLESPEC_AVRO_POLICY",
                "Expected explicit valid record name, namespace and optional context",
            ));
        }
        let mut names = Vec::new();
        for (_, binding) in bindings {
            let Value::Object(value) = binding else {
                return Err(err("TABLESPEC_AVRO_POLICY", "Invalid field binding"));
            };
            if value.iter().any(|(name, _)| {
                !["name", "representation", "nullable", "itemsNullable"]
                    .iter()
                    .any(|allowed| name == &key(allowed))
            }) {
                return Err(err("TABLESPEC_AVRO_POLICY", "Unknown field binding field"));
            }
            let name = text(get(binding, "name"));
            let representation = str_value(get(binding, "representation"));
            let nullable = get(binding, "nullable");
            let items_nullable = get(binding, "itemsNullable");
            if name.is_none_or(|name| !is_ascii_ident(name))
                || !matches!(
                    representation.as_deref(),
                    Some(
                        "string"
                            | "int32"
                            | "int64"
                            | "float32"
                            | "float64"
                            | "boolean"
                            | "decimal"
                            | "date"
                            | "timestamp-micros"
                            | "local-timestamp-micros"
                            | "embedding-float32"
                    )
                )
                || !(matches!(nullable, Some(Value::Bool(_)))
                    || text(nullable).is_some_and(|s| s == &key("source")))
                || items_nullable.is_some_and(|value| {
                    !matches!(value, Value::Bool(_))
                        || representation.as_deref() != Some("embedding-float32")
                })
            {
                return Err(err(
                    "TABLESPEC_AVRO_POLICY",
                    "Invalid, duplicate or incomplete field binding",
                ));
            }
            let name = name.unwrap();
            if names.contains(name) {
                return Err(err(
                    "TABLESPEC_AVRO_POLICY",
                    "Invalid, duplicate or incomplete field binding",
                ));
            }
            names.push(name.clone());
        }
    }
    Ok(policy)
}

/// Validate and retain the explicit Avro-to-TableSpec policy for composite
/// projection owners that must reject policy errors before reading source.
pub fn validate_avro_to_tablespec_policy(
    input: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    policy_copy(input, "avro", ctx)
}

fn projection(
    source: Value,
    policy: Value,
    issues: Vec<Value>,
    mappings: Vec<Value>,
    target: Option<Value>,
    schema: Option<Utf16>,
    fatal: bool,
) -> Value {
    let strict = str_value(get(&policy, "lossPolicy")).as_deref() == Some("strict");
    let blocked = fatal || strict && !issues.is_empty();
    let mut output = vec![
        (
            key("status"),
            string(if blocked { "blocked" } else { "projected" }),
        ),
        (key("source"), source),
        (key("policy"), policy),
        (key("issues"), Value::Array(issues)),
        (key("mappings"), Value::Array(mappings)),
    ];
    if !blocked {
        if let Some(target) = target {
            output.push((key("target"), target));
        }
        if let Some(schema) = schema {
            output.push((key("nativeSchema"), Value::String(schema)));
        }
    }
    Value::Object(output)
}
fn parse_json(source: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    read_json_value(source.units(), Format::Json, ctx)
}
fn native_name(node: &Value) -> Option<&Utf16> {
    text(Some(node))
}
fn definition_name(name: &Utf16, explicit_ns: Option<&Utf16>, inherited: &Utf16) -> Utf16 {
    if name.units().contains(&(b'.' as u16)) {
        return name.clone();
    }
    let namespace = explicit_ns
        .filter(|value| !value.is_empty())
        .unwrap_or(inherited);
    if namespace.is_empty() {
        return name.clone();
    }
    let mut value = namespace.units().to_vec();
    value.push(b'.' as u16);
    value.extend(name.units());
    Utf16::new(value)
}
fn namespace_of(full_name: &Utf16) -> Utf16 {
    match full_name
        .units()
        .iter()
        .rposition(|unit| *unit == b'.' as u16)
    {
        Some(index) => Utf16::new(full_name.units()[..index].to_vec()),
        None => Utf16::default(),
    }
}
fn collect_definitions(
    node: &Value,
    inherited: &Utf16,
    definitions: &mut Vec<(Utf16, Value, Utf16)>,
) {
    if let Value::Array(items) = node {
        for item in items {
            collect_definitions(item, inherited, definitions);
        }
        return;
    }
    let Value::Object(_) = node else {
        return;
    };
    let kind = str_value(get(node, "type"));
    let mut namespace = inherited.clone();
    if matches!(kind.as_deref(), Some("record" | "error" | "enum" | "fixed")) {
        if let Some(name) = text(get(node, "name")) {
            let full = definition_name(name, text(get(node, "namespace")), inherited);
            namespace = namespace_of(&full);
            definitions.retain(|(candidate, _, _)| candidate != &full);
            definitions.push((full, node.clone(), namespace.clone()));
        }
    }
    if let Some(fields) = array(get(node, "fields")) {
        for field in fields {
            if let Some(ty) = get(field, "type") {
                collect_definitions(ty, &namespace, definitions);
            }
        }
    }
    for key_name in ["items", "values"] {
        if let Some(child) = get(node, key_name) {
            collect_definitions(child, &namespace, definitions);
        }
    }
    if let Some(ty) = get(node, "type") {
        if !matches!(ty, Value::String(_)) {
            collect_definitions(ty, &namespace, definitions);
        }
    }
}
fn resolve_type(
    node: &Value,
    namespace: &Utf16,
    definitions: &[(Utf16, Value, Utf16)],
) -> Option<Value> {
    if let Value::String(name) = node {
        let primitive = [
            "null", "boolean", "int", "long", "float", "double", "bytes", "string",
        ];
        if primitive.iter().any(|p| name == &key(p)) {
            return Some(node.clone());
        }
        let full = definition_name(name, None, namespace);
        return definitions
            .iter()
            .rev()
            .find(|(candidate, _, _)| candidate == &full)
            .map(|(_, value, _)| value.clone());
    }
    Some(node.clone())
}
fn js_truthy(value: Option<&Value>) -> bool {
    truthy(value)
}
fn root_record_context(root: &Value) -> Utf16 {
    let name = text(get(root, "name")).cloned().unwrap_or_default();
    definition_name(&name, text(get(root, "namespace")), &Utf16::default())
}
fn avro_issue_diagnostics(
    source: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Vec<Value>, bool), EngineError> {
    let admission = avro_document::admit_document(source, ctx)?;
    if !admission.validation.valid {
        return Err(err("AVRO_TABLESPEC_SOURCE", "Invalid source"));
    }
    let mut issues = Vec::new();
    let mut fatal = false;
    for diagnostic in admission.validation.diagnostics {
        if [
            "AVRO_VALIDATOR_LIMIT",
            "AVRO_NUMERIC",
            "AVRO_REPRESENTATION",
        ]
        .iter()
        .any(|code| diagnostic.code == key(code))
        {
            fatal = true;
        }
        issues.push(issue_utf16(
            diagnostic.path,
            diagnostic.code,
            "not-enforced",
            diagnostic.message,
        ));
    }
    Ok((issues, fatal))
}

/// Project an Avro 1.12 root record into the pinned monolithic TableSpec profile.
pub fn project_avro_to_tablespec(
    source: &Value,
    input: &Value,
    tablespec: &TableSpecRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(source, ctx)?;
    let policy = policy_copy(input, "avro", ctx)?;
    let (mut issues, mut fatal) = avro_issue_diagnostics(&source, ctx)?;
    if fatal {
        return Ok(projection(
            source,
            policy,
            issues,
            Vec::new(),
            None,
            None,
            true,
        ));
    }
    let bundle = avro_document::export_bundle(&source, ctx)?;
    let root = parse_json(&bundle.schema_json, ctx)?;
    let mut definitions = Vec::new();
    for (_, schema) in &bundle.dependencies {
        let dep = parse_json(schema, ctx)?;
        collect_definitions(&dep, &Utf16::default(), &mut definitions);
    }
    collect_definitions(&root, &Utf16::default(), &mut definitions);
    let root_kind = str_value(get(&root, "type"));
    if !matches!(root_kind.as_deref(), Some("record" | "error")) {
        push_issue(
            &mut issues,
            Utf16::default(),
            "AVRO_TABLESPEC_UNSUPPORTED",
            "unsupported",
            "Only root records can become TableSpec tables",
        );
        return Ok(projection(source, policy, issues, vec![], None, None, true));
    }
    let fullname = root_record_context(&root);
    let namespace = namespace_of(&fullname);
    let fields = array(get(&root, "fields")).unwrap_or(&[]);
    push_issue(&mut issues,Utf16::default(),"RECORD_IDENTITY","not-enforced","TableSpec table name is explicit; Avro namespaces, aliases, record/error identity, recursion, binary framing and schema resolution remain in source");
    push_issue(&mut issues,Utf16::default(),"SCHEMA_ONLY","representation-change","No row encoding/coercion, writer-field presence, reader defaults or TableSpec pipeline execution is established");
    if !bundle.dependencies.is_empty() {
        push_issue(&mut issues,Utf16::default(),"NAMED_DEPENDENCIES","not-enforced","Named-schema dependencies remain in the source bundle; TableSpec does not carry the Avro name registry");
    }
    let bindings = get(&policy, "fields")
        .and_then(|v| {
            if let Value::Object(fields) = v {
                Some(fields.as_slice())
            } else {
                None
            }
        })
        .unwrap_or(&[]);
    for (index, field) in fields.iter().enumerate() {
        if let Some(name) = text(get(field, "name")) {
            if !bindings.iter().any(|(candidate, _)| candidate == name) {
                push_issue(
                    &mut issues,
                    indexed(&key(""), "fields", index),
                    "FIELD_OMITTED",
                    "not-enforced",
                    "Source field omitted by explicit selection",
                );
            }
        }
    }
    let mut columns = Vec::new();
    let mut mappings = Vec::new();
    for (field_name, binding) in bindings {
        let selected = fields
            .iter()
            .position(|field| text(get(field, "name")) == Some(field_name));
        let Some(index) = selected else {
            fatal = true;
            push_issue(
                &mut issues,
                path(&key("/fields"), field_name),
                "AVRO_TABLESPEC_UNSUPPORTED",
                "unsupported",
                "Selected field is absent",
            );
            continue;
        };
        let field = &fields[index];
        let at = indexed(&key(""), "fields", index);
        let branches = array(get(field, "type"));
        let members = branches
            .unwrap_or_else(|| std::slice::from_ref(get(field, "type").unwrap_or(&Value::Null)));
        let is_null = |node: &Value| {
            matches!(node,Value::String(s) if s==&key("null"))
                || str_value(get(node, "type")).as_deref() == Some("null")
        };
        let nullable = members.iter().any(is_null);
        let nonnull: Vec<_> = members.iter().filter(|node| !is_null(node)).collect();
        if branches.is_some() {
            push_issue(&mut issues,path(&at,&key("type")),"UNION_IDENTITY","not-enforced","Nullability is derived from a null branch; TableSpec does not preserve union order, branch tags or overlapping alternatives");
        }
        if get(field, "default").is_some() {
            push_issue(&mut issues,path(&at,&key("default")),"READER_DEFAULT","not-enforced","Avro reader-resolution default is not a TableSpec default or permission to omit a writer field");
        }
        if js_truthy(get(field, "aliases")) || js_truthy(get(field, "order")) {
            push_issue(
                &mut issues,
                at.clone(),
                "FIELD_RESOLUTION",
                "not-enforced",
                "Native aliases and field sort order are not TableSpec alias or ordering semantics",
            );
        }
        let binding_name = text(get(binding, "name")).unwrap().clone();
        let representation = str_value(get(binding, "representation")).unwrap_or_default();
        let node = if nonnull.len() == 1 {
            resolve_type(nonnull[0], &namespace, &definitions)
        } else {
            None
        };
        let ty = node.as_ref().and_then(|n| {
            if let Value::String(s) = n {
                s.to_utf8().ok()
            } else {
                str_value(get(n, "type"))
            }
        });
        let logical = node.as_ref().and_then(|n| str_value(get(n, "logicalType")));
        let mut col = vec![
            (key("name"), Value::String(binding_name.clone())),
            (key("nullable"), Value::Bool(nullable)),
        ];
        if let Some(doc) = text(get(field, "doc")) {
            col.push((key("description"), Value::String(doc.clone())));
        }
        let mut consumed = false;
        let mut data_type = None::<&str>;
        let mut precision = None;
        let mut scale = None;
        if representation == "json-text" {
            data_type = Some("TEXT");
            push_issue(&mut issues,at.clone(),"JSON_TEXT_ENCODING","representation-change","Non-null values require an explicit Avro JSON encoder (including tags, names, bytes and exact numbers). Null remains null; target text does not enforce the source shape");
        } else if node.is_none() || nonnull.len() != 1 {
            fatal = true;
            push_issue(
                &mut issues,
                at.clone(),
                "AVRO_TABLESPEC_UNSUPPORTED",
                "unsupported",
                "Non-text bindings require one resolved non-null branch",
            );
            continue;
        } else {
            let ty = ty.as_deref().unwrap_or("");
            match (representation.as_str(), ty) {
                ("string", "string" | "enum") => {
                    data_type = Some("TEXT");
                    if ty == "enum" {
                        push_issue(
                            &mut issues,
                            at.clone(),
                            "ENUM_SYMBOLS",
                            "not-enforced",
                            "Enum symbols, default and named identity are not enforced by TEXT",
                        );
                    }
                }
                ("integer32", "int") => {
                    data_type = Some("INTEGER");
                    push_issue(&mut issues,at.clone(),"INTEGER_EXECUTION_PROFILE","not-enforced","The pinned Spark helper uses int32; this does not establish all TableSpec execution, coercion or range enforcement");
                }
                ("float32", "float" | "double") => {
                    data_type = Some("FLOAT");
                    if ty == "double" {
                        push_issue(&mut issues,at.clone(),"FLOAT64_TO_FLOAT32","representation-change","Explicit narrowing to the pinned Spark float32 helper requires a separate rounding/overflow policy; source double precision is not preserved");
                    } else {
                        push_issue(&mut issues,at.clone(),"FLOAT_EXECUTION_PROFILE","not-enforced","Native non-finite values, signed zero and execution behavior remain source-owned");
                    }
                }
                ("boolean", "boolean") => data_type = Some("BOOLEAN"),
                ("hex-text", "bytes" | "fixed") => {
                    data_type = Some("TEXT");
                    push_issue(&mut issues,at.clone(),"BINARY_HEX_ENCODING","representation-change","Caller must encode bytes as hexadecimal; TableSpec TEXT does not enforce alphabet, width or native fixed identity");
                }
                ("decimal", "bytes" | "fixed") if logical.as_deref() == Some("decimal") => {
                    let p = num(get(node.as_ref().unwrap(), "precision"));
                    let s = if get(node.as_ref().unwrap(), "scale").is_some() {
                        num(get(node.as_ref().unwrap(), "scale"))
                    } else {
                        Some(0)
                    };
                    let size = num(get(node.as_ref().unwrap(), "size"));
                    let capacity = if ty == "fixed" {
                        size.filter(|s| *s > 0 && *s < 17).map(|s| {
                            let max = (1u128 << ((s as u32) * 8 - 1)) - 1;
                            max.to_string().len().saturating_sub(1) as i64
                        })
                    } else {
                        Some(38)
                    };
                    if p.is_none_or(|p| !(1..=38).contains(&p))
                        || s.is_none_or(|s| s < 0 || s > p.unwrap_or(0))
                        || capacity.is_none_or(|cap| p.unwrap_or(0) > cap)
                    {
                        fatal = true;
                        push_issue(&mut issues,at.clone(),"AVRO_TABLESPEC_UNSUPPORTED","unsupported","Valid decimal precision 1–38, scale and fixed capacity required for the selected target profile");
                        continue;
                    }
                    data_type = Some("DECIMAL");
                    precision = p;
                    scale = s;
                    consumed = true;
                    push_issue(&mut issues,at.clone(),"DECIMAL_REPRESENTATION","representation-change","Precision/scale retained; Avro signed big-endian bytes/fixed encoding, native rounding and reader resolution require separate value handling");
                }
                ("date", "int") if logical.as_deref() == Some("date") => {
                    data_type = Some("DATE");
                    consumed = true;
                    push_issue(&mut issues,at.clone(),"DATE_EXECUTION_PROFILE","representation-change","Avro epoch days require decoding; pinned TableSpec date helpers disagree between string and date carriers");
                }
                ("timestamp", "long")
                    if logical.as_deref().is_some_and(|l| {
                        ["timestamp-millis", "timestamp-micros", "timestamp-nanos"]
                            .iter()
                            .any(|p| l == *p)
                    }) =>
                {
                    data_type = Some("TIMESTAMP");
                    consumed = true;
                    push_issue(&mut issues,at.clone(),"TEMPORAL_REPRESENTATION","representation-change","Source units, range and instant/local distinction are not enforced by the target type token; parsing/timezone/precision conversion requires a separate binding");
                }
                ("local-timestamp", "long")
                    if logical.as_deref().is_some_and(|l| {
                        [
                            "local-timestamp-millis",
                            "local-timestamp-micros",
                            "local-timestamp-nanos",
                        ]
                        .iter()
                        .any(|p| l == *p)
                    }) =>
                {
                    data_type = Some("DATETIME");
                    consumed = true;
                    push_issue(&mut issues,at.clone(),"TEMPORAL_REPRESENTATION","representation-change","Source units, range and instant/local distinction are not enforced by the target type token; parsing/timezone/precision conversion requires a separate binding");
                }
                _ => {
                    fatal = true;
                    push_issue(
                        &mut issues,
                        at.clone(),
                        "AVRO_TABLESPEC_UNSUPPORTED",
                        "unsupported",
                        "Representation does not match the resolved native Avro type",
                    );
                    continue;
                }
            }
        }
        if let Some(data_type) = data_type {
            col.push((key("data_type"), string(data_type)));
        }
        if let Some(p) = precision {
            col.push((key("precision"), Value::Number(p as f64)));
        }
        if let Some(s) = scale {
            col.push((key("scale"), Value::Number(s as f64)));
        }
        if let Some(logical) = logical.as_deref().filter(|l| !l.is_empty()) {
            if !consumed {
                push_issue(&mut issues,path(&at,&key("type")),"LOGICAL_TYPE_NOT_REPRESENTED","not-enforced","Logical meaning remains in source; selected representation describes its carrier only");
            }
            let _ = logical;
        }
        columns.push(Value::Object(col));
        mappings.push(obj(vec![
            ("sourcePath", Value::String(at)),
            ("field", Value::String(field_name.clone())),
            ("column", Value::String(binding_name)),
            ("representation", string(&representation)),
            ("nullable", Value::Bool(nullable)),
        ]));
    }
    let id = text(get(&policy, "id")).unwrap().clone();
    let table = text(get(&policy, "tableName")).unwrap().clone();
    let mut native_fields = vec![
        (key("version"), string("1.0")),
        (key("table_name"), Value::String(table)),
    ];
    if let Some(doc) = text(get(&root, "doc")) {
        native_fields.push((key("description"), Value::String(doc.clone())));
    }
    native_fields.push((key("columns"), Value::Array(columns)));
    let schema = write_json_value(&Value::Object(native_fields), Format::Json, ctx)?;
    if fatal
        || str_value(get(&policy, "lossPolicy")).as_deref() == Some("strict") && !issues.is_empty()
    {
        return Ok(projection(
            source, policy, issues, mappings, None, None, fatal,
        ));
    }
    let target = tablespec.import(&schema, &id, TableSpecFormat::Json, ctx)?;
    Ok(projection(
        source,
        policy,
        issues,
        mappings,
        Some(target),
        Some(schema),
        false,
    ))
}

fn native_member<'a>(node: &'a NativeJsonNode, name: &str) -> Option<&'a NativeJsonNode> {
    match node {
        NativeJsonNode::Object(fields) => {
            fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
        }
        _ => None,
    }
}
fn native_text(node: Option<&NativeJsonNode>) -> Option<&Utf16> {
    match node {
        Some(NativeJsonNode::String(s)) => Some(s),
        _ => None,
    }
}
fn native_array(node: Option<&NativeJsonNode>) -> Option<&[NativeJsonNode]> {
    match node {
        Some(NativeJsonNode::Array(items)) => Some(items),
        _ => None,
    }
}
fn native_number(node: Option<&NativeJsonNode>) -> Option<i64> {
    match node {
        Some(NativeJsonNode::Number(n)) => {
            let value = n.parse::<f64>().ok()?;
            if value.fract() != 0.0 || value.abs() > 9_007_199_254_740_991.0 {
                return None;
            }
            Some(value as i64)
        }
        _ => None,
    }
}
fn native_truthy(node: Option<&NativeJsonNode>) -> bool {
    match node {
        None | Some(NativeJsonNode::Null) | Some(NativeJsonNode::Boolean(false)) => false,
        Some(NativeJsonNode::Number(n)) => n.parse::<f64>().is_ok_and(|n| n != 0.0 && !n.is_nan()),
        Some(NativeJsonNode::String(s)) => !s.is_empty(),
        _ => true,
    }
}
/// Project a pinned TableSpec document into an explicitly named Avro record.
pub fn project_tablespec_to_avro(
    source: &Value,
    input: &Value,
    tablespec: &TableSpecRuntime,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(source, ctx)?;
    let policy = policy_copy(input, "tablespec", ctx)?;
    let validation = tablespec.inspect(&source, ctx)?;
    if !validation.valid {
        return Err(err("TABLESPEC_AVRO_SOURCE", "Invalid source"));
    }
    let payload = get(
        get(&source, "extensions").unwrap_or(&Value::Null),
        "umf.tablespec",
    );
    if matches!(payload,Some(Value::Object(fields)) if fields.iter().any(|(k,_)|k==&key("splitFiles")))
    {
        let _ = tablespec.export_bundle(&source, ctx)?;
    } else {
        let _ = tablespec.export(&source, ctx)?;
    }
    let tagged = tablespec.get_table(&source, ctx)?;
    let tree = NativeJsonTree::from_tagged_value(&tagged, ctx)?;
    let root = tree.root();
    let mut issues=vec![issue(Utf16::default(),"TABLESPEC_EXECUTION","not-enforced","Native Pydantic validation/coercion, constraints, relationships, derivations, pipelines and split-loader migrations are not executed by this schema projection"),issue(Utf16::default(),"SCHEMA_ONLY","representation-change","Native values require a separate encoder; the copied source UMF remains required for native meaning")];
    let mut fatal = false;
    if let NativeJsonNode::Object(members) = root {
        for (name, _) in members {
            if name == &key("columns") {
                continue;
            }
            let p = path(&key(""), name);
            let (code, class, detail) = if name == &key("primary_key") {
                ("PRIMARY_KEY_NOT_ENFORCED","not-enforced","Avro record schemas do not enforce native table primary-key membership or uniqueness")
            } else if name == &key("context_column") {
                ("CONTEXT_DISPATCH_NOT_ENFORCED","not-enforced","The policy selects a schema context; Avro does not dispatch validation from the native context column for each row")
            } else {
                ("NATIVE_TABLE_METADATA","not-enforced","Native table metadata remains in source without Avro interpretation; target record identity is supplied by policy")
            };
            push_issue(&mut issues, p, code, class, detail);
        }
    }
    let columns = native_array(native_member(root, "columns")).unwrap_or(&[]);
    let selections = get(&policy, "fields");
    let bindings = selections
        .and_then(|v| {
            if let Value::Object(fields) = v {
                Some(fields.as_slice())
            } else {
                None
            }
        })
        .unwrap_or(&[]);
    for (index, column) in columns.iter().enumerate() {
        if let Some(name) = native_text(native_member(column, "name")) {
            if !bindings.iter().any(|(candidate, _)| candidate == name) {
                push_issue(
                    &mut issues,
                    indexed(&key(""), "columns", index),
                    "COLUMN_OMITTED",
                    "not-enforced",
                    "Native column omitted by explicit field selection",
                );
            }
        }
    }
    let mut avro_fields = Vec::new();
    let mut mappings = Vec::new();
    for (column_name, binding) in bindings {
        let found = columns
            .iter()
            .position(|column| native_text(native_member(column, "name")) == Some(column_name));
        let Some(index) = found else {
            fatal = true;
            push_issue(
                &mut issues,
                path(&key("/fields"), column_name),
                "TABLESPEC_AVRO_UNSUPPORTED",
                "unsupported",
                "Selected column does not exist",
            );
            continue;
        };
        let col = &columns[index];
        let at = indexed(&key(""), "columns", index);
        let nullable_node = native_member(col, "nullable");
        let context_name = text(get(&policy, "context"));
        let source_nullable = match nullable_node {
            Some(NativeJsonNode::Boolean(v)) => Some(*v),
            Some(NativeJsonNode::Object(fields)) => context_name.and_then(|context| {
                fields
                    .iter()
                    .find(|(k, _)| k == context)
                    .and_then(|(_, v)| match v {
                        NativeJsonNode::Boolean(v) => Some(*v),
                        _ => None,
                    })
            }),
            _ => None,
        };
        let bound_nullable = get(binding, "nullable");
        let nullable = if text(bound_nullable).is_some_and(|v| v == &key("source")) {
            source_nullable
        } else {
            match bound_nullable {
                Some(Value::Bool(v)) => Some(*v),
                _ => None,
            }
        };
        if nullable.is_none() {
            fatal = true;
            push_issue(&mut issues,path(&at,&key("nullable")),"TABLESPEC_AVRO_UNSUPPORTED","unsupported","Missing/unknown source nullability or context; provide a known context or explicit boolean binding");
            continue;
        }
        let nullable = nullable.unwrap();
        if !text(bound_nullable).is_some_and(|v| v == &key("source"))
            && source_nullable != Some(nullable)
        {
            push_issue(
                &mut issues,
                path(&at, &key("nullable")),
                "NULLABILITY_BINDING",
                "not-enforced",
                "Explicit target nullability overrides or supplies native/contextual nullability",
            );
        }
        if matches!(nullable_node, Some(NativeJsonNode::Object(_))) && source_nullable.is_some() {
            push_issue(
                &mut issues,
                path(&at, &key("nullable")),
                "CONTEXT_SELECTED",
                "annotation-only",
                "Only the selected context is represented; other context meanings remain in source",
            );
        }
        let representation = str_value(get(binding, "representation")).unwrap_or_default();
        let data_type = native_text(native_member(col, "data_type"))
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        let mut faults = false;
        for name in if representation == "decimal" {
            vec!["precision", "scale"]
        } else if representation == "embedding-float32" {
            vec!["dimension"]
        } else {
            vec![]
        } {
            if matches!(native_member(col, name), Some(NativeJsonNode::Number(_)))
                && native_number(native_member(col, name)).is_none()
            {
                fatal = true;
                faults = true;
                push_issue(&mut issues,path(&at,&Utf16::from(name)),"TABLESPEC_AVRO_UNSUPPORTED","unsupported","Selected numeric qualifier must be an exact interoperable integer; source numeric rounding is not permitted");
            }
        }
        if faults {
            continue;
        }
        let mut ty = None::<Value>;
        let mut consumed_native = Vec::new();
        match representation.as_str() {
            "string" => {
                ty = Some(string("string"));
                push_issue(&mut issues,at.clone(),if ["VARCHAR","TEXT","CHAR"].contains(&data_type.as_str()){"TEXT_REFINEMENTS"}else{"TEXT_REPRESENTATION"},"not-enforced","Native length, formats, conversion and lexical validation are not enforced by Avro string");
            }
            "int32" | "int64" if data_type == "INTEGER" => {
                ty = Some(string(if representation == "int32" {
                    "int"
                } else {
                    "long"
                }));
                push_issue(&mut issues,at.clone(),"INTEGER_PROFILE","not-enforced","Selected integer width is a binding choice; the pinned Spark helper uses 32 bits and other execution rules remain source-owned");
            }
            "float32" | "float64" if data_type == "FLOAT" => {
                ty = Some(string(if representation == "float32" {
                    "float"
                } else {
                    "double"
                }));
                push_issue(&mut issues,at.clone(),"FLOAT_PROFILE","not-enforced","Selected floating width does not establish native rounding, non-finite or execution semantics");
            }
            "boolean" if data_type == "BOOLEAN" => ty = Some(string("boolean")),
            "decimal" if data_type == "DECIMAL" => {
                let p = native_number(native_member(col, "precision"));
                let s = native_number(native_member(col, "scale"));
                if p.is_none_or(|p| p < 1 || p > 1000)
                    || s.is_none_or(|s| s < 0 || s > p.unwrap_or(0))
                {
                    fatal = true;
                    push_issue(&mut issues,at.clone(),"TABLESPEC_AVRO_UNSUPPORTED","unsupported","Explicit decimal precision 1–1000 and scale 0–precision are required; no native defaults are inferred");
                } else {
                    ty = Some(obj(vec![
                        ("type", string("bytes")),
                        ("logicalType", string("decimal")),
                        ("precision", Value::Number(p.unwrap() as f64)),
                        ("scale", Value::Number(s.unwrap() as f64)),
                    ]));
                    consumed_native.extend(["precision", "scale"]);
                    push_issue(&mut issues,at.clone(),"DECIMAL_ENCODING","representation-change","Values require signed big-endian unscaled decimal bytes; native coercion/rounding and engine precision limits remain source-owned");
                }
            }
            "date" if data_type == "DATE" => {
                ty = Some(obj(vec![
                    ("type", string("int")),
                    ("logicalType", string("date")),
                ]));
                push_issue(&mut issues,at.clone(),"DATE_REPRESENTATION","representation-change","TableSpec helper profiles disagree on date storage; selected logical dates require parsing and epoch-day encoding");
            }
            "timestamp-micros" | "local-timestamp-micros"
                if ["DATETIME", "TIMESTAMP"].contains(&data_type.as_str()) =>
            {
                ty = Some(obj(vec![
                    ("type", string("long")),
                    ("logicalType", string(&representation)),
                ]));
                push_issue(&mut issues,at.clone(),"TIMESTAMP_REPRESENTATION","representation-change","Caller selects instant/local-wall-clock microseconds; native parsing, timezone, range and precision correspondence is not established");
            }
            "embedding-float32" if data_type == "EMBEDDING" => {
                let dimension = native_number(native_member(col, "dimension"));
                let nullable_items = match get(binding, "itemsNullable") {
                    Some(Value::Bool(v)) => Some(*v),
                    _ => None,
                };
                if dimension.is_none_or(|d| d < 1) || nullable_items.is_none() {
                    fatal = true;
                    push_issue(&mut issues,at.clone(),"TABLESPEC_AVRO_UNSUPPORTED","unsupported","Embedding requires positive native dimension and explicit item nullability");
                } else {
                    let item = if nullable_items.unwrap() {
                        Value::Array(vec![string("null"), string("float")])
                    } else {
                        string("float")
                    };
                    ty = Some(obj(vec![("type", string("array")), ("items", item)]));
                    consumed_native.push("dimension");
                    push_issue(
                        &mut issues,
                        at.clone(),
                        "EMBEDDING_DIMENSION",
                        "not-enforced",
                        "Avro array does not enforce native dimension",
                    );
                    push_issue(&mut issues,at.clone(),"EMBEDDING_PROFILE","representation-change","Float32 elements and their nullability are explicit bindings; vector execution semantics remain in source");
                }
            }
            _ => {
                fatal = true;
                push_issue(
                    &mut issues,
                    at.clone(),
                    "TABLESPEC_AVRO_UNSUPPORTED",
                    "unsupported",
                    "Representation does not match the known native type",
                );
            }
        }
        if native_truthy(native_member(col, "internal")) {
            push_issue(&mut issues,at.clone(),"INTERNAL_FIELD_EXPOSED","representation-change","Explicit binding exposes a native internal column normally omitted from output schemas");
        }
        for refinement in ["precision", "scale", "dimension", "length"] {
            if native_member(col, refinement).is_some()
                && !consumed_native.contains(&refinement)
                && !(representation == "string" && refinement == "length")
            {
                push_issue(
                    &mut issues,
                    path(&at, &key(refinement)),
                    "NATIVE_REFINEMENT",
                    "not-enforced",
                    "Native refinement is not represented by the selected target type",
                );
            }
        }
        if let NativeJsonNode::Object(entries) = col {
            for (name, _) in entries {
                if ![
                    "name",
                    "data_type",
                    "nullable",
                    "description",
                    "precision",
                    "scale",
                    "dimension",
                    "length",
                    "internal",
                ]
                .iter()
                .any(|v| name == &key(v))
                {
                    push_issue(
                        &mut issues,
                        path(&at, name),
                        "NATIVE_METADATA",
                        "not-enforced",
                        "Native field metadata remains in source without Avro interpretation",
                    );
                }
            }
        }
        if let Some(ty) = ty {
            let name = text(get(binding, "name")).unwrap().clone();
            let field_type = if nullable {
                Value::Array(vec![string("null"), ty])
            } else {
                ty
            };
            let mut entries = vec![
                (key("name"), Value::String(name.clone())),
                (key("type"), field_type),
            ];
            if let Some(doc) = native_text(native_member(col, "description")) {
                entries.push((key("doc"), Value::String(doc.clone())));
            }
            avro_fields.push(Value::Object(entries));
            mappings.push(obj(vec![
                ("index", Value::Number(index as f64)),
                ("column", Value::String(column_name.clone())),
                ("field", Value::String(name)),
                ("representation", string(&representation)),
                ("nullable", Value::Bool(nullable)),
            ]));
        }
    }
    let record = text(get(&policy, "recordName")).unwrap().clone();
    let namespace = text(get(&policy, "namespace")).unwrap().clone();
    let schema_value = obj(vec![
        ("type", string("record")),
        ("name", Value::String(record)),
        ("namespace", Value::String(namespace)),
        ("fields", Value::Array(avro_fields)),
    ]);
    if fatal
        || str_value(get(&policy, "lossPolicy")).as_deref() == Some("strict") && !issues.is_empty()
    {
        return Ok(projection(
            source, policy, issues, mappings, None, None, fatal,
        ));
    }
    let schema = write_json_value(&schema_value, Format::Json, ctx)?;
    let id = text(get(&policy, "id")).unwrap().clone();
    let target = avro_document::import_schema(&id, schema.units(), &[], ctx)?;
    Ok(projection(
        source,
        policy,
        issues,
        mappings,
        Some(target),
        Some(schema),
        false,
    ))
}

// Keep imported helpers used by exact native-number qualification visible to
// the compiler without converting arbitrary native strings through UTF-8.
