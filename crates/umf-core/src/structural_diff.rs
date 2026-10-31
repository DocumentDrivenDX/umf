//! Ordered, non-semantic structural comparison for reference tooling.
//! This reports declared differences only; it does not claim compatibility.

use crate::{Context, EngineError, Utf16, Value};

/// Return ordered change records matching the schema-browser predecessor.
pub fn compare_documents(
    before: &Value,
    after: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // Bound depth/value count and charge both owned snapshots before entering
    // recursive comparison. This also keeps direct Rust callers safe, not only
    // the wire decoder that normally performs the same admission.
    let mut before = crate::copy_json(before, ctx)?;
    let mut after = crate::copy_json(after, ctx)?;
    normalize_ecmascript_objects(&mut before, &Utf16::default(), ctx)?;
    normalize_ecmascript_objects(&mut after, &Utf16::default(), ctx)?;
    let mut changes = Vec::new();
    walk(
        Some(&before),
        Some(&after),
        &Utf16::default(),
        &mut changes,
        ctx,
    )?;
    let output = Value::Array(changes);
    // Apply the regular result-tree depth/value validation and output metering.
    crate::copy_json(&output, ctx)
}

fn normalize_ecmascript_objects(
    value: &mut Value,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    match value {
        Value::Array(items) => {
            for (index, item) in items.iter_mut().enumerate() {
                let child = append_segment(path, &Utf16::from(index.to_string()), ctx)?;
                normalize_ecmascript_objects(item, &child, ctx)?;
            }
        }
        Value::Object(fields) => {
            for (key, item) in fields.iter_mut() {
                let child = append_segment(path, key, ctx)?;
                normalize_ecmascript_objects(item, &child, ctx)?;
            }
            let order = ordered_field_indices(fields, path, ctx)?;
            let mut original = Vec::new();
            original
                .try_reserve(fields.len())
                .map_err(|_| limit_error(path, "Comparison key-order allocation failed"))?;
            original.extend(fields.drain(..).map(Some));
            for index in order {
                let Some(field) = original.get_mut(index).and_then(Option::take) else {
                    return Err(limit_error(
                        path,
                        "Comparison key-order permutation is invalid",
                    ));
                };
                fields.push(field);
            }
        }
        _ => {}
    }
    Ok(())
}

