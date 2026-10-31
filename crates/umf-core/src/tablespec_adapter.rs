// SPDX-License-Identifier: MIT OR Apache-2.0
//! Current monolithic TableSpec source mapping (CONTRACT-030).
//! Split-file loader behavior and Pydantic coercion are intentionally outside this kernel.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{NativeJsonNode, NativeJsonTree},
    registry::Registry,
    serialization::{self, Format},
    value::{Utf16, Value, copy_json},
};

const EXTENSION: &str = "umf.tablespec";
const EXTENSION_TOKEN: u64 = 0x5441_424c_4553_0101;
const CORE_VERSION: &str = "0.10.0";
const EXTENSION_VERSION: &str = "0.1.0";
const PROFILE: &str = "tablespec-table-1";
pub const TABLESPEC_WIRE_PROFILE: &str = "umf.tablespec-wire/1";
pub const TABLESPEC_WIRE_CAPABILITIES: &[&str] = &[
    "importTableSpec",
    "inspectTableSpec",
    "exportTableSpec",
    "getTableSpecTable",
    "getTableSpecColumn",
    "editTableSpecTable",
    "editTableSpecColumn",
    "importTableSpecBundle",
    "exportTableSpecBundle",
];

#[cfg(test)]
#[path = "tablespec_adapter_test.rs"]
mod tests;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TableSpecFormat {
    Json,
    Yaml,
}
impl TableSpecFormat {
    fn parse(self, source: &Utf16, ctx: &mut Context<'_>) -> Result<NativeJsonTree, EngineError> {
        match self {
            Self::Json => NativeJsonTree::parse_json(source.units(), ctx),
            Self::Yaml => NativeJsonTree::parse_yaml(source.units(), ctx),
        }
    }
    fn name(self) -> &'static str {
        match self {
            Self::Json => "json",
            Self::Yaml => "yaml",
        }
    }
}

pub struct TableSpecRuntime {
    engine: Engine,
    registry: Registry,
}

struct SplitEntry {
    path: Utf16,
    source: Value,
    column: NativeJsonTree,
}

struct SplitView {
    root: NativeJsonTree,
    entries: Vec<SplitEntry>,
}

