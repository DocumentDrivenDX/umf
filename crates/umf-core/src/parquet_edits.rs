// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded, source-preserving Parquet metadata edits. Native semantics remain
//! owned here; the wire binding only admits and presents typed values.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{
        decode_parquet_footer, diagnostic, export_parquet_capture, from_json,
        get_parquet_field_metadata, inspect_parquet_containers, inspect_parquet_metadata, to_json,
    },
    parquet_schema_decode::locate_footer,
    parquet_wire_encode::encode_parquet_wire,
    registry::Registry,
    value::{copy_json, Utf16, Value},
};
use serde_json::{json, Value as Json};

const MAX_BYTES: usize = 1_000_000;
fn err(message: impl AsRef<str>) -> EngineError {
    EngineError::new("PARQUET_EDIT", Utf16::default(), message.as_ref())
}
fn member<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    let Value::Object(fields) = v else {
        return None;
    };
    fields
        .iter()
        .find(|(n, _)| n == &Utf16::from(k))
        .map(|(_, v)| v)
}
fn text(v: &Value) -> Option<String> {
    if let Value::String(s) = v {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn arr(v: &Value) -> Option<&[Value]> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn obj(fields: impl IntoIterator<Item = (&'static str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn s(v: impl AsRef<str>) -> Value {
    Value::string_utf8(v)
}
fn n(v: usize) -> Value {
    Value::Number(v as f64)
}
fn result(source: Value, diagnostics: Vec<Value>) -> Value {
    obj([
        ("source", source),
        ("status", s("blocked")),
        ("complete", Value::Bool(false)),
        ("diagnostics", Value::Array(diagnostics)),
    ])
}
fn path_diagnostic(code: &str, path: Utf16, severity: &str, message: &str) -> Value {
    obj([
        ("code", s(code)),
        ("path", Value::String(path)),
        ("severity", s(severity)),
        ("message", s(message)),
    ])
}
fn edit_diag(code: &str, path: &str, message: &str) -> Value {
    path_diagnostic(code, Utf16::from(path), "error", message)
}
fn scope_diag(code: &str, path: &str, message: &str) -> Value {
    obj([
        ("code", s(code)),
        ("path", s(path)),
        ("severity", s("warning")),
        ("message", s(message)),
    ])
}
fn ordered_diagnostics(values: Vec<Value>) -> Vec<Value> {
    values
        .into_iter()
        .map(|d| {
            if let Value::Object(_) = d {
                let code = member(&d, "code").cloned().unwrap_or(Value::Null);
                let path = member(&d, "path").cloned().unwrap_or(Value::Null);
                let severity = member(&d, "severity").cloned().unwrap_or(Value::Null);
                let message = member(&d, "message").cloned().unwrap_or(Value::Null);
                obj([
                    ("code", code),
                    ("path", path),
                    ("severity", severity),
                    ("message", message),
                ])
            } else {
                d
            }
        })
        .collect()
}
fn status(v: &Value, wanted: &str) -> bool {
    member(v, "status").and_then(text).as_deref() == Some(wanted)
}
fn replace_member(v: &mut Value, key: &str, new: Value) -> bool {
    let Value::Object(fields) = v else {
        return false;
    };
    if let Some((_, old)) = fields.iter_mut().find(|(k, _)| k == &Utf16::from(key)) {
        *old = new;
    } else {
        fields.push((Utf16::from(key), new));
    }
    true
}
fn remove_member(v: &mut Value, key: &str) -> bool {
    let Value::Object(fields) = v else {
        return false;
    };
    if let Some(i) = fields.iter().position(|(k, _)| k == &Utf16::from(key)) {
        fields.remove(i);
        true
    } else {
        false
    }
}
fn bytes_from_doc(
    doc: &Value,
    engine: &Engine,
    registry: &Registry,
    cap: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    export_parquet_capture(doc, engine, registry, cap, ctx)
}
fn unsafe_json(v: &Json) -> bool {
    match v {
        Json::Object(m) => m.iter().any(|(k, v)| {
            matches!(
                k.as_str(),
                "$unknown"
                    | "encryption_algorithm"
                    | "footer_signing_key_metadata"
                    | "crypto_metadata"
                    | "encrypted_column_metadata"
            ) || unsafe_json(v)
        }),
        Json::Array(a) => a.iter().any(unsafe_json),
        _ => false,
    }
}
fn hex(bytes: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(H[(b >> 4) as usize] as char);
        s.push(H[(b & 15) as usize] as char)
    }
    s
}
fn refresh_fields(
    doc: &mut Value,
    engine: &Engine,
    registry: &Registry,
    cap: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(modules) = member(doc, "modules").cloned() else {
        return Ok(());
    };
    let Value::Array(ms) = modules else {
        return Ok(());
    };
    let Some(index) = ms
        .iter()
        .position(|m| member(m, "id").and_then(text).as_deref() == Some("parquet.fields"))
    else {
        return Ok(());
    };
    let view = get_parquet_field_metadata(doc, engine, registry, cap, ctx)?;
    if !status(&view, "checked") {
        return Err(err("Rewritten schema metadata is unavailable"));
    }
    let previous = arr(member(&ms[index], "elements").unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .to_vec();
    let fresh = arr(member(&view, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]);
    for old in &previous {
        let old_id = member(old, "id").and_then(text);
        if old_id.as_ref().is_some_and(|id| {
            fresh.iter().any(|item| {
                member(item, "element")
                    .and_then(|e| member(e, "id"))
                    .and_then(text)
                    .as_ref()
                    == Some(id)
            })
        }) {
            continue;
        }
        let attached = member(old, "extensions")
            .and_then(arr)
            .is_some_and(|a| !a.is_empty())
            || matches!(member(old, "extensions"), Some(Value::Object(a)) if !a.is_empty())
            || matches!(old, Value::Object(fields) if fields.iter().any(|(k,_)| !["id","name","scalarType","extensions"].iter().any(|allowed| k==&Utf16::from(*allowed))));
        if attached {
            return Err(err("Rewrite would discard attached field metadata"));
        }
    }
    let mut elements = Vec::new();
    for item in fresh {
        let Some(base) = member(item, "element") else {
            continue;
        };
        let id = member(base, "id").and_then(text).unwrap_or_default();
        let old = previous
            .iter()
            .find(|e| member(e, "id").and_then(text).as_deref() == Some(id.as_str()));
        let mut merged = old.cloned().unwrap_or_else(|| base.clone());
        if old.is_some() {
            // A refresh replaces the native projection fields while retaining all
            // author-owned unknown fields and extension content in their order.
            for key in ["id", "name"] {
                if let Some(v) = member(base, key) {
                    replace_member(&mut merged, key, v.clone());
                }
            }
            // TypeScript deletes scalarType before spreading the refreshed
            // element, so a present replacement is appended in native order.
            remove_member(&mut merged, "scalarType");
            if let Some(v) = member(base, "scalarType") {
                replace_member(&mut merged, "scalarType", v.clone());
            }
        }
        elements.push(merged);
    }
    let Value::Array(modules) = member(doc, "modules").ok_or_else(|| err("Missing modules"))?
    else {
        return Err(err("Invalid modules"));
    };
    let mut copied = modules.clone();
    let Value::Object(fields) = &mut copied[index] else {
        return Err(err("Invalid fields module"));
    };
    if let Some((_, els)) = fields
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("elements"))
    {
        *els = Value::Array(elements)
    } else {
        return Err(err("Missing fields"));
    }
    replace_member(doc, "modules", Value::Array(copied));
    Ok(())
}
fn rewrite(
    source: &Value,
    tree: &Json,
    engine: &Engine,
    registry: &Registry,
    cap: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<(Value, usize), EngineError> {
    let bytes = bytes_from_doc(source, engine, registry, cap, ctx)?;
    let region = locate_footer(&bytes)?;
    let wire = from_json(tree.clone());
    let footer = encode_parquet_wire(&wire, ctx)?;
    let size = region
        .offset
        .checked_add(footer.len())
        .and_then(|x| x.checked_add(8))
        .ok_or_else(|| err("Edited file exceeds capture limit"))?;
    if size > MAX_BYTES {
        return Err(err("Edited file exceeds capture limit"));
    }
    let mut output_bytes = Vec::new();
    output_bytes.try_reserve_exact(size).map_err(|_| {
        EngineError::new(
            "RESOURCE_LIMIT",
            Utf16::default(),
            "Parquet rewrite allocation failed",
        )
        .with_control_failure()
    })?;
    output_bytes.resize(size, 0);
    output_bytes[..region.offset].copy_from_slice(&bytes[..region.offset]);
    output_bytes[region.offset..region.offset + footer.len()].copy_from_slice(&footer);
    let len = u32::try_from(footer.len()).map_err(|_| err("Footer exceeds format bounds"))?;
    output_bytes[size - 8..size - 4].copy_from_slice(&len.to_le_bytes());
    output_bytes[size - 4..].copy_from_slice(b"PAR1");
    let mut doc = copy_json(source, ctx)?;
    let Value::Array(modules) = member(&doc, "modules").ok_or_else(|| err("Missing modules"))?
    else {
        return Err(err("Invalid modules"));
    };
    let mut modules = modules.clone();
    let pm = modules
        .iter_mut()
        .find(|m| member(m, "id").and_then(text).as_deref() == Some("parquet"))
        .ok_or_else(|| err("Missing Parquet module"))?;
    let Value::Array(elements) =
        member(pm, "elements").ok_or_else(|| err("Missing Parquet elements"))?
    else {
        return Err(err("Invalid Parquet elements"));
    };
    let mut elements = elements.clone();
    let source_el = elements
        .iter_mut()
        .find(|e| member(e, "id").and_then(text).as_deref() == Some("source"))
        .ok_or_else(|| err("Missing source element"))?;
    let Value::Object(ext) =
        member(source_el, "extensions").ok_or_else(|| err("Missing source extensions"))?
    else {
        return Err(err("Invalid source extensions"));
    };
    let mut ext = ext.clone();
    let payload = ext
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("umf.parquet"))
        .ok_or_else(|| err("Missing Parquet payload"))?;
    replace_member(&mut payload.1, "bytes", s(hex(&output_bytes)));
    replace_member(source_el, "extensions", Value::Object(ext));
    replace_member(pm, "elements", Value::Array(elements));
    replace_member(&mut doc, "modules", Value::Array(modules));
    refresh_fields(&mut doc, engine, registry, cap, ctx)?;
    Ok((doc, region.offset))
}

/// Append key/value entries while retaining the source envelope and bytes preceding its footer.
pub fn append_key_value_metadata(
    source: &Value,
    entries: &Value,
    engine: &Engine,
    registry: &Registry,
    cap: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let inspected = inspect_parquet_metadata(source, engine, registry, cap, ctx)?;
    let mut ds = ordered_diagnostics(
        arr(member(&inspected, "diagnostics").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .to_vec(),
    );
    let copied = member(&inspected, "source")
        .cloned()
        .unwrap_or(copy_json(source, ctx)?);
    let mut out = result(copied.clone(), ds.clone());
    let fail = |mut out: Value, msg: &str| {
        if let Value::Array(d) = member(&out, "diagnostics")
            .cloned()
            .unwrap_or(Value::Array(vec![]))
        {
            let mut d = d;
            d.push(edit_diag("PARQUET_METADATA_EDIT_BLOCKED", "", msg));
            replace_member(&mut out, "diagnostics", Value::Array(d));
        }
        out
    };
    if !status(&inspected, "mapped") {
        return Ok(out);
    }
    let raw_entries = match entries {
        Value::Array(a) if !a.is_empty() && a.len() <= 1000 => a,
        _ => return Ok(fail(out, "Expected 1..1000 new metadata entries")),
    };
    let footer = decode_parquet_footer(source, engine, registry, cap, ctx)?;
    if member(&footer, "trailingBytes")
        .and_then(|v| {
            if let Value::Number(n) = v {
                Some(*n as usize)
            } else {
                None
            }
        })
        .unwrap_or(0)
        != 0
    {
        return Ok(fail(
            out,
            "Trailing footer bytes may contain signatures and cannot be rewritten",
        ));
    }
    let metadata = member(&inspected, "metadata").ok_or_else(|| err("Missing mapped metadata"))?;
    let metadata_json = to_json(metadata)?;
    if unsafe_json(&metadata_json)
        || ds
            .iter()
            .any(|d| member(d, "code").and_then(text).as_deref() == Some("PARQUET_ENUM_UNKNOWN"))
    {
        return Ok(fail(
            out,
            "Unknown or encryption metadata prevents a safe rewrite",
        ));
    }
    let mut keys = std::collections::HashSet::<Utf16>::new();
    if let Some(Value::Array(existing)) = member(metadata, "key_value_metadata") {
        for kv in existing {
            if let Some(Value::String(k)) = member(kv, "key") {
                keys.insert(k.clone());
            }
        }
    }
    let mut validated = Vec::<(String, Option<String>)>::new();
    let mut total = 0usize;
    for entry in raw_entries {
        let Value::Object(m) = entry else {
            return Ok(fail(
                out,
                "Entries require string keys and optional string values with no unknown fields",
            ));
        };
        if m.iter()
            .any(|(k, _)| k != &Utf16::from("key") && k != &Utf16::from("value"))
        {
            return Ok(fail(
                out,
                "Entries require string keys and optional string values with no unknown fields",
            ));
        }
        let Some(Value::String(key)) = member(entry, "key") else {
            return Ok(fail(
                out,
                "Entries require string keys and optional string values with no unknown fields",
            ));
        };
        let value =
            match member(entry, "value") {
                None => None,
                Some(Value::String(v)) => Some(v),
                _ => return Ok(fail(
                    out,
                    "Entries require string keys and optional string values with no unknown fields",
                )),
            };
        let mut encoded = Vec::new();
        for st in std::iter::once(key).chain(value.into_iter()) {
            if st.len() > MAX_BYTES {
                return Ok(fail(out, "Metadata strings exceed the file size bound"));
            }
            let Ok(text) = st.to_utf8() else {
                return Ok(fail(
                    out,
                    "Metadata strings must round trip UTF-8 without replacement",
                ));
            };
            let byte_len = text.len();
            total = total.saturating_add(byte_len);
            if total > MAX_BYTES {
                return Ok(fail(out, "Metadata additions exceed the file size bound"));
            }
            encoded.push(text);
        }
        if !keys.insert(key.clone()) {
            return Ok(fail(
                out,
                "Existing or duplicate keys cannot be replaced by an append operation",
            ));
        }
        let key_text = encoded.remove(0);
        let value_text = if encoded.is_empty() {
            None
        } else {
            Some(encoded.remove(0))
        };
        validated.push((key_text, value_text));
    }
    let mut tree =
        to_json(member(&footer, "value").ok_or_else(|| err("Footer has no wire tree"))?)?;
    if tree.get("kind").and_then(Json::as_str) != Some("struct") {
        return Ok(fail(out, "Expected FileMetaData struct"));
    }
    let fields = tree
        .get_mut("fields")
        .and_then(Json::as_array_mut)
        .ok_or_else(|| err("Expected FileMetaData fields"))?;
    let mut wires = Vec::new();
    for (key, value) in &validated {
        let mut f = vec![json!({"id":1,"value":{"kind":"binary","hex":hex(key.as_bytes())}})];
        if let Some(v) = value {
            f.push(json!({"id":2,"value":{"kind":"binary","hex":hex(v.as_bytes())}}))
        }
        wires.push(json!({"kind":"struct","fields":f}));
    }
    if let Some(field) = fields
        .iter_mut()
        .find(|f| f.get("id").and_then(Json::as_u64) == Some(5))
    {
        let Some(items) = field
            .get_mut("value")
            .and_then(|v| v.get_mut("items"))
            .and_then(Json::as_array_mut)
        else {
            return Ok(fail(out, "Invalid key-value metadata list"));
        };
        items.extend(wires)
    } else {
        fields.push(json!({"id":5,"value":{"kind":"list","elementType":"struct","items":wires}}))
    }
    match rewrite(&copied, &tree, engine, registry, cap, ctx) {
        Ok((doc, offset)) => {
            let check = inspect_parquet_metadata(&doc, engine, registry, cap, ctx)?;
            if !status(&check, "mapped") {
                return Ok(fail(out, "Edited footer failed metadata validation"));
            }
            replace_member(&mut out, "output", doc);
            replace_member(&mut out, "status", s("transformed"));
            // Retain each entry's member order independently of the footer's
            // native schema field order.
            replace_member(&mut out, "added", entries.clone());
            replace_member(&mut out, "unchangedPrefixBytes", n(offset));
            ds.push(diagnostic("PARQUET_METADATA_EDIT_SCOPE","","warning","File metadata appended; footer encoding may normalize, all preceding bytes are unchanged. Metadata consumers may change behavior; data validity and cross-system semantics are not established"));
            replace_member(&mut out, "diagnostics", Value::Array(ds));
            Ok(out)
        }
        Err(e) if e.is_control_failure() => Err(e),
        Err(e) => Ok(fail(out, &e.message.to_utf8().unwrap_or_default())),
    }
}
fn find_node<'a>(
    node: &'a Json,
    index: usize,
    parent: Option<&'a Json>,
) -> Option<(&'a Json, Option<&'a Json>)> {
    if node.get("index").and_then(Json::as_u64) == Some(index as u64) {
        return Some((node, parent));
    }
    node.get("children")?
        .as_array()?
        .iter()
        .find_map(|c| find_node(c, index, Some(node)))
}
fn id_value(v: &Json, id: u64) -> Option<&Json> {
    v.get("fields")?
        .as_array()?
        .iter()
        .find(|f| f.get("id").and_then(Json::as_u64) == Some(id))?
        .get("value")
}
fn id_value_mut(v: &mut Json, id: u64) -> Option<&mut Json> {
    v.get_mut("fields")?
        .as_array_mut()?
        .iter_mut()
        .find(|f| f.get("id").and_then(Json::as_u64) == Some(id))?
        .get_mut("value")
}
fn wire_list_items_mut(value: &mut Json) -> Option<&mut Vec<Json>> {
    if value.get("kind").and_then(Json::as_str) != Some("list") {
        return None;
    }
    value.get_mut("items")?.as_array_mut()
}
fn raw_reference(v: &Json) -> bool {
    match v {
        Json::Object(m) => m.iter().any(|(k, v)| {
            (k == "key_value_metadata" && v.as_array().is_some_and(|a| !a.is_empty()))
                || k == "file_path"
                || raw_reference(v)
        }),
        Json::Array(a) => a.iter().any(raw_reference),
        _ => false,
    }
}
fn collect_indexes(node: &Json, set: &mut std::collections::HashSet<usize>) {
    if let Some(i) = node.get("index").and_then(Json::as_u64) {
        set.insert(i as usize);
    }
    if let Some(a) = node.get("children").and_then(Json::as_array) {
        for c in a {
            collect_indexes(c, set)
        }
    }
}
fn ecma_index_path(value: &Value) -> Utf16 {
    match value {
        Value::Number(n) => Utf16::from(crate::ecma_number_to_string(*n).as_str()),
        Value::String(s) => s.clone(),
        Value::Bool(v) => Utf16::from(if *v { "true" } else { "false" }),
        Value::Null => Utf16::from("null"),
        Value::Array(items) => {
            let mut units = Vec::new();
            for (i, item) in items.iter().enumerate() {
                if i != 0 {
                    units.push(b',' as u16);
                }
                if !matches!(item, Value::Null) {
                    units.extend_from_slice(ecma_index_path(item).units());
                }
            }
            Utf16::new(units)
        }
        Value::Object(_) => Utf16::from("[object Object]"),
    }
}

/// Rename one schema index and every descendant column path in one footer commit.
pub fn rename_field(
    source: &Value,
    index_value: &Value,
    name_value: &Value,
    engine: &Engine,
    registry: &Registry,
    cap: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let index_number = match index_value {
        Value::Number(n) => Some(*n),
        _ => None,
    };
    // JavaScript integer admission is independent of the host pointer width.
    // A valid index too wide for this host is an absent schema field, after
    // the same intervening name/metadata checks as on a 64-bit host.
    let valid_index = index_number.is_some_and(|n| n.is_finite() && n.fract() == 0.0 && n > 0.0);
    let native_index = index_number
        .filter(|n| *n >= 0.0 && *n <= usize::MAX as f64)
        .map(|n| n as usize);
    let mut path_units = Utf16::from("/schema/").units().to_vec();
    path_units.extend_from_slice(ecma_index_path(index_value).units());
    let index_path = Utf16::new(path_units);
    let inspect = inspect_parquet_containers(source, engine, registry, cap, ctx)?;
    let ds = ordered_diagnostics(
        arr(member(&inspect, "diagnostics").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .to_vec(),
    );
    let original = member(&inspect, "source")
        .cloned()
        .unwrap_or(copy_json(source, ctx)?);
    let mut out = result(original.clone(), ds.clone());
    let fail = |mut out: Value, msg: &str| {
        let mut ds = arr(member(&out, "diagnostics").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .to_vec();
        ds.push(path_diagnostic(
            "PARQUET_RENAME_BLOCKED",
            index_path.clone(),
            "error",
            msg,
        ));
        replace_member(&mut out, "diagnostics", Value::Array(ds));
        out
    };
    if !status(&inspect, "checked") {
        return Ok(out);
    }
    if !valid_index {
        return Ok(fail(out, "Expected a non-root schema index"));
    }
    let name = match name_value {
        Value::String(s) => match s.to_utf8() {
            Ok(s) => s,
            Err(_) => {
                return Ok(fail(
                    out,
                    "Expected a nonempty lossless UTF-8 name up to 100000 UTF-16 units",
                ))
            }
        },
        _ => {
            return Ok(fail(
                out,
                "Expected a nonempty lossless UTF-8 name up to 100000 UTF-16 units",
            ))
        }
    };
    if name.is_empty()
        || name.encode_utf16().count() > 100_000
        || String::from_utf8_lossy(name.as_bytes()) != name
    {
        return Ok(fail(
            out,
            "Expected a nonempty lossless UTF-8 name up to 100000 UTF-16 units",
        ));
    }
    let metadata =
        to_json(member(&inspect, "metadata").ok_or_else(|| err("Missing schema metadata"))?)?;
    if unsafe_json(&metadata)
        || ds
            .iter()
            .any(|d| member(d, "code").and_then(text).as_deref() == Some("PARQUET_ENUM_UNKNOWN"))
    {
        return Ok(fail(
            out,
            "Unknown or crypto metadata prevents schema editing",
        ));
    }
    let footer = decode_parquet_footer(source, engine, registry, cap, ctx)?;
    if member(&footer, "trailingBytes")
        .and_then(|v| {
            if let Value::Number(n) = v {
                Some(*n as usize)
            } else {
                None
            }
        })
        .unwrap_or(0)
        != 0
    {
        return Ok(fail(out, "Footer trailers cannot be rewritten"));
    }
    if raw_reference(&metadata) {
        return Ok(fail(out,"Key/value metadata or external column files may contain schema references; an explicit rewrite policy is required"));
    }
    if arr(member(&inspect, "annotations").unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .iter()
        .any(|a| {
            member(a, "validation").and_then(text).as_deref() != Some("checked")
                && !matches!(
                    member(a, "name").and_then(text).as_deref(),
                    Some("LIST" | "MAP" | "MAP_KEY_VALUE")
                )
        })
    {
        return Ok(fail(
            out,
            "Uninterpreted logical annotations prevent safe rename",
        ));
    }
    let tree = to_json(member(&inspect, "tree").ok_or_else(|| err("Missing schema tree"))?)?;
    let Some(index) = native_index else {
        return Ok(fail(out, "Schema index does not identify a field"));
    };
    let Some((target, Some(parent))) = find_node(&tree, index, None) else {
        return Ok(fail(out, "Schema index does not identify a field"));
    };
    if target.get("name").and_then(Json::as_str) == Some(name.as_str()) {
        return Ok(fail(out, "Rename must change the field name"));
    }
    if parent
        .get("children")
        .and_then(Json::as_array)
        .is_some_and(|a| {
            a.iter().any(|n| {
                n.get("index").and_then(Json::as_u64) != Some(index as u64)
                    && n.get("name").and_then(Json::as_str) == Some(name.as_str())
            })
        })
    {
        return Ok(fail(out, "Sibling name collision"));
    }
    if ds.iter().any(|d| {
        member(d, "code").and_then(text).as_deref() == Some("PARQUET_DUPLICATE_FIELD_NAME")
    }) {
        return Ok(fail(out, "Ambiguous existing sibling names prevent rename"));
    }
    let path = target
        .get("path")
        .and_then(Json::as_array)
        .cloned()
        .unwrap_or_default();
    let from = Json::Array(path.clone());
    let mut to = path.clone();
    if let Some(last) = to.last_mut() {
        *last = Json::String(name.clone())
    }
    let mut wire = to_json(member(&footer, "value").ok_or_else(|| err("Missing footer wire"))?)?;
    let schema = id_value_mut(&mut wire, 2)
        .and_then(Json::as_object_mut)
        .and_then(|o| o.get_mut("items"))
        .and_then(Json::as_array_mut)
        .ok_or_else(|| err("Expected schema list"))?;
    let Some(element) = schema.get_mut(index) else {
        return Ok(fail(out, "Schema index does not identify a field"));
    };
    let fields = element
        .get_mut("fields")
        .and_then(Json::as_array_mut)
        .ok_or_else(|| err("Expected schema element"))?;
    if let Some(f) = fields
        .iter_mut()
        .find(|f| f.get("id").and_then(Json::as_u64) == Some(4))
    {
        f["value"] = json!({"kind":"binary","hex":hex(name.as_bytes())});
    } else {
        return Ok(fail(out, "Required schema name is missing"));
    }
    let mut affected = std::collections::HashSet::new();
    collect_indexes(target, &mut affected);
    let groups = id_value_mut(&mut wire, 4)
        .and_then(wire_list_items_mut)
        .ok_or_else(|| err("Expected row groups"))?;
    let leaves = arr(member(&inspect, "leaves").unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .iter()
        .map(to_json)
        .collect::<Result<Vec<_>, _>>()?;
    for (g, group) in groups.iter_mut().enumerate() {
        let cols = id_value_mut(group, 1)
            .and_then(wire_list_items_mut)
            .ok_or_else(|| err("Expected columns"))?;
        for leaf in &leaves {
            let ix = leaf.get("index").and_then(Json::as_u64).unwrap_or(u64::MAX) as usize;
            if !affected.contains(&ix) {
                continue;
            }
            let ordinal = leaf
                .get("ordinal")
                .and_then(Json::as_u64)
                .unwrap_or(u64::MAX) as usize;
            let Some(column) = cols.get_mut(ordinal) else {
                return Ok(fail(out, "Schema column path is inconsistent"));
            };
            let meta = id_value_mut(column, 3).ok_or_else(|| err("Expected column metadata"))?;
            let path_values = id_value_mut(meta, 3)
                .and_then(wire_list_items_mut)
                .ok_or_else(|| err("Expected column path"))?;
            let at = path.len().saturating_sub(1);
            if at >= path_values.len() {
                return Ok(fail(out, "Schema column path is inconsistent"));
            }
            path_values[at] = json!({"kind":"binary","hex":hex(name.as_bytes())});
        }
        let _ = g;
    }
    let (document, offset) = match rewrite(&original, &wire, engine, registry, cap, ctx) {
        Ok(v) => v,
        Err(e) if e.is_control_failure() => return Err(e),
        Err(e) => return Ok(fail(out, &e.message.to_utf8().unwrap_or_default())),
    };
    let after = inspect_parquet_containers(&document, engine, registry, cap, ctx)?;
    if !status(&after, "checked") {
        return Ok(fail(out, "Renamed schema failed structural/logical checks"));
    }
    if member(&inspect, "containers") != member(&after, "containers") {
        return Ok(fail(out, "Rename changes legacy LIST/MAP interpretation"));
    }
    replace_member(&mut out, "output", document);
    replace_member(
        &mut out,
        "rename",
        obj([
            ("index", n(index)),
            ("from", from_value(&from)),
            ("to", from_value(&Json::Array(to))),
        ]),
    );
    replace_member(&mut out, "unchangedPrefixBytes", n(offset));
    replace_member(&mut out, "status", s("transformed"));
    let mut ds = ds;
    ds.push(path_diagnostic("PARQUET_RENAME_SCOPE",index_path,"warning","Schema name and descendant column paths changed; all bytes before footer are unchanged. External consumers that refer to old names require migration"));
    replace_member(&mut out, "diagnostics", Value::Array(ds));
    Ok(out)
}
fn from_value(v: &Json) -> Value {
    crate::parquet_capture_inspection::from_json(v.clone())
}