fn walk(
    before: Option<&Value>,
    after: Option<&Value>,
    path: &Utf16,
    changes: &mut Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    if let (Some(left), Some(right)) = (before, after) {
        if same(left, right, path, ctx)? {
            return Ok(());
        }
        if let (Value::Object(left), Value::Object(right)) = (left, right) {
            let maximum = left.len().checked_add(right.len()).ok_or_else(|| {
                EngineError::new("LIMIT", path.clone(), "Comparison key count overflow")
            })?;
            ctx.charge_work(maximum, path.clone())?;
            let mut keys: Vec<&Utf16> = Vec::new();
            keys.try_reserve(maximum)
                .map_err(|_| limit_error(path, "Comparison key allocation failed"))?;
            for index in ordered_field_indices(left, path, ctx)? {
                keys.push(&left[index].0);
            }
            for index in ordered_field_indices(right, path, ctx)? {
                let key = &right[index].0;
                if !contains_key(left, key, path, ctx)? {
                    keys.push(key);
                }
            }
            for key in keys {
                let left_value = get(left, key, path, ctx)?;
                let right_value = get(right, key, path, ctx)?;
                let child = append_segment(path, key, ctx)?;
                walk(left_value, right_value, &child, changes, ctx)?;
            }
            return Ok(());
        }
        if let (Value::Array(left), Value::Array(right)) = (left, right) {
            if let Some((left_ids, right_ids)) = keyed_ids(left, right, path, ctx)? {
                let mut shared_left = Vec::new();
                shared_left
                    .try_reserve(left_ids.len())
                    .map_err(|_| limit_error(path, "Comparison ID allocation failed"))?;
                for id in &left_ids {
                    if contains_id(&right_ids, id, path, ctx)? {
                        shared_left.push(id);
                    }
                }
                let mut shared_right = Vec::new();
                shared_right
                    .try_reserve(right_ids.len())
                    .map_err(|_| limit_error(path, "Comparison ID allocation failed"))?;
                for id in &right_ids {
                    if contains_id(&left_ids, id, path, ctx)? {
                        shared_right.push(id);
                    }
                }
                // The predecessor compares these order lists after joining
                // with U+0000. Keep its collision behavior for IDs containing
                // that character as part of the frozen comparison profile.
                if !joined_id_sequences_equal(&shared_left, &shared_right) {
                    let order_before = ids_value(&left_ids, path, ctx)?;
                    let order_after = ids_value(&right_ids, path, ctx)?;
                    push_change(
                        changes,
                        append_segment(path, &Utf16::from("order"), ctx)?,
                        "changed",
                        Some(&order_before),
                        Some(&order_after),
                        ctx,
                    )?;
                }
                let cloned_id_units = left_ids
                    .iter()
                    .try_fold(left_ids.len(), |total, id| total.checked_add(id.len()))
                    .ok_or_else(|| {
                        EngineError::new("LIMIT", path.clone(), "Comparison ID clone size overflow")
                    })?;
                ctx.charge_work(cloned_id_units, path.clone())?;
                let mut ids = Vec::new();
                ids.try_reserve(
                    left_ids
                        .len()
                        .checked_add(right_ids.len())
                        .ok_or_else(|| limit_error(path, "Comparison ID count overflow"))?,
                )
                .map_err(|_| limit_error(path, "Comparison ID allocation failed"))?;
                ids.extend(left_ids.iter().cloned());
                for id in &right_ids {
                    ctx.charge_work(id.len().saturating_add(1), path.clone())?;
                    if !contains_id(&ids, id, path, ctx)? {
                        ids.push(id.clone());
                    }
                }
                for id in ids {
                    let left_value = find_by_id(left, &id, path, ctx)?;
                    let right_value = find_by_id(right, &id, path, ctx)?;
                    let segment_len = 3usize
                        .checked_add(id.len())
                        .ok_or_else(|| limit_error(path, "Comparison path size overflow"))?;
                    ctx.charge_work(segment_len, path.clone())?;
                    let mut segment_units = Vec::new();
                    segment_units
                        .try_reserve(segment_len)
                        .map_err(|_| limit_error(path, "Comparison path allocation failed"))?;
                    segment_units.extend_from_slice(Utf16::from("id:").units());
                    segment_units.extend_from_slice(id.units());
                    let segment = Utf16::new(segment_units);
                    let child = append_segment(path, &segment, ctx)?;
                    walk(left_value, right_value, &child, changes, ctx)?;
                }
                return Ok(());
            }
        }
        push_change(
            changes,
            path.clone(),
            "changed",
            Some(left),
            Some(right),
            ctx,
        )?;
    } else if let Some(value) = after {
        push_change(changes, path.clone(), "created", None, Some(value), ctx)?;
    } else if let Some(value) = before {
        push_change(changes, path.clone(), "removed", Some(value), None, ctx)?;
    }
    Ok(())
}

