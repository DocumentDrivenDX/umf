// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in finite supplied-dataset checks for current core 0.10.0 documents.
//!
//! The operation composes the existing public Record and Key evaluators. Its
//! scope is caller-supplied values only; it does not certify native storage,
//! global uniqueness, authorization, or physical coverage.
use crate::{
    context::Context,
    core_key_tuple::{encode_core_key_tuple, encode_core_key_tuple_compact_body},
    engine::{Capabilities, Engine},
    error::{Diagnostic, EngineError, Severity, Validation},
    record_values::{evaluate_core_record_values_body, validate_core_record_values},
    registry::Registry,
    schema::CompiledSchema,
    value::{Utf16, Value, copy_json},
};
use std::collections::{BTreeMap, BTreeSet};

fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn arr(v: Option<&Value>) -> Option<&[Value]> {
    match v {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn text(v: Option<&Value>) -> Option<&Utf16> {
    match v {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}
fn fields(v: &Value) -> Option<&[(Utf16, Value)]> {
    match v {
        Value::Object(m) => Some(m),
        _ => None,
    }
}
fn known(v: &Value, allowed: &[&str], path: &str) -> Result<(), EngineError> {
    let Some(m) = fields(v) else {
        return Err(err(
            "CORE_DATASET_INPUT",
            "Dataset request violates its versioned operation schema",
            path,
        ));
    };
    if m.iter()
        .any(|(k, _)| !allowed.iter().any(|a| k == &Utf16::from(*a)))
    {
        return Err(err(
            "CORE_DATASET_INPUT",
            "Dataset request violates its versioned operation schema",
            path,
        ));
    }
    Ok(())
}
fn ident(v: &Value, names: &[&str], path: &str) -> Result<(), EngineError> {
    known(v, names, path)?;
    let m = fields(v).unwrap();
    if m.len() != names.len()
        || names
            .iter()
            .any(|n| text(get(v, n)).is_none_or(Utf16::is_empty))
    {
        return Err(err(
            "CORE_DATASET_INPUT",
            "Exact nonempty qualified identity required",
            path,
        ));
    }
    Ok(())
}
fn field_ident(v: &Value) -> Option<(Utf16, Utf16)> {
    Some((
        text(get(v, "module"))?.clone(),
        text(get(v, "element"))?.clone(),
    ))
}
fn same_endpoint(a: &Value, b: &Value) -> bool {
    field_ident(a) == field_ident(b)
}
fn validation_value(v: &Validation) -> Value {
    obj(vec![
        ("valid", Value::Bool(v.valid)),
        ("complete", Value::Bool(v.complete)),
        (
            "diagnostics",
            Value::Array(v.diagnostics.iter().map(diagnostic_value).collect()),
        ),
    ])
}
fn diagnostic_value(d: &Diagnostic) -> Value {
    obj(vec![
        ("code", Value::String(d.code.clone())),
        ("path", Value::String(d.path.clone())),
        ("message", Value::String(d.message.clone())),
        (
            "severity",
            s(match d.severity {
                Severity::Error => "error",
                Severity::Warning => "warning",
            }),
        ),
    ])
}
fn dataset_diagnostic(code: &str, path: &str, message: &str, severity: &str) -> Value {
    obj(vec![
        ("code", s(code)),
        ("path", s(path)),
        ("message", s(message)),
        ("severity", s(severity)),
    ])
}
fn str_value(v: &Utf16) -> Value {
    Value::String(v.clone())
}
fn qid(module: &Utf16, element: &Utf16) -> (Utf16, Utf16) {
    (module.clone(), element.clone())
}
fn bytes_hex(v: &Value) -> Option<Utf16> {
    text(get(v, "bytesHex")).cloned()
}
fn multiplicity(v: Option<&Value>) -> (u64, Option<u64>) {
    let min = get(v.unwrap_or(&Value::Null), "min")
        .and_then(|v| match v {
            Value::Number(n) if *n >= 0.0 => Some(*n as u64),
            _ => None,
        })
        .unwrap_or(0);
    let max = get(v.unwrap_or(&Value::Null), "max").and_then(|v| match v {
        Value::String(s) if s == &Utf16::from("*") => None,
        Value::Number(n) if *n >= 0.0 => Some(*n as u64),
        _ => None,
    });
    (min, max)
}
fn pointer_value<'a>(root: &'a Value, path: &Utf16) -> Option<&'a Value> {
    let units = path.units();
    if units.first().copied()? != u16::from(b'/') {
        return None;
    }
    let mut current = root;
    for raw in units[1..].split(|unit| *unit == u16::from(b'/')) {
        let mut segment = Vec::with_capacity(raw.len());
        let mut i = 0;
        while i < raw.len() {
            if raw[i] == u16::from(b'~') {
                match raw.get(i + 1).copied() {
                    Some(v) if v == u16::from(b'0') => segment.push(u16::from(b'~')),
                    Some(v) if v == u16::from(b'1') => segment.push(u16::from(b'/')),
                    _ => return None,
                }
                i += 2;
            } else {
                segment.push(raw[i]);
                i += 1;
            }
        }
        current = match current {
            Value::Object(m) => m
                .iter()
                .find(|(k, _)| k.units() == segment)
                .map(|(_, v)| v)?,
            Value::Array(a) => {
                if segment.is_empty() || (segment.len() > 1 && segment[0] == u16::from(b'0')) {
                    return None;
                }
                let mut index = 0usize;
                for digit in segment {
                    if !(u16::from(b'0')..=u16::from(b'9')).contains(&digit) {
                        return None;
                    }
                    index = index
                        .checked_mul(10)?
                        .checked_add((digit - u16::from(b'0')) as usize)?;
                }
                a.get(index)?
            }
            _ => return None,
        };
    }
    Some(current)
}
pub(crate) fn tree_values(v: &Value) -> usize {
    1 + match v {
        Value::Array(a) => a.iter().map(tree_values).sum(),
        Value::Object(m) => m.iter().map(|(_, v)| tree_values(v)).sum(),
        _ => 0,
    }
}

/// Invocation-local mirror of the compact predecessor's ValueWork ledger.
/// Context host-meter charges remain separate; this ledger governs the
/// TypeScript-compatible 1,000,000-unit compact work ceiling.
#[derive(Default, Debug)]
struct CompactWorkLedger {
    used: usize,
    categories: BTreeMap<String, usize>,
}

impl CompactWorkLedger {
    fn charge(&mut self, category: impl Into<String>, amount: usize) {
        self.used = self.used.saturating_add(amount);
        let entry = self.categories.entry(category.into()).or_default();
        *entry = entry.saturating_add(amount);
    }

    fn charge_checked(
        &mut self,
        category: impl Into<String>,
        amount: usize,
    ) -> Result<(), EngineError> {
        if self.used.saturating_add(amount) > 1_000_000 {
            return Err(err(
                "LIMIT",
                "Compact dataset JSON traversal/copy/semantic budget exceeded",
                "",
            ));
        }
        self.charge(category, amount);
        Ok(())
    }

    fn copy_tree_checked(&mut self, value: &Value) -> Result<(), EngineError> {
        self.copy_tree_mode(value, true)
    }

    fn enforce(&self) -> Result<(), EngineError> {
        if self.used > 1_000_000 {
            return Err(err(
                "LIMIT",
                "Compact dataset JSON traversal/copy/semantic budget exceeded",
                "",
            ));
        }
        Ok(())
    }

    /// Charge the compact ledger with the same immediate refusal point as the
    /// TypeScript `ValueWork` owner. The selected validation route keeps its
    /// historical phase accounting; verification uses `checked = true` so
    /// receipt admission, recomputation and final comparison share one
    /// fail-fast ledger.
    fn charge_mode(
        &mut self,
        category: impl Into<String>,
        amount: usize,
        checked: bool,
    ) -> Result<(), EngineError> {
        if checked {
            self.charge_checked(category, amount)
        } else {
            self.charge(category, amount);
            Ok(())
        }
    }

    fn count_mode(&mut self, value: &Value, checked: bool) -> Result<usize, EngineError> {
        fn visit(
            value: &Value,
            ledger: &mut CompactWorkLedger,
            total: &mut usize,
            checked: bool,
        ) -> Result<(), EngineError> {
            ledger.charge_mode("count", 1, checked)?;
            *total = total.saturating_add(1);
            match value {
                Value::Array(items) => {
                    for item in items {
                        visit(item, ledger, total, checked)?;
                    }
                }
                Value::Object(members) => {
                    for (_, item) in members {
                        visit(item, ledger, total, checked)?;
                    }
                }
                _ => {}
            }
            Ok(())
        }
        let mut total = 0;
        visit(value, self, &mut total, checked)?;
        Ok(total)
    }

    fn count(&mut self, value: &Value) -> usize {
        self.count_mode(value, false)
            .expect("unchecked ledger cannot refuse")
    }

    fn count_checked(&mut self, value: &Value) -> Result<usize, EngineError> {
        self.count_mode(value, true)
    }

    #[cfg(test)]
    fn walk(&mut self, category: &'static str, value: &Value, multiplier: usize) -> usize {
        let count = self.count(value);
        self.charge(category, count.saturating_mul(multiplier));
        count
    }

    fn walk_mode(
        &mut self,
        category: &'static str,
        value: &Value,
        multiplier: usize,
        checked: bool,
    ) -> Result<usize, EngineError> {
        let count = self.count_mode(value, checked)?;
        self.charge_mode(category, count.saturating_mul(multiplier), checked)?;
        Ok(count)
    }

    #[cfg(test)]
    fn copy_tree(&mut self, value: &Value) {
        self.copy_tree_mode(value, false)
            .expect("unchecked ledger cannot refuse");
    }

    fn copy_tree_mode(&mut self, value: &Value, checked: bool) -> Result<(), EngineError> {
        self.charge_mode("copy", 1, checked)?;
        match value {
            Value::Array(items) => {
                for item in items {
                    self.copy_tree_mode(item, checked)?;
                }
            }
            Value::Object(members) => {
                for (_, item) in members {
                    self.copy_tree_mode(item, checked)?;
                }
            }
            _ => {}
        }
        Ok(())
    }

    /// Reserve the predecessor's complete canonical-string traversal before
    /// performing equality. TypeScript materializes each canonical string in
    /// full, so a later mismatch does not reduce this work charge.
    fn reserve_verify_canonical(&mut self, value: &Value) -> Result<(), EngineError> {
        fn visit(value: &Value, ledger: &mut CompactWorkLedger) -> Result<(), EngineError> {
            ledger.charge_checked("verify-canonical-visit", 1)?;
            if let Value::Object(members) = value {
                let len = members.len();
                let levels = if len == 0 {
                    0
                } else {
                    usize::BITS as usize - len.leading_zeros() as usize
                };
                ledger.charge_checked("verify-canonical-key-sort", len.saturating_mul(levels))?;
                let mut ordered = members.iter().collect::<Vec<_>>();
                ordered.sort_by(|left, right| left.0.cmp(&right.0));
                for (_, child) in ordered {
                    visit(child, ledger)?;
                }
            } else if let Value::Array(items) = value {
                for child in items {
                    visit(child, ledger)?;
                }
            }
            Ok(())
        }
        visit(value, self)
    }

    fn reserve_verify_canonical_receipt_result(
        &mut self,
        value: &Value,
    ) -> Result<(), EngineError> {
        let Value::Object(members) = value else {
            return self.reserve_verify_canonical(value);
        };
        self.charge_checked("verify-canonical-visit", 1)?;
        let keep = |key: &Utf16| key != &Utf16::from("source") && key != &Utf16::from("input");
        let len = members.iter().filter(|(key, _)| keep(key)).count();
        let levels = if len == 0 {
            0
        } else {
            usize::BITS as usize - len.leading_zeros() as usize
        };
        self.charge_checked("verify-canonical-key-sort", len.saturating_mul(levels))?;
        let mut ordered = members.iter().collect::<Vec<_>>();
        ordered.sort_by(|left, right| left.0.cmp(&right.0));
        for (key, child) in ordered {
            if keep(key) {
                self.reserve_verify_canonical(child)?;
            }
        }
        Ok(())
    }

    /// Match `preflightBytes`: count one traversal visit per node while
    /// measuring compact JSON UTF-8 bytes, including lone-surrogate escapes.
    fn preflight_bytes(&mut self, value: &Value) -> usize {
        fn string_bytes(text: &Utf16) -> usize {
            let units = text.units();
            let mut bytes = 2usize;
            let mut i = 0;
            while i < units.len() {
                let unit = units[i];
                bytes = bytes.saturating_add(match unit {
                    0x22 | 0x5c => 2,
                    0x08 | 0x09 | 0x0a | 0x0c | 0x0d => 2,
                    0x00..=0x1f => 6,
                    0xd800..=0xdbff
                        if units
                            .get(i + 1)
                            .is_some_and(|next| (0xdc00..=0xdfff).contains(next)) =>
                    {
                        i += 1;
                        4
                    }
                    0xd800..=0xdfff => 6,
                    0x00..=0x7f => 1,
                    0x80..=0x7ff => 2,
                    _ => 3,
                });
                i += 1;
            }
            bytes
        }
        fn visit(value: &Value, ledger: &mut CompactWorkLedger) -> usize {
            ledger.charge("preflight-byte-traversal", 1);
            match value {
                Value::Null => 4,
                Value::Bool(true) => 4,
                Value::Bool(false) => 5,
                Value::Number(number) => crate::value::ecma_number_to_string(*number).len(),
                Value::String(text) => string_bytes(text),
                Value::Array(items) => {
                    let children = items.iter().map(|item| visit(item, ledger)).sum::<usize>();
                    2usize
                        .saturating_add(items.len().saturating_sub(1))
                        .saturating_add(children)
                }
                Value::Object(members) => {
                    let children = members
                        .iter()
                        .map(|(key, child)| {
                            string_bytes(key)
                                .saturating_add(1)
                                .saturating_add(visit(child, ledger))
                        })
                        .sum::<usize>();
                    2usize
                        .saturating_add(members.len().saturating_sub(1))
                        .saturating_add(children)
                }
            }
        }
        visit(value, self)
    }

    fn preflight_bytes_checked(&mut self, value: &Value) -> Result<usize, EngineError> {
        fn string_bytes(text: &Utf16) -> usize {
            let units = text.units();
            let mut bytes = 2usize;
            let mut i = 0;
            while i < units.len() {
                let unit = units[i];
                bytes = bytes.saturating_add(match unit {
                    0x22 | 0x5c => 2,
                    0x08 | 0x09 | 0x0a | 0x0c | 0x0d => 2,
                    0x00..=0x1f => 6,
                    0xd800..=0xdbff
                        if units
                            .get(i + 1)
                            .is_some_and(|next| (0xdc00..=0xdfff).contains(next)) =>
                    {
                        i += 1;
                        4
                    }
                    0xd800..=0xdfff => 6,
                    0x00..=0x7f => 1,
                    0x80..=0x7ff => 2,
                    _ => 3,
                });
                i += 1;
            }
            bytes
        }
        fn visit(value: &Value, ledger: &mut CompactWorkLedger) -> Result<usize, EngineError> {
            ledger.charge_checked("preflight-byte-traversal", 1)?;
            Ok(match value {
                Value::Null => 4,
                Value::Bool(true) => 4,
                Value::Bool(false) => 5,
                Value::Number(number) => crate::value::ecma_number_to_string(*number).len(),
                Value::String(text) => string_bytes(text),
                Value::Array(items) => {
                    let mut children = 0usize;
                    for item in items {
                        children = children.saturating_add(visit(item, ledger)?);
                    }
                    2usize
                        .saturating_add(items.len().saturating_sub(1))
                        .saturating_add(children)
                }
                Value::Object(members) => {
                    let mut children = 0usize;
                    for (key, child) in members {
                        children = children
                            .saturating_add(string_bytes(key))
                            .saturating_add(1)
                            .saturating_add(visit(child, ledger)?);
                    }
                    2usize
                        .saturating_add(members.len().saturating_sub(1))
                        .saturating_add(children)
                }
            })
        }
        visit(value, self)
    }

    fn aggregate_byte_traversal(&mut self, value: &Value) -> usize {
        fn visit(value: &Value, ledger: &mut CompactWorkLedger) -> usize {
            ledger.charge("aggregate-byte-traversal", 1);
            match value {
                Value::Array(items) => items.iter().map(|child| visit(child, ledger)).sum(),
                Value::Object(members) => {
                    members.iter().map(|(_, child)| visit(child, ledger)).sum()
                }
                _ => 1,
            }
        }
        visit(value, self)
    }

    fn aggregate_byte_traversal_checked(&mut self, value: &Value) -> Result<usize, EngineError> {
        fn visit(value: &Value, ledger: &mut CompactWorkLedger) -> Result<usize, EngineError> {
            ledger.charge_checked("aggregate-byte-traversal", 1)?;
            let mut total = 1usize;
            match value {
                Value::Array(items) => {
                    for child in items {
                        total = total.saturating_add(visit(child, ledger)?);
                    }
                }
                Value::Object(members) => {
                    for (_, child) in members {
                        total = total.saturating_add(visit(child, ledger)?);
                    }
                }
                _ => {}
            }
            Ok(total)
        }
        visit(value, self)
    }

    fn reserve_source_scans(&mut self, source: &Value, source_count: usize) {
        let modules = arr(get(source, "modules")).unwrap_or(&[]);
        let elements = modules
            .iter()
            .flat_map(|module| arr(get(module, "elements")).unwrap_or(&[]))
            .collect::<Vec<_>>();
        let key_field_occurrences = elements
            .iter()
            .map(|element| {
                arr(get(element, "keys"))
                    .unwrap_or(&[])
                    .iter()
                    .fold(0usize, |total, key| {
                        total.saturating_add(
                            arr(get(key, "fields")).map_or(0, |fields| fields.len()),
                        )
                    })
            })
            .sum::<usize>();
        let max_field_references = elements
            .iter()
            .map(|element| arr(get(element, "references")).map_or(0, |references| references.len()))
            .max()
            .unwrap_or(0);
        self.charge(
            "source-key-reference-scans",
            key_field_occurrences.saturating_mul(max_field_references),
        );

        let relationships = modules
            .iter()
            .flat_map(|module| arr(get(module, "relationships")).unwrap_or(&[]))
            .collect::<Vec<_>>();
        let endpoints = relationships.iter().fold(0usize, |total, relation| {
            let source_count = arr(get(relation, "source")).map_or(0, |values| values.len());
            let target_count = arr(get(relation, "target")).map_or(0, |values| values.len());
            let association = usize::from(
                get(relation, "associationRecord")
                    .is_some_and(|value| !matches!(value, Value::Null | Value::Bool(false))),
            );
            total
                .saturating_add(source_count)
                .saturating_add(target_count)
                .saturating_add(association)
        });
        let max_keys = elements
            .iter()
            .map(|element| arr(get(element, "keys")).map_or(0, |keys| keys.len()))
            .max()
            .unwrap_or(0);
        let collision_work = elements
            .len()
            .saturating_mul(elements.len())
            .saturating_add(2usize.saturating_mul(endpoints).saturating_mul(endpoints))
            .saturating_add(endpoints.saturating_mul(max_keys));
        self.charge("source-index-collision-bound", collision_work);

        for element in elements {
            let mut declarations = Vec::new();
            for key in ["examples", "allowedValues"] {
                declarations.extend(arr(get(element, key)).unwrap_or(&[]).iter());
            }
            if let Some(default_value) =
                get(element, "default").and_then(|default| get(default, "value"))
            {
                declarations.push(default_value);
            }
            for declaration in declarations {
                let visits = self.count(declaration);
                self.charge(
                    "source-declaration-validation",
                    source_count.saturating_mul(visits),
                );
            }
        }
    }

    fn reserve_source_scans_checked(
        &mut self,
        source: &Value,
        source_count: usize,
    ) -> Result<(), EngineError> {
        let modules = arr(get(source, "modules")).unwrap_or(&[]);
        let elements = modules
            .iter()
            .flat_map(|module| arr(get(module, "elements")).unwrap_or(&[]))
            .collect::<Vec<_>>();
        let key_field_occurrences = elements
            .iter()
            .map(|element| {
                arr(get(element, "keys"))
                    .unwrap_or(&[])
                    .iter()
                    .fold(0usize, |total, key| {
                        total.saturating_add(
                            arr(get(key, "fields")).map_or(0, |fields| fields.len()),
                        )
                    })
            })
            .sum::<usize>();
        let max_field_references = elements
            .iter()
            .map(|element| arr(get(element, "references")).map_or(0, |references| references.len()))
            .max()
            .unwrap_or(0);
        self.charge_checked(
            "source-key-reference-scans",
            key_field_occurrences.saturating_mul(max_field_references),
        )?;

        let relationships = modules
            .iter()
            .flat_map(|module| arr(get(module, "relationships")).unwrap_or(&[]))
            .collect::<Vec<_>>();
        let endpoints = relationships.iter().fold(0usize, |total, relation| {
            let source_count = arr(get(relation, "source")).map_or(0, |values| values.len());
            let target_count = arr(get(relation, "target")).map_or(0, |values| values.len());
            let association = usize::from(
                get(relation, "associationRecord")
                    .is_some_and(|value| !matches!(value, Value::Null | Value::Bool(false))),
            );
            total
                .saturating_add(source_count)
                .saturating_add(target_count)
                .saturating_add(association)
        });
        let max_keys = elements
            .iter()
            .map(|element| arr(get(element, "keys")).map_or(0, |keys| keys.len()))
            .max()
            .unwrap_or(0);
        let collision_work = elements
            .len()
            .saturating_mul(elements.len())
            .saturating_add(2usize.saturating_mul(endpoints).saturating_mul(endpoints))
            .saturating_add(endpoints.saturating_mul(max_keys));
        self.charge_checked("source-index-collision-bound", collision_work)?;

        for element in elements {
            let mut declarations = Vec::new();
            for key in ["examples", "allowedValues"] {
                declarations.extend(arr(get(element, key)).unwrap_or(&[]).iter());
            }
            if let Some(default_value) =
                get(element, "default").and_then(|default| get(default, "value"))
            {
                declarations.push(default_value);
            }
            for declaration in declarations {
                let visits = self.count_checked(declaration)?;
                self.charge_checked(
                    "source-declaration-validation",
                    source_count.saturating_mul(visits),
                )?;
            }
        }
        Ok(())
    }

    #[cfg(test)]
    fn reserve_schema(&mut self, schema: &Value, value: &Value) -> Result<(), EngineError> {
        self.reserve_schema_with_resources(schema, value, &[schema], "compact-schema")
    }

    fn reserve_schema_with_resources(
        &mut self,
        schema: &Value,
        value: &Value,
        resources: &[&Value],
        category: &str,
    ) -> Result<(), EngineError> {
        self.reserve_schema_rooted(schema, schema, value, resources, category)
    }

    fn reserve_schema_rooted(
        &mut self,
        root: &Value,
        schema: &Value,
        value: &Value,
        resources: &[&Value],
        category: &str,
    ) -> Result<(), EngineError> {
        fn charge_pair(
            ledger: &mut CompactWorkLedger,
            category: &str,
            part: &str,
            amount: usize,
        ) -> Result<(), EngineError> {
            ledger.charge_checked(format!("{category}-meter-{part}"), amount)?;
            ledger.charge_checked(format!("{category}-validator-{part}"), amount)
        }
        fn canonical(
            value: &Value,
            ledger: &mut CompactWorkLedger,
            category: &str,
        ) -> Result<(), EngineError> {
            charge_pair(ledger, category, "canonical", 1)?;
            match value {
                Value::Array(items) => {
                    for item in items {
                        canonical(item, ledger, category)?;
                    }
                }
                Value::Object(members) => {
                    let n = members.len();
                    let sort = n.saturating_mul((usize::BITS - n.leading_zeros()) as usize);
                    charge_pair(ledger, category, "key-sort", sort)?;
                    for (_, child) in members {
                        canonical(child, ledger, category)?;
                    }
                }
                _ => {}
            }
            Ok(())
        }
        fn resolve_pointer<'a>(root: &'a Value, pointer: &str) -> Option<&'a Value> {
            if pointer.is_empty() {
                return Some(root);
            }
            let mut current = root;
            for raw in pointer.strip_prefix('/')?.split('/') {
                let segment = raw.replace("~1", "/").replace("~0", "~");
                current = match current {
                    Value::Object(members) => members
                        .iter()
                        .find(|(key, _)| key == &Utf16::from(segment.as_str()))
                        .map(|(_, child)| child)?,
                    Value::Array(items) => items.get(segment.parse::<usize>().ok()?)?,
                    _ => return None,
                };
            }
            Some(current)
        }
        fn schema_id(schema: &Value) -> Option<String> {
            match schema {
                Value::Object(members) => members
                    .iter()
                    .find(|(key, _)| key == &Utf16::from("$id"))
                    .and_then(|(_, value)| match value {
                        Value::String(id) => id.to_utf8().ok(),
                        _ => None,
                    }),
                _ => None,
            }
        }
        fn pattern_matches(pattern: &Utf16, key: &Utf16) -> bool {
            crate::python_regex::PythonRegex::compile(
                pattern,
                crate::python_regex::PythonReVersion::V3_11,
            )
            .ok()
            .is_some_and(|regex| regex.find_from_utf16(key.units(), 0).is_some())
        }
        fn visit(
            schema: &Value,
            value: &Value,
            root: &Value,
            resources: &[&Value],
            ledger: &mut CompactWorkLedger,
            category: &str,
            depth: usize,
        ) -> Result<(), EngineError> {
            charge_pair(ledger, category, "branch", 1)?;
            fn prop<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
                match v {
                    Value::Object(m) => m
                        .iter()
                        .find(|(k, _)| k == &Utf16::from(name))
                        .map(|(_, v)| v),
                    _ => None,
                }
            }
            if let Some(reference) = prop(schema, "$ref").and_then(|v| match v {
                Value::String(s) => s.to_utf8().ok(),
                _ => None,
            }) {
                let (resource_uri, pointer) = reference
                    .split_once('#')
                    .unwrap_or((reference.as_str(), ""));
                {
                    let target_root = if resource_uri.is_empty() {
                        Some(root)
                    } else {
                        resources
                            .iter()
                            .copied()
                            .find(|candidate| schema_id(candidate).as_deref() == Some(resource_uri))
                    };
                    if let Some(target_root) = target_root {
                        if let Some(target) = resolve_pointer(target_root, pointer) {
                            visit(
                                target,
                                value,
                                target_root,
                                resources,
                                ledger,
                                category,
                                depth + 1,
                            )?;
                        }
                    }
                }
            }
            for keyword in ["allOf", "anyOf", "oneOf"] {
                if let Some(Value::Array(branches)) = prop(schema, keyword) {
                    for branch in branches {
                        visit(branch, value, root, resources, ledger, category, depth + 1)?;
                    }
                }
            }
            for keyword in ["if", "then", "else", "not"] {
                if let Some(branch) = prop(schema, keyword) {
                    visit(branch, value, root, resources, ledger, category, depth + 1)?;
                }
            }
            if let Some(constant) = prop(schema, "const") {
                canonical(constant, ledger, category)?;
                canonical(value, ledger, category)?;
            }
            if let Some(Value::Array(enums)) = prop(schema, "enum") {
                for candidate in enums {
                    canonical(candidate, ledger, category)?;
                    canonical(value, ledger, category)?;
                }
            }
            match value {
                Value::Object(members) => {
                    if let Some(branch) = prop(schema, "propertyNames") {
                        for (key, _) in members {
                            visit(
                                branch,
                                &Value::String(key.clone()),
                                root,
                                resources,
                                ledger,
                                category,
                                depth + 1,
                            )?;
                        }
                    }
                    if let Some(Value::Object(properties)) = prop(schema, "properties") {
                        for (key, branch) in properties {
                            if let Some((_, child)) = members.iter().find(|(seen, _)| seen == key) {
                                charge_pair(ledger, category, "property", 1)?;
                                visit(branch, child, root, resources, ledger, category, depth + 1)?;
                            }
                        }
                    }
                    if let Some(Value::Object(patterns)) = prop(schema, "patternProperties") {
                        for (key, child) in members {
                            for (pattern, branch) in patterns {
                                charge_pair(ledger, category, "pattern", 1)?;
                                if pattern_matches(pattern, key) {
                                    visit(
                                        branch,
                                        child,
                                        root,
                                        resources,
                                        ledger,
                                        category,
                                        depth + 1,
                                    )?;
                                }
                            }
                        }
                    }
                    let additional = prop(schema, "additionalProperties");
                    if prop(schema, "patternProperties").is_some()
                        || matches!(additional, Some(Value::Bool(false)))
                        || matches!(additional, Some(Value::Object(_)))
                    {
                        let properties = prop(schema, "properties");
                        for (key, child) in members {
                            charge_pair(ledger, category, "property", 1)?;
                            let property_match = matches!(properties, Some(Value::Object(props)) if props.iter().any(|(name, _)| name == key));
                            let pattern_match = matches!(prop(schema, "patternProperties"), Some(Value::Object(patterns)) if patterns.iter().any(|(pattern, _)| pattern_matches(pattern, key)));
                            let matched = property_match || pattern_match;
                            if !matched {
                                if let Some(Value::Object(_)) = additional {
                                    visit(
                                        additional.unwrap(),
                                        child,
                                        root,
                                        resources,
                                        ledger,
                                        category,
                                        depth + 1,
                                    )?;
                                }
                            }
                        }
                    }
                    Ok(())
                }
                Value::Array(items) => {
                    for (index, child) in items.iter().enumerate() {
                        let prefix = prop(schema, "prefixItems").and_then(|items| match items {
                            Value::Array(items) => items.get(index),
                            _ => None,
                        });
                        if let Some(branch) = prefix.or_else(|| prop(schema, "items")) {
                            visit(branch, child, root, resources, ledger, category, depth + 1)?;
                        }
                        if let Some(branch) = prop(schema, "contains") {
                            visit(branch, child, root, resources, ledger, category, depth + 1)?;
                        }
                    }
                    if matches!(prop(schema, "uniqueItems"), Some(Value::Bool(true))) {
                        for child in items {
                            canonical(child, ledger, category)?;
                        }
                    }
                    Ok(())
                }
                _ => Ok(()),
            }
        }
        visit(schema, value, root, resources, self, category, 0)
    }
}
fn compact_bytes(v: &Value) -> Result<usize, EngineError> {
    crate::serialization::stringify_compact(v)
        .map(|s| s.to_utf8().map(|t| t.len()).unwrap_or(usize::MAX))
}

