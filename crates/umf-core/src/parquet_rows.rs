// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded physical row assembly using schema indexes and decoded levels.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{diagnostic, from_json, inspect_parquet_schema, to_json},
    parquet_physical::decode_parquet_physical,
    registry::Registry,
    value::{Utf16, Value},
};
use serde_json::{json, Value as Json};
use std::collections::BTreeMap;

pub const PARQUET_ROW_NODE_LIMIT: usize = 100_000;

#[derive(Clone)]
enum Slot {
    Record(BTreeMap<usize, Slot>),
    Repeated { items: Vec<Slot>, empty: bool },
    Null,
    Physical(Json),
}

fn error(message: impl AsRef<str>) -> EngineError {
    EngineError::new("PARQUET_ROW_ASSEMBLY", Utf16::default(), message.as_ref())
}

fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

fn array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(values) = value {
        Some(values)
    } else {
        None
    }
}

fn text(value: &Value) -> Option<String> {
    if let Value::String(value) = value {
        value.to_utf8().ok()
    } else {
        None
    }
}

fn public_result(source: Value, status: &str, diagnostics: Vec<Value>) -> Value {
    Value::Object(vec![
        (Utf16::from("source"), source),
        (Utf16::from("status"), Value::string_utf8(status)),
        (Utf16::from("complete"), Value::Bool(false)),
        (Utf16::from("diagnostics"), Value::Array(diagnostics)),
    ])
}

fn number(value: &Json, label: &str) -> Result<usize, EngineError> {
    let number = value
        .as_u64()
        .or_else(|| value.as_str().and_then(|value| value.parse::<u64>().ok()))
        .ok_or_else(|| error(format!("{label} exceeds supported bound")))?;
    usize::try_from(number).map_err(|_| error(format!("{label} exceeds supported bound")))
}

fn new_slot(value: Slot, count: &mut usize) -> Result<Slot, EngineError> {
    *count = count
        .checked_add(1)
        .filter(|count| *count <= PARQUET_ROW_NODE_LIMIT)
        .ok_or_else(|| error("Physical row node budget exceeded"))?;
    Ok(value)
}

fn physical_value(value: &Json, nodes: &mut usize) -> Result<Slot, EngineError> {
    new_slot(Slot::Physical(value.clone()), nodes)
}

fn finish(slot: &Slot, node: &Json) -> Result<Json, EngineError> {
    match slot {
        Slot::Null => Ok(Json::Null),
        Slot::Physical(value) => Ok(json!({"kind":"physical","value":value})),
        Slot::Repeated { items, .. } => Ok(json!({
            "kind":"repeated",
            "items":items.iter().map(|item| finish(item, node)).collect::<Result<Vec<_>,_>>()?
        })),
        Slot::Record(fields) => {
            let children = node["children"]
                .as_array()
                .ok_or_else(|| error("Schema children unavailable"))?;
            let mut output = Vec::new();
            output
                .try_reserve_exact(children.len())
                .map_err(|_| allocation_error())?;
            for child in children {
                let index = number(&child["index"], "Schema index")?;
                let value = fields.get(&index).ok_or_else(|| {
                    error("Columns disagree on repeated cardinality or shared structure")
                })?;
                output.push(json!({
                    "index":index,
                    "name":child["name"],
                    "value":finish(value,child)?
                }));
            }
            Ok(json!({"kind":"record","fields":output}))
        }
    }
}

fn allocation_error() -> EngineError {
    EngineError::new(
        "RESOURCE_LIMIT",
        Utf16::default(),
        "Parquet row allocation failed",
    )
    .with_control_failure()
}

