// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned Arrow ↔ Spark schema projection composition.
use crate::{
    context::Context,
    error::EngineError,
    serialization::{read_json_value, write_json_value, Format},
    value::{copy_json, Utf16, Value},
};

use super::spark_schema::SparkSchemaResources;

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
    text(value).and_then(|v| v.to_utf8().ok())
}
fn bool_value(value: Option<&Value>) -> Option<bool> {
    match value {
        Some(Value::Bool(v)) => Some(*v),
        _ => None,
    }
}
fn num(value: Option<&Value>) -> Option<i64> {
    match value {
        Some(Value::Number(n)) if n.is_finite() && n.fract() == 0.0 => Some(*n as i64),
        _ => None,
    }
}
fn err(code: &str, msg: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), msg)
}
fn json(value: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    write_json_value(value, Format::Json, ctx)
}
fn parse(value: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    read_json_value(value.units(), Format::Json, ctx)
}
fn ptr_segment(value: &Utf16) -> Utf16 {
    let mut out = Vec::new();
    for u in value.units() {
        match *u {
            0x7e => out.extend([b'~' as u16, b'0' as u16]),
            0x2f => out.extend([b'~' as u16, b'1' as u16]),
            x => out.push(x),
        }
    }
    Utf16::new(out)
}
fn path(base: &Utf16, segment: &str) -> Utf16 {
    path_utf16(base, &key(segment))
}
fn path_utf16(base: &Utf16, segment: &Utf16) -> Utf16 {
    let mut out = base.units().to_vec();
    out.push(b'/' as u16);
    out.extend(ptr_segment(segment).into_units());
    Utf16::new(out)
}
fn child_path(base: &Utf16, name: &str, index: usize) -> Utf16 {
    path(&path(base, name), &index.to_string())
}
fn index_path(base: &Utf16, index: usize) -> Utf16 {
    path(base, &index.to_string())
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
fn push_issue(issues: &mut Vec<Value>, path: Utf16, code: &str, class: &str, detail: &str) {
    issues.push(issue(path, code, class, detail));
}
fn known(value: &Value, keys: &[&str], at: &Utf16, issues: &mut Vec<Value>, fatal: &mut bool) {
    if let Value::Object(fields) = value {
        for (name, _) in fields {
            if !keys.iter().any(|k| name == &key(k)) {
                *fatal = true;
                push_issue(
                    issues,
                    {
                        let mut p = at.units().to_vec();
                        p.push(b'/' as u16);
                        p.extend(ptr_segment(name).into_units());
                        Utf16::new(p)
                    },
                    "ARROW_SPARK_UNSUPPORTED",
                    "unsupported",
                    "Unknown Arrow property cannot be lowered",
                );
            }
        }
    }
}
fn check_arrow_source_context(source: &Value, issues: &mut Vec<Value>, fatal: &mut bool) {
    if let Value::Object(fields) = source {
        for (name, _) in fields {
            if !["umf", "id", "modules", "vocabularies"]
                .iter()
                .any(|k| name == &key(k))
            {
                push_issue(
                    issues,
                    path_utf16(&key(""), name),
                    "ARROW_SOURCE_CONTEXT",
                    "loss",
                    "UMF document context remains in source only",
                );
            }
        }
    }
    if let Some(modules) = array(get(source, "modules")) {
        for (mi, module) in modules.iter().enumerate() {
            let mp = index_path(&key("/modules"), mi);
            if str_value(get(module, "id")).as_deref() != Some("metadata") {
                *fatal = true;
                push_issue(
                    issues,
                    mp.clone(),
                    "ARROW_SPARK_UNSUPPORTED",
                    "unsupported",
                    "Extra source module",
                );
            }
            if let Value::Object(fields) = module {
                for (name, value) in fields {
                    let known =
                        name == &key("id") || name == &key("namespace") || name == &key("elements");
                    let has_namespace = !matches!(value, Value::Null)
                        && !matches!(value, Value::String(s) if s.is_empty());
                    if !known || name == &key("namespace") && has_namespace {
                        push_issue(
                            issues,
                            path_utf16(&mp, name),
                            "ARROW_SOURCE_CONTEXT",
                            "loss",
                            "Module context remains in source",
                        );
                    }
                }
            }
            if let Some(elements) = array(get(module, "elements")) {
                for (ei, element) in elements.iter().enumerate() {
                    let ep = child_path(&mp, "elements", ei);
                    if str_value(get(element, "id")).as_deref() != Some("root") {
                        *fatal = true;
                        push_issue(
                            issues,
                            ep.clone(),
                            "ARROW_SPARK_UNSUPPORTED",
                            "unsupported",
                            "Extra source element",
                        );
                    }
                    if let Value::Object(fields) = element {
                        for (name, _) in fields {
                            if name != &key("id") && name != &key("extensions") {
                                push_issue(
                                    issues,
                                    path_utf16(&ep, name),
                                    "ARROW_SOURCE_CONTEXT",
                                    "loss",
                                    "Element context remains in source",
                                );
                            }
                        }
                    }
                    if let Some(Value::Object(extensions)) = get(element, "extensions") {
                        for (name, _) in extensions {
                            if name != &key("umf.arrow.flatbuffer") {
                                push_issue(
                                    issues,
                                    path_utf16(&path(&ep, "extensions"), name),
                                    "ARROW_SOURCE_CONTEXT",
                                    "loss",
                                    "Extension context remains in source",
                                );
                            }
                        }
                    }
                }
            }
        }
    }
    if let Some(Value::Object(vocabs)) = get(source, "vocabularies") {
        for (id, declaration) in vocabs {
            if id != &key("umf.arrow.flatbuffer")
                || matches!(declaration, Value::Object(fields) if fields.iter().any(|(k,_)| k != &key("version")))
            {
                push_issue(
                    issues,
                    path_utf16(&key("/vocabularies"), id),
                    "ARROW_SOURCE_CONTEXT",
                    "loss",
                    "Vocabulary context remains in source",
                );
            }
        }
    }
}
fn policy(
    source: &Value,
    input: &Value,
    dir: &str,
    ctx: &mut Context<'_>,
) -> Result<(Value, Value), EngineError> {
    let id = text(get(input, "id"))
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            err(
                if dir == "arrow" {
                    "ARROW_SPARK_POLICY"
                } else {
                    "SPARK_ARROW_POLICY"
                },
                "Explicit projection id required",
            )
        })?;
    let id = id.clone();
    let source = copy_json(source, ctx)?;
    let policy = copy_json(input, ctx)?;
    let allowed = if dir == "arrow" {
        vec!["id", "preferTimestampNtz", "variant", "lossPolicy"]
    } else {
        vec![
            "id",
            "timestampUtc",
            "largeTypes",
            "rejectNestedDuplicates",
            "lossPolicy",
        ]
    };
    if let Value::Object(fields) = &policy {
        if fields
            .iter()
            .any(|(k, _)| !allowed.iter().any(|a| k == &key(a)))
        {
            return Err(err(
                if dir == "arrow" {
                    "ARROW_SPARK_POLICY"
                } else {
                    "SPARK_ARROW_POLICY"
                },
                "Unknown projection policy option",
            ));
        }
    }
    let expected = if dir == "arrow" {
        bool_value(get(&policy, "preferTimestampNtz")).is_some()
            && matches!(
                str_value(get(&policy, "variant")).as_deref(),
                Some("spark-tagged-struct" | "preserve-struct")
            )
    } else {
        bool_value(get(&policy, "timestampUtc")).is_some()
            && bool_value(get(&policy, "largeTypes")).is_some()
            && bool_value(get(&policy, "rejectNestedDuplicates")).is_some()
    };
    if !expected
        || !matches!(
            str_value(get(&policy, "lossPolicy")).as_deref(),
            Some("strict" | "allow-reported-loss")
        )
    {
        return Err(err(
            if dir == "arrow" {
                "ARROW_SPARK_POLICY"
            } else {
                "SPARK_ARROW_POLICY"
            },
            "Explicit supported projection policy required",
        ));
    }
    let _ = id;
    Ok((source, policy))
}
fn projection(
    source: Value,
    policy: Value,
    issues: Vec<Value>,
    target: Option<Value>,
    fatal: bool,
) -> Value {
    let strict = str_value(get(&policy, "lossPolicy")).as_deref() == Some("strict");
    let blocked = fatal || (strict && !issues.is_empty());
    let mut fields = vec![
        (
            key("status"),
            string(if blocked { "blocked" } else { "projected" }),
        ),
        (key("complete"), Value::Bool(false)),
        (key("source"), source),
        (key("policy"), policy),
        (key("issues"), Value::Array(issues)),
    ];
    if !blocked {
        if let Some(target) = target {
            fields.push((key("target"), target));
        }
    }
    Value::Object(fields)
}