#[cfg(test)]
mod compact_work_ledger_tests {
    use super::*;

    struct NoCapabilities;
    impl Capabilities for NoCapabilities {
        fn validate_extension(
            &mut self,
            _token: u64,
            _payload: &Value,
            _context: &crate::engine::SemanticContext,
        ) -> Result<Vec<Diagnostic>, Utf16> {
            Ok(Vec::new())
        }
    }

    fn read_fixture(text: &str) -> Value {
        crate::serialization::read_json_value(
            &text.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap()
    }

    fn fixture_engine() -> Engine {
        Engine::new(
            crate::engine::ResourceSet::new(
                read_fixture(include_str!("../../../spec/core/schema.json")),
                read_fixture(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
                read_fixture(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
                read_fixture(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
                read_fixture(include_str!(
                    "../../../spec/metamodel/generated/domain-policy.json"
                )),
            ),
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn number(value: &Value) -> usize {
        match value {
            Value::Number(number) => *number as usize,
            _ => panic!("expected numeric work value"),
        }
    }

    fn string(value: &Value) -> String {
        match value {
            Value::String(value) => value.to_utf8().unwrap(),
            _ => panic!("expected string work/error value"),
        }
    }

    fn work_categories(value: &Value) -> BTreeMap<String, usize> {
        fields(value)
            .expect("work categories object")
            .iter()
            .map(|(key, amount)| (key.to_utf8().unwrap(), number(amount)))
            .collect()
    }

    fn current_work_oracle_case(name: &str) -> Value {
        let oracle = read_fixture(include_str!("../../../tests/rust-core/fixtures/r5-dataset-values-compact-default-cutover/current-work-oracle.json"));
        get(get(&oracle, "cases").unwrap(), name)
            .expect("work ledger case")
            .clone()
    }

    fn set_field(value: &mut Value, name: &str, replacement: Value) {
        let Value::Object(members) = value else {
            panic!("expected object while setting {name}");
        };
        let (_, value) = members
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .unwrap_or_else(|| panic!("missing object member {name}"));
        *value = replacement;
    }

    #[test]
    fn checked_valuework_refuses_at_first_unit_over_limit() {
        let mut ledger = CompactWorkLedger::default();
        ledger
            .charge_checked("predecessor-work", 1_000_000)
            .unwrap();
        assert_eq!(ledger.used, 1_000_000);
        let error = ledger
            .charge_checked("first-excess", 1)
            .expect_err("the first unit over the shared limit must refuse immediately");
        assert_eq!(error.code, "LIMIT");
        assert_eq!(ledger.used, 1_000_000);
        assert_eq!(ledger.categories.get("predecessor-work"), Some(&1_000_000));
        assert!(!ledger.categories.contains_key("first-excess"));
    }

    #[test]
    fn fallible_constraint_observer_refuses_at_the_crossing_charge() {
        let frozen = read_fixture(include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-commerce.json"
        ));
        let source = get(&frozen, "source").unwrap();
        let source_nodes = tree_values(source);
        let mut ledger = CompactWorkLedger::default();
        ledger
            .charge_checked("preceding-verification-work", 1_000_000 - source_nodes)
            .unwrap();
        let mut observed = Vec::new();
        let mut observer = |category, amount| {
            observed.push(category);
            ledger.charge_checked(category, amount)
        };
        let error = fixture_engine()
            .validate_document_observed_fallible(
                source,
                &Registry::default(),
                &mut NoCapabilities,
                &mut Context::ordinary(),
                Some(&mut observer),
            )
            .expect_err("constraint-copy crosses the limit after document-copy reaches it");
        drop(observer);
        assert_eq!(error.code, "LIMIT");
        assert_eq!(ledger.used, 1_000_000);
        assert_eq!(observed, ["document-copy", "constraint-copy"]);
        assert!(!ledger.categories.contains_key("constraint-copy"));
    }

    #[test]
    fn frozen_verify_near_limit_pair_matches_shared_valuework_ledger() {
        for (filename, accepted) in [
            (
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact-verify/frozen-near-limit-accepted.json",
                true,
            ),
            (
                "../../../tests/rust-core/fixtures/r5-dataset-values-compact-verify/frozen-near-limit-first-refused.json",
                false,
            ),
        ] {
            let frozen_text = match filename {
                path if path.ends_with("accepted.json") => include_str!(
                    "../../../tests/rust-core/fixtures/r5-dataset-values-compact-verify/frozen-near-limit-accepted.json"
                ),
                _ => include_str!(
                    "../../../tests/rust-core/fixtures/r5-dataset-values-compact-verify/frozen-near-limit-first-refused.json"
                ),
            };
            let frozen = read_fixture(frozen_text);
            let receipt = get(&frozen, "receipt").expect("frozen receipt");
            let current = get(&frozen, "current").expect("frozen current");
            let expected_input = get(&frozen, "expectedInput").expect("frozen expectedInput");
            let oracle = current_work_oracle_case(
                if accepted { "near-limit-accepted" } else { "near-limit-first-refused" },
            );
            let expected_work = get(&oracle, "work").expect("expected work ledger");
            let expected_categories =
                work_categories(get(expected_work, "categories").expect("frozen categories"));
            let mut context = Context::ordinary();
            let engine = fixture_engine();
            let validator = CoreDatasetValueCompactValidator::new(&engine, &mut context).unwrap();
            let mut ledger = CompactWorkLedger::default();
            let outcome = validator.verify_with_ledger(
                receipt,
                current,
                expected_input,
                &engine,
                &Registry::default(),
                &mut NoCapabilities,
                &mut context,
                &mut ledger,
            );
            let category_diffs = expected_categories
                .iter()
                .chain(ledger.categories.iter())
                .map(|(category, _expected)| {
                    let rust = ledger.categories.get(category).copied().unwrap_or(0);
                    let expected = expected_categories.get(category).copied().unwrap_or(0);
                    (category.clone(), rust, expected)
                })
                .filter(|(_, rust, expected)| rust != expected)
                .collect::<BTreeSet<_>>();
            assert!(
                category_diffs.is_empty(),
                "{filename} category diffs {category_diffs:?}; totals observed={} expected={}",
                ledger.used,
                number(get(expected_work, "used").unwrap())
            );
            assert_eq!(
                ledger.used,
                number(get(expected_work, "used").unwrap()),
                "{filename} total"
            );
            if accepted {
                assert_eq!(outcome.unwrap(), *get(&frozen, "result").unwrap());
            } else {
                let error =
                    outcome.expect_err("near-limit refusal vector must be refused");
                let thrown = get(&frozen, "thrown").unwrap();
                assert_eq!(error.code, string(get(thrown, "code").unwrap()));
                assert_eq!(
                    error.message.to_utf8().unwrap(),
                    string(get(thrown, "message").unwrap())
                );
            }
        }
    }

    #[test]
    fn verify_carries_one_fail_fast_valuework_budget_through_recompute_and_receipt_compare() {
        let frozen = read_fixture(include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact-verify/frozen-near-limit-accepted.json"
        ));
        let mut receipt = get(&frozen, "receipt").unwrap().clone();
        let current = get(&frozen, "current").unwrap().clone();
        let mut expected_input = get(&frozen, "expectedInput").unwrap().clone();

        // One additional valid record lets standalone validation complete at
        // 787,808 ValueWork units, while verification's receipt,
        // copy and comparison overhead crosses the shared 1,000,000 limit.
        // The deliberately stale result flag supplies a second simultaneous
        // fault: without a cumulative verify ledger the final refusal would be
        // CORE_DATASET_COMPACT_RECEIPT instead of the predecessor's LIMIT.
        let instance_id = Utf16::from("compact-near-new");
        let mut input_records = arr(Some(get(&expected_input, "records").unwrap()))
            .unwrap()
            .to_vec();
        let mut input_record = input_records.last().unwrap().clone();
        set_field(
            &mut input_record,
            "instanceId",
            Value::String(instance_id.clone()),
        );
        input_records.push(input_record);
        set_field(
            &mut expected_input,
            "records",
            Value::Array(input_records.clone()),
        );

        let mut receipt_input = get(&receipt, "input").unwrap().clone();
        set_field(&mut receipt_input, "records", Value::Array(input_records));
        set_field(&mut receipt, "input", receipt_input);

        let mut receipt_records = arr(Some(get(&receipt, "records").unwrap()))
            .unwrap()
            .to_vec();
        let mut receipt_record = receipt_records.last().unwrap().clone();
        set_field(
            &mut receipt_record,
            "instanceId",
            Value::String(instance_id),
        );
        receipt_records.push(receipt_record);
        set_field(&mut receipt, "records", Value::Array(receipt_records));

        let mut dataset_validation = get(&receipt, "datasetValidation").unwrap().clone();
        set_field(&mut dataset_validation, "valid", Value::Bool(true));
        set_field(&mut receipt, "datasetValidation", dataset_validation);

        let engine = fixture_engine();
        let mut context = Context::ordinary();
        let validator = CoreDatasetValueCompactValidator::new(&engine, &mut context).unwrap();
        let standalone = validator
            .validate(
                &current,
                &expected_input,
                &engine,
                &Registry::default(),
                &mut NoCapabilities,
                &mut context,
            )
            .expect("the same current/input validation is below ValueWork alone");
        assert_eq!(
            get(&standalone, "operation"),
            Some(&s("validate-core-dataset-values-compact"))
        );

        let error = validator
            .verify(
                &receipt,
                &current,
                &expected_input,
                &engine,
                &Registry::default(),
                &mut NoCapabilities,
                &mut context,
            )
            .expect_err("verification adds receipt and comparison work to the same budget");
        assert_eq!(error.code, "LIMIT");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "Compact dataset JSON traversal/copy/semantic budget exceeded"
        );
        assert_eq!(error.path.to_utf8().unwrap(), "");
    }

    #[test]
    fn constraint_observer_is_category_accurate_and_does_not_change_context_charges() {
        let frozen = read_fixture(include_str!(
            "../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-commerce.json"
        ));
        let source = get(&frozen, "source").unwrap();
        let oracle = current_work_oracle_case("commerce");
        let expected = get(get(&oracle, "contextWork").unwrap(), "categories").unwrap();
        let engine = fixture_engine();
        let mut ordinary_context = Context::ordinary();
        let ordinary = engine
            .validate_document(
                source,
                &Registry::default(),
                &mut NoCapabilities,
                &mut ordinary_context,
            )
            .unwrap();
        let mut repeat_context = Context::ordinary();
        let repeat = fixture_engine()
            .validate_document(
                source,
                &Registry::default(),
                &mut NoCapabilities,
                &mut repeat_context,
            )
            .unwrap();
        assert_eq!(validation_value(&ordinary), validation_value(&repeat));
        assert_eq!(
            ordinary_context.charged_work(),
            repeat_context.charged_work(),
            "unobserved repeat differs"
        );
        let mut observed_context = Context::ordinary();
        let mut categories = BTreeMap::<String, usize>::new();
        let mut observer = |category: &'static str, amount: usize| {
            *categories.entry(category.to_owned()).or_default() += amount;
        };
        let observed = fixture_engine()
            .validate_document_observed(
                source,
                &Registry::default(),
                &mut NoCapabilities,
                &mut observed_context,
                Some(&mut observer),
            )
            .unwrap();
        assert_eq!(validation_value(&ordinary), validation_value(&observed));
        assert_eq!(
            ordinary_context.charged_work(),
            observed_context.charged_work(),
            "observer category snapshot: {categories:#?}"
        );
        for category in [
            "document-copy",
            "constraint-copy",
            "constraint-instruction",
            "constraint-enumeration",
            "constraint-value-visit",
            "constraint-sort",
        ] {
            let rust = categories.get(category).copied().unwrap_or(0);
            let observed = get(expected, category)
                .and_then(|value| match value {
                    Value::Number(number) => Some(*number as usize),
                    _ => None,
                })
                .unwrap_or(0);
            assert_eq!(rust, observed, "observer category {category}");
        }
    }

    #[test]
    fn first_stage_ledger_counts_values_and_local_schema_reservations_observationally() {
        let value = obj(vec![
            ("name", s("sample")),
            ("items", Value::Array(vec![Value::Null])),
        ]);
        let schema = obj(vec![
            ("type", s("object")),
            (
                "properties",
                obj(vec![("name", obj(vec![("type", s("string"))]))]),
            ),
        ]);
        let mut ledger = CompactWorkLedger::default();
        assert_eq!(ledger.walk("record-values", &value, 2), 4);
        ledger.reserve_schema(&schema, &value).unwrap();
        assert_eq!(ledger.categories.get("count"), Some(&4));
        assert_eq!(ledger.categories.get("record-values"), Some(&8));
        assert!(
            ledger
                .categories
                .get("compact-schema-meter-branch")
                .copied()
                .unwrap_or(0)
                > 0
        );
        assert!(
            ledger
                .categories
                .get("compact-schema-validator-property")
                .copied()
                .unwrap_or(0)
                > 0
        );
        // This partial ledger intentionally has no threshold/admission effect.
        assert!(ledger.used < 1_000_000);
    }

    #[test]
    fn schema_work_reservation_refuses_incrementally_at_the_shared_ceiling() {
        let branches = Value::Array((0..50).map(|_| obj(vec![("type", s("object"))])).collect());
        let schema = obj(vec![
            ("type", s("array")),
            ("items", obj(vec![("allOf", branches)])),
        ]);
        let value = Value::Array((0..20_000).map(|_| obj(vec![("x", Value::Null)])).collect());
        let mut ledger = CompactWorkLedger::default();
        let error = ledger
            .reserve_schema_with_resources(&schema, &value, &[&schema], "compact-schema")
            .expect_err("schema traversal must stop at the shared work ceiling");
        assert_eq!(error.code, "LIMIT");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "Compact dataset JSON traversal/copy/semantic budget exceeded"
        );
        assert_eq!(ledger.used, 1_000_000);
    }

    #[test]
    fn compact_depth_preflight_accepts_limit_and_refuses_next_level_with_path() {
        let mut at_limit = Value::Null;
        for _ in 0..Context::ordinary().limits().max_depth {
            at_limit = Value::Array(vec![at_limit]);
        }
        let limits = Context::ordinary().limits();
        assert!(
            preflight_compact_depth(
                &at_limit,
                limits.max_depth,
                limits.max_values,
                &mut Context::ordinary(),
            )
            .is_ok()
        );

        let mut over_limit = at_limit;
        over_limit = Value::Array(vec![over_limit]);
        let error = preflight_compact_depth(
            &over_limit,
            limits.max_depth,
            limits.max_values,
            &mut Context::ordinary(),
        )
        .expect_err("the first level beyond Context max_depth must refuse");
        assert_eq!(error.code, "LIMIT");
        assert_eq!(
            error.message.to_utf8().unwrap(),
            "JSON structural limit exceeded"
        );
        assert_eq!(error.path.to_utf8().unwrap(), "/0".repeat(129));
    }

    #[test]
    fn compact_depth_preflight_polls_host_controls_without_charging_work() {
        let wide = Value::Array(vec![Value::Null; 4096]);
        let limits = Context::ordinary().limits();
        let mut cancellation_checks = 0usize;
        let mut cancellation = || {
            cancellation_checks += 1;
            cancellation_checks >= 2
        };
        let mut context = Context::ordinary().with_cancellation(&mut cancellation);
        let error =
            preflight_compact_depth(&wide, limits.max_depth, limits.max_values, &mut context)
                .expect_err("periodic cancellation must interrupt a wide preflight");
        assert_eq!(error.code, "CANCELLED");
        assert_eq!(context.charged_work(), 0);
        drop(context);
        assert_eq!(cancellation_checks, 2);

        let mut clock_checks = 0usize;
        let mut clock = || {
            clock_checks += 1;
            Some(u64::from(clock_checks >= 2))
        };
        let mut context = Context::ordinary().with_clock(&mut clock, 0);
        let error =
            preflight_compact_depth(&wide, limits.max_depth, limits.max_values, &mut context)
                .expect_err("periodic deadline checks must interrupt a wide preflight");
        assert_eq!(error.code, "DEADLINE");
        assert_eq!(context.charged_work(), 0);
        drop(context);
        assert_eq!(clock_checks, 2);
    }

    #[test]
    fn compact_depth_preflight_handles_large_borrowed_object_keys() {
        let key = Utf16::new(vec![u16::from(b'x'); 1_000_000]);
        let value = Value::Object(vec![(key, Value::Null)]);
        let limits = Context::ordinary().limits();
        assert!(
            preflight_compact_depth(
                &value,
                limits.max_depth,
                limits.max_values,
                &mut Context::ordinary(),
            )
            .is_ok()
        );
    }

    #[test]
    fn frozen_context_copy_count_and_byte_traversal_categories_match_work_ledger() {
        let frozen = crate::serialization::read_json_value(
            &include_str!("../../../tests/rust-core/fixtures/r5-dataset-values-compact/frozen-commerce.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap();
        let source = get(&frozen, "source").unwrap();
        let input = get(&frozen, "input").unwrap();
        let oracle = current_work_oracle_case("commerce");
        let expected_context =
            get(&oracle, "contextWork").expect("expected context-stage ledger");
        let categories = get(expected_context, "categories").unwrap();
        let mut ledger = CompactWorkLedger::default();

        ledger.copy_tree(source);
        ledger.copy_tree(input);
        ledger.count(source);
        ledger.walk("context-freeze", source, 1);
        ledger.walk("context-freeze", input, 1);
        ledger.walk(
            "validation-freeze",
            &obj(vec![
                ("valid", Value::Bool(true)),
                ("complete", Value::Bool(true)),
                ("diagnostics", Value::Array(Vec::new())),
            ]),
            1,
        );
        ledger.walk("context-key-index", source, 1);
        let bytes = ledger
            .preflight_bytes(source)
            .saturating_add(ledger.preflight_bytes(input));
        assert!(bytes > 0);
        for category in ["copy", "count", "preflight-byte-traversal"] {
            let rust = ledger.categories.get(category).copied().unwrap_or(0);
            let expected = get(categories, category)
                .and_then(|value| match value {
                    Value::Number(number) => Some(*number as usize),
                    _ => None,
                })
                .expect("expected work category");
            assert_eq!(rust, expected, "ValueWork category {category}");
        }

        let schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap();
        let reference = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/semantic-type-reference.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap();
        let mut schema_ledger = CompactWorkLedger::default();
        schema_ledger
            .reserve_schema_with_resources(&schema, source, &[&schema, &reference], "source-schema")
            .unwrap();
        for stage in ["branch", "property", "canonical", "key-sort"] {
            for meter in ["meter", "validator"] {
                let rust_name = format!("source-schema-{meter}-{stage}");
                let expected_name = format!("source-schema-{meter}-{stage}");
                let rust = schema_ledger
                    .categories
                    .get(rust_name.as_str())
                    .copied()
                    .unwrap_or(0);
                let expected = get(categories, expected_name.as_str())
                    .and_then(|value| match value {
                        Value::Number(number) => Some(*number as usize),
                        _ => None,
                    })
                    .expect("expected source-schema category");
                assert_eq!(
                    rust, expected,
                    "source schema reservation category {stage}/{meter}"
                );
            }
        }

        schema_ledger.reserve_source_scans(source, tree_values(source));
        for category in [
            "source-key-reference-scans",
            "source-index-collision-bound",
            "source-declaration-validation",
        ] {
            let rust = schema_ledger.categories.get(category).copied().unwrap_or(0);
            let expected = get(categories, category)
                .and_then(|value| match value {
                    Value::Number(number) => Some(*number as usize),
                    _ => None,
                })
                .unwrap_or(0);
            assert_eq!(rust, expected, "source scan category {category}");
        }

        for (category, amount) in schema_ledger.categories {
            ledger.charge(category, amount);
        }
        let engine = fixture_engine();
        let mut observed_context = Context::ordinary();
        let mut observer = |category: &'static str, amount: usize| {
            ledger.charge(category, amount);
        };
        engine
            .validate_document_observed(
                source,
                &Registry::default(),
                &mut NoCapabilities,
                &mut observed_context,
                Some(&mut observer),
            )
            .unwrap();
        for (category, expected_value) in fields(categories).unwrap() {
            let Value::Number(number) = expected_value else {
                panic!("expected numeric context category")
            };
            assert_eq!(
                ledger
                    .categories
                    .get(&category.to_utf8().unwrap())
                    .copied()
                    .unwrap_or(0),
                *number as usize,
                "complete frozen context category {category:?}"
            );
        }
        let expected_used = match get(expected_context, "used") {
            Some(Value::Number(number)) => *number as usize,
            _ => panic!("expected context work total"),
        };
        assert_eq!(
            ledger.used, expected_used,
            "complete frozen context work total"
        );

        let operation_schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/dataset-value-operation.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap();
        let key_schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/key-tuple-operation-v4.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap();
        let compact_schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/dataset-value-compact-operation.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap();
        let mut input_schema_ledger = CompactWorkLedger::default();
        input_schema_ledger
            .reserve_schema_rooted(
                &operation_schema,
                get(get(&operation_schema, "$defs").unwrap(), "input").unwrap(),
                input,
                &[
                    &schema,
                    &reference,
                    &key_schema,
                    &operation_schema,
                    &compact_schema,
                ],
                "input-schema",
            )
            .unwrap();
        let frozen_input_categories = get(
            get(&frozen, "work").expect("frozen complete work ledger"),
            "categories",
        )
        .unwrap();
        for (category, expected_value) in fields(frozen_input_categories).unwrap() {
            if !category
                .units()
                .starts_with(&"input-schema-".encode_utf16().collect::<Vec<_>>())
            {
                continue;
            }
            let Value::Number(number) = expected_value else {
                panic!("expected numeric input schema category")
            };
            assert_eq!(
                input_schema_ledger
                    .categories
                    .get(&category.to_utf8().unwrap())
                    .copied()
                    .unwrap_or(0),
                *number as usize,
                "input schema category {category:?}"
            );
        }
    }
}
fn copy_receipt(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    match copy_json(v, ctx) {
        Ok(value) => Ok(value),
        Err(mut error)
            if error.code == "LIMIT"
                && (error.message == Utf16::from("JSON structural value limit exceeded")
                    || error.message == Utf16::from("JSON nesting depth exceeded")) =>
        {
            error.message = Utf16::from("JSON structural limit exceeded");
            Err(error)
        }
        Err(error) => Err(error),
    }
}
fn compact_child_path(path: &Utf16, segment: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(u16::from(b'/'));
    for unit in segment.units() {
        if *unit == u16::from(b'~') {
            units.extend([u16::from(b'~'), u16::from(b'0')]);
        } else if *unit == u16::from(b'/') {
            units.extend([u16::from(b'~'), u16::from(b'1')]);
        } else {
            units.push(*unit);
        }
    }
    Utf16::new(units)
}

/// Inspect caller-owned JSON depth without recursing before ledger walks. The
/// frame stack grows with nesting depth, not collection width; max_depth is
/// supplied by the same Context used by the subsequent compact copy.
fn preflight_compact_depth(
    value: &Value,
    max_depth: usize,
    max_values: usize,
    context: &mut Context<'_>,
) -> Result<(), EngineError> {
    enum Children<'a> {
        Array(std::iter::Enumerate<std::slice::Iter<'a, Value>>),
        Object(std::slice::Iter<'a, (Utf16, Value)>),
    }
    enum Segment<'a> {
        Root,
        Index(usize),
        Key(&'a Utf16),
    }
    impl Segment<'_> {
        fn to_utf16(&self) -> Utf16 {
            match self {
                Self::Root => Utf16::default(),
                Self::Index(index) => Utf16::from_utf8(&index.to_string()),
                Self::Key(key) => (*key).clone(),
            }
        }
    }
    struct Frame<'a> {
        children: Children<'a>,
        segment: Segment<'a>,
        depth: usize,
    }
    impl<'a> Frame<'a> {
        fn new(value: &'a Value, segment: Segment<'a>, depth: usize) -> Option<Self> {
            let children = match value {
                Value::Array(items) => Children::Array(items.iter().enumerate()),
                Value::Object(members) => Children::Object(members.iter()),
                _ => return None,
            };
            Some(Self {
                children,
                segment,
                depth,
            })
        }

        fn next(&mut self) -> Option<(&'a Value, Segment<'a>)> {
            match &mut self.children {
                Children::Array(items) => {
                    let (index, value) = items.next()?;
                    Some((value, Segment::Index(index)))
                }
                Children::Object(items) => {
                    let (key, value) = items.next()?;
                    Some((value, Segment::Key(key)))
                }
            }
        }
    }

    fn path_for(frames: &[Frame<'_>], segment: &Segment<'_>) -> Utf16 {
        let path = frames.iter().skip(1).fold(Utf16::default(), |path, frame| {
            compact_child_path(&path, &frame.segment.to_utf16())
        });
        compact_child_path(&path, &segment.to_utf16())
    }

    let mut values = 1usize;
    context.check_cancelled(Utf16::default())?;
    context.check_deadline(Utf16::default())?;
    if values > max_values {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "JSON structural limit exceeded",
        ));
    }
    let mut frames = Vec::new();
    if let Some(root) = Frame::new(value, Segment::Root, 0) {
        frames.push(root);
    }
    loop {
        let next = match frames.last_mut() {
            Some(frame) => frame
                .next()
                .map(|(child, segment)| (child, segment, frame.depth)),
            None => break,
        };
        let Some((child, segment, parent_depth)) = next else {
            frames.pop();
            continue;
        };
        values = values.saturating_add(1);
        if values.is_multiple_of(1024) {
            // The control poll is deliberately pathless so a valid tree with
            // a very large member name does not copy that name merely to poll.
            context.check_cancelled(Utf16::default())?;
            context.check_deadline(Utf16::default())?;
        }
        if values > max_values {
            return Err(EngineError::new(
                "LIMIT",
                path_for(&frames, &segment),
                "JSON structural limit exceeded",
            ));
        }
        let depth = parent_depth.saturating_add(1);
        if depth > max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path_for(&frames, &segment),
                "JSON structural limit exceeded",
            ));
        }
        if let Some(child_frame) = Frame::new(child, segment, depth) {
            frames.push(child_frame);
        }
    }
    Ok(())
}

