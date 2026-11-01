// SPDX-License-Identifier: MIT OR Apache-2.0
//! Native transport for the standalone binding index target adapters.
use crate::{decode, encode, field, result_envelope};
use umf_core::{
    binding_index_projection::BindingIndexProjectionResources, binding_postgresql_indexes,
    binding_sqlserver_planned_indexes, native_json::NativeJsonTree, sqlserver_adapter,
    value::copy_json, Context, EngineError, Utf16, Value,
};

pub const PROFILE: &str = "umf.binding-index-projection-wire/1";
fn err(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}
fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(v)) => Ok(v),
        _ => Err(err(&format!("{name} must be text"))),
    }
}
fn execute(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    if text(field(value, "profile"), "profile")? != &Utf16::from(PROFILE) {
        return Err(err("wrong projection profile"));
    }
    let op = text(field(value, "op"), "op")?
        .to_utf8()
        .map_err(|_| err("operation must be UTF-8"))?;
    if op == "binding-index-projection.prepareBindingIndexesToPostgresql" {
        let logical = field(value, "logical").ok_or_else(|| err("logical is required"))?;
        let binding = field(value, "binding").ok_or_else(|| err("binding is required"))?;
        let native_archive =
            field(value, "nativeArchive").ok_or_else(|| err("nativeArchive is required"))?;
        let resources = BindingIndexProjectionResources::new(ctx)?;
        return binding_postgresql_indexes::prepare(
            &resources,
            logical,
            binding,
            native_archive,
            ctx,
        );
    }
    if op == "binding-index-projection.completeBindingIndexesToPostgresql" {
        let prepared = field(value, "prepared").ok_or_else(|| err("prepared is required"))?;
        let parser_archives =
            field(value, "parserArchives").ok_or_else(|| err("parserArchives are required"))?;
        let loss = text(field(value, "lossPolicy"), "lossPolicy")?
            .to_utf8()
            .map_err(|_| err("lossPolicy must be UTF-8"))?;
        return binding_postgresql_indexes::complete(prepared, parser_archives, &loss, ctx);
    }
    if op != "binding-index-projection.projectBindingIndexesToSqlServer" {
        return Err(err("unknown projection operation"));
    }
    let logical = field(value, "logical").ok_or_else(|| err("logical is required"))?;
    let binding = field(value, "binding").ok_or_else(|| err("binding is required"))?;
    let planned =
        field(value, "plannedColumns").ok_or_else(|| err("plannedColumns is required"))?;
    let loss = text(field(value, "lossPolicy"), "lossPolicy")?
        .to_utf8()
        .map_err(|_| err("lossPolicy must be UTF-8"))?;
    let archive = field(value, "nativeArchive").ok_or_else(|| err("nativeArchive is required"))?;
    let source = text(field(value, "nativeSource"), "nativeSource")?;
    let archived = sqlserver_adapter::export_document(archive, ctx)?;
    let parsed = NativeJsonTree::parse_json(source.units(), ctx)?.render_compact(ctx)?;
    let archived_compact = archived
        .units()
        .strip_suffix(&[10])
        .unwrap_or(archived.units());
    if parsed.units() != archived_compact {
        return Err(EngineError::new(
            "SQLSERVER_SOURCE",
            Utf16::default(),
            "Native source and retained catalog differ",
        ));
    }
    let resources = BindingIndexProjectionResources::new(ctx)?;
    let mut result =
        binding_sqlserver_planned_indexes::project_binding_indexes_against_sqlserver_plan(
            &resources, logical, binding, planned, &loss, ctx,
        )?;
    if let Value::Object(fields) = &mut result {
        fields.push((Utf16::from("nativeArchive"), copy_json(archive, ctx)?));
        fields.push((Utf16::from("nativeSource"), Value::String(source.clone())));
    }
    Ok(result)
}
pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}
pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let value = decode(wire, &mut ctx)?;
        execute(&value, &mut ctx).and_then(|out| encode(&out, &mut ctx))
    })();
    result_envelope(result)
}
