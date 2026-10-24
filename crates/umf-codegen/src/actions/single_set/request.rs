use super::common::*;
use super::profile::RequestSelection;
use crate::actions::{analyze_unified_action, inspect_document};
use crate::canonical::sha256_source_text;
use crate::resources::CodegenEngine;
use crate::value::read_source_value;
use std::collections::BTreeSet;
use umf_core::serialization::Format;
use umf_core::{Context, EngineError, Utf16, Value};

pub(super) fn parse_request_selection(
    engine: &CodegenEngine<'_>,
    request: &Value,
    ctx: &mut Context<'_>,
) -> Result<RequestSelection, EngineError> {
    let mut node_count = 0;
    let mut estimated_bytes = 0;
    check_tree(request, 0, &mut node_count, &mut estimated_bytes, ctx)?;
    let _admitted_request = umf_core::copy_json(request, ctx)?;
    exact_object(request, &["source", "model", "action", "authorization"], "")?;
    let source = get(request, "source").ok_or_else(|| invalid("/source"))?;
    exact_object(source, &["mediaType", "utf8", "sha256"], "/source")?;
    if owned_text(
        get(source, "mediaType").ok_or_else(|| invalid("/source/mediaType"))?,
        "/source/mediaType",
    )? != "application/json"
    {
        return Err(invalid("/source/mediaType"));
    }
    let source_text = owned_text(
        get(source, "utf8").ok_or_else(|| invalid("/source/utf8"))?,
        "/source/utf8",
    )?;
    if source_text.len() > MAX_ARTIFACT_BYTES {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::from("/source/utf8"),
            "Source artifact exceeds 1 MiB",
        ));
    }
    let source_hash = hash_hex(&sha256_source_text(&Utf16::from(source_text.clone()), ctx)?);
    if owned_text(
        get(source, "sha256").ok_or_else(|| invalid("/source/sha256"))?,
        "/source/sha256",
    )? != source_hash
    {
        return Err(integrity("/source/sha256"));
    }

    let model = get(request, "model").ok_or_else(|| invalid("/model"))?;
    exact_object(
        model,
        &["documentId", "revision", "umfVersion", "sha256"],
        "/model",
    )?;
    if owned_text(
        get(model, "umfVersion").ok_or_else(|| invalid("/model/umfVersion"))?,
        "/model/umfVersion",
    )? != "0.10.0"
        || owned_text(
            get(model, "sha256").ok_or_else(|| invalid("/model/sha256"))?,
            "/model/sha256",
        )? != source_hash
    {
        return Err(integrity("/model"));
    }
    for name in ["documentId", "revision"] {
        bounded_identifier(
            get(model, name).ok_or_else(|| invalid("/model"))?,
            &format!("/model/{name}"),
        )?;
    }
    let model_copy = umf_core::copy_json(model, ctx)?;

    let action_pin = get(request, "action").ok_or_else(|| invalid("/action"))?;
    exact_object(
        action_pin,
        &["identity", "documentSha256", "invocation"],
        "/action",
    )?;
    let identity = get(action_pin, "identity").ok_or_else(|| invalid("/action/identity"))?;
    exact_object(identity, &["module", "action"], "/action/identity")?;
    let module_id = bounded_identifier(
        get(identity, "module").ok_or_else(|| invalid("/action/identity/module"))?,
        "/action/identity/module",
    )?;
    let action_id = bounded_identifier(
        get(identity, "action").ok_or_else(|| invalid("/action/identity/action"))?,
        "/action/identity/action",
    )?;
    if module_id.is_empty() || action_id.is_empty() {
        return Err(unsupported("/action/identity"));
    }
    if owned_text(
        get(action_pin, "documentSha256").ok_or_else(|| invalid("/action/documentSha256"))?,
        "/action/documentSha256",
    )? != source_hash
    {
        return Err(integrity("/action/documentSha256"));
    }
    let invocation = get(action_pin, "invocation").ok_or_else(|| invalid("/action/invocation"))?;
    exact_object(invocation, &["id", "version"], "/action/invocation")?;
    if bounded_identifier(
        get(invocation, "id").ok_or_else(|| invalid("/action/invocation/id"))?,
        "/action/invocation/id",
    )? != "umf.actions.tx"
        || bounded_identifier(
            get(invocation, "version").ok_or_else(|| invalid("/action/invocation/version"))?,
            "/action/invocation/version",
        )? != "1"
    {
        return Err(unsupported("/action/invocation"));
    }
    let action_copy = umf_core::copy_json(action_pin, ctx)?;

    let authorization = get(request, "authorization").ok_or_else(|| invalid("/authorization"))?;
    exact_object(
        authorization,
        &["profile", "resources", "evidence"],
        "/authorization",
    )?;
    let auth_profile =
        get(authorization, "profile").ok_or_else(|| invalid("/authorization/profile"))?;
    exact_object(auth_profile, &["id", "version"], "/authorization/profile")?;
    bounded_identifier(
        get(auth_profile, "id").ok_or_else(|| invalid("/authorization/profile/id"))?,
        "/authorization/profile/id",
    )?;
    bounded_identifier(
        get(auth_profile, "version").ok_or_else(|| invalid("/authorization/profile/version"))?,
        "/authorization/profile/version",
    )?;
    let auth_resources = array_text(
        get(authorization, "resources").ok_or_else(|| invalid("/authorization/resources"))?,
        "/authorization/resources",
        true,
    )?;
    let evidence = array_text_with_limit(
        get(authorization, "evidence").ok_or_else(|| invalid("/authorization/evidence"))?,
        "/authorization/evidence",
        true,
        4096,
    )?;
    if evidence
        .iter()
        .any(|value| value.chars().any(char::is_control))
    {
        return Err(invalid("/authorization/evidence"));
    }
    let document = read_source_value(&Utf16::from(source_text), Format::Json, ctx)?;
    let mut document_nodes = 0;
    let mut document_bytes = 0;
    check_tree(&document, 0, &mut document_nodes, &mut document_bytes, ctx)?;
    let pinned_document_id = bounded_identifier(
        get(model, "documentId").ok_or_else(|| invalid("/model/documentId"))?,
        "/model/documentId",
    )?;
    if bounded_identifier(
        get(&document, "id").ok_or_else(|| invalid("/source/id"))?,
        "/source/id",
    )? != pinned_document_id
    {
        return Err(integrity("/model/documentId"));
    }
    let selected = BTreeSet::from([(
        Utf16::from(module_id.as_str()),
        Utf16::from(action_id.as_str()),
    )]);
    let inspection = inspect_document(&document, engine.resources(), Some(&selected), ctx)?;
    if !inspection.validation.valid {
        return Err(invalid("/source"));
    }
    let declarations = inspection.actions;
    if declarations.len() != 1 {
        return Err(unsupported("/source"));
    }
    let declaration = declarations.into_iter().next().unwrap();
    let analysis_path = declaration.pointer.clone();
    let (obligations, diagnostics) = analyze_unified_action(
        engine.resources(),
        &document,
        &declaration.value,
        &analysis_path,
        ctx,
    )?;
    if diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == umf_core::Severity::Error)
    {
        let first = diagnostics
            .iter()
            .find(|diagnostic| diagnostic.severity == umf_core::Severity::Error)
            .unwrap();
        return Err(EngineError::new(
            first
                .code
                .to_utf8()
                .unwrap_or_else(|_| "ACTION_INVALID".into()),
            first.path.clone(),
            first.message.clone(),
        ));
    }

    let mut policy_obligation = None;
    for obligation in &obligations {
        if obligation.kind == Utf16::from("authorization")
            && obligation.status == Utf16::from("unchecked")
        {
            if policy_obligation.replace(obligation.path.clone()).is_some() {
                return Err(unsupported("/authorization"));
            }
        } else if obligation.status == Utf16::from("unchecked") {
            return Err(unsupported(&obligation.path.to_utf8().unwrap_or_default()));
        }
    }
    let policy_id = policy_obligation.ok_or_else(|| unsupported("/authorization"))?;

    Ok(RequestSelection {
        source: umf_core::copy_json(source, ctx)?,
        model: model_copy,
        action_pin: action_copy,
        authorization_profile: umf_core::copy_json(auth_profile, ctx)?,
        authorization_resources: auth_resources,
        evidence,
        document,
        module_id,
        action_id,
        declaration: declaration.value,
        obligations,
        policy_id,
    })
}
