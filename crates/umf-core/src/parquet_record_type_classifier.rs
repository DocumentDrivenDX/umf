// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in classifier for the retained-byte Parquet LIST struct-element subset.
//!
//! This resolves a schema index against a decoded Parquet footer. It does not
//! classify or edit a UMF Document, inspect author receipts, or emit the full
//! `parquet-record-type-classification` result. Unsupported schema shapes are
//! reported as such and the original bytes remain owned by the capture.

use crate::{
    context::Context,
    error::EngineError,
    parquet_record_type_candidate::{CandidateResolution, ParquetCapture, RecordTypeCandidate},
    parquet_schema_decode::decode_schema,
    value::Utf16,
};

pub const CLASSIFICATION_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-record-type-classification.schema.json");

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Classification {
    ListStructElement(RecordTypeCandidate),
    Unsupported { reason: &'static str },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClassifiedCapture {
    capture: ParquetCapture,
    result: Classification,
}

impl ClassifiedCapture {
    /// Decode the retained source's narrow schema view and classify `index`.
    /// Source bytes are copied under the same Context resource budget and stay
    /// available regardless of whether the selected node is supported.
    pub fn classify(
        bytes: &[u8],
        index: usize,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let decoded = decode_schema(bytes, ctx)?;
        // Charge before allocating the retained source copy. The candidate
        // constructor also meters its owned input and schema representation.
        ctx.charge_work(bytes.len(), Utf16::default())?;
        let capture = ParquetCapture::new(bytes.to_vec(), decoded.schema, ctx)?;
        let result = match capture.resolve_record_type(index, ctx)? {
            CandidateResolution::StructMember(candidate) => {
                Classification::ListStructElement(candidate)
            }
            CandidateResolution::Unsupported { reason } => Classification::Unsupported { reason },
        };
        Ok(Self { capture, result })
    }

    pub fn bytes(&self) -> &[u8] {
        self.capture.bytes()
    }

    pub fn schema(&self) -> &[crate::parquet_record_type_candidate::SchemaElement] {
        self.capture.schema()
    }

    pub fn result(&self) -> &Classification {
        &self.result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_pinned_list_element_and_retains_original_file_bytes() {
        let fixtures: [&[u8]; 3] = [
            include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet"),
            include_bytes!("../../../fixtures/parquet/containers/list-array.parquet"),
            include_bytes!("../../../fixtures/parquet/containers/list-items_tuple.parquet"),
        ];
        for source in fixtures {
            let classified =
                ClassifiedCapture::classify(source, 2, &mut Context::ordinary()).unwrap();
            assert_eq!(classified.bytes(), source);
            assert!(matches!(
                classified.result(),
                Classification::ListStructElement(candidate)
                    if candidate.index == 2 && candidate.path.len() >= 2
            ));
        }
    }

    #[test]
    fn refuses_root_primitive_and_out_of_range_indexes_without_losing_capture() {
        let source = include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet");
        for index in [0, 3, usize::MAX] {
            let classified =
                ClassifiedCapture::classify(source, index, &mut Context::ordinary()).unwrap();
            assert_eq!(classified.bytes(), source);
            assert!(matches!(
                classified.result(),
                Classification::Unsupported { .. }
            ));
        }
    }

    #[test]
    fn rejects_invalid_file_framing() {
        let error =
            ClassifiedCapture::classify(b"not parquet", 1, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "PARQUET_TRUNCATED");
    }
}
