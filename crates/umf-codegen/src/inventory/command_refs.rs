// Scratch implementation of current TableOperation reference extraction.
// This file is not registered in the official crate until the global projection
// and source-closure pass is complete.
use super::*;

#[derive(Clone)]
pub(super) struct CommandFieldUse {
    pub table: String,
    pub field: Value,
}
#[derive(Clone)]
pub(super) struct CommandKeyUse {
    pub table: String,
    pub key: String,
    pub reason: &'static str,
}
#[derive(Clone, Default)]
pub(super) struct CommandReferences {
    pub tables: Vec<String>,
    pub fields: Vec<CommandFieldUse>,
    pub keys: Vec<CommandKeyUse>,
}
impl CommandReferences {
    fn field(&mut self, table: &str, field: &Value, path: &str) -> Result<(), EngineError> {
        if !exact_fields(field, &["module", "element"]) {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                path,
                "Command Field reference is malformed",
            ));
        }
        self.fields.push(CommandFieldUse {
            table: table.to_owned(),
            field: field.clone(),
        });
        Ok(())
    }
    fn table(&mut self, table: &str) {
        self.tables.push(table.to_owned());
    }
}
fn source_value(
    value: &Value,
    table: &str,
    path: &str,
    refs: &mut CommandReferences,
) -> Result<(), EngineError> {
    if eq_text(get(value, "kind"), "sourceField") {
        refs.field(table, val(value, "field", path)?, path)?;
    }
    Ok(())
}
fn predicate(
    value: &Value,
    table: &str,
    path: &str,
    refs: &mut CommandReferences,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut pending = vec![(value, table.to_owned(), path.to_owned())];
    while let Some((node, table, path)) = pending.pop() {
        ctx.charge_work(1, Utf16::from(path.as_str()))?;
        match member_text(node, "op", &path)?.as_str() {
            "all" => {}
            "related" => {
                let related = member_text(node, "table", &format!("{path}/table"))?;
                refs.table(&related);
                for (index, pair) in items(
                    val(node, "matches", &format!("{path}/matches"))?,
                    &format!("{path}/matches"),
                )?
                .iter()
                .enumerate()
                {
                    let at = format!("{path}/matches/{index}");
                    refs.field(&table, val(pair, "source", &at)?, &at)?;
                    refs.field(&related, val(pair, "target", &at)?, &at)?;
                }
                pending.push((val(node, "where", &path)?, related, format!("{path}/where")));
            }
            "and" | "or" => {
                let children = items(
                    val(node, "args", &format!("{path}/args"))?,
                    &format!("{path}/args"),
                )?;
                for (index, child) in children.iter().enumerate().rev() {
                    pending.push((child, table.clone(), format!("{path}/args/{index}")));
                }
            }
            "not" => pending.push((
                val(node, "arg", &format!("{path}/arg"))?,
                table,
                format!("{path}/arg"),
            )),
            "isNull" | "in" | "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "startsWith" => {
                let op = member_text(node, "op", &path)?;
                refs.field(
                    &table,
                    val(node, "field", &format!("{path}/field"))?,
                    &format!("{path}/field"),
                )?;
                if op == "in" {
                    for (index, item) in items(
                        val(node, "values", &format!("{path}/values"))?,
                        &format!("{path}/values"),
                    )?
                    .iter()
                    .enumerate()
                    {
                        source_value(item, &table, &format!("{path}/values/{index}"), refs)?;
                    }
                } else if op != "isNull" {
                    source_value(
                        val(node, "value", &format!("{path}/value"))?,
                        &table,
                        &format!("{path}/value"),
                        refs,
                    )?;
                }
            }
            _ => {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &path,
                    "Unknown command predicate",
                ))
            }
        }
    }
    Ok(())
}
fn row_predicate(
    value: &Value,
    table: &str,
    path: &str,
    refs: &mut CommandReferences,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut pending = vec![(value, path.to_owned())];
    while let Some((node, path)) = pending.pop() {
        ctx.charge_work(1, Utf16::from(path.as_str()))?;
        match member_text(node, "op", &path)?.as_str() {
            "all" => {}
            "and" | "or" => {
                let children = items(
                    val(node, "args", &format!("{path}/args"))?,
                    &format!("{path}/args"),
                )?;
                for (index, child) in children.iter().enumerate().rev() {
                    pending.push((child, format!("{path}/args/{index}")));
                }
            }
            "not" => pending.push((
                val(node, "arg", &format!("{path}/arg"))?,
                format!("{path}/arg"),
            )),
            "isNull" | "in" | "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "startsWith" => refs
                .field(
                    table,
                    val(node, "field", &format!("{path}/field"))?,
                    &format!("{path}/field"),
                )?,
            _ => {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &path,
                    "Unknown row predicate",
                ))
            }
        }
    }
    Ok(())
}
fn row_expression(
    value: &Value,
    table: &str,
    path: &str,
    refs: &mut CommandReferences,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut pending = vec![(value, path.to_owned())];
    while let Some((node, path)) = pending.pop() {
        ctx.charge_work(1, Utf16::from(path.as_str()))?;
        match member_text(node, "op", &path)?.as_str() {
            "field" => refs.field(
                table,
                val(node, "field", &format!("{path}/field"))?,
                &format!("{path}/field"),
            )?,
            "literal" => {}
            "coalesce" | "concat" => {
                let children = items(
                    val(node, "args", &format!("{path}/args"))?,
                    &format!("{path}/args"),
                )?;
                for (index, child) in children.iter().enumerate().rev() {
                    pending.push((child, format!("{path}/args/{index}")));
                }
            }
            "add" | "subtract" | "multiply" => {
                pending.push((
                    val(node, "right", &format!("{path}/right"))?,
                    format!("{path}/right"),
                ));
                pending.push((
                    val(node, "left", &format!("{path}/left"))?,
                    format!("{path}/left"),
                ));
            }
            "conditional" => {
                row_predicate(
                    val(node, "when", &format!("{path}/when"))?,
                    table,
                    &format!("{path}/when"),
                    refs,
                    ctx,
                )?;
                pending.push((
                    val(node, "else", &format!("{path}/else"))?,
                    format!("{path}/else"),
                ));
                pending.push((
                    val(node, "then", &format!("{path}/then"))?,
                    format!("{path}/then"),
                ));
            }
            _ => {
                return Err(err(
                    "TABLE_INVENTORY_UNSUPPORTED",
                    &path,
                    "Unknown row expression",
                ))
            }
        }
    }
    Ok(())
}
fn field_list(
    value: &Value,
    key: &str,
    table: &str,
    path: &str,
    refs: &mut CommandReferences,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for (index, field) in items(
        val(value, key, &format!("{path}/{key}"))?,
        &format!("{path}/{key}"),
    )?
    .iter()
    .enumerate()
    {
        ctx.charge_work(1, Utf16::from(path))?;
        refs.field(table, field, &format!("{path}/{key}/{index}"))?;
    }
    Ok(())
}
fn assignments(
    body: &Value,
    target: &str,
    source: &str,
    path: &str,
    refs: &mut CommandReferences,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for (index, assignment) in items(
        val(body, "values", &format!("{path}/values"))?,
        &format!("{path}/values"),
    )?
    .iter()
    .enumerate()
    {
        ctx.charge_work(1, Utf16::from(path))?;
        let at = format!("{path}/values/{index}");
        refs.field(
            target,
            val(assignment, "field", &format!("{at}/field"))?,
            &format!("{at}/field"),
        )?;
        source_value(
            val(assignment, "value", &format!("{at}/value"))?,
            source,
            &format!("{at}/value"),
            refs,
        )?;
    }
    Ok(())
}
pub(super) fn command_references(
    command: &Value,
    path: &str,
    tables: &[Value],
    ctx: &mut Context<'_>,
) -> Result<CommandReferences, EngineError> {
    let version = member_text(command, "version", &format!("{path}/version"))?;
    let body = val(command, "body", &format!("{path}/body"))?;
    let kind = member_text(body, "kind", &format!("{path}/body/kind"))?;
    let mut refs = CommandReferences::default();
    if version == "umf.table-operation/0.2" {
        if kind != "update" {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                path,
                "Typed row operation must be UPDATE",
            ));
        }
        let table = member_text(body, "table", &format!("{path}/body/table"))?;
        refs.table(&table);
        // Current 0.2 grammar admits one isNull physical selector.
        refs.field(&table, val(val(body, "where", path)?, "field", path)?, path)?;
        for (index, assignment) in items(val(body, "values", path)?, path)?.iter().enumerate() {
            let at = format!("{path}/body/values/{index}");
            refs.field(&table, val(assignment, "field", &at)?, &at)?;
            row_expression(
                val(val(assignment, "value", &at)?, "expression", &at)?,
                &table,
                &format!("{at}/value/expression"),
                &mut refs,
                ctx,
            )?;
        }
        return Ok(refs);
    }
    if version != "umf.table-operation/0.1" {
        return Err(err(
            "TABLE_INVENTORY_UNSUPPORTED",
            path,
            "Command version is unsupported",
        ));
    }
    if kind == "query" {
        // The catalog projector preserves opaque SQL and binds it conservatively
        // to every source table.  A finite created-operation certificate remains
        // unavailable for this command kind.
        for table in tables {
            let table_id = member_text(table, "id", path)?;
            refs.table(&table_id);
        }
        for output in items(val(body, "outputs", path)?, path)? {
            for table in tables {
                let table_id = member_text(table, "id", path)?;
                let field = val(output, "field", path)?;
                let columns = items(val(table, "columns", path)?, path)?;
                if columns.iter().any(|column| {
                    get(column, "field").is_some_and(|candidate| ref_equal(candidate, field))
                }) {
                    refs.field(&table_id, field, path)?;
                }
            }
        }
        return Ok(refs);
    }
    let table = member_text(body, "table", &format!("{path}/body/table"))?;
    refs.table(&table);
    match kind.as_str() {
        "read" => {
            field_list(body, "fields", &table, path, &mut refs, ctx)?;
            for (index, order) in items(val(body, "orderBy", path)?, path)?.iter().enumerate() {
                refs.field(
                    &table,
                    val(order, "field", path)?,
                    &format!("{path}/body/orderBy/{index}/field"),
                )?;
            }
            predicate(
                val(body, "where", path)?,
                &table,
                &format!("{path}/body/where"),
                &mut refs,
                ctx,
            )?;
            if let Some(key) = get(body, "cursorKey") {
                refs.keys.push(CommandKeyUse {
                    table: table.clone(),
                    key: text(key).ok_or_else(|| {
                        err(
                            "TABLE_INVENTORY_UNSUPPORTED",
                            path,
                            "Cursor Key ID is malformed",
                        )
                    })?,
                    reason: "operation-requires-cursor-key",
                });
            }
        }
        "insert" => {
            assignments(body, &table, &table, path, &mut refs, ctx)?;
            field_list(body, "returning", &table, path, &mut refs, ctx)?;
        }
        "insertFrom" => {
            let source = val(body, "source", path)?;
            let source_table = member_text(source, "table", &format!("{path}/body/source/table"))?;
            refs.table(&source_table);
            predicate(
                val(source, "where", path)?,
                &source_table,
                &format!("{path}/body/source/where"),
                &mut refs,
                ctx,
            )?;
            assignments(body, &table, &source_table, path, &mut refs, ctx)?;
            field_list(body, "returning", &table, path, &mut refs, ctx)?;
        }
        "update" | "delete" => {
            predicate(
                val(body, "where", path)?,
                &table,
                &format!("{path}/body/where"),
                &mut refs,
                ctx,
            )?;
            if kind == "update" {
                assignments(body, &table, &table, path, &mut refs, ctx)?;
            }
            field_list(body, "returning", &table, path, &mut refs, ctx)?;
        }
        "upsert" => {
            refs.keys.push(CommandKeyUse {
                table: table.clone(),
                key: member_text(body, "conflictKey", &format!("{path}/body/conflictKey"))?,
                reason: "operation-requires-conflict-key",
            });
            assignments(body, &table, &table, path, &mut refs, ctx)?;
            field_list(body, "updateFields", &table, path, &mut refs, ctx)?;
            field_list(body, "returning", &table, path, &mut refs, ctx)?;
        }
        _ => {
            return Err(err(
                "TABLE_INVENTORY_UNSUPPORTED",
                path,
                "Unknown command body",
            ))
        }
    }
    Ok(refs)
}
