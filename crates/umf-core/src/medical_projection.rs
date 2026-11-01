// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned selected medical-family projections over exact native JSON trees.
use crate::{
    context::Context,
    error::EngineError,
    native_json::{NativeJsonNode as N, NativeJsonTree},
    value::{copy_json, Utf16, Value},
};

fn k(value: &str) -> Utf16 {
    Utf16::from(value)
}
fn s(value: &str) -> Value {
    Value::string_utf8(value)
}
fn string(value: Utf16) -> Value {
    Value::String(value)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (k(name), value))
            .collect(),
    )
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn get<'a>(node: &'a N, name: &str) -> Option<&'a N> {
    let N::Object(fields) = node else { return None };
    let name = k(name);
    fields
        .iter()
        .find(|(key, _)| key == &name)
        .map(|(_, value)| value)
}
fn array<'a>(node: Option<&'a N>, code: &str, path: &str) -> Result<&'a [N], EngineError> {
    match node {
        None => Ok(&[]),
        Some(N::Array(items)) => Ok(items),
        Some(_) => Err(err(code, "Expected native array", path)),
    }
}
fn text(node: Option<&N>, code: &str, path: &str) -> Result<Option<Utf16>, EngineError> {
    match node {
        None | Some(N::Null) => Ok(None),
        Some(N::String(value)) => Ok(Some(value.clone())),
        Some(N::Number(token)) => Ok(Some(Utf16::from(token.as_str()))),
        Some(_) => Err(err(code, "Expected native string or numeric token", path)),
    }
}
fn required(node: Option<&N>, code: &str, message: &str, path: &str) -> Result<Utf16, EngineError> {
    match node {
        Some(N::String(value)) if !value.is_empty() => Ok(value.clone()),
        _ => Err(err(code, message, path)),
    }
}
fn source_text(
    value: Option<&Value>,
    code: &str,
    field: &str,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    match value {
        Some(Value::String(value)) => {
            ctx.charge_work(value.len(), k(field))?;
            Ok(value.clone())
        }
        _ => Err(err(code, format!("{field} must be a string"), field)),
    }
}
fn exact_fields(
    value: &Value,
    allowed: &[&str],
    code: &str,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err(code, "Expected object", path));
    };
    for (index, (key, _)) in fields.iter().enumerate() {
        ctx.charge_work(key.len().saturating_add(1), k(path))?;
        if !allowed.iter().any(|name| key == &k(name)) {
            return Err(EngineError::new(code, join(path, key), "Unknown member"));
        }
        if fields[..index].iter().any(|(previous, _)| previous == key) {
            return Err(EngineError::new(code, join(path, key), "Duplicate member"));
        }
    }
    Ok(())
}
fn join(base: &str, key: &Utf16) -> Utf16 {
    let mut out = base.encode_utf16().collect::<Vec<_>>();
    out.push(b'/' as u16);
    out.extend(pointer_segment(key).units());
    Utf16::new(out)
}
fn child_path(base: &Utf16, key: &Utf16) -> Utf16 {
    let mut out = base.units().to_vec();
    out.push(b'/' as u16);
    out.extend(pointer_segment(key).units());
    Utf16::new(out)
}
fn array_path(base: &Utf16, index: usize) -> Utf16 {
    let mut out = base.units().to_vec();
    out.push(b'/' as u16);
    out.extend(index.to_string().encode_utf16());
    Utf16::new(out)
}
fn pointer_segment(key: &Utf16) -> Utf16 {
    let mut out = Vec::with_capacity(key.len());
    for unit in key.units() {
        match unit {
            0x7e => out.extend([0x7e, 0x30]),
            0x2f => out.extend([0x7e, 0x31]),
            value => out.push(*value),
        }
    }
    Utf16::new(out)
}
fn concat(parts: &[&Utf16]) -> Utf16 {
    let size = parts
        .iter()
        .fold(0usize, |size, part| size.saturating_add(part.len()));
    let mut out = Vec::with_capacity(size);
    for part in parts {
        out.extend_from_slice(part.units());
    }
    Utf16::new(out)
}
fn ascii(value: &Utf16, predicate: impl Fn(u16) -> bool) -> bool {
    !value.is_empty() && value.units().iter().copied().all(predicate)
}
fn is_upper(u: u16) -> bool {
    (b'A' as u16..=b'Z' as u16).contains(&u)
}
fn is_lower(u: u16) -> bool {
    (b'a' as u16..=b'z' as u16).contains(&u)
}
fn is_digit(u: u16) -> bool {
    (b'0' as u16..=b'9' as u16).contains(&u)
}
fn namespace_valid(value: &Utf16) -> bool {
    ascii(value, |u| {
        is_upper(u)
            || is_lower(u)
            || is_digit(u)
            || u == b'_' as u16
            || u == b'.' as u16
            || u == b'-' as u16
    })
}
fn resource_type_valid(value: &Utf16) -> bool {
    let units = value.units();
    !units.is_empty()
        && is_upper(units[0])
        && units[1..]
            .iter()
            .all(|u| is_upper(*u) || is_lower(*u) || is_digit(*u))
}
fn native_id_valid(value: &Utf16) -> bool {
    (1..=64).contains(&value.len())
        && ascii(value, |u| {
            is_upper(u) || is_lower(u) || is_digit(u) || u == b'.' as u16 || u == b'-' as u16
        })
}
fn resource_key(namespace: &Utf16, resource_type: &Utf16, id: &Utf16) -> Utf16 {
    concat(&[namespace, &k("::"), resource_type, &k("/"), id])
}
fn charge_node(
    node: &N,
    ctx: &mut Context<'_>,
    path: &Utf16,
    depth: usize,
    count: &mut usize,
) -> Result<(), EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err("LIMIT", "Medical native tree depth limit exceeded", ""));
    }
    *count = (*count).saturating_add(1);
    if *count > ctx.limits().max_values {
        return Err(err("LIMIT", "Medical native tree value limit exceeded", ""));
    }
    ctx.charge_work(1, path.clone())?;
    match node {
        N::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                charge_node(item, ctx, &array_path(path, index), depth + 1, count)?;
            }
        }
        N::Object(fields) => {
            for (key, value) in fields {
                ctx.charge_work(key.len(), path.clone())?;
                charge_node(value, ctx, &child_path(path, key), depth + 1, count)?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn quote_json(value: &Utf16, out: &mut Vec<u16>, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    out.push(b'"' as u16);
    let units = value.units();
    let mut index = 0;
    while index < units.len() {
        ctx.charge_work(1, Utf16::default())?;
        match units[index] {
            0x22 => out.extend("\\\"".encode_utf16()),
            0x5c => out.extend("\\\\".encode_utf16()),
            0x08 => out.extend("\\b".encode_utf16()),
            0x09 => out.extend("\\t".encode_utf16()),
            0x0a => out.extend("\\n".encode_utf16()),
            0x0c => out.extend("\\f".encode_utf16()),
            0x0d => out.extend("\\r".encode_utf16()),
            0x00..=0x1f => out.extend(format!("\\u{:04x}", units[index]).encode_utf16()),
            0xd800..=0xdbff
                if index + 1 < units.len() && (0xdc00..=0xdfff).contains(&units[index + 1]) =>
            {
                out.push(units[index]);
                out.push(units[index + 1]);
                index += 1;
            }
            0xd800..=0xdfff => out.extend(format!("\\u{:04x}", units[index]).encode_utf16()),
            unit => out.push(unit),
        }
        index += 1;
    }
    out.push(b'"' as u16);
    Ok(())
}
fn render_node(node: &N, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut count = 0;
    charge_node(node, ctx, &Utf16::default(), 0, &mut count)?;
    let mut out = Vec::new();
    fn write(node: &N, out: &mut Vec<u16>, ctx: &mut Context<'_>) -> Result<(), EngineError> {
        match node {
            N::Null => out.extend("null".encode_utf16()),
            N::Boolean(true) => out.extend("true".encode_utf16()),
            N::Boolean(false) => out.extend("false".encode_utf16()),
            N::String(value) => quote_json(value, out, ctx)?,
            N::Number(token) => out.extend(token.bytes().map(u16::from)),
            N::Array(items) => {
                out.push(b'[' as u16);
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        out.push(b',' as u16);
                    }
                    write(item, out, ctx)?;
                }
                out.push(b']' as u16);
            }
            N::Object(fields) => {
                out.push(b'{' as u16);
                for (index, (key, value)) in fields.iter().enumerate() {
                    if index > 0 {
                        out.push(b',' as u16);
                    }
                    quote_json(key, out, ctx)?;
                    out.push(b':' as u16);
                    write(value, out, ctx)?;
                }
                out.push(b'}' as u16);
            }
        }
        Ok(())
    }
    write(node, &mut out, ctx)?;
    if out.len() > ctx.limits().max_text_units {
        return Err(err(
            "LIMIT",
            "Serialized medical JSON exceeds text limit",
            "",
        ));
    }
    ctx.charge_text(out.len(), Utf16::default())?;
    Ok(Utf16::new(out))
}
fn optional_text(node: Option<&N>, code: &str, path: &str) -> Result<Value, EngineError> {
    Ok(text(node, code, path)?
        .map(Value::String)
        .unwrap_or(Value::Null))
}
fn native_json(
    node: Option<&N>,
    code: &str,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    match node {
        None => Ok(Value::Null),
        Some(value) => Ok(Value::String(render_node(value, ctx)?)),
    }
}
fn add(tables: &mut [(Utf16, Vec<Value>)], name: &str, row: Value) -> Result<(), EngineError> {
    let key = k(name);
    let (_, rows) = tables
        .iter_mut()
        .find(|(candidate, _)| candidate == &key)
        .ok_or_else(|| err("INVARIANT", "Medical output table is missing", name))?;
    rows.push(row);
    Ok(())
}
fn tables_value(tables: Vec<(Utf16, Vec<Value>)>) -> Value {
    Value::Object(
        tables
            .into_iter()
            .map(|(name, rows)| (name, Value::Array(rows)))
            .collect(),
    )
}
fn parse_native(text: &Utf16, ctx: &mut Context<'_>) -> Result<NativeJsonTree, EngineError> {
    NativeJsonTree::parse_json(text.units(), ctx)
}
fn get_or<'a>(node: &'a N, first: &str, second: &str) -> Option<&'a N> {
    // A native null is a present tagged node in the public API.
    get(node, first).or_else(|| get(node, second))
}
fn money(node: Option<&N>, code: &str, path: &str) -> Result<(Value, Value), EngineError> {
    Ok((
        optional_text(node.and_then(|n| get(n, "value")), code, path)?,
        optional_text(node.and_then(|n| get(n, "currency")), code, path)?,
    ))
}
fn lines(
    parent: &N,
    base_path: &Utf16,
    parent_key: Option<&Utf16>,
    member: &str,
    resource_key_value: &Utf16,
    resource_type: &Utf16,
    tables: &mut [(Utf16, Vec<Value>)],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let path = child_path(base_path, &k(member));
    let items = array(get(parent, member), "MEDICAL_FHIR_LINE", "/item")?;
    let response = resource_type == &k("ClaimResponse");
    let sequence_member = if response {
        match member {
            "item" => "itemSequence",
            "detail" => "detailSequence",
            _ => "subDetailSequence",
        }
    } else {
        "sequence"
    };
    let mut used: Vec<Utf16> = Vec::new();
    for (index, line) in items.iter().enumerate() {
        ctx.charge_work(1, path.clone())?;
        let native_path = array_path(&path, index);
        let sequence = text(get(line, sequence_member), "MEDICAL_FHIR_LINE", "/sequence")?
            .ok_or_else(|| {
                err(
                    "MEDICAL_FHIR_LINE",
                    "Invalid or duplicate line sequence",
                    "/sequence",
                )
            })?;
        if !ascii(&sequence, |u| (b'0' as u16..=b'9' as u16).contains(&u))
            || sequence.units()[0] == b'0' as u16
            || used.contains(&sequence)
        {
            return Err(err(
                "MEDICAL_FHIR_LINE",
                "Invalid or duplicate line sequence",
                "/sequence",
            ));
        }
        used.push(sequence.clone());
        let line_key = concat(&[resource_key_value, &native_path]);
        let quantity = get(line, "quantity");
        let unit_price = get(line, "unitPrice");
        let net = get(line, "net");
        add(
            tables,
            "claim_lines",
            obj(vec![
                ("line_key", string(line_key.clone())),
                ("resource_key", string(resource_key_value.clone())),
                (
                    "parent_line_key",
                    parent_key
                        .cloned()
                        .map(Value::String)
                        .unwrap_or(Value::Null),
                ),
                ("native_path", string(native_path.clone())),
                ("sequence", string(sequence)),
                (
                    "product_json",
                    native_json(
                        get(line, "productOrService"),
                        "MEDICAL_FHIR_LINE",
                        "/productOrService",
                        ctx,
                    )?,
                ),
                (
                    "modifiers_json",
                    native_json(get(line, "modifier"), "MEDICAL_FHIR_LINE", "/modifier", ctx)?,
                ),
                (
                    "service_json",
                    native_json(
                        get_or(line, "servicedDate", "servicedPeriod"),
                        "MEDICAL_FHIR_LINE",
                        "/servicedDate",
                        ctx,
                    )?,
                ),
                (
                    "quantity",
                    optional_text(
                        quantity.and_then(|n| get(n, "value")),
                        "MEDICAL_FHIR_LINE",
                        "/quantity/value",
                    )?,
                ),
                (
                    "unit_price",
                    optional_text(
                        unit_price.and_then(|n| get(n, "value")),
                        "MEDICAL_FHIR_LINE",
                        "/unitPrice/value",
                    )?,
                ),
                (
                    "net_amount",
                    optional_text(
                        net.and_then(|n| get(n, "value")),
                        "MEDICAL_FHIR_LINE",
                        "/net/value",
                    )?,
                ),
                (
                    "net_currency",
                    optional_text(
                        net.and_then(|n| get(n, "currency")),
                        "MEDICAL_FHIR_LINE",
                        "/net/currency",
                    )?,
                ),
                ("line_json", Value::String(render_node(line, ctx)?)),
            ]),
        )?;
        for (adj_index, adjudication) in array(
            get(line, "adjudication"),
            "MEDICAL_FHIR_LINE",
            "/adjudication",
        )?
        .iter()
        .enumerate()
        {
            let amount = get(adjudication, "amount");
            let (amount_value, currency) =
                money(amount, "MEDICAL_FHIR_LINE", "/adjudication/amount")?;
            let adjudication_key =
                concat(&[&line_key, &k("/adjudication/"), &k(&adj_index.to_string())]);
            add(
                tables,
                "adjudications",
                obj(vec![
                    ("adjudication_key", string(adjudication_key)),
                    ("resource_key", string(resource_key_value.clone())),
                    ("line_key", string(line_key.clone())),
                    (
                        "category_json",
                        native_json(
                            get(adjudication, "category"),
                            "MEDICAL_FHIR_LINE",
                            "/adjudication/category",
                            ctx,
                        )?,
                    ),
                    (
                        "reason_json",
                        native_json(
                            get(adjudication, "reason"),
                            "MEDICAL_FHIR_LINE",
                            "/adjudication/reason",
                            ctx,
                        )?,
                    ),
                    ("amount", amount_value),
                    ("currency", currency),
                    (
                        "value",
                        optional_text(
                            get(adjudication, "value"),
                            "MEDICAL_FHIR_LINE",
                            "/adjudication/value",
                        )?,
                    ),
                    (
                        "native_json",
                        Value::String(render_node(adjudication, ctx)?),
                    ),
                ]),
            )?;
        }
        if member == "item" {
            lines(
                line,
                &native_path,
                Some(&line_key),
                "detail",
                resource_key_value,
                resource_type,
                tables,
                ctx,
            )?;
        }
        if member == "detail" {
            lines(
                line,
                &native_path,
                Some(&line_key),
                "subDetail",
                resource_key_value,
                resource_type,
                tables,
                ctx,
            )?;
        }
    }
    Ok(())
}
fn local_reference(reference: &Utf16, namespace: &Utf16) -> Option<Utf16> {
    let units = reference.units();
    let slash = units.iter().position(|unit| *unit == b'/' as u16)?;
    if slash == 0 || slash + 1 == units.len() || units[slash + 1..].contains(&(b'/' as u16)) {
        return None;
    }
    let typ = Utf16::new(units[..slash].to_vec());
    let id = Utf16::new(units[slash + 1..].to_vec());
    let valid_type = !typ.is_empty()
        && (is_upper(typ.units()[0]) || is_lower(typ.units()[0]))
        && typ.units()[1..]
            .iter()
            .all(|u| is_upper(*u) || is_lower(*u) || is_digit(*u));
    if !valid_type || !native_id_valid(&id) {
        return None;
    }
    Some(resource_key(namespace, &typ, &id))
}
fn visit_references(
    node: &N,
    path: &Utf16,
    current_key: &Utf16,
    namespace: &Utf16,
    identities: &[Utf16],
    tables: &mut [(Utf16, Vec<Value>)],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(path.len().saturating_add(1), path.clone())?;
    match node {
        N::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                visit_references(
                    child,
                    &array_path(path, index),
                    current_key,
                    namespace,
                    identities,
                    tables,
                    ctx,
                )?;
            }
        }
        N::Object(fields) => {
            if let Some(reference_node) = get(node, "reference") {
                if let Some(reference) =
                    text(Some(reference_node), "MEDICAL_FHIR_REFERENCE", "/reference")?
                {
                    let target = local_reference(&reference, namespace)
                        .filter(|key| identities.contains(key))
                        .map(Value::String)
                        .unwrap_or(Value::Null);
                    add(
                        tables,
                        "resource_references",
                        obj(vec![
                            (
                                "reference_key",
                                string(concat(&[current_key, path, &k("/reference")])),
                            ),
                            ("resource_key", string(current_key.clone())),
                            ("native_path", string(concat(&[path, &k("/reference")]))),
                            ("native_reference", string(reference)),
                            ("target_key", target),
                        ]),
                    )?;
                }
            }
            for (index, coding) in array(get(node, "coding"), "MEDICAL_FHIR_CODING", "/coding")?
                .iter()
                .enumerate()
            {
                let native_path = concat(&[path, &k("/coding/"), &k(&index.to_string())]);
                add(
                    tables,
                    "coded_values",
                    obj(vec![
                        ("coding_key", string(concat(&[current_key, &native_path]))),
                        ("resource_key", string(current_key.clone())),
                        ("native_path", string(native_path)),
                        (
                            "system",
                            optional_text(
                                get(coding, "system"),
                                "MEDICAL_FHIR_CODING",
                                "/coding/system",
                            )?,
                        ),
                        (
                            "release",
                            optional_text(
                                get(coding, "version"),
                                "MEDICAL_FHIR_CODING",
                                "/coding/version",
                            )?,
                        ),
                        (
                            "code",
                            optional_text(
                                get(coding, "code"),
                                "MEDICAL_FHIR_CODING",
                                "/coding/code",
                            )?,
                        ),
                        (
                            "display",
                            optional_text(
                                get(coding, "display"),
                                "MEDICAL_FHIR_CODING",
                                "/coding/display",
                            )?,
                        ),
                        ("native_json", Value::String(render_node(coding, ctx)?)),
                    ]),
                )?;
            }
            for (name, child) in fields {
                visit_references(
                    child,
                    &child_path(path, name),
                    current_key,
                    namespace,
                    identities,
                    tables,
                    ctx,
                )?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub fn project_medical_fhir(
    inputs: &Value,
    namespace_value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let namespace = source_text(
        Some(namespace_value),
        "MEDICAL_NAMESPACE",
        "/namespace",
        ctx,
    )?;
    if !namespace_valid(&namespace) {
        return Err(err(
            "MEDICAL_NAMESPACE",
            "Invalid source namespace",
            "/namespace",
        ));
    }
    let Value::Array(inputs) = inputs else {
        return Err(err(
            "MEDICAL_FHIR_INPUT",
            "Resource inputs must be an array",
            "/inputs",
        ));
    };
    let mut tables: Vec<(Utf16, Vec<Value>)> = [
        "resources",
        "coverage",
        "eligibility",
        "claims",
        "claim_lines",
        "adjudications",
        "payments",
        "plans",
        "enrollments",
        "resource_references",
        "coded_values",
    ]
    .iter()
    .map(|name| (k(name), Vec::new()))
    .collect();
    struct Parsed {
        source: Utf16,
        raw: Utf16,
        tree: NativeJsonTree,
        typ: Utf16,
        id: Utf16,
        key: Utf16,
    }
    let mut parsed = Vec::with_capacity(inputs.len());
    let mut source_ids = Vec::<Utf16>::new();
    let mut identities = Vec::<Utf16>::new();
    for (index, input) in inputs.iter().enumerate() {
        let path = format!("/inputs/{index}");
        exact_fields(
            input,
            &["source_id", "text"],
            "MEDICAL_FHIR_INPUT",
            &path,
            ctx,
        )?;
        let source_id = source_text(
            obj_get(input, "source_id"),
            "MEDICAL_FHIR_INPUT",
            "/source_id",
            ctx,
        )?;
        if source_id.is_empty() {
            return Err(err("MEDICAL_FHIR_INPUT", "Invalid resource inputs", &path));
        }
        if source_ids.contains(&source_id) {
            return Err(err(
                "MEDICAL_FHIR_IDENTITY",
                "Duplicate native resource or source identity",
                &path,
            ));
        }
        let raw = source_text(obj_get(input, "text"), "MEDICAL_FHIR_INPUT", "/text", ctx)?;
        let tree = parse_native(&raw, ctx)?;
        let root = tree.root();
        let typ = required(
            get(root, "resourceType"),
            "MEDICAL_FHIR_IDENTITY",
            "Invalid R4 resource or source identity",
            "/resourceType",
        )?;
        let id = required(
            get(root, "id"),
            "MEDICAL_FHIR_IDENTITY",
            "Invalid R4 resource or source identity",
            "/id",
        )?;
        if !resource_type_valid(&typ) || !native_id_valid(&id) {
            return Err(err(
                "MEDICAL_FHIR_IDENTITY",
                "Invalid R4 resource or source identity",
                &path,
            ));
        }
        let key = resource_key(&namespace, &typ, &id);
        if identities.contains(&key) {
            return Err(err(
                "MEDICAL_FHIR_IDENTITY",
                "Duplicate native resource or source identity",
                &path,
            ));
        }
        source_ids.push(source_id.clone());
        identities.push(key.clone());
        parsed.push(Parsed {
            source: source_id,
            raw,
            tree,
            typ,
            id,
            key,
        });
    }
    for p in &parsed {
        let n = p.tree.root();
        let common_status = optional_text(get(n, "status"), "MEDICAL_FHIR", "/status")?;
        let patient_reference = optional_text(
            get(get(n, "patient").unwrap_or(&N::Null), "reference"),
            "MEDICAL_FHIR",
            "/patient/reference",
        )?;
        add(
            &mut tables,
            "resources",
            obj(vec![
                ("resource_key", string(p.key.clone())),
                ("source_id", string(p.source.clone())),
                ("resource_type", string(p.typ.clone())),
                ("native_id", string(p.id.clone())),
                ("resource_json", string(p.raw.clone())),
            ]),
        )?;
        if p.typ == k("Coverage") {
            add(
                &mut tables,
                "coverage",
                obj(vec![
                    ("resource_key", string(p.key.clone())),
                    ("status", common_status.clone()),
                    (
                        "beneficiary_json",
                        native_json(get(n, "beneficiary"), "MEDICAL_FHIR", "/beneficiary", ctx)?,
                    ),
                    (
                        "subscriber_json",
                        native_json(get(n, "subscriber"), "MEDICAL_FHIR", "/subscriber", ctx)?,
                    ),
                    (
                        "payors_json",
                        native_json(get(n, "payor"), "MEDICAL_FHIR", "/payor", ctx)?,
                    ),
                    (
                        "classes_json",
                        native_json(get(n, "class"), "MEDICAL_FHIR", "/class", ctx)?,
                    ),
                    (
                        "period_start",
                        optional_text(
                            get(get(n, "period").unwrap_or(&N::Null), "start"),
                            "MEDICAL_FHIR",
                            "/period/start",
                        )?,
                    ),
                    (
                        "period_end",
                        optional_text(
                            get(get(n, "period").unwrap_or(&N::Null), "end"),
                            "MEDICAL_FHIR",
                            "/period/end",
                        )?,
                    ),
                    (
                        "benefits_json",
                        native_json(
                            get(n, "costToBeneficiary"),
                            "MEDICAL_FHIR",
                            "/costToBeneficiary",
                            ctx,
                        )?,
                    ),
                ]),
            )?;
        }
        if p.typ == k("CoverageEligibilityRequest") || p.typ == k("CoverageEligibilityResponse") {
            let direction = if p.typ == k("CoverageEligibilityRequest") {
                "request"
            } else {
                "response"
            };
            add(
                &mut tables,
                "eligibility",
                obj(vec![
                    ("resource_key", string(p.key.clone())),
                    ("status", common_status.clone()),
                    ("patient_reference", patient_reference.clone()),
                    ("direction", s(direction)),
                    (
                        "purpose_json",
                        native_json(get(n, "purpose"), "MEDICAL_FHIR", "/purpose", ctx)?,
                    ),
                    (
                        "created",
                        optional_text(get(n, "created"), "MEDICAL_FHIR", "/created")?,
                    ),
                    (
                        "serviced_json",
                        native_json(
                            get_or(n, "servicedDate", "servicedPeriod"),
                            "MEDICAL_FHIR",
                            "/servicedDate",
                            ctx,
                        )?,
                    ),
                    (
                        "request_json",
                        native_json(get(n, "request"), "MEDICAL_FHIR", "/request", ctx)?,
                    ),
                    (
                        "outcome",
                        optional_text(get(n, "outcome"), "MEDICAL_FHIR", "/outcome")?,
                    ),
                    (
                        "insurance_json",
                        native_json(get(n, "insurance"), "MEDICAL_FHIR", "/insurance", ctx)?,
                    ),
                    (
                        "items_json",
                        native_json(get(n, "item"), "MEDICAL_FHIR", "/item", ctx)?,
                    ),
                ]),
            )?;
        }
        if ["Claim", "ClaimResponse", "ExplanationOfBenefit"]
            .iter()
            .any(|value| p.typ == k(value))
        {
            add(
                &mut tables,
                "claims",
                obj(vec![
                    ("resource_key", string(p.key.clone())),
                    ("status", common_status.clone()),
                    ("patient_reference", patient_reference.clone()),
                    ("resource_type", string(p.typ.clone())),
                    ("use", optional_text(get(n, "use"), "MEDICAL_FHIR", "/use")?),
                    (
                        "type_json",
                        native_json(get(n, "type"), "MEDICAL_FHIR", "/type", ctx)?,
                    ),
                    (
                        "created",
                        optional_text(get(n, "created"), "MEDICAL_FHIR", "/created")?,
                    ),
                    (
                        "outcome",
                        optional_text(get(n, "outcome"), "MEDICAL_FHIR", "/outcome")?,
                    ),
                    (
                        "request_json",
                        native_json(get(n, "request"), "MEDICAL_FHIR", "/request", ctx)?,
                    ),
                    (
                        "insurance_json",
                        native_json(get(n, "insurance"), "MEDICAL_FHIR", "/insurance", ctx)?,
                    ),
                    (
                        "diagnoses_json",
                        native_json(get(n, "diagnosis"), "MEDICAL_FHIR", "/diagnosis", ctx)?,
                    ),
                    (
                        "procedures_json",
                        native_json(get(n, "procedure"), "MEDICAL_FHIR", "/procedure", ctx)?,
                    ),
                    (
                        "related_json",
                        native_json(get(n, "related"), "MEDICAL_FHIR", "/related", ctx)?,
                    ),
                    (
                        "totals_json",
                        native_json(get(n, "total"), "MEDICAL_FHIR", "/total", ctx)?,
                    ),
                ]),
            )?;
            lines(
                n,
                &Utf16::default(),
                None,
                "item",
                &p.key,
                &p.typ,
                &mut tables,
                ctx,
            )?;
            if let Some(payment) = get(n, "payment") {
                let (amount, currency) =
                    money(get(payment, "amount"), "MEDICAL_FHIR", "/payment/amount")?;
                add(
                    &mut tables,
                    "payments",
                    obj(vec![
                        ("payment_key", string(concat(&[&p.key, &k("/payment")]))),
                        ("resource_key", string(p.key.clone())),
                        (
                            "date",
                            optional_text(get(payment, "date"), "MEDICAL_FHIR", "/payment/date")?,
                        ),
                        ("amount", amount),
                        ("currency", currency),
                        ("allocations_json", Value::Null),
                        ("native_json", Value::String(render_node(payment, ctx)?)),
                    ]),
                )?;
            }
        }
        if p.typ == k("PaymentReconciliation") {
            let (amount, currency) =
                money(get(n, "paymentAmount"), "MEDICAL_FHIR", "/paymentAmount")?;
            add(
                &mut tables,
                "payments",
                obj(vec![
                    ("payment_key", string(p.key.clone())),
                    ("resource_key", string(p.key.clone())),
                    (
                        "date",
                        optional_text(get(n, "paymentDate"), "MEDICAL_FHIR", "/paymentDate")?,
                    ),
                    ("amount", amount),
                    ("currency", currency),
                    (
                        "allocations_json",
                        native_json(get(n, "detail"), "MEDICAL_FHIR", "/detail", ctx)?,
                    ),
                    ("native_json", Value::String(render_node(n, ctx)?)),
                ]),
            )?;
        }
        if p.typ == k("InsurancePlan") {
            add(
                &mut tables,
                "plans",
                obj(vec![
                    ("resource_key", string(p.key.clone())),
                    ("status", common_status.clone()),
                    (
                        "name",
                        optional_text(get(n, "name"), "MEDICAL_FHIR", "/name")?,
                    ),
                    (
                        "period_json",
                        native_json(get(n, "period"), "MEDICAL_FHIR", "/period", ctx)?,
                    ),
                    (
                        "owner_json",
                        native_json(get(n, "ownedBy"), "MEDICAL_FHIR", "/ownedBy", ctx)?,
                    ),
                    (
                        "coverage_json",
                        native_json(get(n, "coverage"), "MEDICAL_FHIR", "/coverage", ctx)?,
                    ),
                    (
                        "plans_json",
                        native_json(get(n, "plan"), "MEDICAL_FHIR", "/plan", ctx)?,
                    ),
                ]),
            )?;
        }
        if p.typ == k("EnrollmentRequest") || p.typ == k("EnrollmentResponse") {
            add(
                &mut tables,
                "enrollments",
                obj(vec![
                    ("resource_key", string(p.key.clone())),
                    (
                        "direction",
                        s(if p.typ == k("EnrollmentRequest") {
                            "request"
                        } else {
                            "response"
                        }),
                    ),
                    ("status", common_status.clone()),
                    (
                        "created",
                        optional_text(get(n, "created"), "MEDICAL_FHIR", "/created")?,
                    ),
                    (
                        "candidate_json",
                        native_json(get(n, "candidate"), "MEDICAL_FHIR", "/candidate", ctx)?,
                    ),
                    (
                        "coverage_json",
                        native_json(get(n, "coverage"), "MEDICAL_FHIR", "/coverage", ctx)?,
                    ),
                    (
                        "request_json",
                        native_json(get(n, "request"), "MEDICAL_FHIR", "/request", ctx)?,
                    ),
                    (
                        "outcome",
                        optional_text(get(n, "outcome"), "MEDICAL_FHIR", "/outcome")?,
                    ),
                ]),
            )?;
        }
        visit_references(
            n,
            &Utf16::default(),
            &p.key,
            &namespace,
            &identities,
            &mut tables,
            ctx,
        )?;
    }
    Ok(tables_value(tables))
}
fn obj_get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &k(name))
        .map(|(_, value)| value)
}

