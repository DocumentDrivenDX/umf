// SPDX-License-Identifier: MIT OR Apache-2.0
//! RFC 6902 value transformations. No native write or authorization is implied.
use crate::{
    value::{array_items, member, object_members, string_member},
    CodegenEngine,
};
use umf_core::{copy_json, Context, EngineError, Utf16, Value};

fn error(index: usize, message: &str) -> EngineError {
    EngineError::new(
        "JSON_PATCH",
        Utf16::from(format!("/patch/{index}")),
        message,
    )
}
fn pointer(text: &Utf16, index: usize, ctx: &mut Context<'_>) -> Result<Vec<Utf16>, EngineError> {
    ctx.charge_work(text.len(), Utf16::from(format!("/patch/{index}")))?;
    let text = text
        .to_utf8()
        .map_err(|_| error(index, "JSON Pointer must contain Unicode scalar values"))?;
    if text.is_empty() {
        return Ok(Vec::new());
    }
    let tail = text
        .strip_prefix('/')
        .ok_or_else(|| error(index, "JSON Pointer must be empty or begin with slash"))?;
    let mut parts = Vec::new();
    for part in tail.split('/') {
        if parts.len() >= ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                Utf16::default(),
                "JSON Pointer depth exceeded",
            ));
        }
        let mut result = String::new();
        let mut chars = part.chars();
        while let Some(c) = chars.next() {
            if c != '~' {
                result.push(c);
                continue;
            }
            result.push(match chars.next() {
                Some('0') => '~',
                Some('1') => '/',
                _ => return Err(error(index, "Invalid JSON Pointer escape")),
            });
        }
        parts.push(Utf16::from(result));
    }
    Ok(parts)
}
fn array_index(key: &Utf16, len: usize, append: bool, index: usize) -> Result<usize, EngineError> {
    let key = key
        .to_utf8()
        .map_err(|_| error(index, "Invalid array index"))?;
    if append && key == "-" {
        return Ok(len);
    }
    if key.is_empty()
        || (key.len() > 1 && key.starts_with('0'))
        || !key.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(error(index, "Invalid array index"));
    }
    let n = key
        .parse::<usize>()
        .map_err(|_| error(index, "Array index overflow"))?;
    if n > len || (!append && n == len) {
        return Err(error(index, "Array index does not exist"));
    }
    Ok(n)
}
fn descend<'a>(
    node: &'a mut Value,
    path: &[Utf16],
    index: usize,
    ctx: &mut Context<'_>,
) -> Result<&'a mut Value, EngineError> {
    if path.is_empty() {
        return Ok(node);
    }
    ctx.charge_work(
        match node {
            Value::Object(fields) => fields.len(),
            _ => 1,
        },
        Utf16::from(format!("/patch/{index}")),
    )?;
    let next = match node {
        Value::Object(fields) => fields
            .iter_mut()
            .find(|(key, _)| key == &path[0])
            .map(|(_, v)| v)
            .ok_or_else(|| error(index, "Parent path does not exist"))?,
        Value::Array(items) => {
            let at = array_index(&path[0], items.len(), false, index)?;
            &mut items[at]
        }
        _ => return Err(error(index, "Cannot traverse a scalar")),
    };
    descend(next, &path[1..], index, ctx)
}
fn target<'a>(
    root: &'a mut Option<Value>,
    path: &[Utf16],
    index: usize,
    ctx: &mut Context<'_>,
) -> Result<&'a mut Value, EngineError> {
    descend(
        root.as_mut()
            .ok_or_else(|| error(index, "Document does not exist"))?,
        path,
        index,
        ctx,
    )
}
fn remove(
    root: &mut Option<Value>,
    path: &[Utf16],
    index: usize,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let Some((key, parent)) = path.split_last() else {
        return root
            .take()
            .ok_or_else(|| error(index, "Document does not exist"));
    };
    match target(root, parent, index, ctx)? {
        Value::Object(fields) => {
            ctx.charge_work(fields.len().saturating_mul(2), Utf16::default())?;
            let at = fields
                .iter()
                .position(|(k, _)| k == key)
                .ok_or_else(|| error(index, "Target does not exist"))?;
            Ok(fields.remove(at).1)
        }
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let at = array_index(key, items.len(), false, index)?;
            Ok(items.remove(at))
        }
        _ => Err(error(index, "Cannot remove from a scalar")),
    }
}
fn add(
    root: &mut Option<Value>,
    path: &[Utf16],
    value: Value,
    index: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some((key, parent)) = path.split_last() else {
        *root = Some(value);
        return Ok(());
    };
    match target(root, parent, index, ctx)? {
        Value::Object(fields) => {
            ctx.charge_work(fields.len(), Utf16::default())?;
            if let Some((_, old)) = fields.iter_mut().find(|(k, _)| k == key) {
                *old = value;
            } else {
                fields.push((key.clone(), value));
            }
        }
        Value::Array(items) => {
            ctx.charge_work(items.len(), Utf16::default())?;
            let at = array_index(key, items.len(), true, index)?;
            items.insert(at, value);
        }
        _ => return Err(error(index, "Cannot add to a scalar")),
    }
    Ok(())
}
fn json_check(
    value: &Value,
    depth: usize,
    count: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    *count = count
        .checked_add(1)
        .ok_or_else(|| EngineError::new("LIMIT", Utf16::default(), "JSON count overflow"))?;
    ctx.check_tree_value_count(*count, Utf16::default())?;
    if depth > ctx.limits().max_depth {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "JSON nesting depth exceeded",
        ));
    }
    match value {
        Value::String(s) => {
            s.to_utf8()
                .map_err(|_| error(0, "JSON strings must contain Unicode scalar values"))?;
        }
        Value::Array(items) => {
            for item in items {
                json_check(item, depth + 1, count, ctx)?;
            }
        }
        Value::Object(fields) => {
            for (key, item) in fields {
                key.to_utf8()
                    .map_err(|_| error(0, "JSON keys must contain Unicode scalar values"))?;
                json_check(item, depth + 1, count, ctx)?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn equal(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    Ok(match (a, b) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(a), Value::Bool(b)) => a == b,
        (Value::Number(a), Value::Number(b)) => a == b,
        (Value::String(a), Value::String(b)) => a == b,
        (Value::Array(a), Value::Array(b)) if a.len() == b.len() => {
            for (a, b) in a.iter().zip(b) {
                if !equal(a, b, ctx)? {
                    return Ok(false);
                }
            }
            true
        }
        (Value::Object(a), Value::Object(b)) if a.len() == b.len() => {
            for (key, value) in a {
                ctx.charge_work(b.len(), Utf16::default())?;
                let Some((_, other)) = b.iter().find(|(k, _)| k == key) else {
                    return Ok(false);
                };
                if !equal(value, other, ctx)? {
                    return Ok(false);
                }
            }
            true
        }
        _ => false,
    })
}
impl CodegenEngine<'_> {
    /// Apply a complete RFC 6902 patch to a private admitted copy.
    /// Returns `{present:true,value}` or `{present:false}` after root removal.
    /// A failure returns no partial result; this operation grants no database effect.
    pub fn apply_json_patch(
        &self,
        request: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let request = copy_json(request, ctx)?;
        json_check(&request, 0, &mut 0, ctx)?;
        let fields =
            object_members(&request).ok_or_else(|| error(0, "Expected document and patch"))?;
        if fields.len() != 2 || member(&request, "document").is_none() {
            return Err(error(0, "Expected document and patch"));
        }
        let patch = member(&request, "patch")
            .and_then(|v| array_items(v))
            .ok_or_else(|| error(0, "Patch must be an array"))?;
        let source = member(&request, "document").expect("checked document");
        json_check(source, 0, &mut 0, ctx)?;
        let mut result = Some(copy_json(source, ctx)?);
        for (index, operation) in patch.iter().enumerate() {
            ctx.charge_work(1, Utf16::from(format!("/patch/{index}")))?;
            let op = string_member(operation, "op")
                .and_then(|s| s.to_utf8().ok())
                .ok_or_else(|| error(index, "Operation name is required"))?;
            let path = pointer(
                string_member(operation, "path").ok_or_else(|| error(index, "Path is required"))?,
                index,
                ctx,
            )?;
            match op.as_str() {
                "add" | "replace" => {
                    let value = member(operation, "value")
                        .ok_or_else(|| error(index, "Value is required"))?;
                    json_check(value, 0, &mut 0, ctx)?;
                    if op == "replace" {
                        let _ = target(&mut result, &path, index, ctx)?;
                    }
                    let value = copy_json(value, ctx)?;
                    if op == "replace" {
                        *target(&mut result, &path, index, ctx)? = value;
                    } else {
                        add(&mut result, &path, value, index, ctx)?;
                    }
                }
                "remove" => {
                    let _ = remove(&mut result, &path, index, ctx)?;
                }
                "move" | "copy" => {
                    let from = pointer(
                        string_member(operation, "from")
                            .ok_or_else(|| error(index, "From is required"))?,
                        index,
                        ctx,
                    )?;
                    if op == "move" && path.len() > from.len() && path.starts_with(&from) {
                        return Err(error(index, "Cannot move into a descendant"));
                    }
                    let value = if op == "move" {
                        remove(&mut result, &from, index, ctx)?
                    } else {
                        copy_json(target(&mut result, &from, index, ctx)?, ctx)?
                    };
                    add(&mut result, &path, value, index, ctx)?;
                }
                "test" => {
                    let expected = member(operation, "value")
                        .ok_or_else(|| error(index, "Value is required"))?;
                    json_check(expected, 0, &mut 0, ctx)?;
                    if !equal(target(&mut result, &path, index, ctx)?, expected, ctx)? {
                        return Err(error(index, "Test failed"));
                    }
                }
                _ => return Err(error(index, "Unknown patch operation")),
            }
            if let Some(value) = &result {
                json_check(value, 0, &mut 0, ctx)?;
            }
        }
        let mut output = vec![(Utf16::from("present"), Value::Bool(result.is_some()))];
        if let Some(value) = result {
            output.push((Utf16::from("value"), value));
        }
        copy_json(&Value::Object(output), ctx)
    }
}