impl TableSpecRuntime {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            let unit_count = source.encode_utf16().count();
            ctx.charge_text(unit_count, Utf16::default())?;
            let units = source.encode_utf16().collect::<Vec<_>>();
            serialization::read_json_value(&units, Format::Json, ctx)
        }
        let engine = Engine::new(
            ResourceSet::new(
                read(include_str!("../../../spec/core/schema.json"), ctx)?,
                read(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/core/extension-package.schema.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                    ctx,
                )?,
                read(
                    include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                    ctx,
                )?,
            ),
            ctx,
        )?;
        let package = read(
            include_str!("../../../spec/extensions/tablespec/package.json"),
            ctx,
        )?;
        let resources = engine.schema_resources_with_context(ctx)?;
        let mut registry = Registry::new();
        registry.register(
            &package,
            Some(EXTENSION_TOKEN),
            engine.package_schema(),
            &resources,
            ctx,
        )?;
        Ok(Self { engine, registry })
    }

    pub fn import(
        &self,
        source: &Utf16,
        id: &Utf16,
        format: TableSpecFormat,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let root = format.parse(source, ctx)?;
        let (table_name, columns) = table_columns(root.root(), ctx)?;
        validate_version(root.root())?;
        let mut names = std::collections::BTreeSet::new();
        ctx.charge_work(columns.len(), Utf16::default())?;
        let mut elements = Vec::with_capacity(columns.len());
        for (index, column) in columns.iter().enumerate() {
            let (name, data_type, description) = column_fields(column, ctx)?;
            ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
            if !names.insert(name.clone()) {
                return Err(err("TABLESPEC_COLUMN", "Duplicate column name"));
            }
            let scalar_type = scalar_family(&data_type);
            let id_len = 7usize.saturating_add(decimal_digits(index));
            ctx.charge_work(
                4usize.saturating_add(name.len()).saturating_add(id_len),
                Utf16::default(),
            )?;
            let column_id = format!("column:{index}");
            let mut fields = vec![
                (key("id"), Value::string_utf8(column_id)),
                (key("name"), Value::String(name)),
                (key("extensions"), Value::Object(Vec::new())),
            ];
            if let Some(description) = description {
                fields.push((key("description"), Value::String(description)));
            }
            if let Some(scalar_type) = scalar_type {
                fields.push((key("scalarType"), Value::string_utf8(scalar_type)));
            }
            elements.push(Value::Object(fields));
        }
        ctx.charge_text(id.len(), Utf16::default())?;
        ctx.charge_text(source.len(), Utf16::default())?;
        let root_value = root.tagged_value_preserving_extras(ctx)?;
        let payload = Value::Object(vec![
            (key("profile"), Value::string_utf8(PROFILE)),
            (key("root"), root_value),
            (key("originalSource"), Value::String(source.clone())),
            (key("originalFormat"), Value::string_utf8(format.name())),
        ]);
        let document = Value::Object(vec![
            (key("umf"), Value::string_utf8(CORE_VERSION)),
            (key("id"), Value::String(id.clone())),
            (
                key("vocabularies"),
                Value::Object(vec![(
                    key(EXTENSION),
                    Value::Object(vec![(
                        key("version"),
                        Value::string_utf8(EXTENSION_VERSION),
                    )]),
                )]),
            ),
            (
                key("extensions"),
                Value::Object(vec![(key(EXTENSION), payload)]),
            ),
            (
                key("modules"),
                Value::Array(vec![Value::Object(vec![
                    (key("id"), Value::string_utf8("table")),
                    (key("namespace"), Value::String(table_name)),
                    (key("elements"), Value::Array(elements)),
                ])]),
            ),
        ]);
        let validation = self.inspect(&document, ctx)?;
        if !validation.valid {
            return Err(err("TABLESPEC_DOCUMENT", "Invalid UMF representation"));
        }
        Ok(document)
    }

    pub fn import_bundle(
        &self,
        files: &Value,
        id: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let copied_files = copy_json(files, ctx)?;
        let split = split_view(&copied_files, ctx)?;
        let source = split.root.render_compact(ctx)?;
        let mut document = self.import(&source, id, TableSpecFormat::Json, ctx)?;
        let payload = object_field_mut(&mut document, "extensions")
            .and_then(|extensions| object_field_mut(extensions, EXTENSION))
            .ok_or_else(|| err("TABLESPEC_PAYLOAD", "Missing TableSpec payload"))?;
        let Value::Object(fields) = payload else {
            return Err(err(
                "TABLESPEC_PAYLOAD",
                "Expected TableSpec payload object",
            ));
        };
        fields.push((key("splitFiles"), copied_files));
        if !self.inspect(&document, ctx)?.valid {
            return Err(err("TABLESPEC_SPLIT", "Invalid split bundle"));
        }
        Ok(document)
    }

    pub fn inspect(
        &self,
        document: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Validation, EngineError> {
        let mut capabilities = StructuralOnly;
        let mut result =
            self.engine
                .validate_document(document, &self.registry, &mut capabilities, ctx)?;
        // CONTRACT-030 does not run the pinned TableSpec Pydantic model, casts,
        // conditions, or pipelines, so native semantic validation is incomplete.
        result.complete = false;
        Ok(result)
    }

    pub fn export(&self, document: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        let validation = self.inspect(document, ctx)?;
        if !validation.valid {
            return Err(err(
                "TABLESPEC_DOCUMENT",
                "Expected a valid pinned TableSpec document",
            ));
        }
        let payload = object_field(document, "extensions")
            .and_then(|v| object_field(v, EXTENSION))
            .ok_or_else(|| err("TABLESPEC_PAYLOAD", "Missing TableSpec source"))?;
        if let Value::Object(fields) = payload {
            if fields.iter().any(|(name, _)| {
                ![
                    "profile",
                    "root",
                    "originalSource",
                    "originalFormat",
                    "splitFiles",
                ]
                .iter()
                .any(|known| name == &Utf16::from(*known))
            }) {
                return Err(err(
                    "TABLESPEC_ENCODING",
                    "Unknown source encoding fields retained; export blocked",
                ));
            }
        }
        if object_field(payload, "splitFiles").is_some() {
            return Err(err(
                "TABLESPEC_SPLIT",
                "Use exportTableSpecBundle to preserve split-file semantics",
            ));
        }
        if !matches!(string_field(payload, "profile"), Some(s) if s == &Utf16::from(PROFILE)) {
            return Err(err("TABLESPEC_PAYLOAD", "Unexpected TableSpec profile"));
        }
        if !matches!(object_field(document, "vocabularies").and_then(|v| object_field(v, EXTENSION)).and_then(|v| string_field(v, "version")), Some(s) if s == &Utf16::from(EXTENSION_VERSION))
        {
            return Err(err(
                "TABLESPEC_DOCUMENT",
                "Expected TableSpec version 0.1.0",
            ));
        }
        let root_value = object_field(payload, "root")
            .ok_or_else(|| err("TABLESPEC_PAYLOAD", "Missing native table tree"))?;
        let root = NativeJsonTree::from_tagged_value(root_value, ctx)?;
        let (table_name, columns) = table_columns(root.root(), ctx)?;
        validate_version(root.root())?;
        let module = array_field(document, "modules")
            .and_then(|m| {
                m.iter().find(
                    |m| matches!(string_field(m, "id"), Some(id) if id == &Utf16::from("table")),
                )
            })
            .ok_or_else(|| err("TABLESPEC_METADATA", "Missing table module"))?;
        if string_field(module, "namespace") != Some(&table_name) {
            return Err(err(
                "TABLESPEC_METADATA",
                "Native source and core table metadata disagree",
            ));
        }
        let elements = array_field(module, "elements")
            .ok_or_else(|| err("TABLESPEC_METADATA", "Missing table elements"))?;
        if elements.len() != columns.len() {
            return Err(err(
                "TABLESPEC_METADATA",
                "Native source and core column metadata disagree",
            ));
        }
        let mut column_names = std::collections::BTreeSet::new();
        for (index, (column, element)) in columns.iter().zip(elements).enumerate() {
            let (name, data_type, description) = column_fields(column, ctx)?;
            ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
            if !column_names.insert(name.clone()) {
                return Err(err("TABLESPEC_COLUMN", "Duplicate column name"));
            }
            let expected_scalar = scalar_family(&data_type);
            if string_field(element, "id") != Some(&Utf16::from(format!("column:{index}")))
                || string_field(element, "name") != Some(&name)
                || string_field(element, "description") != description.as_ref()
                || string_field(element, "scalarType") != expected_scalar.map(Utf16::from).as_ref()
            {
                return Err(err(
                    "TABLESPEC_METADATA",
                    "Native source and core column metadata disagree",
                ));
            }
        }
        let original = string_field(payload, "originalSource")
            .ok_or_else(|| err("TABLESPEC_PAYLOAD", "Missing original source"))?;
        let original_format = string_field(payload, "originalFormat")
            .ok_or_else(|| err("TABLESPEC_FORMAT", "Missing original format"))?;
        let format = if original_format == &Utf16::from("json") {
            TableSpecFormat::Json
        } else if original_format == &Utf16::from("yaml") {
            TableSpecFormat::Yaml
        } else {
            return Err(err("TABLESPEC_FORMAT", "Expected json or yaml"));
        };
        if format.parse(original, ctx)? == root {
            ctx.charge_text(original.len(), Utf16::default())?;
            return Ok(original.clone());
        }
        let mut rendered = root.render_compact(ctx)?.into_units();
        ctx.charge_text(1, Utf16::default())?;
        rendered.push(b'\n' as u16);
        Ok(Utf16::new(rendered))
    }

    pub fn export_bundle(
        &self,
        document: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let validation = self.inspect(document, ctx)?;
        if !validation.valid {
            return Err(err(
                "TABLESPEC_DOCUMENT",
                "Expected a valid pinned TableSpec document",
            ));
        }
        let payload = object_field(document, "extensions")
            .and_then(|extensions| object_field(extensions, EXTENSION))
            .ok_or_else(|| err("TABLESPEC_PAYLOAD", "Missing TableSpec source"))?;
        if !matches!(string_field(payload, "profile"), Some(value) if value == &Utf16::from(PROFILE))
        {
            return Err(err("TABLESPEC_PAYLOAD", "Unexpected TableSpec profile"));
        }
        if !matches!(object_field(document, "vocabularies").and_then(|v| object_field(v, EXTENSION)).and_then(|v| string_field(v, "version")), Some(value) if value == &Utf16::from(EXTENSION_VERSION))
        {
            return Err(err(
                "TABLESPEC_DOCUMENT",
                "Expected TableSpec version 0.1.0",
            ));
        }
        if let Value::Object(fields) = payload {
            if fields.iter().any(|(name, _)| {
                ![
                    "profile",
                    "root",
                    "originalSource",
                    "originalFormat",
                    "splitFiles",
                ]
                .iter()
                .any(|known| name == &Utf16::from(*known))
            }) {
                return Err(err(
                    "TABLESPEC_ENCODING",
                    "Unknown source encoding fields retained; export blocked",
                ));
            }
        }
        let files = object_field(payload, "splitFiles")
            .ok_or_else(|| err("TABLESPEC_SPLIT", "Expected a split bundle"))?;
        let files = copy_json(files, ctx)?;
        let split = split_view(&files, ctx)?;
        let root_value = object_field(payload, "root")
            .ok_or_else(|| err("TABLESPEC_PAYLOAD", "Missing native table tree"))?;
        let root = NativeJsonTree::from_tagged_value(root_value, ctx)?;
        let _ = root.render_compact(ctx)?;
        let (_, columns) = table_columns(root.root(), ctx)?;
        validate_version(root.root())?;
        let table_name = table_columns(root.root(), ctx)?.0;
        let derived = derive_elements(columns, ctx)?;
        let module = array_field(document, "modules")
            .and_then(|modules| modules.iter().find(|module| matches!(string_field(module, "id"), Some(id) if id == &Utf16::from("table"))))
            .ok_or_else(|| err("TABLESPEC_METADATA", "Missing table module"))?;
        if string_field(module, "namespace") != Some(&table_name) {
            return Err(err(
                "TABLESPEC_METADATA",
                "Native source and core table metadata disagree",
            ));
        }
        let elements = array_field(module, "elements")
            .ok_or_else(|| err("TABLESPEC_METADATA", "Missing table elements"))?;
        if elements.len() != columns.len() || derived.len() != elements.len() {
            return Err(err(
                "TABLESPEC_METADATA",
                "Native source and core column metadata disagree",
            ));
        }
        let mut names = std::collections::BTreeSet::new();
        for ((column, element), expected) in columns.iter().zip(elements).zip(&derived) {
            let (name, _, _) = column_fields(column, ctx)?;
            ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
            if !names.insert(name.clone()) {
                return Err(err("TABLESPEC_COLUMN", "Duplicate column name"));
            }
            if !metadata_element_matches(element, expected) {
                return Err(err(
                    "TABLESPEC_METADATA",
                    "Native source and core column metadata disagree",
                ));
            }
        }
        if split.entries.len() != columns.len() {
            return Err(err(
                "TABLESPEC_SPLIT",
                "Column insertion/deletion needs explicit file mapping",
            ));
        }
        let mut output = files;
        // The top-level TableSpec file may contain a shadowed columns value;
        // preserve it and update only the unshadowed table metadata.
        let table_source = string_from_file(&output, &key("table.yaml"))?;
        let table_tree = NativeJsonTree::parse_yaml(table_source.units(), ctx)?;
        let mut table_tag = table_tree.tagged_value_preserving_extras(ctx)?;
        let current_table_tag = root.tagged_value_preserving_extras(ctx)?;
        sync_tagged_native_members(&mut table_tag, &current_table_tag, true, ctx)?;
        let updated_table = NativeJsonTree::from_tagged_value(&table_tag, ctx)?;
        if updated_table != table_tree {
            set_file(
                &mut output,
                &key("table.yaml"),
                rendered_with_newline(&updated_table, ctx)?,
            )?;
        }
        for (index, entry) in split.entries.into_iter().enumerate() {
            if entry.column
                == NativeJsonTree::from_tagged_value(&tagged_node(&columns[index], ctx)?, ctx)?
            {
                continue;
            }
            let mut source_tag = entry.source;
            let mut replacement = tagged_node(&columns[index], ctx)?;
            let original_column = tagged_member(&source_tag, "column")
                .ok_or_else(|| err("TABLESPEC_COLUMN", "Missing column in split source"))
                .and_then(|value| copy_json(value, ctx))?;
            if tagged_member(&source_tag, "derivation").is_some() {
                let updated_derivation = tagged_member(&replacement, "derivation")
                    .ok_or_else(|| {
                        err(
                            "TABLESPEC_SPLIT",
                            "Removing sibling derivation requires explicit file edit",
                        )
                    })
                    .and_then(|value| copy_json(value, ctx))?;
                set_native_member(&mut source_tag, "derivation", updated_derivation)?;
                if let Some(original_derivation) = tagged_member(&original_column, "derivation") {
                    let original_derivation = copy_json(original_derivation, ctx)?;
                    set_native_member(&mut replacement, "derivation", original_derivation)?;
                } else {
                    remove_native_member(&mut replacement, "derivation")?;
                }
            }
            set_native_member(&mut source_tag, "column", replacement)?;
            let updated_source = NativeJsonTree::from_tagged_value(&source_tag, ctx)?;
            let original_source = string_from_file(&output, &entry.path)?;
            let original_tree = NativeJsonTree::parse_yaml(original_source.units(), ctx)?;
            if updated_source != original_tree {
                set_file(
                    &mut output,
                    &entry.path,
                    rendered_with_newline(&updated_source, ctx)?,
                )?;
            }
        }
        Ok(output)
    }

    pub fn get_table(&self, document: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let payload = self.payload_for_read(document, ctx)?;
        let root = object_field(payload, "root")
            .ok_or_else(|| err("TABLESPEC_PAYLOAD", "Missing native table tree"))?;
        copy_json(root, ctx)
    }

    pub fn get_column(
        &self,
        document: &Value,
        index: usize,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let payload = self.payload_for_read(document, ctx)?;
        let root = object_field(payload, "root")
            .ok_or_else(|| err("TABLESPEC_PAYLOAD", "Missing native table tree"))?;
        let tree = NativeJsonTree::from_tagged_value(root, ctx)?;
        let (_, columns) = table_columns(tree.root(), ctx)?;
        validate_version(tree.root())?;
        derive_elements(columns, ctx)?;
        if index >= columns.len() {
            return Err(err("TABLESPEC_COLUMN", "Column index does not exist"));
        }
        let Value::Object(root_fields) = root else {
            return Err(err("TABLESPEC_ENCODING", "Expected tagged native tree"));
        };
        let members = value_field(root_fields, "members")
            .ok_or_else(|| err("TABLESPEC_ENCODING", "Missing tagged object members"))?;
        let Value::Object(members) = members else {
            return Err(err("TABLESPEC_ENCODING", "Expected tagged object members"));
        };
        let columns = value_field(members, "columns")
            .ok_or_else(|| err("TABLESPEC_COLUMN", "Missing columns"))?;
        let Value::Object(columns) = columns else {
            return Err(err("TABLESPEC_ENCODING", "Expected tagged columns node"));
        };
        let items = value_field(columns, "items")
            .ok_or_else(|| err("TABLESPEC_COLUMN", "Missing columns"))?;
        let Value::Array(items) = items else {
            return Err(err("TABLESPEC_ENCODING", "Expected tagged columns array"));
        };
        copy_json(
            items
                .get(index)
                .ok_or_else(|| err("TABLESPEC_COLUMN", "Column index does not exist"))?,
            ctx,
        )
    }

    pub fn edit_column(
        &self,
        document: &Value,
        index: usize,
        changes: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        // Run the same stale-metadata and source-encoding checks as export before
        // copying anything into a candidate.
        if has_split_files(document) {
            self.export_bundle(document, ctx)?;
        } else {
            self.export(document, ctx)?;
        }
        let changes = copy_json(changes, ctx)?;
        let Value::Object(changes) = changes else {
            return Err(err(
                "TABLESPEC_COLUMN_EDIT",
                "Expected a mapping of native column changes",
            ));
        };
        self.get_column(document, index, ctx)?;
        let mut candidate = copy_json(document, ctx)?;
        let root = extension_root_mut(&mut candidate)?;
        let columns = tagged_columns_mut(root)?;
        let column = columns
            .get_mut(index)
            .ok_or_else(|| err("TABLESPEC_COLUMN", "Column index does not exist"))?;
        let Value::Object(members) = value_field_mut(column, "members")
            .ok_or_else(|| err("TABLESPEC_COLUMN", "Expected a column object"))?
        else {
            return Err(err("TABLESPEC_COLUMN", "Expected a column object"));
        };
        merge_tagged_members(members, changes);
        let native = NativeJsonTree::from_tagged_value(root, ctx)?;
        let (table_name, native_columns) = table_columns(native.root(), ctx)?;
        validate_version(native.root())?;
        let derived = derive_elements(native_columns, ctx)?;
        sync_table_namespace(&mut candidate, table_name)?;
        sync_column_metadata(
            &mut candidate,
            index,
            derived
                .into_iter()
                .nth(index)
                .ok_or_else(|| err("TABLESPEC_COLUMN", "Column index does not exist"))?,
        )?;
        self.inspect(&candidate, ctx)?;
        if has_split_files(&candidate) {
            self.export_bundle(&candidate, ctx)?;
        } else {
            self.export(&candidate, ctx)?;
        }
        Ok(candidate)
    }

    pub fn edit_table(
        &self,
        document: &Value,
        changes: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        if has_split_files(document) {
            self.export_bundle(document, ctx)?;
        } else {
            self.export(document, ctx)?;
        }
        let changes = copy_json(changes, ctx)?;
        let Value::Object(changes) = changes else {
            return Err(err(
                "TABLESPEC_TABLE_EDIT",
                "Expected a mapping of native table changes",
            ));
        };
        if changes.iter().any(|(name, _)| name == &key("columns")) {
            return Err(err(
                "TABLESPEC_TABLE_EDIT",
                "Table metadata changes cannot replace columns",
            ));
        }
        let mut candidate = copy_json(document, ctx)?;
        let root = extension_root_mut(&mut candidate)?;
        let Value::Object(members) = value_field_mut(root, "members")
            .ok_or_else(|| err("TABLESPEC_TABLE", "Expected a table object"))?
        else {
            return Err(err("TABLESPEC_TABLE", "Expected a table object"));
        };
        merge_tagged_members(members, changes);
        let native = NativeJsonTree::from_tagged_value(root, ctx)?;
        let (table_name, columns) = table_columns(native.root(), ctx)?;
        validate_version(native.root())?;
        // A table-level edit changes only the table namespace. Existing element
        // extensions and unknown core metadata must remain byte-for-byte intact.
        let _ = derive_elements(columns, ctx)?;
        sync_table_namespace(&mut candidate, table_name)?;
        self.inspect(&candidate, ctx)?;
        if has_split_files(&candidate) {
            self.export_bundle(&candidate, ctx)?;
        } else {
            self.export(&candidate, ctx)?;
        }
        Ok(candidate)
    }

    fn payload_for_read<'a>(
        &self,
        document: &'a Value,
        ctx: &mut Context<'_>,
    ) -> Result<&'a Value, EngineError> {
        let validation = self.inspect(document, ctx)?;
        if !validation.valid {
            return Err(err(
                "TABLESPEC_DOCUMENT",
                "Expected a valid pinned TableSpec document",
            ));
        }
        if object_field(document, "vocabularies")
            .and_then(|v| object_field(v, EXTENSION))
            .and_then(|v| string_field(v, "version"))
            != Some(&Utf16::from(EXTENSION_VERSION))
        {
            return Err(err(
                "TABLESPEC_DOCUMENT",
                "Expected TableSpec version 0.1.0",
            ));
        }
        object_field(document, "extensions")
            .and_then(|v| object_field(v, EXTENSION))
            .ok_or_else(|| err("TABLESPEC_PAYLOAD", "Missing TableSpec source"))
    }
}