pub fn project_arrow_to_spark(
    source: &Value,
    input: &Value,
    spark: &SparkSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (source, policy) = policy(source, input, "arrow", ctx)?;
    let id = text(get(&policy, "id")).unwrap().clone();
    let arrow_text = crate::arrow_flatbuffer_model::export_arrow_flatbuffer_model(&source, ctx)?;
    let model = parse(&arrow_text, ctx)?;
    let mut issues = Vec::new();
    let mut fatal = false;
    known(
        &model,
        &["rootType", "value"],
        &key(""),
        &mut issues,
        &mut fatal,
    );
    let mut schema = get(&model, "value").cloned().unwrap_or(Value::Null);
    let mut at = key("/value");
    let root = str_value(get(&model, "rootType")).unwrap_or_default();
    if root == "Message" {
        let head = get(&schema, "header").cloned().unwrap_or(Value::Null);
        known(
            &schema,
            &["version", "header", "bodyLength", "custom_metadata"],
            &at,
            &mut issues,
            &mut fatal,
        );
        let body_empty = match get(&schema, "bodyLength") {
            None | Some(Value::Null) => true,
            Some(Value::String(value)) => value == &key("0"),
            Some(Value::Number(value)) => *value == 0.0,
            _ => false,
        };
        if str_value(get(&head, "type")).as_deref() != Some("Schema") || !body_empty {
            push_issue(
                &mut issues,
                at,
                "ARROW_SPARK_UNSUPPORTED",
                "unsupported",
                "Expected a body-free schema message",
            );
            return Ok(projection(source, policy, issues, None, true));
        }
        if array(get(&schema, "custom_metadata")).is_some_and(|items| !items.is_empty()) {
            push_issue(
                &mut issues,
                path(&at, "custom_metadata"),
                "ARROW_METADATA_LOSS",
                "loss",
                "Arrow metadata remains only in retained source",
            );
        }
        schema = get(&head, "value").cloned().unwrap_or(Value::Null);
        known(
            &head,
            &["type", "value"],
            &path(&at, "header"),
            &mut issues,
            &mut fatal,
        );
        at = key("/value/header/value");
    } else if root != "Schema" {
        push_issue(
            &mut issues,
            key(""),
            "ARROW_SPARK_UNSUPPORTED",
            "unsupported",
            "Expected Schema or schema Message root",
        );
        return Ok(projection(source, policy, issues, None, true));
    }
    known(
        &schema,
        &["endianness", "fields", "custom_metadata", "features"],
        &at,
        &mut issues,
        &mut fatal,
    );
    if array(get(&schema, "custom_metadata")).is_some_and(|a| !a.is_empty()) {
        push_issue(
            &mut issues,
            path(&at, "custom_metadata"),
            "ARROW_METADATA_LOSS",
            "loss",
            "Arrow metadata remains only in retained source",
        );
    }
    if array(get(&schema, "features")).is_some_and(|a| !a.is_empty()) {
        push_issue(
            &mut issues,
            path(&at, "features"),
            "ARROW_FEATURES_LOSS",
            "loss",
            "Arrow protocol feature requirements remain only in source",
        );
    }
    if str_value(get(&schema, "endianness")).as_deref() == Some("Big") {
        push_issue(
            &mut issues,
            path(&at, "endianness"),
            "ARROW_ENDIANNESS_LOSS",
            "loss",
            "Spark schema does not retain Arrow physical byte order",
        );
    }
    let fields = array(get(&schema, "fields")).unwrap_or(&[]);
    let mut spark_fields = Vec::new();
    for (i, f) in fields.iter().enumerate() {
        let p = child_path(&at, "fields", i);
        let mapped = arrow_field(f, &p, &policy, &mut issues, &mut fatal, ctx)?;
        spark_fields.push(mapped);
    }
    check_arrow_source_context(&source, &mut issues, &mut fatal);
    if fatal
        || (str_value(get(&policy, "lossPolicy")).as_deref() == Some("strict")
            && !issues.is_empty())
    {
        return Ok(projection(source, policy, issues, None, fatal));
    }
    // Any remaining Arrow document context is loss-only and the complete source is always returned.
    let root_value = obj(vec![
        ("type", string("struct")),
        ("fields", Value::Array(spark_fields)),
    ]);
    let target_text = json(&root_value, ctx)?;
    let target = crate::spark_schema::import_spark_schema(target_text.units(), &id, spark, ctx)?;
    Ok(projection(source, policy, issues, Some(target), fatal))
}