/// Assemble physical records from decoded values and schema-indexed levels.
pub fn assemble_parquet_rows(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let physical = decode_parquet_physical(document, engine, registry, capabilities, ctx)?;
    let source = member(&physical, "source")
        .ok_or_else(|| error("Physical result omitted source"))?
        .clone();
    let mut diagnostics = array(
        member(&physical, "diagnostics")
            .ok_or_else(|| error("Physical diagnostics unavailable"))?,
    )
    .unwrap_or(&[])
    .to_vec();
    if text(member(&physical, "status").unwrap_or(&Value::Null)).as_deref() != Some("decoded") {
        return Ok(public_result(source, "blocked", diagnostics));
    }

    let inspected = inspect_parquet_schema(document, engine, registry, capabilities, ctx)?;
    let schema = to_json(
        member(&inspected, "metadata").ok_or_else(|| error("Schema metadata unavailable"))?,
    )?;
    let tree =
        to_json(member(&inspected, "tree").ok_or_else(|| error("Schema tree unavailable"))?)?;
    let leaves =
        to_json(member(&inspected, "leaves").ok_or_else(|| error("Schema leaves unavailable"))?)?;
    let pages =
        array(member(&physical, "pages").ok_or_else(|| error("Physical pages unavailable"))?)
            .ok_or_else(|| error("Physical pages unavailable"))?;

    let assembled = (|| -> Result<Vec<Json>, EngineError> {
        let schema_elements = schema["schema"]
            .as_array()
            .ok_or_else(|| error("Schema elements unavailable"))?;
        let leaf_list = leaves
            .as_array()
            .ok_or_else(|| error("Schema leaves unavailable"))?;
        let row_groups = schema["row_groups"]
            .as_array()
            .ok_or_else(|| error("Row groups unavailable"))?;
        let mut paths = BTreeMap::<usize, Vec<usize>>::new();
        let mut tree_nodes = BTreeMap::<usize, &Json>::new();
        let mut nodes = 0usize;
        fn index_schema(
            node: &Json,
            path: &mut Vec<usize>,
            schema_elements: &[Json],
            paths: &mut BTreeMap<usize, Vec<usize>>,
        ) -> Result<(), EngineError> {
            let index = number(&node["index"], "Schema index")?;
            let element = schema_elements
                .get(index)
                .ok_or_else(|| error("Schema element unavailable"))?;
            path.push(index);
            if !element.get("type").is_none_or(Json::is_null) {
                paths.insert(index, path.iter().skip(1).copied().collect());
            } else {
                let children = node["children"]
                    .as_array()
                    .ok_or_else(|| error("Schema children unavailable"))?;
                if children.is_empty() {
                    return Err(error("Empty groups have no observable presence stream"));
                }
                for child in children {
                    index_schema(child, path, schema_elements, paths)?;
                }
            }
            path.pop();
            Ok(())
        }
        index_schema(&tree, &mut Vec::new(), schema_elements, &mut paths)?;
        fn collect_nodes<'a>(
            node: &'a Json,
            output: &mut BTreeMap<usize, &'a Json>,
        ) -> Result<(), EngineError> {
            let index = number(&node["index"], "Schema index")?;
            output.insert(index, node);
            if let Some(children) = node["children"].as_array() {
                for child in children {
                    collect_nodes(child, output)?;
                }
            }
            Ok(())
        }
        collect_nodes(&tree, &mut tree_nodes)?;

        let mut all_rows = Vec::<Json>::new();
        for (group_index, group) in row_groups.iter().enumerate() {
            let row_count = number(&group["num_rows"], "Row count")?;
            if row_count > PARQUET_ROW_NODE_LIMIT.saturating_sub(nodes) {
                return Err(error("Physical row node budget exceeded"));
            }
            let mut group_rows = Vec::new();
            group_rows
                .try_reserve_exact(row_count)
                .map_err(|_| allocation_error())?;
            for _ in 0..row_count {
                group_rows.push(new_slot(Slot::Record(BTreeMap::new()), &mut nodes)?);
            }
            all_rows
                .try_reserve(row_count)
                .map_err(|_| allocation_error())?;

            for leaf in leaf_list {
                let column = number(&leaf["ordinal"], "Column ordinal")?;
                let leaf_index = number(&leaf["index"], "Schema index")?;
                let path = paths
                    .get(&leaf_index)
                    .ok_or_else(|| error("Schema path unavailable"))?;
                let mut row = -1isize;
                let mut positions = Vec::<Option<usize>>::new();
                for page in pages {
                    if page["kind"] != "data"
                        || number(&page["rowGroup"], "Row group")? != group_index
                        || number(&page["column"], "Column")? != column
                    {
                        continue;
                    }
                    let levels = &page["levels"];
                    let repetitions = levels["repetition"]
                        .as_array()
                        .ok_or_else(|| error("Repetition levels unavailable"))?;
                    let definitions = levels["definition"]
                        .as_array()
                        .ok_or_else(|| error("Definition levels unavailable"))?;
                    let physical_values = page["values"]
                        .as_array()
                        .ok_or_else(|| error("Physical values unavailable"))?;
                    let mut value_index = 0usize;
                    for (position, (repetition, definition)) in
                        repetitions.iter().zip(definitions).enumerate()
                    {
                        if position % 1024 == 0 {
                            ctx.charge_work(
                                (repetitions.len() - position).min(1024),
                                Utf16::default(),
                            )?;
                        }
                        let repetition = number(repetition, "Repetition level")?;
                        let definition = number(definition, "Definition level")?;
                        if repetition == 0 {
                            row += 1;
                            positions.clear();
                        } else {
                            let prior = positions
                                .get_mut(repetition)
                                .and_then(Option::as_mut)
                                .ok_or_else(|| {
                                    error("Repeated continuation has no prior instance")
                                })?;
                            *prior += 1;
                            positions.truncate(repetition + 1);
                        }
                        if row < 0 || row as usize >= group_rows.len() {
                            return Err(error("Column row count exceeds row group"));
                        }
                        let mut current = match &mut group_rows[row as usize] {
                            Slot::Record(fields) => fields,
                            _ => {
                                return Err(error("Shared group structure differs between columns"))
                            }
                        };
                        for schema_index in path {
                            let element = schema_elements
                                .get(*schema_index)
                                .ok_or_else(|| error("Schema element unavailable"))?;
                            let repeated = element["repetition_type"] == "2";
                            let node = tree_nodes
                                .get(schema_index)
                                .ok_or_else(|| error("Schema tree node unavailable"))?;
                            let definition_level =
                                number(&node["definitionLevel"], "Definition level")?;
                            let repetition_level =
                                number(&node["repetitionLevel"], "Repetition level")?;
                            let absent = definition < definition_level;
                            if repeated {
                                if !current.contains_key(schema_index) {
                                    let slot = new_slot(
                                        Slot::Repeated {
                                            items: Vec::new(),
                                            empty: absent,
                                        },
                                        &mut nodes,
                                    )?;
                                    current.insert(*schema_index, slot);
                                }
                                let slot = current
                                    .get_mut(schema_index)
                                    .ok_or_else(|| error("Repeated slot unavailable"))?;
                                let Slot::Repeated { items, empty } = slot else {
                                    return Err(error("Columns disagree on empty repeated group"));
                                };
                                if *empty != absent {
                                    return Err(error("Columns disagree on empty repeated group"));
                                }
                                if absent {
                                    positions.truncate(positions.len().min(repetition_level));
                                    break;
                                }
                                if positions.len() <= repetition_level {
                                    positions.resize(repetition_level + 1, None);
                                }
                                if positions[repetition_level].is_none() {
                                    positions[repetition_level] = Some(0);
                                }
                                let item_position = positions[repetition_level].unwrap();
                                if item_position >= items.len() {
                                    if item_position > items.len() {
                                        return Err(error(
                                            "Repeated instance coordinates have a gap",
                                        ));
                                    }
                                    let item = if element.get("type").is_some_and(|v| !v.is_null())
                                    {
                                        let value = physical_values
                                            .get(value_index)
                                            .ok_or_else(|| error("Missing physical value"))?;
                                        value_index += 1;
                                        physical_value(value, &mut nodes)?
                                    } else {
                                        new_slot(Slot::Record(BTreeMap::new()), &mut nodes)?
                                    };
                                    items.try_reserve(1).map_err(|_| allocation_error())?;
                                    items.push(item);
                                } else if element.get("type").is_some_and(|v| !v.is_null()) {
                                    return Err(error(
                                        "Duplicate physical value at repeated coordinate",
                                    ));
                                }
                                if element.get("type").is_some_and(|v| !v.is_null()) {
                                    let item = items
                                        .get(item_position)
                                        .ok_or_else(|| error("Missing physical value"))?;
                                    if !matches!(item, Slot::Physical(_)) {
                                        return Err(error("Missing physical value"));
                                    }
                                    break;
                                }
                                current = match items.get_mut(item_position) {
                                    Some(Slot::Record(fields)) => fields,
                                    _ => {
                                        return Err(error(
                                            "Shared group structure differs between columns",
                                        ))
                                    }
                                };
                            } else if absent {
                                if let Some(slot) = current.get(schema_index) {
                                    if !matches!(slot, Slot::Null) {
                                        return Err(error(
                                            "Columns disagree on optional group presence",
                                        ));
                                    }
                                } else {
                                    current
                                        .insert(*schema_index, new_slot(Slot::Null, &mut nodes)?);
                                }
                                positions.truncate(positions.len().min(repetition_level + 1));
                                break;
                            } else if element.get("type").is_some_and(|v| !v.is_null()) {
                                if current.contains_key(schema_index) {
                                    return Err(error("Duplicate physical value coordinate"));
                                }
                                let value = physical_values
                                    .get(value_index)
                                    .ok_or_else(|| error("Missing physical value"))?;
                                value_index += 1;
                                current.insert(*schema_index, physical_value(value, &mut nodes)?);
                                break;
                            } else {
                                if !current.contains_key(schema_index) {
                                    current.insert(
                                        *schema_index,
                                        new_slot(Slot::Record(BTreeMap::new()), &mut nodes)?,
                                    );
                                }
                                current = match current.get_mut(schema_index) {
                                    Some(Slot::Record(fields)) => fields,
                                    _ => {
                                        return Err(error(
                                            "Columns disagree on optional group presence",
                                        ))
                                    }
                                };
                            }
                        }
                    }
                    if value_index != physical_values.len() {
                        return Err(error("Unused physical values after row assembly"));
                    }
                }
                if row + 1 != group_rows.len() as isize {
                    return Err(error("Column row count differs from row group"));
                }
            }
            for row in group_rows {
                all_rows.push(finish(&row, &tree)?);
            }
        }
        Ok(all_rows)
    })();

    match assembled {
        Ok(rows) => {
            diagnostics.push(crate::parquet_capture_inspection::diagnostic(
                "PARQUET_ROW_LOGICAL_UNVERIFIED",
                "",
                "warning",
                "Physical records assembled by schema index; logical validation and LIST/MAP projections remain separate",
            ));
            let mut result = public_result(source, "assembled", diagnostics);
            if let Value::Object(fields) = &mut result {
                fields.push((Utf16::from("rows"), from_json(Json::Array(rows))));
            }
            Ok(result)
        }
        Err(failure) if failure.is_control_failure() => Err(failure),
        Err(failure) => {
            diagnostics.push(diagnostic(
                "PARQUET_ROW_ASSEMBLY",
                "",
                "error",
                &failure.message.to_utf8().unwrap_or_default(),
            ));
            Ok(public_result(source, "blocked", diagnostics))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        engine::{ResourceSet, SemanticContext},
        error::Diagnostic,
        parquet_physical::decode_parquet_physical,
        registry::Registry,
        serialization::{read_json_value, Format},
    };
    use std::{fs, path::PathBuf};

    struct NoCapabilities;
    impl Capabilities for NoCapabilities {
        fn validate_extension(
            &mut self,
            _: u64,
            _: &Value,
            _: &SemanticContext,
        ) -> Result<Vec<Diagnostic>, Utf16> {
            Ok(Vec::new())
        }
    }

    fn parse_value(source: &str) -> Value {
        read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn test_engine() -> Engine {
        Engine::new(
            ResourceSet::new(
                parse_value(include_str!("../../../spec/core/schema.json")),
                parse_value(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
                parse_value(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
                parse_value(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
                parse_value(include_str!(
                    "../../../spec/metamodel/generated/domain-policy.json"
                )),
            ),
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn fixture(path: &str) -> Vec<u8> {
        fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../")
                .join(path),
        )
        .unwrap()
    }

    fn native(value: &Json) -> Json {
        if value.is_null() {
            return Json::Null;
        }
        match value["kind"].as_str() {
            Some("physical") => {
                let physical = &value["value"];
                if let Some(boolean) = physical["value"].as_bool() {
                    Json::Bool(boolean)
                } else {
                    Json::Number(
                        physical["value"]
                            .as_str()
                            .unwrap()
                            .parse::<i64>()
                            .unwrap()
                            .into(),
                    )
                }
            }
            Some("repeated") => Json::Array(
                value["items"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(native)
                    .collect(),
            ),
            Some("record") => {
                let mut fields = serde_json::Map::new();
                for field in value["fields"].as_array().unwrap() {
                    fields.insert(
                        field["name"].as_str().unwrap().to_owned(),
                        native(&field["value"]),
                    );
                }
                Json::Object(fields)
            }
            _ => panic!("unexpected physical row value"),
        }
    }

    #[test]
    fn physical_row_assembly_matches_shared_column_and_refusal_fixtures() {
        let engine = test_engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        let manifest: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/rows/authored/manifest.json"
        ))
        .unwrap();
        for case in manifest["cases"].as_array().unwrap() {
            let id = case["id"].as_str().unwrap();
            let bytes = fixture(case["path"].as_str().unwrap());
            let document = crate::parquet_capture_inspection::capture_parquet(
                &bytes,
                &Utf16::from(id),
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let physical = decode_parquet_physical(
                &document,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            assert_eq!(to_json(&physical).unwrap()["status"], "decoded", "{id}");
            let result = assemble_parquet_rows(
                &document,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let public = to_json(&result).unwrap();
            assert_eq!(public["status"], case["status"], "{id}");
            assert_eq!(public["complete"], false, "{id}");
            if case["status"] == "assembled" {
                let rows = public["rows"].as_array().unwrap();
                let native_rows = rows.iter().map(native).collect::<Vec<_>>();
                assert_eq!(native_rows, case["nativeRows"], "{id}");
            } else {
                assert!(public.get("rows").is_none(), "{id}");
                assert_eq!(
                    public["diagnostics"].as_array().unwrap().last().unwrap()["code"],
                    "PARQUET_ROW_ASSEMBLY",
                    "{id}"
                );
            }
        }
    }

    #[test]
    fn physical_row_values_match_typescript_frozen_corpus_outputs() {
        let engine = test_engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        let manifest: Json =
            serde_json::from_str(include_str!("../../../fixtures/parquet/rows/results.json"))
                .unwrap();
        for case in manifest["results"].as_array().unwrap() {
            let id = case["id"].as_str().unwrap();
            let bytes = fixture(case["path"].as_str().unwrap());
            let document = crate::parquet_capture_inspection::capture_parquet(
                &bytes,
                &Utf16::from(id),
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let result = assemble_parquet_rows(
                &document,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let public = to_json(&result).unwrap();
            assert_eq!(public["status"], case["status"], "{id}");
            assert_eq!(public["complete"], false, "{id}");
            if case["status"] == "assembled" {
                let expected: Json =
                    serde_json::from_slice(&fixture(&format!("fixtures/parquet/rows/{id}.json")))
                        .unwrap();
                assert_eq!(public["rows"], expected, "{id}");
            } else {
                assert!(public.get("rows").is_none(), "{id}");
            }
        }
    }
}