struct StructuralOnly;
impl Capabilities for StructuralOnly {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &umf_core::engine::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn has_split_files(document: &Value) -> bool {
    object_field(document, "extensions")
        .and_then(|extensions| object_field(extensions, EXTENSION))
        .is_some_and(|payload| object_field(payload, "splitFiles").is_some())
}

fn split_view(files: &Value, ctx: &mut Context<'_>) -> Result<SplitView, EngineError> {
    let Value::Object(fields) = files else {
        return Err(err(
            "TABLESPEC_PATH",
            "Expected a normalized relative bundle map",
        ));
    };
    if !(2..=1000).contains(&fields.len()) {
        return Err(err(
            "TABLESPEC_SPLIT",
            "Expected between 2 and 1000 bundle files",
        ));
    }
    ctx.charge_work(fields.len(), Utf16::default())?;
    let mut order = Vec::with_capacity(fields.len());
    for (index, (path, source)) in fields.iter().enumerate() {
        validate_bundle_path(path)?;
        if !matches!(source, Value::String(_)) {
            return Err(err(
                "TABLESPEC_PATH",
                "Expected every bundle path to map to source text",
            ));
        }
        order.push(index);
    }
    order.sort_by(|left, right| compare_codepoint_strings(&fields[*left].0, &fields[*right].0));
    let table_source = fields
        .iter()
        .find(|(path, _)| path == &Utf16::from("table.yaml"))
        .and_then(|(_, source)| match source {
            Value::String(text) => Some(text),
            _ => None,
        })
        .ok_or_else(|| err("TABLESPEC_SPLIT", "Missing table.yaml"))?;
    let table_tree = NativeJsonTree::parse_yaml(table_source.units(), ctx)?;
    if !matches!(table_tree.root(), NativeJsonNode::Object(_)) {
        return Err(err("TABLESPEC_TABLE", "Expected table.yaml mapping"));
    }
    let column_count = order
        .iter()
        .filter(|index| is_split_column_path(&fields[**index].0))
        .count();
    if column_count == 0 {
        return Err(err(
            "TABLESPEC_SPLIT",
            "Expected at least one columns/*.yaml file",
        ));
    }
    ctx.charge_work(column_count, Utf16::default())?;
    let mut root_tag = table_tree.tagged_value_preserving_extras(ctx)?;
    let mut columns = Vec::with_capacity(column_count);
    let mut entries = Vec::with_capacity(column_count);
    for index in order {
        let (path, source_value) = &fields[index];
        if !is_split_column_path(path) {
            continue;
        }
        let Value::String(source_text) = source_value else {
            unreachable!()
        };
        let source_tree = NativeJsonTree::parse_yaml(source_text.units(), ctx)?;
        let source_tag = source_tree.tagged_value_preserving_extras(ctx)?;
        let mut column_tag = tagged_member(&source_tag, "column")
            .ok_or_else(|| {
                err(
                    "TABLESPEC_COLUMN",
                    "Expected column mapping in split source",
                )
            })
            .and_then(|value| copy_json(value, ctx))?;
        if !matches!(&column_tag, Value::Object(_)) {
            return Err(err(
                "TABLESPEC_COLUMN",
                "Expected column mapping in split source",
            ));
        }
        if !matches!(tagged_member(&column_tag, "kind"), Some(Value::String(kind)) if kind == &Utf16::from("object"))
        {
            return Err(err(
                "TABLESPEC_COLUMN",
                "Expected column mapping in split source",
            ));
        }
        if let Some(sibling_derivation) = tagged_member(&source_tag, "derivation") {
            let copied = copy_json(sibling_derivation, ctx)?;
            let members = tagged_member_mut(&mut column_tag, "members").ok_or_else(|| {
                err(
                    "TABLESPEC_COLUMN",
                    "Expected column mapping in split source",
                )
            })?;
            let Value::Object(members) = members else {
                return Err(err(
                    "TABLESPEC_COLUMN",
                    "Expected column mapping in split source",
                ));
            };
            set_object_field(members, "derivation", copied);
        }
        columns.push(column_tag);
        entries.push(SplitEntry {
            path: {
                ctx.charge_work(path.len(), Utf16::default())?;
                path.clone()
            },
            source: source_tag,
            column: NativeJsonTree::from_tagged_value(columns.last().unwrap(), ctx)?,
        });
    }
    if entries.is_empty() {
        return Err(err(
            "TABLESPEC_SPLIT",
            "Expected at least one columns/*.yaml file",
        ));
    }
    let tagged_columns = Value::Object(vec![
        (key("kind"), Value::string_utf8("array")),
        (key("items"), Value::Array(columns)),
    ]);
    let root_members = tagged_member_mut(&mut root_tag, "members")
        .ok_or_else(|| err("TABLESPEC_TABLE", "Expected table.yaml mapping"))?;
    let Value::Object(root_members) = root_members else {
        return Err(err("TABLESPEC_TABLE", "Expected table.yaml mapping"));
    };
    set_object_field(root_members, "columns", tagged_columns);
    let root = NativeJsonTree::from_tagged_value(&root_tag, ctx)?;
    Ok(SplitView { root, entries })
}

fn validate_bundle_path(path: &Utf16) -> Result<(), EngineError> {
    if path.is_empty()
        || path.units().first() == Some(&(b'/' as u16))
        || path.units().contains(&(b'\\' as u16))
    {
        return Err(err(
            "TABLESPEC_PATH",
            "Expected normalized relative bundle paths",
        ));
    }
    for segment in path.units().split(|unit| *unit == b'/' as u16) {
        if segment.is_empty() || segment == [b'.' as u16] || segment == [b'.' as u16, b'.' as u16] {
            return Err(err(
                "TABLESPEC_PATH",
                "Expected normalized relative bundle paths",
            ));
        }
    }
    Ok(())
}

fn is_split_column_path(path: &Utf16) -> bool {
    const PREFIX: &[u16] = &[
        b'c' as u16,
        b'o' as u16,
        b'l' as u16,
        b'u' as u16,
        b'm' as u16,
        b'n' as u16,
        b's' as u16,
        b'/' as u16,
    ];
    let units = path.units();
    units.starts_with(PREFIX)
        && units.len() > PREFIX.len() + 5
        && !units[PREFIX.len()..].contains(&(b'/' as u16))
        && units.ends_with(&[
            b'.' as u16,
            b'y' as u16,
            b'a' as u16,
            b'm' as u16,
            b'l' as u16,
        ])
}

fn compare_codepoint_strings(left: &Utf16, right: &Utf16) -> std::cmp::Ordering {
    let mut left_index = 0;
    let mut right_index = 0;
    loop {
        match (
            next_codepoint(left.units(), &mut left_index),
            next_codepoint(right.units(), &mut right_index),
        ) {
            (Some(a), Some(b)) if a != b => return a.cmp(&b),
            (Some(_), Some(_)) => {}
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (None, None) => return std::cmp::Ordering::Equal,
        }
    }
}

fn next_codepoint(units: &[u16], index: &mut usize) -> Option<u32> {
    let first = *units.get(*index)?;
    *index += 1;
    if (0xD800..=0xDBFF).contains(&first) {
        if let Some(second) = units
            .get(*index)
            .copied()
            .filter(|unit| (0xDC00..=0xDFFF).contains(unit))
        {
            *index += 1;
            return Some(
                0x10000 + ((u32::from(first) - 0xD800) << 10) + (u32::from(second) - 0xDC00),
            );
        }
    }
    Some(u32::from(first))
}

fn tagged_member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let members = object_field(value, "members")?;
    object_field(members, name)
}
fn tagged_member_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    let members = object_field_mut(value, "members")?;
    object_field_mut(members, name)
}
fn set_native_member(value: &mut Value, name: &str, replacement: Value) -> Result<(), EngineError> {
    let members = tagged_member_mut(value, "members")
        .ok_or_else(|| err("TABLESPEC_ENCODING", "Expected tagged object members"))?;
    let Value::Object(fields) = members else {
        return Err(err("TABLESPEC_ENCODING", "Expected tagged object members"));
    };
    set_object_field(fields, name, replacement);
    Ok(())
}
fn remove_native_member(value: &mut Value, name: &str) -> Result<(), EngineError> {
    let members = tagged_member_mut(value, "members")
        .ok_or_else(|| err("TABLESPEC_ENCODING", "Expected tagged object members"))?;
    let Value::Object(fields) = members else {
        return Err(err("TABLESPEC_ENCODING", "Expected tagged object members"));
    };
    remove_object_field(fields, name);
    Ok(())
}
fn sync_tagged_native_members(
    target: &mut Value,
    current: &Value,
    skip_columns: bool,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let current_members = tagged_member(current, "members")
        .ok_or_else(|| err("TABLESPEC_TABLE", "Expected table object"))?;
    let Value::Object(current_fields) = current_members else {
        return Err(err("TABLESPEC_TABLE", "Expected table object"));
    };
    let target_members = tagged_member_mut(target, "members")
        .ok_or_else(|| err("TABLESPEC_TABLE", "Expected table object"))?;
    let Value::Object(target_fields) = target_members else {
        return Err(err("TABLESPEC_TABLE", "Expected table object"));
    };
    let obsolete_count = target_fields
        .iter()
        .filter(|(name, _)| {
            !(skip_columns && name == &key("columns"))
                && !current_fields.iter().any(|(current_name, _)| {
                    current_name == name && !(skip_columns && current_name == &key("columns"))
                })
        })
        .count();
    ctx.charge_work(obsolete_count, Utf16::default())?;
    let mut obsolete = Vec::with_capacity(obsolete_count);
    for (name, _) in target_fields.iter() {
        if skip_columns && name == &key("columns") {
            continue;
        }
        if !current_fields.iter().any(|(current_name, _)| {
            current_name == name && !(skip_columns && current_name == &key("columns"))
        }) {
            ctx.charge_work(name.len(), Utf16::default())?;
            obsolete.push(name.clone());
        }
    }
    for name in obsolete {
        target_fields.retain(|(field, _)| field != &name);
    }
    for (name, value) in current_fields {
        if skip_columns && name == &key("columns") {
            continue;
        }
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        let copied = copy_json(value, ctx)?;
        set_utf16_field(target_fields, name.clone(), copied);
    }
    Ok(())
}
fn tagged_node(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let (kind, value) = match node {
        NativeJsonNode::Null => ("null", None),
        NativeJsonNode::Boolean(value) => ("boolean", Some(Value::Bool(*value))),
        NativeJsonNode::String(value) => ("string", Some(Value::String(value.clone()))),
        NativeJsonNode::Number(value) => ("number", Some(Value::string_utf8(value))),
        NativeJsonNode::Array(items) => (
            "array",
            Some(Value::Array(
                items
                    .iter()
                    .map(|item| tagged_node(item, ctx))
                    .collect::<Result<_, _>>()?,
            )),
        ),
        NativeJsonNode::Object(members) => (
            "object",
            Some(Value::Object(
                members
                    .iter()
                    .map(|(name, value)| Ok((name.clone(), tagged_node(value, ctx)?)))
                    .collect::<Result<_, EngineError>>()?,
            )),
        ),
    };
    let mut fields = vec![(key("kind"), Value::string_utf8(kind))];
    match (node, value) {
        (NativeJsonNode::Null, _) => {}
        (NativeJsonNode::Array(_), Some(value)) => fields.push((key("items"), value)),
        (NativeJsonNode::Object(_), Some(value)) => fields.push((key("members"), value)),
        (_, Some(value)) => fields.push((key("value"), value)),
        _ => unreachable!(),
    }
    Ok(Value::Object(fields))
}
fn string_from_file<'a>(files: &'a Value, path: &Utf16) -> Result<&'a Utf16, EngineError> {
    match files {
        Value::Object(fields) => match fields
            .iter()
            .find(|(name, _)| name == path)
            .map(|(_, value)| value)
        {
            Some(Value::String(source)) => Ok(source),
            _ => Err(err(
                "TABLESPEC_PATH",
                "Expected a normalized relative bundle map",
            )),
        },
        _ => Err(err(
            "TABLESPEC_PATH",
            "Expected a normalized relative bundle map",
        )),
    }
}
fn set_file(files: &mut Value, path: &Utf16, source: Utf16) -> Result<(), EngineError> {
    let Value::Object(fields) = files else {
        return Err(err(
            "TABLESPEC_PATH",
            "Expected a normalized relative bundle map",
        ));
    };
    let Some((_, value)) = fields.iter_mut().find(|(name, _)| name == path) else {
        return Err(err("TABLESPEC_PATH", "Missing split source file"));
    };
    *value = Value::String(source);
    Ok(())
}
fn rendered_with_newline(
    tree: &NativeJsonTree,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let mut rendered = tree.render_compact(ctx)?.into_units();
    ctx.charge_text(1, Utf16::default())?;
    rendered.push(b'\n' as u16);
    Ok(Utf16::new(rendered))
}
fn metadata_element_matches(actual: &Value, expected: &Value) -> bool {
    ["id", "name", "description", "scalarType"]
        .into_iter()
        .all(|name| object_field(actual, name) == object_field(expected, name))
}
fn set_utf16_field(fields: &mut Vec<(Utf16, Value)>, name: Utf16, value: Value) {
    if let Some((_, existing)) = fields.iter_mut().find(|(field, _)| field == &name) {
        *existing = value;
    } else {
        fields.push((name, value));
    }
}

