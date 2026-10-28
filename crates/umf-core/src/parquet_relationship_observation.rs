// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native-preserving substrate for the opt-in Parquet relationship classifier.
//!
//! This slice exposes ordered native footer fields and a conservative status.
//! It does not construct a UMF document receipt or infer authored relationships.

use crate::parquet_schema_decode::{
    self, ArrowSchemaMetadata, DecodedSchema, NativeSchemaElement, NativeWireValue,
};
use crate::{context::Context, error::EngineError};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RelationshipObservationStatus {
    Ready,
    Blocked(&'static str),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeRelationshipObservation {
    /// Zero-based FileMetaData.schema index (the synthetic root is not emitted).
    pub index: usize,
    /// Original ordered Thrift fields, including fields unknown to this IDL.
    pub native_fields: Vec<(i16, NativeWireValue)>,
    /// Familiar field names where known and `field:<id>` labels otherwise.
    /// Unknown fields remain in `native_fields`; no value is discarded.
    pub named_fields: Vec<(String, NativeWireValue)>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RelationshipSchemaObservation {
    pub status: RelationshipObservationStatus,
    pub metadata: Vec<parquet_schema_decode::NativeKeyValueMetadata>,
    pub observations: Vec<NativeRelationshipObservation>,
}

/// Decode the footer using the native-retaining route. Arrow's embedded schema
/// and any other key/value metadata are retained in `metadata`; because this
/// classifier slice has no Arrow/metadata interpreter, its result is blocked.
pub fn observe(
    bytes: &[u8],
    ctx: &mut Context<'_>,
) -> Result<RelationshipSchemaObservation, EngineError> {
    let decoded = parquet_schema_decode::decode_schema_retaining(bytes, ctx)?;
    observe_decoded(&decoded)
}

pub fn observe_decoded(
    decoded: &DecodedSchema,
) -> Result<RelationshipSchemaObservation, EngineError> {
    let (metadata, arrow) = parquet_schema_decode::inspect_file_key_value_metadata(decoded);
    let status = match arrow {
        ArrowSchemaMetadata::Blocked { diagnostic } => {
            RelationshipObservationStatus::Blocked(diagnostic)
        }
        ArrowSchemaMetadata::Duplicate { .. } => RelationshipObservationStatus::Blocked(
            "Duplicate ARROW:schema metadata is not interpreted",
        ),
        ArrowSchemaMetadata::Unique { .. } => RelationshipObservationStatus::Blocked(
            "ARROW:schema metadata is retained but not interpreted",
        ),
        ArrowSchemaMetadata::Absent if !metadata.is_empty() => {
            RelationshipObservationStatus::Blocked(
                "Parquet key/value metadata is retained but not interpreted",
            )
        }
        ArrowSchemaMetadata::Absent => RelationshipObservationStatus::Ready,
    };
    let observations = decoded
        .native_schema_elements
        .iter()
        .enumerate()
        .skip(1)
        .map(|(index, element)| observation(index, element))
        .collect::<Result<Vec<_>, _>>()?;
    let has_unknown = decoded.native_schema_elements.iter().any(|element| {
        element
            .fields
            .iter()
            .any(|(id, _)| schema_field_name(*id).is_none())
    });
    let has_unknown_footer = decoded
        .native_file_metadata_fields
        .iter()
        .any(|(id, _)| !matches!(*id, 1..=9));
    let status = if has_unknown_footer {
        RelationshipObservationStatus::Blocked(
            "Unknown FileMetaData fields are retained but not interpreted",
        )
    } else if has_unknown {
        RelationshipObservationStatus::Blocked(
            "Unknown SchemaElement fields are retained but not interpreted",
        )
    } else {
        status
    };
    Ok(RelationshipSchemaObservation {
        status,
        metadata,
        observations,
    })
}

fn observation(
    index: usize,
    element: &NativeSchemaElement,
) -> Result<NativeRelationshipObservation, EngineError> {
    let mut named_fields = Vec::with_capacity(element.fields.len());
    for (id, value) in &element.fields {
        let Some(name) = schema_field_name(*id) else {
            // Keep the raw field untouched. Its presence is evidence that a
            // caller requiring a complete named projection must stop.
            named_fields.push((format!("field:{id}"), value.clone()));
            continue;
        };
        named_fields.push((name.to_owned(), value.clone()));
    }
    Ok(NativeRelationshipObservation {
        index,
        native_fields: element.fields.clone(),
        named_fields,
    })
}

fn schema_field_name(id: i16) -> Option<&'static str> {
    Some(match id {
        1 => "type",
        2 => "type_length",
        3 => "repetition_type",
        4 => "name",
        5 => "num_children",
        6 => "converted_type",
        7 => "scale",
        8 => "precision",
        9 => "field_id",
        10 => "logicalType",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parquet_schema_decode::{NativeSchemaElement, NativeWireValue as W};

    #[test]
    fn keeps_native_schema_field_order_and_unknown_values() {
        let element = NativeSchemaElement {
            fields: vec![
                (4, W::Binary(b"items".to_vec())),
                (3, W::I32(1)),
                (
                    77,
                    W::Map(8, 12, vec![(W::I32(9), W::Binary(vec![0xff, 0x00]))]),
                ),
            ],
        };
        let got = observation(4, &element).unwrap();
        assert_eq!(got.index, 4);
        assert_eq!(got.native_fields, element.fields);
        assert_eq!(
            got.named_fields
                .iter()
                .map(|(name, _)| name.as_str())
                .collect::<Vec<_>>(),
            ["name", "repetition_type", "field:77"]
        );
        assert_eq!(
            got.named_fields[2].1,
            W::Map(8, 12, vec![(W::I32(9), W::Binary(vec![0xff, 0x00]))])
        );
    }

    #[test]
    fn frozen_predecessor_report_schema_fields_remain_in_observation_order() {
        let frozen: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/rust-core/fixtures/parquet-relationship-predecessor.json"
        ))
        .unwrap();
        let expected = &frozen["cases"]["report"]["observations"];
        assert_eq!(expected.as_array().unwrap().len(), 11);
        let modules = frozen["cases"]["report"]["source"]["modules"]
            .as_array()
            .unwrap();
        let source = modules
            .iter()
            .find(|module| module["id"] == "parquet")
            .unwrap();
        let source = source["elements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|element| element["id"] == "source")
            .unwrap();
        let hex = source["extensions"]["umf.parquet"]["bytes"]
            .as_str()
            .unwrap();
        let bytes = hex
            .as_bytes()
            .chunks_exact(2)
            .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
            .collect::<Vec<_>>();
        let decoded =
            parquet_schema_decode::decode_schema_retaining(&bytes, &mut Context::ordinary())
                .unwrap();
        let observed = observe_decoded(&decoded).unwrap();
        assert_eq!(
            observed.status,
            RelationshipObservationStatus::Blocked(
                "ARROW:schema metadata is retained but not interpreted"
            )
        );
        assert_eq!(
            observed.observations.len(),
            expected.as_array().unwrap().len()
        );
        for (actual, expected) in observed
            .observations
            .iter()
            .zip(expected.as_array().unwrap())
        {
            assert_eq!(actual.index, expected["index"].as_u64().unwrap() as usize);
            let expected_fields = expected["nativeField"].as_object().unwrap();
            let actual_name = actual
                .native_fields
                .iter()
                .find(|(id, _)| *id == 4)
                .unwrap();
            assert_eq!(
                actual_name.1,
                W::Binary(
                    expected_fields["name"]
                        .as_str()
                        .unwrap()
                        .as_bytes()
                        .to_vec()
                )
            );
        }
        assert_eq!(expected[0]["nativeField"]["name"], "items");
        assert_eq!(expected[1]["nativeField"]["name"], "list");
        assert_eq!(expected[10]["nativeField"]["name"], "qty");
    }

    #[test]
    fn arrow_metadata_is_an_explicit_blocker() {
        let entry = W::Struct(vec![
            (1, W::Binary(b"ARROW:schema".to_vec())),
            (2, W::Binary(b"unparsed".to_vec())),
        ]);
        let decoded = DecodedSchema {
            schema: vec![],
            native_schema_elements: vec![],
            native_file_metadata_fields: vec![(5, W::List(12, vec![entry]))],
            trailing_footer_bytes: 0,
        };
        assert!(matches!(
            observe_decoded(&decoded).unwrap().status,
            RelationshipObservationStatus::Blocked(_)
        ));
    }

    #[test]
    fn unknown_schema_field_blocks_named_interpretation_without_losing_raw_value() {
        let unknown = (77, W::Binary(vec![0xff, 0x00]));
        let decoded = DecodedSchema {
            schema: vec![],
            native_schema_elements: vec![
                NativeSchemaElement { fields: vec![] },
                NativeSchemaElement {
                    fields: vec![(4, W::Binary(b"field".to_vec())), unknown.clone()],
                },
            ],
            native_file_metadata_fields: vec![],
            trailing_footer_bytes: 0,
        };
        let observed = observe_decoded(&decoded).unwrap();
        assert!(matches!(
            observed.status,
            RelationshipObservationStatus::Blocked(_)
        ));
        assert_eq!(observed.observations[0].native_fields[1], unknown);
    }

    #[test]
    fn unknown_footer_field_blocks_interpretation_without_losing_raw_value() {
        let unknown = (77, W::Binary(vec![0xff, 0x00]));
        let decoded = DecodedSchema {
            schema: vec![],
            native_schema_elements: vec![NativeSchemaElement { fields: vec![] }],
            native_file_metadata_fields: vec![unknown.clone()],
            trailing_footer_bytes: 0,
        };
        assert_eq!(
            observe_decoded(&decoded).unwrap().status,
            RelationshipObservationStatus::Blocked(
                "Unknown FileMetaData fields are retained but not interpreted"
            )
        );
        assert_eq!(decoded.native_file_metadata_fields[0], unknown);
    }
}
