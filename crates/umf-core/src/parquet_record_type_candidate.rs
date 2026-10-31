// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in Parquet Record Type foundation. This module accepts bytes and a
//! caller-supplied Parquet schema view; it performs no file I/O or Thrift
//! decoding and never rewrites the captured bytes.

use crate::{context::Context, error::EngineError, value::Utf16};

pub const PROFILE: &str = "umf-r8-parquet-list-element-record-type-candidate/0.1.0";
pub const CORE_SCHEMA: &str = include_str!("../../../spec/core/schema.json");
pub const KIND_OPERATION_SCHEMA: &str =
    include_str!("../../../spec/core/kind-operation-v6.schema.json");
pub const CLASSIFICATION_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-record-type-classification.schema.json");

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SchemaElement {
    pub name: Utf16,
    /// Parquet repetition enum spelling: REQUIRED, OPTIONAL, REPEATED.
    pub repetition: Option<Utf16>,
    /// Present for groups; omitted for primitive leaves.
    pub num_children: Option<usize>,
    /// `None` for groups; physical enum spelling for primitive leaves.
    pub physical_type: Option<Utf16>,
    /// Only LIST/MAP/MAP_KEY_VALUE are interpreted by this profile.
    pub annotation: Option<Utf16>,
    /// Original Parquet SchemaElement field 6, retained as its numeric IDL value.
    /// This is transport metadata only; it does not broaden annotation semantics.
    pub converted_type: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParquetCapture {
    bytes: Vec<u8>,
    schema: Vec<SchemaElement>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RecordTypeCandidate {
    pub index: usize,
    pub path: Vec<Utf16>,
    pub container_index: usize,
    pub layout: Utf16,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CandidateResolution {
    StructMember(RecordTypeCandidate),
    Unsupported { reason: &'static str },
}

impl ParquetCapture {
    pub fn new(
        bytes: Vec<u8>,
        schema: Vec<SchemaElement>,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        validate_schema(&schema, ctx)?;
        let schema_cost = schema
            .iter()
            .map(|e| {
                e.name.len()
                    + e.repetition.as_ref().map_or(0, Utf16::len)
                    + e.physical_type.as_ref().map_or(0, Utf16::len)
                    + e.annotation.as_ref().map_or(0, Utf16::len)
                    + usize::from(e.converted_type.is_some())
                    + 1
            })
            .sum::<usize>();
        ctx.charge_work(bytes.len().saturating_add(schema_cost), Utf16::default())?;
        Ok(Self { bytes, schema })
    }

    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }
    pub fn schema(&self) -> &[SchemaElement] {
        &self.schema
    }

    /// Resolve the narrow interpreted LIST struct-member subset. Physical
    /// repetition remains in `schema`; this result is metadata only.
    pub fn resolve_record_type(
        &self,
        index: usize,
        ctx: &mut Context<'_>,
    ) -> Result<CandidateResolution, EngineError> {
        let nodes = nodes(&self.schema, ctx)?;
        let Some(node) = nodes.get(index) else {
            return Ok(CandidateResolution::Unsupported {
                reason: "Schema index is out of range",
            });
        };
        if index == 0 {
            return Ok(CandidateResolution::Unsupported {
                reason: "Root is not a record-valued member",
            });
        }
        if node.leaf {
            return Ok(CandidateResolution::Unsupported {
                reason: "Primitive schema nodes are not struct-valued members",
            });
        }
        let annotation = self.schema[index]
            .annotation
            .as_ref()
            .and_then(|v| v.to_utf8().ok());
        if matches!(
            annotation.as_deref(),
            Some("LIST" | "MAP" | "MAP_KEY_VALUE")
        ) {
            return Ok(CandidateResolution::Unsupported {
                reason: "LIST/MAP wrapper nodes are not record-valued members",
            });
        }
        if annotation.is_some() {
            return Ok(CandidateResolution::Unsupported {
                reason: "Unknown logical annotations are not interpreted",
            });
        }

        // A candidate belongs to exactly one valid LIST container. The
        // selected node must be the interpreted element, not the wrapper.
        for outer in nodes.iter().filter(|n| {
            self.schema[n.index]
                .annotation
                .as_ref()
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                == Some("LIST")
        }) {
            ctx.charge_work(1, Utf16::default())?;
            if outer.children.len() != 1 {
                continue;
            }
            let repeated = &nodes[outer.children[0]];
            if self.schema[repeated.index]
                .repetition
                .as_ref()
                .and_then(|v| v.to_utf8().ok())
                .as_deref()
                != Some("REPEATED")
            {
                continue;
            }
            let repeated_schema = &self.schema[repeated.index];
            let is_two_level = repeated.leaf
                || repeated.children.len() > 1
                || repeated.children.first().is_some_and(|child| {
                    self.schema[*child]
                        .repetition
                        .as_ref()
                        .and_then(|v| v.to_utf8().ok())
                        .as_deref()
                        == Some("REPEATED")
                })
                || repeated_schema.name.to_utf8().ok().is_some_and(|n| {
                    n == "array"
                        || n == format!(
                            "{}_tuple",
                            self.schema[outer.index].name.to_utf8().unwrap_or_default()
                        )
                });
            let element_index = if is_two_level {
                repeated.index
            } else if repeated.children.len() == 1 {
                repeated.children[0]
            } else {
                continue;
            };
            if element_index == index && !nodes[element_index].leaf {
                let mut indexes = Vec::new();
                let mut cursor = Some(index);
                while let Some(i) = cursor {
                    indexes.push(i);
                    cursor = nodes[i].parent;
                }
                indexes.reverse();
                let path = indexes
                    .into_iter()
                    .skip(1)
                    .map(|i| self.schema[i].name.clone())
                    .collect::<Vec<_>>();
                // Charge the returned path and preserve bounded traversal.
                ctx.charge_work(path.iter().map(Utf16::len).sum::<usize>(), Utf16::default())?;
                return Ok(CandidateResolution::StructMember(RecordTypeCandidate {
                    index,
                    path,
                    container_index: outer.index,
                    layout: Utf16::from(if is_two_level {
                        "two-level"
                    } else {
                        "three-level"
                    }),
                }));
            }
        }
        Ok(CandidateResolution::Unsupported {
            reason: "Selected node is not an interpreted LIST struct element",
        })
    }
}

#[derive(Clone)]
struct Node {
    index: usize,
    children: Vec<usize>,
    parent: Option<usize>,
    leaf: bool,
}

fn validate_schema(schema: &[SchemaElement], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    if schema.is_empty() {
        return Err(err("PARQUET_SCHEMA", "Schema is empty"));
    }
    if schema[0].physical_type.is_some() {
        return Err(err("PARQUET_SCHEMA", "Root must be a group"));
    }
    for (i, e) in schema.iter().enumerate().skip(1) {
        if !matches!(
            e.repetition
                .as_ref()
                .and_then(|v| v.to_utf8().ok())
                .as_deref(),
            Some("REQUIRED" | "OPTIONAL" | "REPEATED")
        ) {
            return Err(err(
                "PARQUET_SCHEMA",
                "Non-root repetition is missing or unknown",
            ));
        }
        if e.physical_type.is_some() == e.num_children.is_some() {
            return Err(err(
                "PARQUET_SCHEMA",
                "Node must be either a primitive or a group",
            ));
        }
        if e.physical_type
            .as_ref()
            .and_then(|v| v.to_utf8().ok())
            .is_some_and(|v| {
                ![
                    "BOOLEAN",
                    "INT32",
                    "INT64",
                    "INT96",
                    "FLOAT",
                    "DOUBLE",
                    "BYTE_ARRAY",
                    "FIXED_LEN_BYTE_ARRAY",
                ]
                .contains(&v.as_str())
            })
        {
            return Err(err("PARQUET_SCHEMA", "Unknown physical type"));
        }
        ctx.charge_work(i.saturating_add(e.name.len()), Utf16::default())?;
    }
    if schema[0].num_children.is_none() {
        return Err(err("PARQUET_SCHEMA", "Root group has no child count"));
    }
    let _ = nodes(schema, ctx)?;
    Ok(())
}

// Build a compact flat index using the schema's preorder layout.
fn nodes(schema: &[SchemaElement], ctx: &mut Context<'_>) -> Result<Vec<Node>, EngineError> {
    fn one(
        schema: &[SchemaElement],
        cursor: &mut usize,
        parent: Option<usize>,
        depth: usize,
        out: &mut Vec<Node>,
        ctx: &mut Context<'_>,
    ) -> Result<usize, EngineError> {
        if depth > 64 {
            return Err(err("PARQUET_SCHEMA", "Schema nesting exceeds 64"));
        }
        if *cursor >= schema.len() {
            return Err(err(
                "PARQUET_SCHEMA",
                "Group child count exceeds remaining schema",
            ));
        }
        ctx.charge_work(1, Utf16::default())?;
        let index = *cursor;
        *cursor += 1;
        let e = &schema[index];
        e.name
            .to_utf8()
            .map_err(|_| err("PARQUET_SCHEMA", "Schema name contains invalid UTF-16"))?;
        let leaf = e.physical_type.is_some();
        out.push(Node {
            index,
            children: Vec::new(),
            parent,
            leaf,
        });
        if !leaf {
            for _ in 0..e
                .num_children
                .ok_or_else(|| err("PARQUET_SCHEMA", "Group has no child count"))?
            {
                let child = one(schema, cursor, Some(index), depth + 1, out, ctx)?;
                out[index].children.push(child);
            }
        }
        Ok(index)
    }
    let mut out = Vec::new();
    let mut cursor = 0;
    one(schema, &mut cursor, None, 0, &mut out, ctx)?;
    if cursor != schema.len() {
        return Err(err(
            "PARQUET_SCHEMA",
            "Unattached schema elements remain after root tree",
        ));
    }
    Ok(out)
}

fn err(code: &'static str, message: &'static str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn e(
        name: &str,
        repetition: Option<&str>,
        children: Option<usize>,
        physical: Option<&str>,
        annotation: Option<&str>,
    ) -> SchemaElement {
        SchemaElement {
            name: name.into(),
            repetition: repetition.map(Into::into),
            num_children: children,
            physical_type: physical.map(Into::into),
            annotation: annotation.map(Into::into),
            converted_type: None,
        }
    }
    fn list_fixture() -> Vec<SchemaElement> {
        vec![
            e("root", None, Some(1), None, None),
            e("items", Some("OPTIONAL"), Some(1), None, Some("LIST")),
            e("list", Some("REPEATED"), Some(2), None, None),
            e("id", Some("REQUIRED"), None, Some("INT64"), None),
            e("label", Some("OPTIONAL"), None, Some("BYTE_ARRAY"), None),
        ]
    }
    #[test]
    fn preserves_capture_and_resolves_only_list_struct_elements() {
        let bytes = vec![b'P', b'A', b'R', b'1', 0, 255];
        let capture =
            ParquetCapture::new(bytes.clone(), list_fixture(), &mut Context::ordinary()).unwrap();
        let CandidateResolution::StructMember(candidate) = capture
            .resolve_record_type(2, &mut Context::ordinary())
            .unwrap()
        else {
            panic!("expected interpreted struct element")
        };
        assert_eq!(
            candidate.path,
            vec![Utf16::from("items"), Utf16::from("list")]
        );
        assert_eq!(candidate.layout, Utf16::from("two-level"));
        assert_eq!(capture.bytes(), bytes);
        assert!(matches!(
            capture
                .resolve_record_type(0, &mut Context::ordinary())
                .unwrap(),
            CandidateResolution::Unsupported { .. }
        ));
        assert!(matches!(
            capture
                .resolve_record_type(3, &mut Context::ordinary())
                .unwrap(),
            CandidateResolution::Unsupported { .. }
        ));
        assert!(matches!(
            capture
                .resolve_record_type(99, &mut Context::ordinary())
                .unwrap(),
            CandidateResolution::Unsupported { .. }
        ));
    }
    #[test]
    fn resolves_three_level_list_struct_element() {
        let schema = vec![
            e("root", None, Some(1), None, None),
            e("items", Some("OPTIONAL"), Some(1), None, Some("LIST")),
            e("list", Some("REPEATED"), Some(1), None, None),
            e("element", Some("OPTIONAL"), Some(2), None, None),
            e("id", Some("REQUIRED"), None, Some("INT64"), None),
            e("label", Some("OPTIONAL"), None, Some("BYTE_ARRAY"), None),
        ];
        let capture = ParquetCapture::new(vec![1], schema, &mut Context::ordinary()).unwrap();
        let CandidateResolution::StructMember(candidate) = capture
            .resolve_record_type(3, &mut Context::ordinary())
            .unwrap()
        else {
            panic!("expected interpreted struct element")
        };
        assert_eq!(
            candidate.path,
            vec![
                Utf16::from("items"),
                Utf16::from("list"),
                Utf16::from("element")
            ]
        );
        assert_eq!(candidate.layout, Utf16::from("three-level"));
    }
    #[test]
    fn rejects_malformed_schema_and_does_not_claim_map_semantics() {
        let mut malformed = list_fixture();
        malformed[1].num_children = Some(9);
        assert!(ParquetCapture::new(vec![], malformed, &mut Context::ordinary()).is_err());
        let mut map = list_fixture();
        map[1].annotation = Some("MAP".into());
        let capture = ParquetCapture::new(vec![1], map, &mut Context::ordinary()).unwrap();
        assert!(matches!(
            capture
                .resolve_record_type(2, &mut Context::ordinary())
                .unwrap(),
            CandidateResolution::Unsupported { .. }
        ));
    }
}