fn copy_compact_root(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    fn visit(
        value: &Value,
        path: &Utf16,
        depth: usize,
        count: &mut usize,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        *count = count.checked_add(1).ok_or_else(|| {
            err(
                "LIMIT",
                "JSON value count overflow",
                &path.to_utf8().unwrap_or_default(),
            )
        })?;
        ctx.check_tree_value_count(*count, path.clone())
            .map_err(|mut error| {
                if error.message == Utf16::from("JSON structural value limit exceeded") {
                    error.message = Utf16::from("JSON structural limit exceeded");
                }
                error
            })?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "JSON structural limit exceeded",
            ));
        }
        ctx.charge_work(1, path.clone())?;
        match value {
            Value::Null => Ok(Value::Null),
            Value::Bool(v) => Ok(Value::Bool(*v)),
            Value::Number(v) => Value::number(*v, path.clone()),
            Value::String(v) => {
                ctx.charge_work(v.len(), path.clone())?;
                Ok(Value::String(v.clone()))
            }
            Value::Array(items) => {
                let mut output = Vec::new();
                for (index, item) in items.iter().enumerate() {
                    let child = compact_child_path(path, &Utf16::from(index.to_string()));
                    output.push(visit(item, &child, depth + 1, count, ctx)?);
                }
                Ok(Value::Array(output))
            }
            Value::Object(members) => {
                let mut seen = BTreeSet::new();
                let mut output = Vec::new();
                for (key, item) in members {
                    ctx.charge_work(key.len(), path.clone())?;
                    if !seen.insert(key.units().to_vec()) {
                        return Err(EngineError::new(
                            "DUPLICATE_KEY",
                            path.clone(),
                            "Duplicate object key",
                        ));
                    }
                    let child = compact_child_path(path, key);
                    output.push((key.clone(), visit(item, &child, depth + 1, count, ctx)?));
                }
                Ok(Value::Object(output))
            }
        }
    }
    let mut count = 0;
    visit(value, &Utf16::default(), 0, &mut count, ctx)
}
fn preflight(
    source: &Value,
    input: &Value,
    records: &[Value],
    links: &[Value],
    compact: bool,
) -> Result<(), EngineError> {
    const MAX_VALUES: usize = 100_000;
    const MAX_BYTES: usize = 4_000_000;
    const MAX_WORK: usize = 1_000_000;
    let sv = tree_values(source);
    let iv = tree_values(input);
    if compact {
        // Compact receipts retain the complete source/input once, then retain
        // only selected Record/Key bodies. Bound work from those exact source
        // subtrees rather than multiplying the whole source by every row.
        let modules = arr(get(source, "modules")).unwrap_or(&[]);
        let mut work = sv.saturating_add(iv).saturating_mul(16);
        let mut retained = sv.saturating_add(iv).saturating_mul(2);
        for record in records {
            let values = get(record, "values").unwrap_or(&Value::Null);
            let value_count = tree_values(values);
            work = work.saturating_add(value_count.saturating_mul(8));
            retained = retained.saturating_add(value_count.saturating_mul(3));
            let identity = get(record, "identity").unwrap_or(&Value::Null);
            let id = field_ident(identity);
            for module in modules {
                if text(get(module, "id")) != id.as_ref().map(|v| &v.0) {
                    continue;
                }
                for element in arr(get(module, "elements")).unwrap_or(&[]) {
                    if text(get(element, "id")) != id.as_ref().map(|v| &v.1) {
                        continue;
                    }
                    let owner_count = tree_values(element);
                    work = work.saturating_add(owner_count.saturating_mul(4));
                    for member in arr(get(element, "members")).unwrap_or(&[]) {
                        let Some((member_module, member_element)) = field_ident(member) else {
                            continue;
                        };
                        for source_module in modules {
                            if text(get(source_module, "id")) != Some(&member_module) {
                                continue;
                            }
                            for field in arr(get(source_module, "elements")).unwrap_or(&[]) {
                                if text(get(field, "id")) == Some(&member_element) {
                                    work =
                                        work.saturating_add(tree_values(field).saturating_mul(4));
                                }
                            }
                        }
                    }
                    for key in arr(get(element, "keys")).unwrap_or(&[]) {
                        let count = tree_values(key);
                        work = work.saturating_add(count.saturating_mul(4));
                        retained = retained.saturating_add(count.saturating_mul(2));
                    }
                }
            }
        }
        for link in links {
            let count = tree_values(link);
            work = work.saturating_add(count.saturating_mul(8));
            retained = retained.saturating_add(count.saturating_mul(3));
        }
        let declaration_count = modules
            .iter()
            .map(|m| arr(get(m, "relationships")).map_or(0, |a| a.len()))
            .sum::<usize>();
        let multiplicity_scans = declaration_count
            .saturating_mul(records.len())
            .saturating_mul(2);
        work = work.saturating_add(multiplicity_scans);
        let bytes = compact_bytes(source)?
            .saturating_add(compact_bytes(input)?)
            .saturating_mul(3);
        if work > MAX_WORK || retained > MAX_VALUES || bytes > MAX_BYTES {
            return Err(err(
                "LIMIT",
                "Compact dataset JSON traversal/copy/semantic budget exceeded",
                "",
            ));
        }
        return Ok(());
    }
    let mut max_keys = 0usize;
    let mut max_members = 0usize;
    let mut declarations = 0usize;
    for module in arr(get(source, "modules")).unwrap_or(&[]) {
        for element in arr(get(module, "elements")).unwrap_or(&[]) {
            max_keys = max_keys.max(arr(get(element, "keys")).map_or(0, |x| x.len()));
            max_members = max_members.max(arr(get(element, "members")).map_or(0, |x| x.len()));
        }
        declarations += arr(get(module, "relationships")).map_or(0, |x| x.len());
    }
    let copies = 3usize
        .saturating_add(
            records
                .len()
                .saturating_mul(1usize.saturating_add(max_keys)),
        )
        .saturating_add(links.len())
        .saturating_add(2usize.saturating_mul(declarations));
    let work = sv.saturating_mul(
        records
            .len()
            .saturating_mul(1usize.saturating_add(max_members).saturating_add(max_keys))
            .saturating_add(links.len().saturating_mul(2)),
    );
    if sv
        .saturating_mul(copies)
        .saturating_add(iv.saturating_mul(8))
        > MAX_VALUES
        || compact_bytes(source)?
            .saturating_mul(copies)
            .saturating_add(compact_bytes(input)?.saturating_mul(8))
            > MAX_BYTES
        || work > MAX_WORK
    {
        return Err(err(
            "LIMIT",
            "Dataset work/retained receipt budget exceeded",
            "",
        ));
    }
    Ok(())
}
fn schemas(
    e: &Engine,
    x: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let read = |source: &str, ctx: &mut Context<'_>| {
        crate::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            ctx,
        )
    };
    let operation = read(
        include_str!("../../../spec/core/dataset-value-operation.schema.json"),
        x,
    )?;
    let key = read(
        include_str!("../../../spec/core/key-tuple-operation-v4.schema.json"),
        x,
    )?;
    let mut resources = e.schema_resources_with_context(x)?;
    for resource in [&operation, &key] {
        if let Some(id) = text(get(resource, "$id")) {
            if !resources.entries.iter().any(|(seen, _)| seen == id) {
                resources.entries.push((id.clone(), resource.clone()));
            }
        }
    }
    let receipt = CompiledSchema::compile(&operation, &resources, x)?;
    let wrapper = obj(vec![
        (
            "$schema",
            get(&operation, "$schema").cloned().unwrap_or(Value::Null),
        ),
        ("$id", s("urn:umf:core:dataset-value-operation:1.0.0:input")),
        (
            "$ref",
            s("urn:umf:core:dataset-value-operation:1.0.0#/$defs/input"),
        ),
    ]);
    let input = CompiledSchema::compile(&wrapper, &resources, x)?;
    Ok((input, receipt))
}

