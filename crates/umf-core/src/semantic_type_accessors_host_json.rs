//! Staged `umf.host-json/1` entry points for the retained semantic-type
//! extension accessors. Rust owns JSON admission; identity and annotation
//! handles are observed only at the predecessor's operation checkpoints.
use crate::{
    host_json::{
        copy_host_json, read_host_string_value_metered, HostHandle, HostJsonEvent, HostJsonKind,
        HostJsonReflection, HostJsonReply,
    },
    value::{Utf16, Value},
    Context, Engine, EngineError,
};
use std::cell::RefCell;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SemanticTypeAccessorHostOperation {
    Get,
    Set,
}

fn handle(handles: &[HostHandle], index: usize) -> Result<HostHandle, EngineError> {
    handles.get(index).copied().ok_or_else(|| {
        EngineError::new(
            "REQUEST",
            Utf16::default(),
            "Missing semantic type accessor host input",
        )
    })
}

/// Observe a raw JS identity only after the semantic accessor has reached its
/// lookup checkpoint. Non-string values remain non-matching strict-equality
/// operands; they are not converted or recursively admitted.
fn identity_string(
    host: &mut dyn HostJsonReflection,
    handle: HostHandle,
    ctx: &mut Context<'_>,
) -> Result<Option<Utf16>, EngineError> {
    match host.reflect(HostJsonEvent::Classify { handle })? {
        HostJsonReply::Kind(HostJsonKind::String(value)) => {
            // Every candidate ID already passed document text admission. A
            // longer scalar cannot compare equal and need not be allocated.
            if value.units > ctx.limits().max_text_units {
                return Ok(None);
            }
            read_host_string_value_metered(host, value, &Utf16::default(), ctx).map(Some)
        }
        // JavaScript's `===` does not coerce non-string values or inspect
        // objects. Classification is type-only and does not touch properties.
        HostJsonReply::Kind(_) => Ok(None),
        _ => Err(EngineError::new(
            "HOST_JSON_PROTOCOL",
            Utf16::default(),
            "Malformed host JSON classification response",
        )),
    }
}

/// Execute a retained accessor over host-owned inputs using one Rust operation
/// context. `Get` copies/validates the document before reading either identity.
/// `Set` also checks profile and target before it copies the annotation.
pub fn execute(
    operation: SemanticTypeAccessorHostOperation,
    handles: &[HostHandle],
    host: &mut dyn HostJsonReflection,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let document = copy_host_json(handle(handles, 0)?, host, ctx)?;
    let host = RefCell::new(host);
    let module_handle = handle(handles, 1)?;
    let element_handle = handle(handles, 2)?;
    match operation {
        SemanticTypeAccessorHostOperation::Get => {
            crate::semantic_type_accessors::get_semantic_types_copied_with_identity(
                document,
                engine,
                ctx,
                |ctx| {
                    ctx.charge_work(1, Utf16::default())?;
                    identity_string(&mut **host.borrow_mut(), module_handle, ctx)
                },
                |ctx| {
                    ctx.charge_work(1, Utf16::default())?;
                    identity_string(&mut **host.borrow_mut(), element_handle, ctx)
                },
            )
        }
        SemanticTypeAccessorHostOperation::Set => {
            let annotation_handle = handle(handles, 3)?;
            crate::semantic_type_accessors::set_semantic_types_copied_with_identity_and_annotation(
                document,
                engine,
                ctx,
                |ctx| {
                    ctx.charge_work(1, Utf16::default())?;
                    identity_string(&mut **host.borrow_mut(), module_handle, ctx)
                },
                |ctx| {
                    ctx.charge_work(1, Utf16::default())?;
                    identity_string(&mut **host.borrow_mut(), element_handle, ctx)
                },
                |ctx| copy_host_json(annotation_handle, &mut **host.borrow_mut(), ctx),
            )
        }
    }
}