fn same(
    left: &Value,
    right: &Value,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    ctx.charge_work(1, path.clone())?;
    match (left, right) {
        (Value::Null, Value::Null) => Ok(true),
        (Value::Bool(a), Value::Bool(b)) => Ok(a == b),
        (Value::Number(a), Value::Number(b)) => Ok(a == b),
        (Value::String(a), Value::String(b)) => Ok(a == b),
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                return Ok(false);
            }
            for (index, (left, right)) in a.iter().zip(b).enumerate() {
                let child = append_segment(path, &Utf16::from(index.to_string()), ctx)?;
                if !same(left, right, &child, ctx)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (Value::Object(a), Value::Object(b)) => {
            if a.len() != b.len() {
                return Ok(false);
            }
            let left_order = ordered_field_indices(a, path, ctx)?;
            let right_order = ordered_field_indices(b, path, ctx)?;
            for (left_index, right_index) in left_order.into_iter().zip(right_order) {
                let (left_key, left_value) = &a[left_index];
                let (right_key, right_value) = &b[right_index];
                ctx.charge_work(left_key.len().saturating_add(1), path.clone())?;
                if left_key != right_key
                    || !same(
                        left_value,
                        right_value,
                        &append_segment(path, left_key, ctx)?,
                        ctx,
                    )?
                {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        _ => Ok(false),
    }
}

// Object.keys uses ECMAScript property order: canonical array-index keys first
// in ascending numeric order, followed by all other string keys in insertion
// order. Keep this only as a traversal view; output snapshots retain the
// original ordered fields.
fn ordered_field_indices(
    fields: &[(Utf16, Value)],
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Vec<usize>, EngineError> {
    let len = fields.len();
    ctx.charge_work(len, path.clone())?;
    let log = if len <= 1 {
        1
    } else {
        usize::BITS as usize - (len - 1).leading_zeros() as usize
    };
    let sort_bound = len
        .checked_mul(log.saturating_mul(2).saturating_add(1))
        .ok_or_else(|| limit_error(path, "Comparison key-order work overflow"))?;
    ctx.charge_work(sort_bound, path.clone())?;
    let mut indices = Vec::new();
    indices
        .try_reserve(len)
        .map_err(|_| limit_error(path, "Comparison key-order allocation failed"))?;
    indices.extend(0..len);
    indices.sort_unstable_by(|left, right| {
        match (
            ecmascript_index(&fields[*left].0),
            ecmascript_index(&fields[*right].0),
        ) {
            (Some(a), Some(b)) => a.cmp(&b).then_with(|| left.cmp(right)),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => left.cmp(right),
        }
    });
    Ok(indices)
}

fn ecmascript_index(key: &Utf16) -> Option<u32> {
    let units = key.units();
    if units.is_empty() || units.len() > 10 || (units.len() > 1 && units[0] == b'0' as u16) {
        return None;
    }
    let mut value = 0u32;
    for unit in units {
        if !(b'0' as u16..=b'9' as u16).contains(unit) {
            return None;
        }
        value = value
            .checked_mul(10)?
            .checked_add(u32::from(*unit - b'0' as u16))?;
    }
    (value < u32::MAX).then_some(value)
}

fn keyed_ids(
    before: &[Value],
    after: &[Value],
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<(Vec<Utf16>, Vec<Utf16>)>, EngineError> {
    let Some(left) = collect_ids(before, path, ctx)? else {
        return Ok(None);
    };
    let Some(right) = collect_ids(after, path, ctx)? else {
        return Ok(None);
    };
    Ok(Some((left, right)))
}

fn collect_ids(
    values: &[Value],
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<Vec<Utf16>>, EngineError> {
    ctx.charge_work(values.len(), path.clone())?;
    let mut ids = Vec::new();
    ids.try_reserve(values.len())
        .map_err(|_| limit_error(path, "Comparison ID allocation failed"))?;
    let id_key = Utf16::from("id");
    for value in values {
        ctx.charge_work(1, path.clone())?;
        let Value::Object(fields) = value else {
            return Ok(None);
        };
        // Charge every inspected member before reading it. A missing `id` can
        // otherwise make a wide object an unmetered scan on each side.
        let mut member_id = None;
        for (key, item) in fields {
            ctx.charge_work(key.len().saturating_add(1), path.clone())?;
            if key == &id_key {
                member_id = Some(item);
                break;
            }
        }
        let Some(Value::String(id)) = member_id else {
            return Ok(None);
        };
        ctx.charge_work(id.len().saturating_add(1), path.clone())?;
        if contains_id(&ids, id, path, ctx)? {
            return Ok(None);
        }
        ids.push(id.clone());
    }
    Ok(Some(ids))
}

fn find_by_id<'a>(
    values: &'a [Value],
    id: &Utf16,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    for value in values {
        ctx.charge_work(1, path.clone())?;
        let Value::Object(fields) = value else {
            continue;
        };
        for (key, item) in fields {
            ctx.charge_work(key.len().saturating_add(1), path.clone())?;
            if key == &Utf16::from("id") {
                if let Value::String(candidate) = item {
                    if candidate == id {
                        return Ok(Some(value));
                    }
                }
            }
        }
    }
    Ok(None)
}

fn get<'a>(
    fields: &'a [(Utf16, Value)],
    key: &Utf16,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    for (candidate, value) in fields {
        ctx.charge_work(candidate.len().saturating_add(1), path.clone())?;
        if candidate == key {
            return Ok(Some(value));
        }
    }
    Ok(None)
}

fn contains_key(
    fields: &[(Utf16, Value)],
    key: &Utf16,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    for (candidate, _) in fields {
        ctx.charge_work(candidate.len().saturating_add(1), path.clone())?;
        if candidate == key {
            return Ok(true);
        }
    }
    Ok(false)
}

fn contains_id(
    ids: &[Utf16],
    id: &Utf16,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    for candidate in ids {
        ctx.charge_work(candidate.len().saturating_add(1), path.clone())?;
        if candidate == id {
            return Ok(true);
        }
    }
    Ok(false)
}

fn joined_id_sequences_equal(left: &[&Utf16], right: &[&Utf16]) -> bool {
    fn next(ids: &[&Utf16], id_index: &mut usize, unit_index: &mut usize) -> Option<u16> {
        if *id_index >= ids.len() {
            return None;
        }
        let units = ids[*id_index].units();
        if *unit_index < units.len() {
            let unit = units[*unit_index];
            *unit_index += 1;
            return Some(unit);
        }
        if *id_index + 1 < ids.len() {
            *id_index += 1;
            *unit_index = 0;
            return Some(0);
        }
        *id_index = ids.len();
        None
    }
    let (mut left_id, mut left_unit, mut right_id, mut right_unit) = (0, 0, 0, 0);
    loop {
        let a = next(left, &mut left_id, &mut left_unit);
        let b = next(right, &mut right_id, &mut right_unit);
        if a != b {
            return false;
        }
        if a.is_none() {
            return true;
        }
    }
}

fn ids_value(ids: &[Utf16], path: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = ids
        .iter()
        .try_fold(ids.len(), |total, id| total.checked_add(id.len()))
        .ok_or_else(|| {
            EngineError::new("LIMIT", path.clone(), "Comparison ID output size overflow")
        })?;
    ctx.charge_work(units, path.clone())?;
    let mut values = Vec::new();
    values
        .try_reserve(ids.len())
        .map_err(|_| limit_error(path, "Comparison ID output allocation failed"))?;
    values.extend(ids.iter().cloned().map(Value::String));
    Ok(Value::Array(values))
}

fn push_change(
    changes: &mut Vec<Value>,
    path: Utf16,
    status: &str,
    before: Option<&Value>,
    after: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    changes
        .try_reserve(1)
        .map_err(|_| limit_error(&path, "Comparison output allocation failed"))?;
    let mut fields = vec![
        (Utf16::from("path"), Value::String(path)),
        (Utf16::from("status"), Value::string_utf8(status)),
    ];
    if let Some(before) = before {
        fields.push((Utf16::from("before"), crate::copy_json(before, ctx)?));
    }
    if let Some(after) = after {
        fields.push((Utf16::from("after"), crate::copy_json(after, ctx)?));
    }
    changes.push(Value::Object(fields));
    Ok(())
}

fn append_segment(
    path: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let escaped_len = segment
        .units()
        .iter()
        .try_fold(0usize, |len, unit| {
            len.checked_add(if *unit == 0x7e || *unit == 0x2f { 2 } else { 1 })
        })
        .ok_or_else(|| limit_error(path, "Comparison path size overflow"))?;
    let total = path
        .len()
        .checked_add(1)
        .and_then(|len| len.checked_add(escaped_len))
        .ok_or_else(|| limit_error(path, "Comparison path size overflow"))?;
    ctx.charge_work(total, path.clone())?;
    let mut units = Vec::new();
    units
        .try_reserve(total)
        .map_err(|_| limit_error(path, "Comparison path allocation failed"))?;
    units.extend_from_slice(path.units());
    units.push(b'/' as u16);
    for unit in segment.units() {
        match unit {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            other => units.push(*other),
        }
    }
    Ok(Utf16::new(units))
}

fn limit_error(path: &Utf16, message: &str) -> EngineError {
    EngineError::new("LIMIT", path.clone(), message)
}