fn arrow_field(
    f: &Value,
    at: &Utf16,
    policy: &Value,
    issues: &mut Vec<Value>,
    fatal: &mut bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    known(
        f,
        &[
            "name",
            "nullable",
            "type",
            "dictionary",
            "children",
            "custom_metadata",
        ],
        at,
        issues,
        fatal,
    );
    if array(get(f, "custom_metadata")).is_some_and(|a| !a.is_empty()) {
        push_issue(
            issues,
            path(at, "custom_metadata"),
            "ARROW_METADATA_LOSS",
            "loss",
            "Arrow metadata remains only in retained source",
        );
    }
    if let Some(name) = array(get(f, "custom_metadata")) {
        if name.iter().any(|m| {
            matches!(
                str_value(get(m, "key")).as_deref(),
                Some("ARROW:extension:name" | "ARROW:extension:metadata")
            )
        }) {
            *fatal = true;
            push_issue(issues,path(at,"custom_metadata"),"ARROW_EXTENSION_UNINTERPRETED","unsupported","Arrow extension semantics cannot be equated with physical storage without an explicit mapping");
        }
    }
    let name = text(get(f, "name")).cloned().unwrap_or_default();
    if get(f, "name").is_none() {
        push_issue(
            issues,
            path(at, "name"),
            "ARROW_FIELD_NAME_DEFAULT",
            "representation-change",
            "Absent Arrow field name becomes an empty Spark name",
        );
    }
    if let Some(dictionary) = get(f, "dictionary") {
        known(
            dictionary,
            &["id", "indexType", "isOrdered", "dictionaryKind"],
            &path(at, "dictionary"),
            issues,
            fatal,
        );
        push_issue(issues, path(at,"dictionary"), "ARROW_DICTIONARY_LOSS", "loss", "Dictionary identity, index encoding and ordering are not represented in Spark value type");
    }
    let type_value = get(f, "type").unwrap_or(&Value::Null);
    known(
        type_value,
        &["type", "value"],
        &path(at, "type"),
        issues,
        fatal,
    );
    let tag = str_value(get(type_value, "type")).unwrap_or_default();
    let v = get(type_value, "value").unwrap_or(&Value::Null);
    let children = array(get(f, "children")).unwrap_or(&[]);
    let allowed = match tag.as_str() {
        "Int" => &["bitWidth", "is_signed"][..],
        "FloatingPoint" => &["precision"][..],
        "Decimal" => &["precision", "scale", "bitWidth"][..],
        "Timestamp" => &["unit", "timezone"][..],
        "Duration" | "Date" => &["unit"][..],
        "Map" => &["keysSorted"][..],
        "FixedSizeBinary" => &["byteWidth"][..],
        "FixedSizeList" => &["listSize"][..],
        _ => &[][..],
    };
    known(v, allowed, &path(at, "type/value"), issues, fatal);
    let mapped = arrow_type(tag.as_str(), v, children, f, at, policy, issues, fatal, ctx)?;
    Ok(obj(vec![
        ("name", Value::String(name)),
        ("type", mapped),
        (
            "nullable",
            Value::Bool(bool_value(get(f, "nullable")).unwrap_or(false)),
        ),
        ("metadata", obj(vec![])),
    ]))
}
fn arrow_type(
    tag: &str,
    v: &Value,
    children: &[Value],
    field: &Value,
    at: &Utf16,
    policy: &Value,
    issues: &mut Vec<Value>,
    fatal: &mut bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let scalar = |s: &str| string(s);
    if !["Struct_", "List", "LargeList", "FixedSizeList", "Map"].contains(&tag)
        && !children.is_empty()
    {
        *fatal = true;
        push_issue(
            issues,
            path(at, "children"),
            "ARROW_SPARK_UNSUPPORTED",
            "unsupported",
            "Scalar Arrow type has unexpected children",
        );
        return Ok(scalar("void"));
    }
    let value = match tag {
        "Bool" => scalar("boolean"),
        "Int" => {
            let bits = num(get(v, "bitWidth")).unwrap_or(0);
            let name = match (bits, bool_value(get(v, "is_signed"))) {
                (8, Some(true)) => "byte",
                (16, Some(true)) => "short",
                (32, Some(true)) => "integer",
                (64, Some(true)) => "long",
                _ => {
                    *fatal = true;
                    push_issue(
                        issues,
                        at.clone(),
                        "ARROW_SPARK_UNSUPPORTED",
                        "unsupported",
                        "Unsigned or unsupported integer width",
                    );
                    "void"
                }
            };
            scalar(name)
        }
        "FloatingPoint" => match str_value(get(v, "precision")).as_deref() {
            Some("SINGLE") => scalar("float"),
            Some("DOUBLE") => scalar("double"),
            _ => {
                *fatal = true;
                push_issue(
                    issues,
                    at.clone(),
                    "ARROW_SPARK_UNSUPPORTED",
                    "unsupported",
                    "Half precision has no verified Spark mapping",
                );
                scalar("void")
            }
        },
        "Utf8" | "LargeUtf8" => {
            if tag == "LargeUtf8" {
                push_issue(
                    issues,
                    at.clone(),
                    "ARROW_OFFSET_WIDTH_LOSS",
                    "loss",
                    "Spark string does not retain Arrow offset width",
                );
            }
            scalar("string")
        }
        "Binary" | "LargeBinary" | "FixedSizeBinary" => {
            if tag != "Binary" {
                push_issue(
                    issues,
                    at.clone(),
                    "ARROW_BINARY_LAYOUT_LOSS",
                    "loss",
                    "Spark binary does not retain fixed size or large-offset layout",
                );
            }
            if tag == "FixedSizeBinary" && num(get(v, "byteWidth")).unwrap_or(0) < 0 {
                *fatal = true;
                push_issue(
                    issues,
                    at.clone(),
                    "ARROW_SPARK_UNSUPPORTED",
                    "unsupported",
                    "Invalid fixed binary width",
                );
            }
            scalar("binary")
        }
        "Null" => {
            if bool_value(get(field, "nullable")) != Some(true) {
                *fatal = true;
                push_issue(
                    issues,
                    at.clone(),
                    "ARROW_SPARK_UNSUPPORTED",
                    "unsupported",
                    "Non-nullable null field is invalid Arrow",
                );
            }
            scalar("void")
        }
        "Decimal" => {
            let p = num(get(v, "precision")).unwrap_or(0);
            let s = num(get(v, "scale")).unwrap_or(0);
            let width = num(get(v, "bitWidth")).unwrap_or(128);
            if !(1..=38).contains(&p) || s < 0 || s > p || ![32, 64, 128, 256].contains(&width) {
                *fatal = true;
                push_issue(
                    issues,
                    at.clone(),
                    "ARROW_SPARK_UNSUPPORTED",
                    "unsupported",
                    "Decimal width/range/configuration outside verified Spark target",
                );
                scalar("void")
            } else {
                if width != 128 {
                    push_issue(
                        issues,
                        at.clone(),
                        "ARROW_DECIMAL_WIDTH_LOSS",
                        "loss",
                        "Spark decimal does not retain Arrow physical decimal width",
                    );
                }
                string(&format!("decimal({p},{s})"))
            }
        }
        "Date" => {
            if str_value(get(v, "unit")).as_deref() == Some("DAY") {
                scalar("date")
            } else {
                *fatal = true;
                push_issue(
                    issues,
                    at.clone(),
                    "ARROW_SPARK_UNSUPPORTED",
                    "unsupported",
                    "Only date32 is mapped by the pinned native conversion",
                );
                scalar("void")
            }
        }
        "Timestamp" => {
            if str_value(get(v, "unit")).as_deref() != Some("MICROSECOND") {
                push_issue(issues,at.clone(),"ARROW_TIMESTAMP_UNIT_LOSS","loss","Spark timestamp is microsecond-based; data conversion may lose precision or require scaling");
            }
            if text(get(v, "timezone")).is_some_and(|s| !s.is_empty()) {
                push_issue(
                    issues,
                    at.clone(),
                    "ARROW_TIMEZONE_LOSS",
                    "loss",
                    "Spark timestamp does not retain Arrow timezone label",
                );
                scalar("timestamp")
            } else {
                push_issue(issues,at.clone(),"ARROW_TIMESTAMP_INTERPRETATION","representation-change","Timezone-free timestamp recovery follows the explicit preferTimestampNtz choice");
                scalar(
                    if bool_value(get(policy, "preferTimestampNtz")) == Some(true) {
                        "timestamp_ntz"
                    } else {
                        "timestamp"
                    },
                )
            }
        }
        "Duration" => {
            push_issue(
                issues,
                at.clone(),
                "ARROW_DURATION_INTERPRETATION",
                "representation-change",
                "Arrow duration lowers to Spark day-to-second interval; Arrow unit is not retained",
            );
            scalar("interval day to second")
        }
        "Map" => {
            let entry = children.first();
            let items = entry.and_then(|e| array(get(e, "children")));
            if children.len() != 1
                || entry.is_none()
                || items.is_none_or(|xs| xs.len() != 2)
                || str_value(get(
                    get(entry.unwrap(), "type").unwrap_or(&Value::Null),
                    "type",
                ))
                .as_deref()
                    != Some("Struct_")
                || bool_value(get(entry.unwrap(), "nullable")) == Some(true)
                || bool_value(get(&items.unwrap()[0], "nullable")) == Some(true)
            {
                *fatal = true;
                push_issue(
                    issues,
                    at.clone(),
                    "ARROW_SPARK_UNSUPPORTED",
                    "unsupported",
                    "Invalid Arrow map entry/key layout",
                );
                scalar("void")
            } else {
                let entry = entry.unwrap();
                let items = items.unwrap();
                known(
                    entry,
                    &["name", "nullable", "type", "children", "custom_metadata"],
                    &child_path(at, "children", 0),
                    issues,
                    fatal,
                );
                known(
                    get(entry, "type").unwrap_or(&Value::Null),
                    &["type", "value"],
                    &path(&child_path(at, "children", 0), "type"),
                    issues,
                    fatal,
                );
                known(
                    get(get(entry, "type").unwrap_or(&Value::Null), "value")
                        .unwrap_or(&Value::Null),
                    &[],
                    &path(&path(&child_path(at, "children", 0), "type"), "value"),
                    issues,
                    fatal,
                );
                if array(get(entry, "custom_metadata")).is_some_and(|metadata| !metadata.is_empty())
                {
                    push_issue(
                        issues,
                        child_path(at, "children", 0),
                        "ARROW_METADATA_LOSS",
                        "loss",
                        "Arrow metadata remains only in retained source",
                    );
                }
                if bool_value(get(v, "keysSorted")) == Some(true) {
                    push_issue(
                        issues,
                        at.clone(),
                        "ARROW_MAP_ORDER_LOSS",
                        "loss",
                        "Spark map does not retain keysSorted",
                    );
                }
                if bool_value(get(&items[1], "nullable")) != Some(true) {
                    push_issue(
                        issues,
                        child_path(at, "children", 0),
                        "ARROW_VALUE_NULLABILITY_LOSS",
                        "loss",
                        "Native Spark recovery widens map value nullability",
                    );
                }
                if str_value(get(entry, "name")).as_deref() != Some("entries")
                    || str_value(get(&items[0], "name")).as_deref() != Some("key")
                    || str_value(get(&items[1], "name")).as_deref() != Some("value")
                {
                    push_issue(
                        issues,
                        path(at, "children"),
                        "ARROW_CHILD_NAME_LOSS",
                        "loss",
                        "Spark map does not retain Arrow entry/key/value names",
                    );
                }
                let key_at = child_path(&child_path(at, "children", 0), "children", 0);
                let value_at = child_path(&child_path(at, "children", 0), "children", 1);
                let k = arrow_field(&items[0], &key_at, policy, issues, fatal, ctx)?;
                let val = arrow_field(&items[1], &value_at, policy, issues, fatal, ctx)?;
                obj(vec![
                    ("type", scalar("map")),
                    ("keyType", get(&k, "type").cloned().unwrap_or(Value::Null)),
                    (
                        "valueType",
                        get(&val, "type").cloned().unwrap_or(Value::Null),
                    ),
                    ("valueContainsNull", Value::Bool(true)),
                ])
            }
        }
        "List" | "LargeList" | "FixedSizeList" => {
            if children.len() != 1 {
                *fatal = true;
                push_issue(
                    issues,
                    at.clone(),
                    "ARROW_SPARK_UNSUPPORTED",
                    "unsupported",
                    "List requires exactly one child",
                );
                scalar("void")
            } else {
                if tag != "List" {
                    push_issue(
                        issues,
                        at.clone(),
                        "ARROW_LIST_LAYOUT_LOSS",
                        "loss",
                        "Spark array does not retain large offsets or fixed list length",
                    );
                }
                if tag == "FixedSizeList" && num(get(v, "listSize")).unwrap_or(0) < 0 {
                    *fatal = true;
                    push_issue(
                        issues,
                        at.clone(),
                        "ARROW_SPARK_UNSUPPORTED",
                        "unsupported",
                        "Invalid fixed list size",
                    );
                }
                let mut child = arrow_field(
                    &children[0],
                    &child_path(at, "children", 0),
                    policy,
                    issues,
                    fatal,
                    ctx,
                )?;
                if bool_value(get(&children[0], "nullable")) != Some(true) {
                    push_issue(
                        issues,
                        child_path(at, "children", 0),
                        "ARROW_ELEMENT_NULLABILITY_LOSS",
                        "loss",
                        "Native Spark recovery widens array element nullability",
                    );
                }
                if str_value(get(&children[0], "name")).as_deref() != Some("element") {
                    push_issue(
                        issues,
                        child_path(at, "children", 0),
                        "ARROW_CHILD_NAME_LOSS",
                        "loss",
                        "Spark array has no named element field",
                    );
                }
                let child_type = get(&child, "type").cloned().unwrap_or(Value::Null);
                obj(vec![
                    ("type", scalar("array")),
                    ("elementType", child_type),
                    ("containsNull", Value::Bool(true)),
                ])
            }
        }
        "Struct_" => {
            let marker = children.iter().any(|c| {
                str_value(get(c, "name")).as_deref() == Some("metadata")
                    && array(get(c, "custom_metadata")).is_some_and(|ms| {
                        ms.iter().any(|m| {
                            str_value(get(m, "key")).as_deref() == Some("variant")
                                && str_value(get(m, "value")).as_deref() == Some("true")
                        })
                    })
            }) && children
                .iter()
                .any(|c| str_value(get(c, "name")).as_deref() == Some("value"));
            if marker && str_value(get(policy, "variant")).as_deref() == Some("spark-tagged-struct")
            {
                let canonical = children.len() == 2
                    && str_value(get(&children[0], "name")).as_deref() == Some("value")
                    && str_value(get(&children[1], "name")).as_deref() == Some("metadata")
                    && children.iter().all(|c| {
                        str_value(get(get(c, "type").unwrap_or(&Value::Null), "type")).as_deref()
                            == Some("Binary")
                            && bool_value(get(c, "nullable")) != Some(true)
                            && get(c, "dictionary").is_none()
                            && array(get(c, "children")).is_none_or(|a| a.is_empty())
                    });
                if !canonical {
                    *fatal = true;
                    push_issue(
                        issues,
                        at.clone(),
                        "ARROW_SPARK_UNSUPPORTED",
                        "unsupported",
                        "Variant marker on a noncanonical Spark physical struct",
                    );
                    scalar("void")
                } else {
                    for (i, c) in children.iter().enumerate() {
                        let _ = arrow_field(
                            c,
                            &child_path(at, "children", i),
                            policy,
                            issues,
                            fatal,
                            ctx,
                        )?;
                    }
                    push_issue(
                        issues,
                        at.clone(),
                        "ARROW_SPARK_VARIANT",
                        "representation-change",
                        "Explicit Spark variant convention replaces the tagged physical struct",
                    );
                    scalar("variant")
                }
            } else {
                let fields = children
                    .iter()
                    .enumerate()
                    .map(|(i, c)| {
                        arrow_field(
                            c,
                            &child_path(at, "children", i),
                            policy,
                            issues,
                            fatal,
                            ctx,
                        )
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                obj(vec![
                    ("type", scalar("struct")),
                    ("fields", Value::Array(fields)),
                ])
            }
        }
        _ => {
            *fatal = true;
            push_issue(
                issues,
                at.clone(),
                "ARROW_SPARK_UNSUPPORTED",
                "unsupported",
                "Unsupported Arrow type",
            );
            scalar("void")
        }
    };
    let _ = ctx;
    Ok(value)
}

pub fn project_spark_to_arrow(
    source: &Value,
    input: &Value,
    spark: &SparkSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (source, policy) = policy(source, input, "spark", ctx)?;
    let id = text(get(&policy, "id")).unwrap().clone();
    let spark_text = crate::spark_schema::export_spark_schema(&source, spark, ctx)?;
    let root = parse(&spark_text, ctx)?;
    let mut issues = Vec::new();
    let mut fatal = false;
    if str_value(get(&root, "type")).as_deref() != Some("struct") {
        push_issue(
            &mut issues,
            key(""),
            "SPARK_ARROW_UNSUPPORTED",
            "unsupported",
            "Spark-to-Arrow schema requires a StructType root",
        );
        return Ok(projection(source, policy, issues, None, true));
    }
    known_spark(
        &root,
        &["type", "fields"],
        &key(""),
        &mut issues,
        &mut fatal,
    );
    let fields = array(get(&root, "fields")).unwrap_or(&[]);
    let mut arrow_fields = Vec::new();
    for (i, f) in fields.iter().enumerate() {
        arrow_fields.push(spark_field(
            f,
            &child_path(&key(""), "fields", i),
            &policy,
            &mut issues,
            &mut fatal,
            ctx,
        )?);
    }
    check_spark_source_context(&source, &mut issues, &mut fatal);
    if fatal
        || (str_value(get(&policy, "lossPolicy")).as_deref() == Some("strict")
            && !issues.is_empty())
    {
        return Ok(projection(source, policy, issues, None, fatal));
    }
    let native = obj(vec![
        ("rootType", string("Message")),
        (
            "value",
            obj(vec![
                ("version", string("V5")),
                (
                    "header",
                    obj(vec![
                        ("type", string("Schema")),
                        ("value", obj(vec![("fields", Value::Array(arrow_fields))])),
                    ]),
                ),
                ("bodyLength", string("0")),
            ]),
        ),
    ]);
    let native_text = json(&native, ctx)?;
    let target =
        crate::arrow_flatbuffer_model::import_arrow_flatbuffer_model(&native_text, &id, ctx)?;
    Ok(projection(source, policy, issues, Some(target), fatal))
}
fn spark_field(
    field: &Value,
    at: &Utf16,
    policy: &Value,
    issues: &mut Vec<Value>,
    fatal: &mut bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    known_spark(
        field,
        &["name", "type", "nullable", "metadata"],
        at,
        issues,
        fatal,
    );
    if get(field, "nullable").is_none() {
        push_issue(
            issues,
            path(at, "nullable"),
            "SPARK_DEFAULT_NULLABLE",
            "representation-change",
            "Spark nullable default is made explicit in Arrow",
        );
    }
    if let Some(Value::Object(metadata)) = get(field, "metadata") {
        for (name, _) in metadata {
            push_issue(
                issues,
                path_utf16(&path(at, "metadata"), name),
                if name == &key("__COLLATIONS") {
                    "SPARK_COLLATION_LOSS"
                } else {
                    "SPARK_METADATA_LOSS"
                },
                "loss",
                "Spark field metadata is not conveyed by this native-compatible Arrow lowering",
            );
        }
    }
    let name = text(get(field, "name")).cloned().unwrap_or_default();
    let nullable = bool_value(get(field, "nullable")).unwrap_or(true);
    let ty = get(field, "type").unwrap_or(&Value::Null);
    let mut out = spark_type(ty, &path(at, "type"), policy, issues, fatal, ctx)?;
    if str_value(get(get(&out, "type").unwrap_or(&Value::Null), "type")).as_deref() == Some("Null")
        && !nullable
    {
        *fatal = true;
        push_issue(
            issues,
            at.clone(),
            "SPARK_ARROW_UNSUPPORTED",
            "unsupported",
            "Arrow does not allow a non-nullable null field",
        );
    }
    if let Value::Object(ref mut entries) = out {
        entries.push((key("name"), Value::String(name)));
        if nullable {
            entries.push((key("nullable"), Value::Bool(true)));
        }
    }
    Ok(out)
}
fn known_spark(
    value: &Value,
    keys: &[&str],
    at: &Utf16,
    issues: &mut Vec<Value>,
    fatal: &mut bool,
) {
    if let Value::Object(fields) = value {
        for (name, _) in fields {
            if !keys.iter().any(|k| name == &key(k)) {
                *fatal = true;
                push_issue(
                    issues,
                    path_utf16(at, name),
                    "SPARK_ARROW_UNSUPPORTED",
                    "unsupported",
                    "Unknown source property has no established Arrow meaning",
                );
            }
        }
    }
}
fn check_spark_source_context(source: &Value, issues: &mut Vec<Value>, fatal: &mut bool) {
    if let Value::Object(fields) = source {
        for (name, _) in fields {
            if !["umf", "id", "vocabularies", "modules", "extensions"]
                .iter()
                .any(|k| name == &key(k))
            {
                push_issue(
                    issues,
                    path_utf16(&key(""), name),
                    "SPARK_DOCUMENT_CONTEXT",
                    "loss",
                    "Document context remains in retained source only",
                );
            }
        }
    }
    if let Some(Value::Object(vocabs)) = get(source, "vocabularies") {
        for (id, declaration) in vocabs {
            if id != &key("umf.spark") {
                push_issue(
                    issues,
                    path_utf16(&key("/vocabularies"), id),
                    "SPARK_EXTENSION_CONTEXT",
                    "loss",
                    "Other extension semantics remain in the retained source only",
                );
            }
            if let Value::Object(fields) = declaration {
                for (name, _) in fields {
                    if name != &key("version") {
                        push_issue(
                            issues,
                            path_utf16(&path_utf16(&key("/vocabularies"), id), name),
                            "SPARK_EXTENSION_CONTEXT",
                            "loss",
                            "Vocabulary context remains in retained source only",
                        );
                    }
                }
            }
        }
    }
    if get(source, "extensions").is_some() {
        push_issue(
            issues,
            key("/extensions"),
            "SPARK_DOCUMENT_CONTEXT",
            "loss",
            "Document extensions remain in the retained source only",
        );
    }
    if let Some(modules) = array(get(source, "modules")) {
        for (mi, module) in modules.iter().enumerate() {
            let mp = index_path(&key("/modules"), mi);
            if str_value(get(module, "id")).as_deref() != Some("schema") {
                *fatal = true;
                push_issue(
                    issues,
                    mp.clone(),
                    "SPARK_ARROW_UNSUPPORTED",
                    "unsupported",
                    "Additional modules require an explicit projection contract",
                );
            }
            if let Value::Object(fields) = module {
                for (name, value) in fields {
                    if name != &key("id") && name != &key("namespace") && name != &key("elements") {
                        push_issue(
                            issues,
                            path_utf16(&mp, name),
                            "SPARK_MODULE_CONTEXT",
                            "loss",
                            "Module context remains in retained source only",
                        );
                    }
                    if name == &key("namespace")
                        && !matches!(value, Value::Null)
                        && !matches!(value,Value::String(s)if s.is_empty())
                    {
                        push_issue(
                            issues,
                            path(&mp, "namespace"),
                            "SPARK_MODULE_CONTEXT",
                            "loss",
                            "Module namespace remains in retained source only",
                        );
                    }
                }
            }
            if let Some(elements) = array(get(module, "elements")) {
                for (ei, element) in elements.iter().enumerate() {
                    let ep = child_path(&mp, "elements", ei);
                    if str_value(get(element, "id")).as_deref() != Some("schema") {
                        *fatal = true;
                        push_issue(
                            issues,
                            ep.clone(),
                            "SPARK_ARROW_UNSUPPORTED",
                            "unsupported",
                            "Additional elements require an explicit projection contract",
                        );
                    }
                    if let Value::Object(fields) = element {
                        for (name, _) in fields {
                            if name != &key("id") && name != &key("extensions") {
                                push_issue(
                                    issues,
                                    path_utf16(&ep, name),
                                    "SPARK_ELEMENT_CONTEXT",
                                    "loss",
                                    "Element context remains in retained source only",
                                );
                            }
                        }
                    }
                    if let Some(Value::Object(exts)) = get(element, "extensions") {
                        for (name, _) in exts {
                            if name != &key("umf.spark") {
                                push_issue(
                                    issues,
                                    path_utf16(&path(&ep, "extensions"), name),
                                    "SPARK_EXTENSION_CONTEXT",
                                    "loss",
                                    "Other extension content remains in retained source only",
                                );
                            }
                        }
                    }
                }
            }
        }
    }
}
fn spark_type(
    ty: &Value,
    at: &Utf16,
    policy: &Value,
    issues: &mut Vec<Value>,
    fatal: &mut bool,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if let Value::String(name) = ty {
        let spelling = match name.to_utf8() {
            Ok(value) => value,
            Err(_) => {
                *fatal = true;
                push_issue(
                    issues,
                    at.clone(),
                    "SPARK_ARROW_UNSUPPORTED",
                    "unsupported",
                    "Ill-formed Spark type spelling cannot be lowered",
                );
                String::new()
            }
        };
        if spelling == "timestamp" {
            if bool_value(get(policy, "timestampUtc")) != Some(true) {
                push_issue(issues,at.clone(),"SPARK_TIMESTAMP_ZONE_LOSS","loss","Timezone-free Arrow timestamp does not distinguish Spark timestamp from timestamp_ntz");
            }
            return Ok(obj(vec![
                (
                    "type",
                    obj(vec![
                        ("type", string("Timestamp")),
                        (
                            "value",
                            if bool_value(get(policy, "timestampUtc")) == Some(true) {
                                obj(vec![
                                    ("unit", string("MICROSECOND")),
                                    ("timezone", string("UTC")),
                                ])
                            } else {
                                obj(vec![("unit", string("MICROSECOND"))])
                            },
                        ),
                    ]),
                ),
                ("children", Value::Array(vec![])),
            ]));
        }
        if spelling == "timestamp_ntz" {
            push_issue(issues,at.clone(),"SPARK_TIMESTAMP_RECOVERY","representation-change","Recovering Spark timestamp_ntz requires prefer_timestamp_ntz=true on target-only recovery");
            return Ok(obj(vec![
                (
                    "type",
                    obj(vec![
                        ("type", string("Timestamp")),
                        ("value", obj(vec![("unit", string("MICROSECOND"))])),
                    ]),
                ),
                ("children", Value::Array(vec![])),
            ]));
        }
        if let Some(body) = spelling
            .strip_prefix("decimal(")
            .and_then(|s| s.strip_suffix(')'))
        {
            let parts = body.split(',').collect::<Vec<_>>();
            let precision = parts
                .first()
                .and_then(|s| s.trim().parse::<i64>().ok())
                .unwrap_or(0);
            let scale = parts
                .get(1)
                .and_then(|s| s.trim().parse::<i64>().ok())
                .unwrap_or(-1);
            if parts.len() != 2 || !(1..=38).contains(&precision) || scale < 0 || scale > precision
            {
                *fatal = true;
                push_issue(
                    issues,
                    at.clone(),
                    "SPARK_ARROW_UNSUPPORTED",
                    "unsupported",
                    "Decimal range or configuration is outside this verified lowering",
                );
                return Ok(obj(vec![
                    (
                        "type",
                        obj(vec![("type", string("Null")), ("value", obj(vec![]))]),
                    ),
                    ("children", Value::Array(vec![])),
                ]));
            }
            let mut value = vec![(key("precision"), Value::Number(precision as f64))];
            if scale != 0 {
                value.push((key("scale"), Value::Number(scale as f64)));
            }
            return Ok(obj(vec![
                (
                    "type",
                    obj(vec![
                        ("type", string("Decimal")),
                        ("value", Value::Object(value)),
                    ]),
                ),
                ("children", Value::Array(vec![])),
            ]));
        }
        if spelling.starts_with("interval ") {
            let valid = matches!(
                spelling.as_str(),
                "interval day"
                    | "interval day to hour"
                    | "interval day to minute"
                    | "interval day to second"
                    | "interval hour"
                    | "interval hour to minute"
                    | "interval hour to second"
                    | "interval minute"
                    | "interval minute to second"
                    | "interval second"
            );
            if !valid {
                *fatal = true;
                push_issue(
                    issues,
                    at.clone(),
                    "SPARK_ARROW_UNSUPPORTED",
                    "unsupported",
                    "Invalid interval range",
                );
            }
            if spelling != "interval day to second" {
                push_issue(issues,at.clone(),"SPARK_INTERVAL_RANGE_LOSS","loss","Arrow duration does not retain Spark interval start/end units; native recovery uses day to second");
            }
            return Ok(obj(vec![
                (
                    "type",
                    obj(vec![
                        ("type", string("Duration")),
                        ("value", obj(vec![("unit", string("MICROSECOND"))])),
                    ]),
                ),
                ("children", Value::Array(vec![])),
            ]));
        }
        if spelling == "variant" {
            push_issue(issues,at.clone(),"SPARK_VARIANT_ENCODING","representation-change","Spark-specific tagged binary struct encodes variant; generic Arrow consumers need the Spark convention");
            let value = obj(vec![
                (
                    "type",
                    obj(vec![("type", string("Binary")), ("value", obj(vec![]))]),
                ),
                ("children", Value::Array(vec![])),
            ]);
            let mut metadata = match value.clone() {
                Value::Object(fields) => fields,
                _ => vec![],
            };
            metadata.push((key("name"), string("metadata")));
            metadata.push((key("nullable"), Value::Bool(false)));
            metadata.push((
                key("custom_metadata"),
                Value::Array(vec![obj(vec![
                    ("key", string("variant")),
                    ("value", string("true")),
                ])]),
            ));
            let mut value = match value {
                Value::Object(fields) => fields,
                _ => vec![],
            };
            value.push((key("name"), string("value")));
            value.push((key("nullable"), Value::Bool(false)));
            return Ok(obj(vec![
                (
                    "type",
                    obj(vec![("type", string("Struct_")), ("value", obj(vec![]))]),
                ),
                (
                    "children",
                    Value::Array(vec![Value::Object(value), Value::Object(metadata)]),
                ),
            ]));
        }
        let (tag, value) = match spelling.as_str() {
            "byte" => (
                "Int",
                obj(vec![
                    ("bitWidth", Value::Number(8.0)),
                    ("is_signed", Value::Bool(true)),
                ]),
            ),
            "short" => (
                "Int",
                obj(vec![
                    ("bitWidth", Value::Number(16.0)),
                    ("is_signed", Value::Bool(true)),
                ]),
            ),
            "integer" => (
                "Int",
                obj(vec![
                    ("bitWidth", Value::Number(32.0)),
                    ("is_signed", Value::Bool(true)),
                ]),
            ),
            "long" => (
                "Int",
                obj(vec![
                    ("bitWidth", Value::Number(64.0)),
                    ("is_signed", Value::Bool(true)),
                ]),
            ),
            "boolean" => ("Bool", obj(vec![])),
            "float" => ("FloatingPoint", obj(vec![("precision", string("SINGLE"))])),
            "double" => ("FloatingPoint", obj(vec![("precision", string("DOUBLE"))])),
            "string" => (
                if bool_value(get(policy, "largeTypes")) == Some(true) {
                    "LargeUtf8"
                } else {
                    "Utf8"
                },
                obj(vec![]),
            ),
            "binary" => (
                if bool_value(get(policy, "largeTypes")) == Some(true) {
                    "LargeBinary"
                } else {
                    "Binary"
                },
                obj(vec![]),
            ),
            "void" => ("Null", obj(vec![])),
            "date" => ("Date", obj(vec![("unit", string("DAY"))])),
            _ => {
                *fatal = true;
                push_issue(
                    issues,
                    at.clone(),
                    "SPARK_ARROW_UNSUPPORTED",
                    "unsupported",
                    "Unsupported or unverified Spark type spelling",
                );
                ("Null", obj(vec![]))
            }
        };
        return Ok(obj(vec![
            ("type", obj(vec![("type", string(tag)), ("value", value)])),
            ("children", Value::Array(vec![])),
        ]));
    }
    let kind = str_value(get(ty, "type")).unwrap_or_default();
    if kind == "struct" {
        known_spark(ty, &["type", "fields"], at, issues, fatal);
        let fields = array(get(ty, "fields")).unwrap_or(&[]);
        if bool_value(get(policy, "rejectNestedDuplicates")) == Some(true) {
            let mut names = std::collections::BTreeSet::new();
            for f in fields {
                let name = text(get(f, "name")).cloned().unwrap_or_default();
                if !names.insert(name) {
                    *fatal = true;
                    push_issue(
                        issues,
                        path(at, "fields"),
                        "SPARK_ARROW_UNSUPPORTED",
                        "unsupported",
                        "Duplicate nested field names rejected by the selected policy",
                    );
                }
            }
        }
        let mut children = Vec::new();
        for (i, f) in fields.iter().enumerate() {
            children.push(spark_field(
                f,
                &child_path(at, "fields", i),
                policy,
                issues,
                fatal,
                ctx,
            )?);
        }
        return Ok(obj(vec![
            (
                "type",
                obj(vec![("type", string("Struct_")), ("value", obj(vec![]))]),
            ),
            ("children", Value::Array(children)),
        ]));
    }
    if kind == "array" {
        known_spark(
            ty,
            &["type", "elementType", "containsNull"],
            at,
            issues,
            fatal,
        );
        let contains = bool_value(get(ty, "containsNull")).unwrap_or(true);
        let child = spark_field(
            &obj(vec![
                ("name", string("element")),
                (
                    "type",
                    get(ty, "elementType").cloned().unwrap_or(Value::Null),
                ),
                ("nullable", Value::Bool(contains)),
            ]),
            &path(at, "elementType"),
            policy,
            issues,
            fatal,
            ctx,
        )?;
        return Ok(obj(vec![
            (
                "type",
                obj(vec![("type", string("List")), ("value", obj(vec![]))]),
            ),
            ("children", Value::Array(vec![child])),
        ]));
    }
    if kind == "map" {
        known_spark(
            ty,
            &["type", "keyType", "valueType", "valueContainsNull"],
            at,
            issues,
            fatal,
        );
        let nullable = bool_value(get(ty, "valueContainsNull")).unwrap_or(true);
        let key_field = spark_field(
            &obj(vec![
                ("name", string("key")),
                ("type", get(ty, "keyType").cloned().unwrap_or(Value::Null)),
                ("nullable", Value::Bool(false)),
            ]),
            &path(at, "keyType"),
            policy,
            issues,
            fatal,
            ctx,
        )?;
        let value_field = spark_field(
            &obj(vec![
                ("name", string("value")),
                ("type", get(ty, "valueType").cloned().unwrap_or(Value::Null)),
                ("nullable", Value::Bool(nullable)),
            ]),
            &path(at, "valueType"),
            policy,
            issues,
            fatal,
            ctx,
        )?;
        let entry = obj(vec![
            ("name", string("entries")),
            (
                "type",
                obj(vec![("type", string("Struct_")), ("value", obj(vec![]))]),
            ),
            ("nullable", Value::Bool(false)),
            ("children", Value::Array(vec![key_field, value_field])),
        ]);
        return Ok(obj(vec![
            (
                "type",
                obj(vec![("type", string("Map")), ("value", obj(vec![]))]),
            ),
            ("children", Value::Array(vec![entry])),
        ]));
    }
    *fatal = true;
    push_issue(
        issues,
        at.clone(),
        "SPARK_ARROW_UNSUPPORTED",
        "unsupported",
        "Unknown type or opaque UDT cannot be lowered without its contract",
    );
    let _ = ctx;
    Ok(obj(vec![
        (
            "type",
            obj(vec![("type", string("Null")), ("value", obj(vec![]))]),
        ),
        ("children", Value::Array(vec![])),
    ]))
}