fn table_columns(
    root: &NativeJsonNode,
    ctx: &mut Context<'_>,
) -> Result<(Utf16, &[NativeJsonNode]), EngineError> {
    let members =
        object_members(root).ok_or_else(|| err("TABLESPEC_TABLE", "Expected table mapping"))?;
    let table_name = match native_field(members, "table_name") {
        Some(NativeJsonNode::String(name)) => {
            ctx.charge_work(name.len(), Utf16::default())?;
            name.clone()
        }
        _ => {
            return Err(err(
                "TABLESPEC_TABLE",
                "Expected table_name and a monolithic columns array",
            ));
        }
    };
    let columns = match native_field(members, "columns") {
        Some(NativeJsonNode::Array(columns)) => columns,
        _ => {
            return Err(err(
                "TABLESPEC_TABLE",
                "Expected table_name and a monolithic columns array",
            ));
        }
    };
    Ok((table_name, columns))
}
fn validate_version(root: &NativeJsonNode) -> Result<(), EngineError> {
    match object_members(root).and_then(|members| native_field(members, "version")) {
        Some(NativeJsonNode::String(version)) if version == &Utf16::from("1.0") => Ok(()),
        _ => Err(err(
            "TABLESPEC_VERSION",
            "Expected TableSpec table version 1.0",
        )),
    }
}
fn column_fields(
    column: &NativeJsonNode,
    ctx: &mut Context<'_>,
) -> Result<(Utf16, Utf16, Option<Utf16>), EngineError> {
    let members = object_members(column).ok_or_else(|| {
        err(
            "TABLESPEC_COLUMN",
            "Expected native column name and data_type",
        )
    })?;
    let name = match native_field(members, "name") {
        Some(NativeJsonNode::String(name)) => {
            ctx.charge_work(name.len(), Utf16::default())?;
            name.clone()
        }
        _ => {
            return Err(err(
                "TABLESPEC_COLUMN",
                "Expected native column name and data_type",
            ));
        }
    };
    let data_type = match native_field(members, "data_type") {
        Some(NativeJsonNode::String(data_type)) => {
            ctx.charge_work(data_type.len(), Utf16::default())?;
            data_type.clone()
        }
        _ => {
            return Err(err(
                "TABLESPEC_COLUMN",
                "Expected native column name and data_type",
            ));
        }
    };
    let description = match native_field(members, "description") {
        Some(NativeJsonNode::String(description)) => {
            ctx.charge_work(description.len(), Utf16::default())?;
            Some(description.clone())
        }
        _ => None,
    };
    Ok((name, data_type, description))
}
fn derive_elements(
    columns: &[NativeJsonNode],
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    ctx.charge_work(columns.len(), Utf16::default())?;
    let mut elements = Vec::with_capacity(columns.len());
    let mut names = std::collections::BTreeSet::new();
    for (index, column) in columns.iter().enumerate() {
        let (name, data_type, description) = column_fields(column, ctx)?;
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        if !names.insert(name.clone()) {
            return Err(err("TABLESPEC_COLUMN", "Duplicate column name"));
        }
        let scalar_type = scalar_family(&data_type);
        let id_len = 7usize.saturating_add(decimal_digits(index));
        ctx.charge_work(
            4usize.saturating_add(name.len()).saturating_add(id_len),
            Utf16::default(),
        )?;
        let id = format!("column:{index}");
        let mut fields = vec![
            (key("id"), Value::string_utf8(id)),
            (key("name"), Value::String(name)),
            (key("extensions"), Value::Object(Vec::new())),
        ];
        if let Some(description) = description {
            fields.push((key("description"), Value::String(description)));
        }
        if let Some(scalar_type) = scalar_type {
            fields.push((key("scalarType"), Value::string_utf8(scalar_type)));
        }
        elements.push(Value::Object(fields));
    }
    Ok(elements)
}
fn scalar_family(native: &Utf16) -> Option<&'static str> {
    match native.to_utf8().ok()?.as_str() {
        "VARCHAR" | "TEXT" | "CHAR" => Some("string"),
        "BOOLEAN" => Some("boolean"),
        "INTEGER" => Some("integer"),
        "DECIMAL" => Some("decimal"),
        "FLOAT" => Some("float"),
        "DATE" => Some("date"),
        "DATETIME" | "TIMESTAMP" => Some("timestamp"),
        _ => None,
    }
}
fn decimal_digits(mut number: usize) -> usize {
    let mut digits = 1;
    while number >= 10 {
        number /= 10;
        digits += 1;
    }
    digits
}
fn object_members(node: &NativeJsonNode) -> Option<&[(Utf16, NativeJsonNode)]> {
    if let NativeJsonNode::Object(fields) = node {
        Some(fields)
    } else {
        None
    }
}
fn native_field<'a>(
    fields: &'a [(Utf16, NativeJsonNode)],
    key: &str,
) -> Option<&'a NativeJsonNode> {
    fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v)
}
fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn object_field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = value {
        fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
    } else {
        None
    }
}
fn value_field<'a>(fields: &'a [(Utf16, Value)], name: &str) -> Option<&'a Value> {
    fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
}
fn string_field<'a>(value: &'a Value, name: &str) -> Option<&'a Utf16> {
    match object_field(value, name) {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn array_field(value: &Value, name: &str) -> Option<&Vec<Value>> {
    match object_field(value, name) {
        Some(Value::Array(items)) => Some(items),
        _ => None,
    }
}
fn object_field_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    if let Value::Object(fields) = value {
        fields
            .iter_mut()
            .find(|(k, _)| k == &key(name))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn value_field_mut<'a>(fields: &'a mut [(Utf16, Value)], name: &str) -> Option<&'a mut Value> {
    fields
        .iter_mut()
        .find(|(k, _)| k == &key(name))
        .map(|(_, v)| v)
}
fn extension_root_mut(document: &mut Value) -> Result<&mut Value, EngineError> {
    object_field_mut(document, "extensions")
        .and_then(|ext| object_field_mut(ext, EXTENSION))
        .and_then(|payload| object_field_mut(payload, "root"))
        .ok_or_else(|| err("TABLESPEC_PAYLOAD", "Missing native table tree"))
}
fn tagged_columns_mut(root: &mut Value) -> Result<&mut Vec<Value>, EngineError> {
    let members = object_field_mut(root, "members")
        .ok_or_else(|| err("TABLESPEC_ENCODING", "Missing tagged object members"))?;
    let columns = object_field_mut(members, "columns")
        .ok_or_else(|| err("TABLESPEC_COLUMN", "Missing columns"))?;
    let items = object_field_mut(columns, "items")
        .ok_or_else(|| err("TABLESPEC_COLUMN", "Missing columns"))?;
    match items {
        Value::Array(items) => Ok(items),
        _ => Err(err("TABLESPEC_ENCODING", "Expected tagged columns array")),
    }
}
fn merge_tagged_members(members: &mut Vec<(Utf16, Value)>, changes: Vec<(Utf16, Value)>) {
    for (key, value) in changes {
        if let Some((_, existing)) = members.iter_mut().find(|(name, _)| name == &key) {
            *existing = value;
        } else {
            members.push((key, value));
        }
    }
}
fn sync_table_namespace(document: &mut Value, table_name: Utf16) -> Result<(), EngineError> {
    let modules = object_field_mut(document, "modules")
        .ok_or_else(|| err("TABLESPEC_METADATA", "Missing table module"))?;
    let Value::Array(modules) = modules else {
        return Err(err("TABLESPEC_METADATA", "Missing table module"));
    };
    let module = modules
        .iter_mut()
        .find(
            |module| matches!(string_field(module, "id"), Some(id) if id == &Utf16::from("table")),
        )
        .ok_or_else(|| err("TABLESPEC_METADATA", "Missing table module"))?;
    *object_field_mut(module, "namespace")
        .ok_or_else(|| err("TABLESPEC_METADATA", "Missing table namespace"))? =
        Value::String(table_name);
    Ok(())
}
fn sync_column_metadata(
    document: &mut Value,
    index: usize,
    derived: Value,
) -> Result<(), EngineError> {
    let modules = object_field_mut(document, "modules")
        .ok_or_else(|| err("TABLESPEC_METADATA", "Missing table module"))?;
    let Value::Array(modules) = modules else {
        return Err(err("TABLESPEC_METADATA", "Missing table module"));
    };
    let module = modules
        .iter_mut()
        .find(
            |module| matches!(string_field(module, "id"), Some(id) if id == &Utf16::from("table")),
        )
        .ok_or_else(|| err("TABLESPEC_METADATA", "Missing table module"))?;
    let elements = object_field_mut(module, "elements")
        .ok_or_else(|| err("TABLESPEC_METADATA", "Missing table elements"))?;
    let Value::Array(elements) = elements else {
        return Err(err("TABLESPEC_METADATA", "Missing table elements"));
    };
    let element = elements
        .get_mut(index)
        .ok_or_else(|| err("TABLESPEC_METADATA", "Missing table element"))?;
    let Value::Object(derived) = derived else {
        return Err(err("TABLESPEC_METADATA", "Invalid derived table element"));
    };
    let mut id = None;
    let mut name = None;
    let mut description = None;
    let mut scalar_type = None;
    for (key, value) in derived {
        match key.to_utf8().ok().as_deref() {
            Some("id") => id = Some(value),
            Some("name") => name = Some(value),
            Some("description") => description = Some(value),
            Some("scalarType") => scalar_type = Some(value),
            _ => {}
        }
    }
    let Value::Object(fields) = element else {
        return Err(err("TABLESPEC_METADATA", "Invalid table element"));
    };
    set_object_field(
        fields,
        "id",
        id.ok_or_else(|| err("TABLESPEC_METADATA", "Missing derived id"))?,
    );
    set_object_field(
        fields,
        "name",
        name.ok_or_else(|| err("TABLESPEC_METADATA", "Missing derived name"))?,
    );
    if let Some(value) = description {
        set_object_field(fields, "description", value);
    } else {
        remove_object_field(fields, "description");
    }
    if let Some(value) = scalar_type {
        set_object_field(fields, "scalarType", value);
    } else {
        remove_object_field(fields, "scalarType");
    }
    Ok(())
}
fn set_object_field(fields: &mut Vec<(Utf16, Value)>, name: &str, value: Value) {
    let key = key(name);
    if let Some((_, existing)) = fields.iter_mut().find(|(field, _)| field == &key) {
        *existing = value;
    } else {
        fields.push((key, value));
    }
}
fn remove_object_field(fields: &mut Vec<(Utf16, Value)>, name: &str) {
    let key = key(name);
    if let Some(index) = fields.iter().position(|(field, _)| field == &key) {
        fields.remove(index);
    }
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
