// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded, inert admission for one generated graph-write/1 string SET.
//!
//! The operation is split into private source/profile, invocation, codec, and
//! bootstrap modules. It adapts shared action and literal kernels and performs
//! no authorization or effect.

use crate::resources::CodegenEngine;
use umf_core::{Context, EngineError, Utf16, Value};

mod action_shape;
mod codec;
mod common;
mod invocation;
mod prepare;
mod profile;
mod record;
mod record_shape;
mod request;

use common::{array, exact_object, obj, strval};

impl CodegenEngine<'_> {
    pub fn single_set_capabilities(
        &self,
        request: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        exact_object(request, &[], "")?;
        ctx.charge_work(512, Utf16::default())?;
        Ok(obj(vec![
            ("profile", strval("umf.actions.single-set-capabilities/1")),
            ("coreVersion", strval("0.10.0")),
            (
                "operations",
                array([
                    strval("prepareSingleSetAction"),
                    strval("admitGeneratedActionInvocation"),
                    strval("admitGeneratedRecordValues"),
                ]),
            ),
            (
                "resultProfiles",
                array([
                    strval("umf.actions.single-set-prepared/1"),
                    strval("umf.actions.single-set-invocation/1"),
                    strval("umf.actions.single-record-values/1"),
                ]),
            ),
            (
                "inputDigestProfile",
                strval("umf.actions.generated-invocation/1"),
            ),
            ("executionVerified", Value::Bool(false)),
        ]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn string_key_tuple_v1_uses_the_frozen_umfk1_framing() {
        let mut ctx = Context::ordinary();
        assert_eq!(
            codec::tuple_hex("A", &mut ctx).unwrap(),
            "554d464b3101040141"
        );
        assert_eq!(
            codec::tuple_hex("😀", &mut ctx).unwrap(),
            "554d464b31010404f09f9880"
        );
    }

    #[test]
    fn selector_profile_uses_action_parser_and_requires_exact_entity_ast() {
        let mut ctx = Context::ordinary();
        assert!(crate::actions::selector_uses_entity_parameter(
            &Utf16::from(" { \"entity\" : \"item\" } "),
            "item",
            &mut ctx,
        )
        .unwrap());
        assert!(!crate::actions::selector_uses_entity_parameter(
            &Utf16::from(
                r#"{"key":"item-key","components":[{"literal":{"string":"other-item"}}]}"#
            ),
            "item",
            &mut ctx,
        )
        .unwrap());
        assert!(!crate::actions::selector_uses_entity_parameter(
            &Utf16::from(r#"{"entity":"label_value"}"#),
            "item",
            &mut ctx,
        )
        .unwrap());
        assert!(!crate::actions::selector_uses_entity_parameter(
            &Utf16::from(r#"{"entity":"item","other":true}"#),
            "item",
            &mut ctx,
        )
        .unwrap());
    }
}