fn compact_schemas(
    e: &Engine,
    x: &mut Context<'_>,
) -> Result<(CompiledSchema, CompiledSchema), EngineError> {
    let read = |source: &str, ctx: &mut Context<'_>| {
        crate::serialization::read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            ctx,
        )
    };
    let operation = read(
        include_str!("../../../spec/core/dataset-value-compact-operation.schema.json"),
        x,
    )?;
    let key = read(
        include_str!("../../../spec/core/key-tuple-operation-v4.schema.json"),
        x,
    )?;
    let mut resources = e.schema_resources_with_context(x)?;
    for resource in [&operation, &key] {
        if let Some(id) = text(get(resource, "$id")) {
            if !resources.entries.iter().any(|(seen, _)| seen == id) {
                resources.entries.push((id.clone(), resource.clone()));
            }
        }
    }
    let receipt = CompiledSchema::compile(&operation, &resources, x)?;
    let wrapper = obj(vec![
        (
            "$schema",
            get(&operation, "$schema").cloned().unwrap_or(Value::Null),
        ),
        (
            "$id",
            s("urn:umf:core:dataset-value-compact-operation:1.0.0:input"),
        ),
        (
            "$ref",
            s("urn:umf:core:dataset-value-compact-operation:1.0.0#/$defs/input"),
        ),
    ]);
    let input = CompiledSchema::compile(&wrapper, &resources, x)?;
    Ok((input, receipt))
}