pub fn project_cdc_mortality(
    source_value: &Value,
    source_id_value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let raw_source = source_text(Some(source_value), "MEDICAL_CDC_INPUT", "/source", ctx)?;
    let source_id = source_text(Some(source_id_value), "MEDICAL_CDC_INPUT", "/sourceId", ctx)?;
    if source_id.is_empty() {
        return Err(err(
            "MEDICAL_CDC_INPUT",
            "Missing source text or identity",
            "/sourceId",
        ));
    }

    let tree = parse_native(&raw_source, ctx)?;
    let rows = array(Some(tree.root()), "MEDICAL_CDC_INPUT", "/source")?;
    let mut output = Vec::with_capacity(rows.len());
    for (index, node) in rows.iter().enumerate() {
        ctx.charge_work(1, k("/source"))?;
        let path = format!("/source/{index}");
        let mut count = 0;
        charge_node(node, ctx, &k(&path), 0, &mut count)?;
        output.push(obj(vec![
            (
                "measure_key",
                string(concat(&[&source_id, &k("/"), &k(&index.to_string())])),
            ),
            ("source_id", string(source_id.clone())),
            (
                "year",
                string(required(
                    get(node, "year"),
                    "MEDICAL_CDC_ROW",
                    "Expected nonempty native string",
                    "/year",
                )?),
            ),
            (
                "geography",
                string(required(
                    get(node, "state"),
                    "MEDICAL_CDC_ROW",
                    "Expected nonempty native string",
                    "/state",
                )?),
            ),
            ("geography_vintage", Value::Null),
            (
                "cause",
                string(required(
                    get(node, "cause_name"),
                    "MEDICAL_CDC_ROW",
                    "Expected nonempty native string",
                    "/cause_name",
                )?),
            ),
            (
                "case_definition",
                string(required(
                    get(node, "_113_cause_name"),
                    "MEDICAL_CDC_ROW",
                    "Expected nonempty native string",
                    "/_113_cause_name",
                )?),
            ),
            ("measure", s("underlying-cause mortality")),
            (
                "count",
                string(required(
                    get(node, "deaths"),
                    "MEDICAL_CDC_ROW",
                    "Expected nonempty native string",
                    "/deaths",
                )?),
            ),
            ("count_status", s("reported")),
            (
                "adjusted_rate",
                string(required(
                    get(node, "aadr"),
                    "MEDICAL_CDC_ROW",
                    "Expected nonempty native string",
                    "/aadr",
                )?),
            ),
            ("rate_status", s("reported")),
            ("rate_unit", s("per 100000 population")),
            (
                "adjustment",
                s("age-adjusted to 2000 US standard population"),
            ),
            ("population_denominator", Value::Null),
            ("denominator_status", s("not supplied in source rows")),
            ("uncertainty_json", Value::Null),
            ("native_json", Value::String(render_node(node, ctx)?)),
        ]));
    }
    Ok(Value::Array(output))
}
fn dicom_tag_valid(value: &Utf16) -> bool {
    value.len() == 8
        && value
            .units()
            .iter()
            .all(|u| is_digit(*u) || (b'A' as u16..=b'F' as u16).contains(u))
}
fn dicom_vr_valid(value: &Utf16) -> bool {
    value.len() == 2
        && value
            .units()
            .iter()
            .all(|u| (b'A' as u16..=b'Z' as u16).contains(u))
}
fn visit_dicom(
    dataset: &N,
    path: &Utf16,
    source_id: &Utf16,
    attributes: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let N::Object(fields) = dataset else {
        return Err(err(
            "MEDICAL_DICOM_DATASET",
            "Expected DICOM dataset",
            "/dataset",
        ));
    };
    for (tag, value) in fields {
        ctx.charge_work(tag.len().saturating_add(1), path.clone())?;
        if !dicom_tag_valid(tag) || !matches!(value, N::Object(_)) {
            return Err(err(
                "MEDICAL_DICOM_ATTRIBUTE",
                "Invalid DICOM JSON attribute",
                "/dataset",
            ));
        }
        let vr = required(
            get(value, "vr"),
            "MEDICAL_DICOM_ATTRIBUTE",
            "Expected nonempty DICOM VR",
            "/vr",
        )?;
        if !dicom_vr_valid(&vr) {
            return Err(err(
                "MEDICAL_DICOM_ATTRIBUTE",
                "Invalid DICOM VR spelling",
                "/vr",
            ));
        }
        let native_path = child_path(path, tag);
        attributes.push(obj(vec![
            ("attribute_key", string(concat(&[source_id, &native_path]))),
            ("source_id", string(source_id.clone())),
            ("native_path", string(native_path.clone())),
            ("tag", string(tag.clone())),
            ("vr", string(vr.clone())),
            (
                "value_json",
                native_json(
                    get(value, "Value"),
                    "MEDICAL_DICOM_ATTRIBUTE",
                    "/Value",
                    ctx,
                )?,
            ),
            (
                "bulk_data_uri",
                optional_text(
                    get(value, "BulkDataURI"),
                    "MEDICAL_DICOM_ATTRIBUTE",
                    "/BulkDataURI",
                )?,
            ),
            (
                "inline_binary",
                optional_text(
                    get(value, "InlineBinary"),
                    "MEDICAL_DICOM_ATTRIBUTE",
                    "/InlineBinary",
                )?,
            ),
            ("native_json", Value::String(render_node(value, ctx)?)),
        ]));
        if vr == k("SQ") {
            let sequence = array(get(value, "Value"), "MEDICAL_DICOM_SEQUENCE", "/Value")?;
            for (index, item) in sequence.iter().enumerate() {
                visit_dicom(
                    item,
                    &array_path(&child_path(&native_path, &k("Value")), index),
                    source_id,
                    attributes,
                    ctx,
                )?;
            }
        }
    }
    Ok(())
}
fn dicom_uid(root: &N, tag: &str) -> Result<Utf16, EngineError> {
    let attribute = get(root, tag)
        .ok_or_else(|| err("MEDICAL_DICOM_UID", "Missing single DICOM UID", "/dataset"))?;
    let values = array(get(attribute, "Value"), "MEDICAL_DICOM_UID", "/Value")?;
    if values.len() != 1
        || text(get(attribute, "vr"), "MEDICAL_DICOM_UID", "/vr")?.as_ref() != Some(&k("UI"))
    {
        return Err(err(
            "MEDICAL_DICOM_UID",
            "Missing single DICOM UID",
            "/dataset",
        ));
    }
    required(
        values.first(),
        "MEDICAL_DICOM_UID",
        "Missing single DICOM UID",
        "/Value/0",
    )
}
pub fn project_dicom_metadata(
    source_value: &Value,
    source_id_value: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let raw = source_text(Some(source_value), "MEDICAL_DICOM_INPUT", "/source", ctx)?;
    let source_id = source_text(
        Some(source_id_value),
        "MEDICAL_DICOM_INPUT",
        "/sourceId",
        ctx,
    )?;
    if source_id.is_empty() {
        return Err(err(
            "MEDICAL_DICOM_INPUT",
            "Missing source text or identity",
            "/sourceId",
        ));
    }

    let tree = parse_native(&raw, ctx)?;
    let root = tree.root();
    if !matches!(root, N::Object(_)) {
        return Err(err(
            "MEDICAL_DICOM_INPUT",
            "Expected DICOM JSON object and source ID",
            "/source",
        ));
    }
    let mut attributes = Vec::new();
    visit_dicom(root, &Utf16::default(), &source_id, &mut attributes, ctx)?;
    let modality = array(
        get(get(root, "00080060").unwrap_or(&N::Null), "Value"),
        "MEDICAL_DICOM_ATTRIBUTE",
        "/00080060/Value",
    )?
    .first();
    let modality = text(modality, "MEDICAL_DICOM_ATTRIBUTE", "/00080060/Value/0")?
        .map(Value::String)
        .unwrap_or(Value::Null);
    let tables = vec![
        (
            k("instances"),
            vec![obj(vec![
                ("instance_key", string(source_id.clone())),
                ("source_id", string(source_id.clone())),
                ("study_uid", string(dicom_uid(root, "0020000D")?)),
                ("series_uid", string(dicom_uid(root, "0020000E")?)),
                ("sop_instance_uid", string(dicom_uid(root, "00080018")?)),
                ("sop_class_uid", string(dicom_uid(root, "00080016")?)),
                ("modality", modality),
                ("metadata_json", string(raw)),
            ])],
        ),
        (k("attributes"), attributes),
    ];
    Ok(tables_value(tables))
}
fn identity_field<'a>(value: &'a Value, key: &str) -> Option<&'a Utf16> {
    match obj_get(value, key) {
        Some(Value::String(text)) if !text.is_empty() => Some(text),
        _ => None,
    }
}