/// Reusable compiled admission/result schemas for repeated dataset calls.
pub struct CoreDatasetValueValidator {
    input_schema: CompiledSchema,
    receipt_schema: CompiledSchema,
}
impl CoreDatasetValueValidator {
    pub fn new(e: &Engine, x: &mut Context<'_>) -> Result<Self, EngineError> {
        let (input_schema, receipt_schema) = schemas(e, x)?;
        Ok(Self {
            input_schema,
            receipt_schema,
        })
    }
    pub fn validate(
        &self,
        source: &Value,
        input: &Value,
        e: &Engine,
        r: &Registry,
        c: &mut dyn Capabilities,
        x: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        validate_with_schemas(
            source,
            input,
            e,
            r,
            c,
            x,
            &self.input_schema,
            &self.receipt_schema,
            false,
        )
    }

    /// Continue validation after an opaque host adapter has completed the
    /// predecessor-ordered JSON copy of source and input. This skips the
    /// duplicate Rust-value copy while keeping schema, semantic and receipt
    /// work on the caller's same Context.
    pub(crate) fn validate_admitted(
        &self,
        source: &Value,
        input: &Value,
        e: &Engine,
        r: &Registry,
        c: &mut dyn Capabilities,
        x: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let mut compact_work = CompactWorkLedger::default();
        validate_with_schemas_and_ledger(
            source,
            input,
            e,
            r,
            c,
            x,
            &self.input_schema,
            &self.receipt_schema,
            false,
            &mut compact_work,
            true,
            false,
        )
    }

    /// Verify a complete dataset receipt against independently retained source
    /// and request data, then return the freshly recomputed receipt.
    pub fn verify(
        &self,
        receipt_input: &Value,
        current: &Value,
        expected_input: &Value,
        e: &Engine,
        r: &Registry,
        c: &mut dyn Capabilities,
        x: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let receipt = copy_json(receipt_input, x)?;
        self.verify_admitted_with(
            receipt,
            |index, ctx| copy_json(if index == 0 { current } else { expected_input }, ctx),
            e,
            r,
            c,
            x,
        )
    }

    /// Finish verification from an already copied receipt while admitting the
    /// independent current source and expected input only at the predecessor
    /// checkpoints. The callbacks preserve the observable order for host
    /// objects; all phases share the caller's Context.
    pub(crate) fn verify_admitted_with<Admit>(
        &self,
        receipt: Value,
        mut admit: Admit,
        e: &Engine,
        r: &Registry,
        c: &mut dyn Capabilities,
        x: &mut Context<'_>,
    ) -> Result<Value, EngineError>
    where
        Admit: FnMut(usize, &mut Context<'_>) -> Result<Value, EngineError>,
    {
        if !self.receipt_schema.validate(&receipt, x)?.is_empty() {
            return Err(err(
                "CORE_DATASET_RECEIPT",
                "Dataset receipt violates its versioned schema",
                "",
            ));
        }
        if get(&receipt, "operation") != Some(&s("validate-core-dataset-values"))
            || get(&receipt, "version") != Some(&s("1.0.0"))
        {
            return Err(err(
                "CORE_DATASET_RECEIPT",
                "Invalid/stale original dataset receipt",
                "",
            ));
        }
        let receipt_source = get(&receipt, "source").expect("receipt schema requires source");
        let receipt_input = get(&receipt, "input").expect("receipt schema requires input");
        let copied_receipt_source = copy_json(receipt_source, x)?;
        let copied_current = admit(0, x)?;
        if !json_data_equal(&copied_receipt_source, &copied_current, x)? {
            return Err(err(
                "CORE_DATASET_RECEIPT",
                "Invalid/stale original dataset receipt",
                "",
            ));
        }
        let copied_receipt_input = copy_json(receipt_input, x)?;
        let copied_expected_input = admit(1, x)?;
        if !json_data_equal(&copied_receipt_input, &copied_expected_input, x)? {
            return Err(err(
                "CORE_DATASET_RECEIPT",
                "Invalid/stale original dataset receipt",
                "",
            ));
        }
        let expected = self.validate(&copied_receipt_source, &copied_receipt_input, e, r, c, x)?;
        if !json_data_equal(&receipt, &expected, x)? {
            return Err(err(
                "CORE_DATASET_RECEIPT",
                "Dataset receipt differs from complete recomputation",
                "",
            ));
        }
        Ok(expected)
    }
}

/// Validate one finite dataset under the supplied-dataset-only contract.
///
/// This first Rust operation profile implements the current directed,
/// monomorphic, independent-lifecycle relationship subset. Unsupported source
/// relationship meaning is retained as a residual and makes the result
/// incomplete. Inputs and source are copied before any receipt is produced.
pub fn validate_core_dataset_values(
    source_input: &Value,
    input_input: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let validator = CoreDatasetValueValidator::new(e, x)?;
    validator.validate(source_input, input_input, e, r, c, x)
}

/// Verify a complete full-source dataset receipt by validating and comparing
/// the complete recomputed result under the same caller-owned context.
pub fn verify_core_dataset_values(
    receipt: &Value,
    current: &Value,
    expected_input: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let validator = CoreDatasetValueValidator::new(e, x)?;
    validator.verify(receipt, current, expected_input, e, r, c, x)
}

/// Reusable compact admission/result schemas for repeated opt-in calls.
pub struct CoreDatasetValueCompactValidator {
    input_schema: CompiledSchema,
    receipt_schema: CompiledSchema,
}
impl CoreDatasetValueCompactValidator {
    pub fn new(e: &Engine, x: &mut Context<'_>) -> Result<Self, EngineError> {
        let (input_schema, receipt_schema) = compact_schemas(e, x)?;
        Ok(Self {
            input_schema,
            receipt_schema,
        })
    }
    pub fn validate(
        &self,
        source: &Value,
        input: &Value,
        e: &Engine,
        r: &Registry,
        c: &mut dyn Capabilities,
        x: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        validate_with_schemas(
            source,
            input,
            e,
            r,
            c,
            x,
            &self.input_schema,
            &self.receipt_schema,
            true,
        )
    }
    pub fn verify(
        &self,
        receipt_input: &Value,
        current: &Value,
        expected_input: &Value,
        e: &Engine,
        r: &Registry,
        c: &mut dyn Capabilities,
        x: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let mut compact_work = CompactWorkLedger::default();
        self.verify_with_ledger(
            receipt_input,
            current,
            expected_input,
            e,
            r,
            c,
            x,
            &mut compact_work,
        )
    }

    fn verify_with_ledger(
        &self,
        receipt_input: &Value,
        current: &Value,
        expected_input: &Value,
        e: &Engine,
        r: &Registry,
        c: &mut dyn Capabilities,
        x: &mut Context<'_>,
        compact_work: &mut CompactWorkLedger,
    ) -> Result<Value, EngineError> {
        let limits = x.limits();
        preflight_compact_depth(receipt_input, limits.max_depth, limits.max_values, x)?;
        compact_work.copy_tree_checked(receipt_input)?;
        let receipt = copy_json(receipt_input, x)?;
        let compact_schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/dataset-value-compact-operation.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )?;
        let dataset_schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/dataset-value-operation.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )?;
        let key_schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/key-tuple-operation-v4.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )?;
        let core_schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )?;
        let semantic_reference = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/semantic-type-reference.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )?;
        compact_work.reserve_schema_with_resources(
            &compact_schema,
            &receipt,
            &[
                &core_schema,
                &semantic_reference,
                &key_schema,
                &dataset_schema,
                &compact_schema,
            ],
            "compact-schema",
        )?;
        compact_work.enforce()?;
        if !self.receipt_schema.validate(&receipt, x)?.is_empty() {
            return Err(err(
                "CORE_DATASET_COMPACT_RECEIPT",
                "Compact receipt violates its versioned schema",
                "",
            ));
        }
        preflight_compact_depth(current, limits.max_depth, limits.max_values, x)?;
        preflight_compact_depth(expected_input, limits.max_depth, limits.max_values, x)?;
        compact_work.copy_tree_checked(current)?;
        compact_work.copy_tree_checked(expected_input)?;
        let copied_current = copy_json(current, x)?;
        let copied_expected_input = copy_json(expected_input, x)?;
        let receipt_source = get(&receipt, "source").expect("compact schema requires source");
        let receipt_input = get(&receipt, "input").expect("compact schema requires input");
        // TypeScript copies both host arguments before testing either against
        // the retained receipt. Keep this order so an over-limit expectedInput
        // can refuse before a stale-current result.
        compact_work.reserve_verify_canonical(receipt_source)?;
        compact_work.reserve_verify_canonical(&copied_current)?;
        compact_work.enforce()?;
        if !json_data_equal(receipt_source, &copied_current, x)? {
            return Err(err(
                "CORE_DATASET_COMPACT_RECEIPT",
                "Invalid/stale original compact dataset receipt",
                "",
            ));
        }
        compact_work.reserve_verify_canonical(receipt_input)?;
        compact_work.reserve_verify_canonical(&copied_expected_input)?;
        compact_work.enforce()?;
        if !json_data_equal(receipt_input, &copied_expected_input, x)? {
            return Err(err(
                "CORE_DATASET_COMPACT_RECEIPT",
                "Invalid/stale original compact dataset receipt",
                "",
            ));
        }
        // TypeScript createValueContext copies both already-admitted arguments
        // again before counting, schema reservation, and recomputation.
        compact_work.copy_tree_checked(&copied_current)?;
        compact_work.copy_tree_checked(&copied_expected_input)?;
        let expected = validate_with_schemas_and_ledger(
            &copied_current,
            &copied_expected_input,
            e,
            r,
            c,
            x,
            &self.input_schema,
            &self.receipt_schema,
            true,
            compact_work,
            true,
            true,
        )?;
        // Verification's single ValueWork ledger also covers the complete
        // current-source recomputation before receipt-result comparison.
        compact_work.enforce()?;
        compact_work.reserve_verify_canonical_receipt_result(&receipt)?;
        compact_work.reserve_verify_canonical_receipt_result(&expected)?;
        compact_work.enforce()?;
        if !json_data_equal_receipt_result(&receipt, &expected, x)? {
            return Err(err(
                "CORE_DATASET_COMPACT_RECEIPT",
                "Compact receipt differs from complete recomputation",
                "",
            ));
        }
        Ok(expected)
    }

    /// First staged prefix for the host verify adapter. This deliberately
    /// touches only the receipt so a malformed receipt refuses before host
    /// getters for `current` or `expectedInput` are visited.
    pub fn prepare_verification_receipt(
        &self,
        receipt_input: &Value,
        x: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let receipt = copy_json(receipt_input, x)?;
        if !self.receipt_schema.validate(&receipt, x)?.is_empty() {
            return Err(err(
                "CORE_DATASET_COMPACT_RECEIPT",
                "Compact receipt violates its versioned schema",
                "",
            ));
        }
        Ok(receipt)
    }
}

pub fn validate_core_dataset_values_compact(
    source: &Value,
    input: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
) -> Result<Value, EngineError> {
    CoreDatasetValueCompactValidator::new(e, x)?.validate(source, input, e, r, c, x)
}
pub fn verify_core_dataset_values_compact(
    receipt: &Value,
    current: &Value,
    expected_input: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
) -> Result<Value, EngineError> {
    CoreDatasetValueCompactValidator::new(e, x)?.verify(
        receipt,
        current,
        expected_input,
        e,
        r,
        c,
        x,
    )
}

/// Prepare receipt-only verification admission before a host reads later args.
pub fn prepare_core_dataset_values_compact_verification(
    receipt: &Value,
    e: &Engine,
    x: &mut Context<'_>,
) -> Result<Value, EngineError> {
    CoreDatasetValueCompactValidator::new(e, x)?.prepare_verification_receipt(receipt, x)
}

fn json_data_equal(a: &Value, b: &Value, x: &mut Context<'_>) -> Result<bool, EngineError> {
    x.charge_work(1, Utf16::default())?;
    match (a, b) {
        (Value::Array(left), Value::Array(right)) => {
            if left.len() != right.len() {
                return Ok(false);
            }
            for (left, right) in left.iter().zip(right) {
                if !json_data_equal(left, right, x)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (Value::Object(left), Value::Object(right)) => {
            if left.len() != right.len() {
                return Ok(false);
            }
            let sort_cost = |len: usize| {
                let levels = if len == 0 {
                    0
                } else {
                    usize::BITS as usize - len.leading_zeros() as usize
                };
                len.saturating_mul(levels)
            };
            let max_key_units = |fields: &[(Utf16, Value)]| {
                fields.iter().map(|(key, _)| key.len()).max().unwrap_or(0)
            };
            let left_comparisons = sort_cost(left.len());
            let right_comparisons = sort_cost(right.len());
            let sort_units = left_comparisons
                .saturating_mul(max_key_units(left))
                .saturating_add(right_comparisons.saturating_mul(max_key_units(right)));
            x.charge_work(sort_units, Utf16::default())?;
            let mut left_sorted: Vec<_> = left.iter().collect();
            let mut right_sorted: Vec<_> = right.iter().collect();
            left_sorted.sort_by(|a, b| a.0.cmp(&b.0));
            right_sorted.sort_by(|a, b| a.0.cmp(&b.0));
            for ((left_key, left_value), (right_key, right_value)) in
                left_sorted.into_iter().zip(right_sorted)
            {
                x.charge_work(
                    left_key.len().saturating_add(right_key.len()),
                    Utf16::default(),
                )?;
                if left_key != right_key || !json_data_equal(left_value, right_value, x)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (Value::String(left), Value::String(right)) => {
            x.charge_work(left.len().saturating_add(right.len()), Utf16::default())?;
            Ok(left == right)
        }
        _ => Ok(a == b),
    }
}

/// Compare the recomputed result surface while leaving the retained source and
/// input checks to the earlier canonical comparisons, matching TS's destructure.
fn json_data_equal_receipt_result(
    actual: &Value,
    expected: &Value,
    x: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let (Value::Object(actual), Value::Object(expected)) = (actual, expected) else {
        return Ok(false);
    };
    x.charge_work(1, Utf16::default())?;
    let mut left = actual
        .iter()
        .filter(|(key, _)| key != &Utf16::from("source") && key != &Utf16::from("input"))
        .collect::<Vec<_>>();
    let mut right = expected
        .iter()
        .filter(|(key, _)| key != &Utf16::from("source") && key != &Utf16::from("input"))
        .collect::<Vec<_>>();
    if left.len() != right.len() {
        return Ok(false);
    }
    let sort_cost = |len: usize| {
        let levels = if len == 0 {
            0
        } else {
            usize::BITS as usize - len.leading_zeros() as usize
        };
        len.saturating_mul(levels)
    };
    let max_key_units =
        |fields: &[&(Utf16, Value)]| fields.iter().map(|(key, _)| key.len()).max().unwrap_or(0);
    let sort_units = sort_cost(left.len())
        .saturating_mul(max_key_units(&left))
        .saturating_add(sort_cost(right.len()).saturating_mul(max_key_units(&right)));
    x.charge_work(sort_units, Utf16::default())?;
    left.sort_by(|a, b| a.0.cmp(&b.0));
    right.sort_by(|a, b| a.0.cmp(&b.0));
    for ((left_key, left_value), (right_key, right_value)) in left.into_iter().zip(right) {
        x.charge_work(
            left_key.len().saturating_add(right_key.len()),
            Utf16::default(),
        )?;
        if left_key != right_key || !json_data_equal(left_value, right_value, x)? {
            return Ok(false);
        }
    }
    Ok(true)
}

#[cfg(test)]
mod verification_comparison_tests {
    use super::{CompactWorkLedger, json_data_equal, json_data_equal_receipt_result};
    use crate::{Context, Value, value::Utf16};

    #[test]
    fn comparison_meter_covers_long_prefix_sort_and_string_equality() {
        let left = Value::Object(vec![
            (Utf16::from("a"), Value::Null),
            (Utf16::from("b"), Value::Null),
            (Utf16::from("c"), Value::Null),
        ]);
        let right = left.clone();
        let mut three_key_charge = 0usize;
        let mut meter = |amount: usize| {
            three_key_charge = three_key_charge.saturating_add(amount);
            Ok(())
        };
        assert!(
            json_data_equal(
                &left,
                &right,
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap()
        );
        // root visit (1), both three-key sorts (12), key equality (6), and
        // three recursive null comparisons (3).
        assert_eq!(three_key_charge, 22);

        const COUNT: usize = 64;
        const PREFIX_UNITS: usize = 256;
        let prefix = "p".repeat(PREFIX_UNITS);
        let fields = (0..COUNT)
            .map(|index| (Utf16::from(format!("{prefix}{index:04}")), Value::Null))
            .collect::<Vec<_>>();
        let left = Value::Object(fields.clone());
        let right = Value::Object(fields);
        let mut charged = 0usize;
        let mut meter = |amount: usize| {
            charged = charged.saturating_add(amount);
            Ok(())
        };
        assert!(
            json_data_equal(
                &left,
                &right,
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap()
        );
        let sort_comparisons = COUNT * (usize::BITS as usize - COUNT.leading_zeros() as usize);
        let expected_sort_charge = sort_comparisons * (PREFIX_UNITS + 4) * 2;
        let expected_key_charge = COUNT * (PREFIX_UNITS + 4) * 2;
        assert!(charged >= expected_sort_charge + expected_key_charge);

        let left = Value::String(Utf16::from("x".repeat(4096)));
        let right = left.clone();
        let mut string_charge = 0usize;
        let mut meter = |amount: usize| {
            string_charge = string_charge.saturating_add(amount);
            Ok(())
        };
        assert!(
            json_data_equal(
                &left,
                &right,
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap()
        );
        assert!(string_charge >= 8192);
    }

    #[test]
    fn receipt_result_comparison_skips_already_checked_source_and_input() {
        let retained = Value::String(Utf16::from("x".repeat(4096)));
        let make = || {
            Value::Object(vec![
                (Utf16::from("source"), retained.clone()),
                (Utf16::from("input"), retained.clone()),
                (Utf16::from("result"), Value::Null),
            ])
        };
        let left = make();
        let right = make();
        let mut charged = 0usize;
        let mut meter = |amount: usize| {
            charged = charged.saturating_add(amount);
            Ok(())
        };
        assert!(
            json_data_equal_receipt_result(
                &left,
                &right,
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap()
        );
        assert!(
            charged < 100,
            "retained input fields were traversed: {charged}"
        );
    }

    #[test]
    fn verify_canonical_reservation_matches_three_key_ts_formula_and_checks_incrementally() {
        let value = Value::Object(vec![
            (Utf16::from("a"), Value::Null),
            (Utf16::from("b"), Value::Null),
            (Utf16::from("c"), Value::Null),
        ]);
        let mut ledger = CompactWorkLedger::default();
        ledger.reserve_verify_canonical(&value).unwrap();
        assert_eq!(ledger.categories.get("verify-canonical-visit"), Some(&4));
        assert_eq!(ledger.categories.get("verify-canonical-key-sort"), Some(&6));
        assert_eq!(ledger.used, 10);

        ledger.used = 1_000_000;
        let before = ledger.used;
        let error = ledger
            .reserve_verify_canonical(&Value::Null)
            .expect_err("the next canonical visit must stop at the 1M boundary");
        assert_eq!(error.code, "LIMIT");
        assert_eq!(
            ledger.used, before,
            "failed reserve must not grow the ledger"
        );
    }
}

fn validate_with_schemas(
    source_input: &Value,
    input_input: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
    input_schema: &CompiledSchema,
    receipt_schema: &CompiledSchema,
    compact: bool,
) -> Result<Value, EngineError> {
    let mut compact_work = CompactWorkLedger::default();
    validate_with_schemas_and_ledger(
        source_input,
        input_input,
        e,
        r,
        c,
        x,
        input_schema,
        receipt_schema,
        compact,
        &mut compact_work,
        false,
        false,
    )
}

fn validate_with_schemas_and_ledger(
    source_input: &Value,
    input_input: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
    input_schema: &CompiledSchema,
    receipt_schema: &CompiledSchema,
    compact: bool,
    compact_work: &mut CompactWorkLedger,
    inputs_already_copied: bool,
    verify_recompute: bool,
) -> Result<Value, EngineError> {
    if compact {
        // Caller-owned Values can be assembled directly, without passing the
        // serialization/copy admission path. Bound depth before recursive
        // ValueWork/schema helpers inspect those trees.
        let limits = x.limits();
        preflight_compact_depth(source_input, limits.max_depth, limits.max_values, x)?;
        preflight_compact_depth(input_input, limits.max_depth, limits.max_values, x)?;
        // ValueWork.copy charges before constructing each copied subtree.
        if !inputs_already_copied {
            compact_work.copy_tree_checked(source_input)?;
            compact_work.copy_tree_checked(input_input)?;
        }
    }
    let source = if inputs_already_copied {
        source_input.clone()
    } else if compact {
        copy_compact_root(source_input, x)?
    } else {
        copy_json(source_input, x)?
    };
    let input = if inputs_already_copied {
        input_input.clone()
    } else if compact {
        copy_compact_root(input_input, x)?
    } else {
        copy_json(input_input, x)?
    };
    let mut compact_core_schema: Option<Value> = None;
    if compact {
        // Mirror createValueContext's source/input admission order. This is an
        // invocation-local ValueWork ledger; Context remains the host resource
        // meter and is deliberately not charged a second time here.
        let source_count = if verify_recompute {
            compact_work.count_checked(&source)?
        } else {
            compact_work.count(&source)
        };
        let source_bytes = if verify_recompute {
            compact_work.preflight_bytes_checked(&source)?
        } else {
            compact_work.preflight_bytes(&source)
        };
        let input_bytes = if verify_recompute {
            compact_work.preflight_bytes_checked(&input)?
        } else {
            compact_work.preflight_bytes(&input)
        };
        if source_bytes.saturating_add(input_bytes) > 4_000_000 {
            return Err(err(
                "LIMIT",
                "Compact aggregate source/input serialized bytes exceeded",
                "",
            ));
        }
        compact_work.enforce()?;

        let read_schema = |text: &str| {
            crate::serialization::read_json_value(
                &text.encode_utf16().collect::<Vec<_>>(),
                crate::serialization::Format::Json,
                &mut Context::catalog(),
            )
        };
        let core_schema = read_schema(include_str!("../../../spec/core/schema.json"))?;
        let semantic_reference = read_schema(include_str!(
            "../../../spec/core/semantic-type-reference.schema.json"
        ))?;
        compact_work.reserve_schema_with_resources(
            &core_schema,
            &source,
            &[&core_schema, &semantic_reference],
            "source-schema",
        )?;
        if verify_recompute {
            compact_work.reserve_source_scans_checked(&source, source_count)?;
        } else {
            compact_work.reserve_source_scans(&source, source_count);
        }
        compact_work.enforce()?;
        compact_core_schema = Some(core_schema);
    }
    let early_document_validation = if compact {
        if verify_recompute {
            let mut observer = |category: &'static str, amount: usize| {
                compact_work.charge_checked(category, amount)
            };
            Some(e.validate_document_observed_fallible(&source, r, c, x, Some(&mut observer))?)
        } else {
            let mut observer = |category: &'static str, amount: usize| {
                compact_work.charge(category, amount);
            };
            Some(e.validate_document_observed(&source, r, c, x, Some(&mut observer))?)
        }
    } else {
        None
    };
    if compact {
        compact_work.enforce()?;
    }
    if let Some(validation) = &early_document_validation {
        if !matches!(get(&source,"umf"),Some(Value::String(v)) if v==&Utf16::from("0.10.0"))
            || !validation.valid
        {
            return Err(err(
                "CORE_DATASET_SOURCE",
                "Valid current core 0.10.0 source required",
                "/source",
            ));
        }
        compact_work.walk_mode("context-freeze", &source, 1, verify_recompute)?;
        compact_work.walk_mode("context-freeze", &input, 1, verify_recompute)?;
        compact_work.walk_mode(
            "validation-freeze",
            &validation_value(validation),
            1,
            verify_recompute,
        )?;
        compact_work.walk_mode("context-key-index", &source, 1, verify_recompute)?;
        compact_work.enforce()?;
    }
    if compact {
        let core_schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )?;
        let semantic_reference = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/semantic-type-reference.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )?;
        let operation_schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/dataset-value-operation.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )?;
        let key_schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/key-tuple-operation-v4.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )?;
        let compact_schema = crate::serialization::read_json_value(
            &include_str!("../../../spec/core/dataset-value-compact-operation.schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            &mut Context::catalog(),
        )?;
        compact_work.reserve_schema_rooted(
            &operation_schema,
            get(
                get(&operation_schema, "$defs").expect("input schema defs"),
                "input",
            )
            .expect("dataset input schema"),
            &input,
            &[
                &core_schema,
                &semantic_reference,
                &key_schema,
                &operation_schema,
                &compact_schema,
            ],
            "input-schema",
        )?;
        compact_work.enforce()?;
    }
    if !verify_recompute && !input_schema.validate(&input, x)?.is_empty() {
        return Err(err(
            "CORE_DATASET_INPUT",
            "Dataset request violates its versioned operation schema",
            "/input",
        ));
    }
    known(
        &input,
        &["scope", "records", "relationships", "context"],
        "/input",
    )?;
    let scope = get(&input, "scope").ok_or_else(|| {
        err(
            "CORE_DATASET_INPUT",
            "Explicit finite supplied-dataset scope required",
            "/input/scope",
        )
    })?;
    known(scope, &["id", "closure"], "/input/scope")?;
    if fields(scope).is_none_or(|m| m.len() != 2)
        || text(get(scope, "id")).is_none_or(Utf16::is_empty)
        || get(scope, "closure") != Some(&s("supplied-dataset-only"))
    {
        return Err(err(
            "CORE_DATASET_INPUT",
            "Dataset request violates its versioned operation schema",
            "/input/scope",
        ));
    }
    let records = arr(get(&input, "records")).ok_or_else(|| {
        err(
            "CORE_DATASET_INPUT",
            "Explicit bounded records/relationships required",
            "/input/records",
        )
    })?;
    let links = arr(get(&input, "relationships")).ok_or_else(|| {
        err(
            "CORE_DATASET_INPUT",
            "Explicit bounded records/relationships required",
            "/input/relationships",
        )
    })?;
    if records.len() > 1000 || links.len() > 10000 {
        return Err(err(
            "CORE_DATASET_INPUT",
            "Explicit bounded records/relationships required",
            "/input",
        ));
    }
    let document_validation = match early_document_validation {
        Some(validation) => validation,
        None => e.validate_document(&source, r, c, x)?,
    };
    if !matches!(get(&source,"umf"),Some(Value::String(v)) if v==&Utf16::from("0.10.0"))
        || !document_validation.valid
    {
        return Err(err(
            "CORE_DATASET_SOURCE",
            "Valid current core 0.10.0 source required",
            "/source",
        ));
    }
    preflight(&source, &input, records, links, compact)?;
    if compact {
        compact_work.walk_mode("dataset-source-composition", &source, 4, verify_recompute)?;
        compact_work.walk_mode("dataset-input-composition", &input, 8, verify_recompute)?;
        if verify_recompute {
            compact_work.aggregate_byte_traversal_checked(&source)?;
            compact_work.aggregate_byte_traversal_checked(&input)?;
            compact_work
                .aggregate_byte_traversal_checked(&validation_value(&document_validation))?;
        } else {
            compact_work.aggregate_byte_traversal(&source);
            compact_work.aggregate_byte_traversal(&input);
            compact_work.aggregate_byte_traversal(&validation_value(&document_validation));
        }
        compact_work.enforce()?;
    }

    let mut diagnostics: Vec<Value> = Vec::new();
    let mut residuals: Vec<Value> = Vec::new();
    for d in document_validation.diagnostics.iter().filter(|d| {
        d.severity == Severity::Warning
            && !d
                .code
                .units()
                .starts_with(&"EXPERIMENTAL_".encode_utf16().collect::<Vec<_>>())
    }) {
        diagnostics.push(diagnostic_value(d));
        residuals.push(obj(vec![
            ("path", str_value(&d.path)),
            (
                "value",
                pointer_value(&source, &d.path)
                    .cloned()
                    .unwrap_or(Value::Null),
            ),
            ("reason", str_value(&d.message)),
        ]));
    }
    let mut instances: BTreeMap<Utf16, Value> = BTreeMap::new();
    let mut record_receipts = Vec::new();
    let mut key_receipts = Vec::new();
    let mut key_index: BTreeMap<(Utf16, Utf16, Utf16, Utf16), Vec<Utf16>> = BTreeMap::new();
    let mut key_invalid = false;
    let mut key_unresolved = !residuals.is_empty();
    let mut unresolved_keys: BTreeSet<(Utf16, Utf16, Utf16)> = BTreeSet::new();
    let mut relation_invalid = false;
    let mut relation_unresolved = !residuals.is_empty();
    let modules = arr(get(&source, "modules")).unwrap_or(&[]);
    let mut declarations: BTreeMap<(Utf16, Utf16), Value> = BTreeMap::new();
    let mut declared_elements: BTreeMap<(Utf16, Utf16), Value> = BTreeMap::new();
    let mut declared_element_paths: BTreeMap<(Utf16, Utf16), String> = BTreeMap::new();
    let mut declaration_paths: BTreeMap<(Utf16, Utf16), String> = BTreeMap::new();
    let mut unsupported_declarations: BTreeSet<(Utf16, Utf16)> = BTreeSet::new();
    let mut declaration_order = Vec::new();
    for (mi, module) in modules.iter().enumerate() {
        let Some(mid) = text(get(module, "id")) else {
            continue;
        };
        for (ei, element) in arr(get(module, "elements"))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            if let Some(eid) = text(get(element, "id")) {
                let key = qid(mid, eid);
                declared_elements.insert(key.clone(), element.clone());
                declared_element_paths.insert(key, format!("/modules/{mi}/elements/{ei}"));
            }
        }
        for (ri, relation) in arr(get(module, "relationships"))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            if let Some(rid) = text(get(relation, "id")) {
                let key = (mid.clone(), rid.clone());
                if !declarations.contains_key(&key) {
                    declaration_order.push(key.clone());
                }
                declarations.insert(key.clone(), relation.clone());
                declaration_paths.insert(key, format!("/modules/{mi}/relationships/{ri}"));
            }
        }
    }
    for identity in &declaration_order {
        let declaration = &declarations[identity];
        let path = declaration_paths
            .get(identity)
            .map(String::as_str)
            .unwrap_or("/modules");
        let prefix = Utf16::from(format!("{path}/")).into_units();
        let unknown = document_validation
            .diagnostics
            .iter()
            .any(|d| d.severity == Severity::Warning && d.path.units().starts_with(&prefix));
        let sources = arr(get(declaration, "source")).unwrap_or(&[]);
        let targets = arr(get(declaration, "target")).unwrap_or(&[]);
        let supported = !unknown
            && get(declaration, "directed") == Some(&Value::Bool(true))
            && sources.len() == 1
            && targets.len() == 1
            && get(declaration, "targetLifecycle") == Some(&s("independent"))
            && get(declaration, "associationRecord").is_none();
        if !supported {
            unsupported_declarations.insert(identity.clone());
            relation_unresolved = true;
        }
    }
    for (i, record) in records.iter().enumerate() {
        let path = format!("/input/records/{i}");
        known(record, &["instanceId", "identity", "values"], &path)?;
        if fields(record).is_none_or(|m| m.len() != 3)
            || text(get(record, "instanceId")).is_none_or(Utf16::is_empty)
        {
            return Err(err(
                "CORE_DATASET_INPUT",
                "Exact record locator required",
                &path,
            ));
        }
        let id = get(record, "identity")
            .ok_or_else(|| err("CORE_DATASET_INPUT", "Exact record locator required", &path))?;
        ident(id, &["module", "element"], &format!("{path}/identity"))?;
        let instance_id = text(get(record, "instanceId")).unwrap().clone();
        if instances.contains_key(&instance_id) {
            diagnostics.push(obj(vec![
                ("code", s("DUPLICATE_DATASET_INSTANCE")),
                ("path", s(&path)),
                ("message", s("Duplicate record instance locator")),
                ("severity", s("error")),
            ]));
            key_invalid = true;
        } else {
            instances.insert(instance_id.clone(), record.clone());
        }
        let vals = get(record, "values").ok_or_else(|| {
            err(
                "CORE_DATASET_INPUT",
                "Explicit field-state array required",
                &path,
            )
        })?;
        let rr = if compact {
            evaluate_core_record_values_body(e, &source, id, vals, &document_validation, x, true)?
        } else {
            validate_core_record_values(e, &source, id, vals, x)?
        };
        if compact {
            compact_work.copy_tree_mode(&rr, verify_recompute)?;
        }
        record_receipts.push(obj(vec![
            ("instanceId", str_value(&instance_id)),
            ("result", rr.clone()),
        ]));
        if let Value::Array(ds) = get(get(&rr, "validation").unwrap(), "diagnostics").unwrap() {
            for d in ds {
                if text(get(d, "code")).is_some_and(|v| {
                    v == &Utf16::from("RECORD_KEY_CONTEXT_REQUIRED")
                        || v == &Utf16::from("RECORD_RELATIONSHIP_CONTEXT_REQUIRED")
                }) {
                    continue;
                }
                let mut d = d.clone();
                if let Value::Object(ref mut m) = d {
                    if let Some((_, p)) = m.iter_mut().find(|(k, _)| k == &Utf16::from("path")) {
                        if let Value::String(pv) = p {
                            let mut joined = Utf16::from(path.clone()).into_units();
                            joined.extend(pv.units());
                            *pv = Utf16::new(joined);
                        }
                    }
                }
                diagnostics.push(d);
            }
        }
        let q = field_ident(id).unwrap();
        let Some(owner) = declared_elements.get(&q) else {
            continue;
        };
        if compact {
            compact_work.walk_mode("record-index", owner, 1, verify_recompute)?;
            compact_work.walk_mode("record-member-lookup", id, 1, verify_recompute)?;
            compact_work.walk_mode("record-values", vals, 1, verify_recompute)?;
            compact_work.walk_mode(
                "record-document-diagnostics",
                &validation_value(&document_validation),
                1,
                verify_recompute,
            )?;
            let mut supplied_fields = BTreeMap::new();
            if let Value::Array(values) = vals {
                for value in values {
                    if let Some(field) = field_ident(get(value, "field").unwrap_or(&Value::Null)) {
                        supplied_fields.entry(field).or_insert(value);
                    }
                }
            }
            for member in arr(get(owner, "members")).unwrap_or(&[]) {
                compact_work.walk_mode("record-member-lookup", member, 1, verify_recompute)?;
                let Some(member_id) = field_ident(member) else {
                    continue;
                };
                let Some(supplied) = supplied_fields.get(&member_id) else {
                    continue;
                };
                if get(supplied, "state") != Some(&s("present")) {
                    continue;
                }
                let field = declared_elements.get(&member_id).unwrap_or(&Value::Null);
                compact_work.copy_tree_mode(member, verify_recompute)?;
                let literal = get(supplied, "value").unwrap_or(&Value::Null);
                compact_work.copy_tree_mode(literal, verify_recompute)?;
                compact_work.walk_mode("field-identity", member, 1, verify_recompute)?;
                compact_work.walk_mode("literal-field-access", field, 4, verify_recompute)?;
                compact_work.walk_mode("literal-value", literal, 4, verify_recompute)?;
                if let Some(core_schema) = compact_core_schema.as_ref() {
                    let reference = crate::serialization::read_json_value(
                        &include_str!("../../../spec/core/semantic-type-reference.schema.json")
                            .encode_utf16()
                            .collect::<Vec<_>>(),
                        crate::serialization::Format::Json,
                        &mut Context::catalog(),
                    )?;
                    compact_work.reserve_schema_with_resources(
                        get(
                            get(core_schema, "$defs").expect("core schema defs"),
                            "literal",
                        )
                        .expect("literal schema"),
                        literal,
                        &[core_schema, &reference],
                        "literal-schema",
                    )?;
                }
            }
        }
        let mut supplied: BTreeMap<(Utf16, Utf16), Value> = BTreeMap::new();
        if let Value::Array(vs) = vals {
            for v in vs {
                if compact {
                    compact_work.walk_mode(
                        "dataset-field-index",
                        get(v, "field").unwrap_or(&Value::Null),
                        1,
                        verify_recompute,
                    )?;
                }
                if let Some(fid) = field_ident(get(v, "field").unwrap_or(&Value::Null)) {
                    supplied.entry(fid).or_insert_with(|| v.clone());
                }
            }
        }
        for key in arr(get(owner, "keys")).unwrap_or(&[]) {
            let Some(kid) = text(get(key, "id")) else {
                continue;
            };
            let components = arr(get(key, "fields")).unwrap_or(&[]);
            if compact {
                for component in components {
                    compact_work.walk_mode(
                        "dataset-key-component",
                        component,
                        1,
                        verify_recompute,
                    )?;
                }
            }
            let tuple: Vec<Value> = components
                .iter()
                .map(|f| {
                    let Some(fid) = field_ident(f) else {
                        return Value::Null;
                    };
                    let Some(v) = supplied.get(&fid) else {
                        return Value::Null;
                    };
                    if get(v, "state") == Some(&s("present")) {
                        get(v, "value").cloned().unwrap_or(Value::Null)
                    } else {
                        Value::Null
                    }
                })
                .collect();
            if compact {
                for (index, component) in components.iter().enumerate() {
                    let Some(field_identity) = field_ident(component) else {
                        continue;
                    };
                    let Some(field_node) = declared_elements.get(&field_identity) else {
                        continue;
                    };
                    compact_work.walk_mode(
                        "literal-field-access",
                        field_node,
                        4,
                        verify_recompute,
                    )?;
                    if let Some(value) = tuple.get(index) {
                        compact_work.walk_mode("literal-value", value, 4, verify_recompute)?;
                    }
                }
            }
            let key_identity = obj(vec![
                ("module", str_value(&q.0)),
                ("element", str_value(&q.1)),
                ("key", str_value(kid)),
            ]);
            let tuple_value = Value::Array(tuple);
            if compact {
                compact_work.walk_mode("key-index-identity", &key_identity, 1, verify_recompute)?;
                compact_work.charge_mode(
                    "key-component-index",
                    components.len(),
                    verify_recompute,
                )?;
                compact_work.charge_mode(
                    "key-relevant-diagnostic-scans",
                    3usize
                        .saturating_mul(
                            1usize.saturating_add(2usize.saturating_mul(components.len())),
                        )
                        .saturating_mul(document_validation.diagnostics.len()),
                    verify_recompute,
                )?;
                compact_work.walk_mode("key-values", &tuple_value, 1, verify_recompute)?;
                compact_work.walk_mode(
                    "key-document-diagnostics",
                    &validation_value(&document_validation),
                    1,
                    verify_recompute,
                )?;
            }
            let encoded = if compact {
                encode_core_key_tuple_compact_body(
                    &source,
                    &key_identity,
                    &tuple_value,
                    None,
                    e,
                    r,
                    c,
                    x,
                    &document_validation.diagnostics,
                )
            } else {
                encode_core_key_tuple(&source, &key_identity, &tuple_value, None, e, r, c, x)
            };
            match encoded {
                Ok(receipt) => {
                    if compact {
                        compact_work.copy_tree_mode(&receipt, verify_recompute)?;
                    }
                    key_receipts.push(obj(vec![
                        ("instanceId", str_value(&instance_id)),
                        ("result", receipt.clone()),
                    ]));
                    if let Some(hex) = bytes_hex(&receipt) {
                        let ids = key_index
                            .entry((q.0.clone(), q.1.clone(), kid.clone(), hex))
                            .or_default();
                        ids.push(instance_id.clone());
                        if ids.len() > 1 {
                            key_invalid = true;
                            let owner_path = declared_element_paths
                                .get(&q)
                                .map(String::as_str)
                                .unwrap_or("/modules");
                            diagnostics.push(obj(vec![("code",s("DUPLICATE_DATASET_KEY")),("path",s(&format!("{owner_path}/keys"))),("message",s("Declared Key tuple duplicates within supplied Record collection")),("severity",s("error"))]));
                        }
                    }
                }
                Err(error) => {
                    if error.is_control_failure() || error.code == "LIMIT" {
                        return Err(error);
                    }
                    let unresolved = error.code.contains("UNKNOWN");
                    if unresolved {
                        key_unresolved = true;
                        unresolved_keys.insert((q.0.clone(), q.1.clone(), kid.clone()));
                        residuals.push(obj(vec![
                            ("path", s(&path)),
                            ("value", tuple_value.clone()),
                            ("reason", Value::String(error.message.clone())),
                        ]));
                    } else {
                        key_invalid = true;
                    }
                    diagnostics.push(obj(vec![
                        ("code", s(&error.code)),
                        ("path", s(&path)),
                        ("message", Value::String(error.message.clone())),
                        ("severity", s(if unresolved { "warning" } else { "error" })),
                    ]));
                    if unresolved {
                        diagnostics.push(dataset_diagnostic(
                            "DATASET_UNRESOLVED",
                            &path,
                            &error.message.to_utf8().unwrap_or_default(),
                            "warning",
                        ));
                    }
                }
            }
        }
    }
    if compact {
        let declaration_count = modules
            .iter()
            .map(|module| arr(get(module, "relationships")).map_or(0, |items| items.len()))
            .sum::<usize>();
        compact_work.charge_mode(
            "dataset-relationship-diagnostic-scans",
            3usize
                .saturating_mul(declaration_count)
                .saturating_mul(document_validation.diagnostics.len()),
            verify_recompute,
        )?;
    }
    // TypeScript emits declaration residuals after supplied-record/key
    // diagnostics, while their support flags are computed before occurrence
    // traversal. Keep classification and output ordering separate.
    for identity in &declaration_order {
        if !unsupported_declarations.contains(identity) {
            continue;
        }
        let declaration = &declarations[identity];
        let path = declaration_paths
            .get(identity)
            .map(String::as_str)
            .unwrap_or("/modules");
        let reason =
            "Relationship context outside directed monomorphic independent-lifecycle subset";
        residuals.push(obj(vec![
            ("path", s(path)),
            ("value", declaration.clone()),
            ("reason", s(reason)),
        ]));
        diagnostics.push(obj(vec![
            ("code", s("DATASET_UNRESOLVED")),
            ("path", s(path)),
            ("message", s(reason)),
            ("severity", s("warning")),
        ]));
    }
    // Relationship occurrences resolve exact declared target Keys. Parallel
    // occurrences remain in the output while multiplicity counts distinct peers.
    let mut relationship_receipts = Vec::new();
    let mut seen = BTreeSet::new();
    let mut outgoing: BTreeMap<(Utf16, Utf16, Utf16), BTreeSet<Utf16>> = BTreeMap::new();
    let mut incoming: BTreeMap<(Utf16, Utf16, Utf16), BTreeSet<Utf16>> = BTreeMap::new();
    for (i, link) in links.iter().enumerate() {
        let path = format!("/input/relationships/{i}");
        known(
            link,
            &["instanceId", "identity", "sourceInstanceId", "target"],
            &path,
        )?;
        if fields(link).is_none_or(|m| m.len() != 4) {
            return Err(err(
                "CORE_DATASET_INPUT",
                "Exact relationship occurrence/source locator required",
                &path,
            ));
        }
        let iid = text(get(link, "instanceId"))
            .filter(|v| !v.is_empty())
            .ok_or_else(|| {
                err(
                    "CORE_DATASET_INPUT",
                    "Exact relationship occurrence/source locator required",
                    &path,
                )
            })?
            .clone();
        let source_iid = text(get(link, "sourceInstanceId"))
            .filter(|v| !v.is_empty())
            .ok_or_else(|| {
                err(
                    "CORE_DATASET_INPUT",
                    "Exact relationship occurrence/source locator required",
                    &path,
                )
            })?
            .clone();
        let rid = get(link, "identity").ok_or_else(|| {
            err(
                "CORE_DATASET_INPUT",
                "Exact relationship identity required",
                &path,
            )
        })?;
        ident(rid, &["module", "id"], &format!("{path}/identity"))?;
        if !seen.insert(iid.clone()) {
            relation_invalid = true;
            diagnostics.push(obj(vec![
                ("code", s("DUPLICATE_DATASET_RELATIONSHIP")),
                ("path", s(&path)),
                ("message", s("Duplicate relationship occurrence locator")),
                ("severity", s("error")),
            ]));
        }
        let relation = declarations.get(&(
            text(get(rid, "module")).unwrap().clone(),
            text(get(rid, "id")).unwrap().clone(),
        ));
        let Some(decl) = relation else {
            relation_invalid = true;
            diagnostics.push(dataset_diagnostic(
                "DATASET_RELATIONSHIP_IDENTITY",
                &path,
                "Undeclared relationship identity",
                "error",
            ));
            continue;
        };
        let sources = arr(get(decl, "source")).unwrap_or(&[]);
        let targets = arr(get(decl, "target")).unwrap_or(&[]);
        let relation_identity = (
            text(get(rid, "module")).unwrap().clone(),
            text(get(rid, "id")).unwrap().clone(),
        );
        let supported = !unsupported_declarations.contains(&relation_identity)
            && get(decl, "directed") == Some(&Value::Bool(true))
            && sources.len() == 1
            && targets.len() == 1
            && get(decl, "targetLifecycle") == Some(&s("independent"))
            && get(decl, "associationRecord").is_none();
        if !supported {
            relation_unresolved = true;
            let reason = "Occurrence depends on unsupported relationship declaration";
            residuals.push(obj(vec![
                ("path", s(&path)),
                ("value", link.clone()),
                ("reason", s(reason)),
            ]));
            diagnostics.push(dataset_diagnostic(
                "DATASET_UNRESOLVED",
                &path,
                reason,
                "warning",
            ));
            continue;
        }
        let Some(start) = instances.get(&source_iid) else {
            relation_invalid = true;
            diagnostics.push(dataset_diagnostic(
                "DATASET_SOURCE_ENDPOINT",
                &path,
                "Source locator missing or not an allowed exact Record type",
                "error",
            ));
            continue;
        };
        if !same_endpoint(get(start, "identity").unwrap_or(&Value::Null), &sources[0]) {
            relation_invalid = true;
            diagnostics.push(dataset_diagnostic(
                "DATASET_SOURCE_ENDPOINT",
                &path,
                "Source locator missing or not an allowed exact Record type",
                "error",
            ));
            continue;
        }
        let target = get(link, "target").ok_or_else(|| {
            err(
                "CORE_DATASET_INPUT",
                "Exact target Key locator required",
                &path,
            )
        })?;
        known(target, &["identity", "values"], &format!("{path}/target"))?;
        let tid = get(target, "identity").ok_or_else(|| {
            err(
                "CORE_DATASET_INPUT",
                "Exact target Key locator required",
                &path,
            )
        })?;
        ident(
            tid,
            &["module", "element", "key"],
            &format!("{path}/target/identity"),
        )?;
        if !same_endpoint(tid, &targets[0]) || get(tid, "key") != get(&targets[0], "key") {
            relation_invalid = true;
            diagnostics.push(dataset_diagnostic(
                "DATASET_TARGET_ENDPOINT",
                &path,
                "Target locator does not name declared Record/Key",
                "error",
            ));
            continue;
        }
        let tv = get(target, "values").ok_or_else(|| {
            err(
                "CORE_DATASET_INPUT",
                "Explicit target Key values required",
                &path,
            )
        })?;
        let encoded = if compact {
            encode_core_key_tuple_compact_body(
                &source,
                tid,
                tv,
                None,
                e,
                r,
                c,
                x,
                &document_validation.diagnostics,
            )
        } else {
            encode_core_key_tuple(&source, tid, tv, None, e, r, c, x)
        };
        let receipt = match encoded {
            Ok(v) => v,
            Err(error) => {
                if error.is_control_failure() || error.code == "LIMIT" {
                    return Err(error);
                }
                // The target Key uses the same encoder and obligation state as
                // record-owned Keys in the TypeScript composition. A failed
                // target tuple therefore affects dataset.keys as well as the
                // relationship obligation; unknown equality must also suppress
                // inferred multiplicity failures for this Key.
                let unresolved = error.code == "KEY_TUPLE_UNKNOWN";
                if unresolved {
                    key_unresolved = true;
                    unresolved_keys.insert((
                        text(get(tid, "module")).unwrap().clone(),
                        text(get(tid, "element")).unwrap().clone(),
                        text(get(tid, "key")).unwrap().clone(),
                    ));
                    relation_unresolved = true;
                } else {
                    key_invalid = true;
                    relation_invalid = true;
                }
                if unresolved {
                    residuals.push(obj(vec![
                        ("path", s(&format!("{path}/target"))),
                        ("value", tv.clone()),
                        ("reason", Value::String(error.message.clone())),
                    ]));
                }
                diagnostics.push(dataset_diagnostic(
                    &error.code,
                    &format!("{path}/target"),
                    &error.message.to_utf8().unwrap_or_default(),
                    if unresolved { "warning" } else { "error" },
                ));
                if unresolved {
                    diagnostics.push(dataset_diagnostic(
                        "DATASET_UNRESOLVED",
                        &format!("{path}/target"),
                        &error.message.to_utf8().unwrap_or_default(),
                        "warning",
                    ));
                }
                continue;
            }
        };
        let Some(hex) = bytes_hex(&receipt) else {
            relation_unresolved = true;
            continue;
        };
        let target_key = (
            text(get(tid, "module")).unwrap().clone(),
            text(get(tid, "element")).unwrap().clone(),
            text(get(tid, "key")).unwrap().clone(),
            hex,
        );
        let matches = key_index.get(&target_key).cloned().unwrap_or_default();
        if matches.len() != 1 {
            relation_invalid = true;
            diagnostics.push(dataset_diagnostic(
                "DATASET_TARGET_RESOLUTION",
                &path,
                "Target Key has zero or ambiguous supplied record matches",
                "error",
            ));
            continue;
        }
        let target_iid = matches[0].clone();
        relationship_receipts.push(obj(vec![
            ("instanceId", str_value(&iid)),
            ("identity", rid.clone()),
            ("sourceInstanceId", str_value(&source_iid)),
            ("targetInstanceId", str_value(&target_iid)),
            ("targetKey", receipt),
        ]));
        let relation_id = (
            text(get(rid, "module")).unwrap().clone(),
            text(get(rid, "id")).unwrap().clone(),
        );
        outgoing
            .entry((relation_id.0.clone(), relation_id.1.clone(), source_iid))
            .or_default()
            .insert(target_iid.clone());
        incoming
            .entry((relation_id.0, relation_id.1, target_iid))
            .or_default()
            .insert(text(get(link, "sourceInstanceId")).unwrap().clone());
    }
    if compact {
        let supported_count = declaration_order
            .iter()
            .filter(|identity| !unsupported_declarations.contains(*identity))
            .count();
        compact_work.charge_mode(
            "dataset-multiplicity-scans",
            16usize
                .saturating_mul(supported_count)
                .saturating_mul(records.len()),
            verify_recompute,
        )?;
    }
    for relation_id in &declaration_order {
        let declaration = &declarations[relation_id];
        let path = declaration_paths
            .get(relation_id)
            .map(String::as_str)
            .unwrap_or("/modules");
        let sources = arr(get(declaration, "source")).unwrap_or(&[]);
        let targets = arr(get(declaration, "target")).unwrap_or(&[]);
        let prefix = Utf16::from(format!("{path}/")).into_units();
        if sources.len() != 1
            || targets.len() != 1
            || get(declaration, "directed") != Some(&Value::Bool(true))
            || get(declaration, "targetLifecycle") != Some(&s("independent"))
            || get(declaration, "associationRecord").is_some()
            || document_validation
                .diagnostics
                .iter()
                .any(|d| d.severity == Severity::Warning && d.path.units().starts_with(&prefix))
        {
            continue;
        }
        let target_identity = &targets[0];
        let target_key = (
            text(get(target_identity, "module"))
                .cloned()
                .unwrap_or_default(),
            text(get(target_identity, "element"))
                .cloned()
                .unwrap_or_default(),
            text(get(target_identity, "key"))
                .cloned()
                .unwrap_or_default(),
        );
        if unresolved_keys.contains(&target_key) {
            relation_unresolved = true;
            let reason =
                "Target Key equality is unresolved; missing participation cannot be inferred";
            residuals.push(obj(vec![
                ("path", s(path)),
                ("value", declaration.clone()),
                ("reason", s(reason)),
            ]));
            diagnostics.push(dataset_diagnostic(
                "DATASET_UNRESOLVED",
                path,
                reason,
                "warning",
            ));
            continue;
        }
        for record in records {
            let Some(identity) = get(record, "identity") else {
                continue;
            };
            if same_endpoint(identity, &sources[0]) {
                let count = outgoing
                    .get(&(
                        relation_id.0.clone(),
                        relation_id.1.clone(),
                        text(get(record, "instanceId")).cloned().unwrap_or_default(),
                    ))
                    .map_or(0, |v| v.len()) as u64;
                let (min, max) = multiplicity(get(declaration, "targetMultiplicity"));
                if count < min || max.is_some_and(|m| count > m) {
                    relation_invalid = true;
                    diagnostics.push(obj(vec![("code",s("DATASET_RELATIONSHIP_MULTIPLICITY")),("path",s(path)),("message",s("Distinct related record count violates declared multiplicity within supplied dataset")),("severity",s("error"))]));
                }
            }
            if same_endpoint(identity, &targets[0]) {
                let count = incoming
                    .get(&(
                        relation_id.0.clone(),
                        relation_id.1.clone(),
                        text(get(record, "instanceId")).cloned().unwrap_or_default(),
                    ))
                    .map_or(0, |v| v.len()) as u64;
                let (min, max) = multiplicity(get(declaration, "sourceMultiplicity"));
                if count < min || max.is_some_and(|m| count > m) {
                    relation_invalid = true;
                    diagnostics.push(obj(vec![("code",s("DATASET_RELATIONSHIP_MULTIPLICITY")),("path",s(path)),("message",s("Distinct related record count violates declared multiplicity within supplied dataset")),("severity",s("error"))]));
                }
            }
        }
    }
    let valid = !diagnostics
        .iter()
        .any(|d| get(d, "severity") == Some(&s("error")));
    let complete = diagnostics.is_empty() && residuals.is_empty();
    let state = |invalid, unresolved| -> Value {
        s(if invalid {
            "invalid"
        } else if unresolved {
            "unresolved"
        } else {
            "satisfied"
        })
    };
    let result = obj(vec![
        (
            "operation",
            s(if compact {
                "validate-core-dataset-values-compact"
            } else {
                "validate-core-dataset-values"
            }),
        ),
        ("version", s("1.0.0")),
        ("scope", s("supplied-dataset-only")),
        ("provenance", s("unverified")),
        ("source", source),
        ("input", input),
        ("documentValidation", validation_value(&document_validation)),
        ("records", Value::Array(record_receipts)),
        ("keys", Value::Array(key_receipts)),
        ("relationships", Value::Array(relationship_receipts)),
        (
            "datasetValidation",
            obj(vec![
                ("valid", Value::Bool(valid)),
                ("complete", Value::Bool(complete)),
                ("diagnostics", Value::Array(diagnostics)),
            ]),
        ),
        (
            "obligations",
            Value::Array(vec![
                obj(vec![
                    ("id", s("dataset.keys")),
                    ("state", state(key_invalid, key_unresolved)),
                    ("scope", s("supplied-dataset-only")),
                ]),
                obj(vec![
                    ("id", s("dataset.relationships")),
                    ("state", state(relation_invalid, relation_unresolved)),
                    ("scope", s("supplied-dataset-only")),
                ]),
            ]),
        ),
        ("residuals", Value::Array(residuals)),
    ]);
    if compact {
        // ValueWork.copy charges each node before allocating the copied tree.
        compact_work.copy_tree_checked(&result)?;
    }
    let result = copy_receipt(&result, x)?;
    if compact {
        // `retainBudget` charges each retained collection member before the
        // final result copy; `bytes(result)` then walks the complete envelope.
        for key in [
            "records",
            "keys",
            "relationships",
            "datasetValidation",
            "residuals",
        ] {
            if let Some(Value::Array(items)) = get(&result, key) {
                for item in items {
                    if verify_recompute {
                        compact_work.aggregate_byte_traversal_checked(item)?;
                    } else {
                        compact_work.aggregate_byte_traversal(item);
                    }
                    if key == "residuals" {
                        if let Some(value) = get(item, "value") {
                            compact_work.copy_tree_mode(value, verify_recompute)?;
                        }
                    }
                }
            }
        }
        if let Some(Value::Array(items)) = get(
            get(&result, "datasetValidation").unwrap_or(&Value::Null),
            "diagnostics",
        ) {
            // `add()` calls retainBudget on every diagnostic before the
            // enclosing result is copied and byte-counted.
            for item in items {
                if verify_recompute {
                    compact_work.aggregate_byte_traversal_checked(item)?;
                } else {
                    compact_work.aggregate_byte_traversal(item);
                }
            }
        }
        if verify_recompute {
            compact_work.aggregate_byte_traversal_checked(&result)?;
        } else {
            compact_work.aggregate_byte_traversal(&result);
        }
        if !verify_recompute {
            let compact_schema = crate::serialization::read_json_value(
                &include_str!("../../../spec/core/dataset-value-compact-operation.schema.json")
                    .encode_utf16()
                    .collect::<Vec<_>>(),
                crate::serialization::Format::Json,
                &mut Context::catalog(),
            )?;
            let core_schema = crate::serialization::read_json_value(
                &include_str!("../../../spec/core/schema.json")
                    .encode_utf16()
                    .collect::<Vec<_>>(),
                crate::serialization::Format::Json,
                &mut Context::catalog(),
            )?;
            let reference_schema = crate::serialization::read_json_value(
                &include_str!("../../../spec/core/semantic-type-reference.schema.json")
                    .encode_utf16()
                    .collect::<Vec<_>>(),
                crate::serialization::Format::Json,
                &mut Context::catalog(),
            )?;
            let key_schema = crate::serialization::read_json_value(
                &include_str!("../../../spec/core/key-tuple-operation-v4.schema.json")
                    .encode_utf16()
                    .collect::<Vec<_>>(),
                crate::serialization::Format::Json,
                &mut Context::catalog(),
            )?;
            let operation_schema = crate::serialization::read_json_value(
                &include_str!("../../../spec/core/dataset-value-operation.schema.json")
                    .encode_utf16()
                    .collect::<Vec<_>>(),
                crate::serialization::Format::Json,
                &mut Context::catalog(),
            )?;
            compact_work.reserve_schema_with_resources(
                &compact_schema,
                &result,
                &[
                    &core_schema,
                    &reference_schema,
                    &key_schema,
                    &operation_schema,
                    &compact_schema,
                ],
                "compact-schema",
            )?;
            compact_work.enforce()?;
        }
    }
    if compact_bytes(&result)? > 4_000_000 {
        return Err(err(
            "LIMIT",
            "Actual aggregate dataset receipt-byte budget exceeded",
            "",
        ));
    }
    if !verify_recompute {
        if let Some(problem) = receipt_schema.validate(&result, x)?.first() {
            return Err(err(
                if compact {
                    "CORE_DATASET_COMPACT_RESULT"
                } else {
                    "CORE_DATASET_RESULT"
                },
                &problem.message.to_utf8().unwrap_or_default(),
                &problem.instance_path.to_utf8().unwrap_or_default(),
            ));
        }
    }
    Ok(result)
}