pub fn lookup_medical_terminology(
    query_input: &Value,
    records_input: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let query = copy_json(query_input, ctx)?;
    exact_fields(
        &query,
        &["system", "release", "code"],
        "MEDICAL_TERMINOLOGY_QUERY",
        "/query",
        ctx,
    )?;
    let system = identity_field(&query, "system").ok_or_else(|| {
        err(
            "MEDICAL_TERMINOLOGY_QUERY",
            "Exact terminology identity required",
            "/query/system",
        )
    })?;
    let release = identity_field(&query, "release").ok_or_else(|| {
        err(
            "MEDICAL_TERMINOLOGY_QUERY",
            "Exact terminology identity required",
            "/query/release",
        )
    })?;
    let code = identity_field(&query, "code").ok_or_else(|| {
        err(
            "MEDICAL_TERMINOLOGY_QUERY",
            "Exact terminology identity required",
            "/query/code",
        )
    })?;
    ctx.charge_work(
        system
            .len()
            .saturating_add(release.len())
            .saturating_add(code.len()),
        k("/query"),
    )?;
    let Some(records) = records_input else {
        return Ok(obj(vec![
            ("status", s("source-unavailable")),
            ("matches", Value::Array(Vec::new())),
        ]));
    };
    let Value::Array(records) = records else {
        return Err(err(
            "MEDICAL_TERMINOLOGY_RECORDS",
            "Malformed terminology records",
            "/records",
        ));
    };
    let mut matches = Vec::new();
    for (index, record) in records.iter().enumerate() {
        ctx.charge_work(1, k("/records"))?;
        let record_system = identity_field(record, "system");
        let record_release = identity_field(record, "release");
        let record_code = identity_field(record, "code");
        let (Some(record_system), Some(record_release), Some(record_code)) =
            (record_system, record_release, record_code)
        else {
            return Err(err(
                "MEDICAL_TERMINOLOGY_RECORDS",
                "Malformed terminology records",
                &format!("/records/{index}"),
            ));
        };
        ctx.charge_work(
            record_system
                .len()
                .saturating_add(record_release.len())
                .saturating_add(record_code.len()),
            k("/records"),
        )?;
        if record_system == system && record_release == release && record_code == code {
            matches.push(copy_json(record, ctx)?);
        }
    }
    Ok(obj(vec![
        (
            "status",
            s(if matches.is_empty() {
                "not-in-subset"
            } else {
                "matched"
            }),
        ),
        ("matches", Value::Array(matches)),
    ]))
}
