// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in wire boundary for the bounded shared security truth operators.

use umf_core::{Context, EngineError, Utf16, Value, security_logic};

use crate::{decode, encode, fail, field, result_envelope};

pub const SECURITY_LOGIC_PROFILE: &str = "umf.security-logic/1.0.0";

/// Execute the scalar CONTRACT-062 negation without the generic JSON wire.
/// The host admits the raw value before calling this function; Rust still
/// validates the token, owns the truth decision, and charges operation work.
pub fn execute_security_not_scalar_with_control(
    value: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        context.charge_work(1, Utf16::default())?;
        let input = Value::String(Utf16::from(value));
        let output = security_logic::security_not(&input)?;
        let Value::String(output) = output else {
            return Err(fail("SECURITY_TRUTH", "Invalid security truth"));
        };
        output
            .to_utf8()
            .map_err(|_| fail("SECURITY_TRUTH", "Invalid security truth"))
    })();
    match result {
        Ok(value) => value,
        Err(error) => result_envelope(Err(error)),
    }
}

pub fn execute_security_not_scalar(value: &str) -> String {
    execute_security_not_scalar_with_control(value, &mut |_amount| Ok(()))
}

fn exact_members(value: &Value, required: &[&str], allowed: &[&str]) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail(
            "REQUEST",
            "Security request members must be an object",
        ));
    };
    for (index, (key, _)) in fields.iter().enumerate() {
        if !allowed.iter().any(|name| key == &Utf16::from(*name))
            || fields[..index].iter().any(|(prior, _)| prior == key)
        {
            return Err(fail(
                "REQUEST",
                "Unknown or duplicate security request member",
            ));
        }
    }
    if required.iter().any(|name| field(value, name).is_none()) {
        return Err(fail(
            "REQUEST",
            "Required security request member is missing",
        ));
    }
    Ok(())
}

/// Execute one security truth operation using `umf.core-wire/1` tagged values.
/// This operation performs no policy selection or host authorization.
pub fn execute_security_logic_wire(wire_json: &str) -> String {
    let mut no_control = |_amount: usize| Ok(());
    execute_security_logic_wire_with_control(wire_json, &mut no_control)
}

/// Execute a security truth operation with cumulative invocation work control.
pub fn execute_security_logic_wire_with_control(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    execute_security_logic_request(wire_json, control, false)
}

pub fn execute_candidate_security_logic_wire(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    execute_security_logic_request(wire_json, control, true)
}

fn execute_security_logic_request(
    wire_json: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
    candidate: bool,
) -> String {
    let result = (|| {
        let mut context = Context::ordinary().with_host_control(control);
        let request = if candidate {
            // Catalog DTOs combine separately bounded source and fact cuts.
            // Their own limits apply after the aggregate transport is decoded.
            if wire_json.len() > 64_000_000 {
                return Err(fail("LIMIT", "Candidate catalog transport is too large"));
            }
            context.with_tagged_transport_limit(|context| decode(wire_json, context))?
        } else {
            decode(wire_json, &mut context)?
        };
        exact_members(
            &request,
            &["profile", "op", "args"],
            &["profile", "op", "args"],
        )?;
        if field(&request, "profile") != Some(&Value::string_utf8(SECURITY_LOGIC_PROFILE)) {
            return Err(fail("REQUEST", "Unsupported security logic profile"));
        }
        let operation = match field(&request, "op") {
            Some(Value::String(text)) => text
                .to_utf8()
                .map_err(|_| fail("REQUEST", "Security operation must be valid UTF-16"))?,
            _ => return Err(fail("REQUEST", "Security operation is required")),
        };
        if candidate
            && matches!(
                operation.as_str(),
                "securityNot"
                    | "securityAnd"
                    | "securityOr"
                    | "composeSecurityRules"
                    | "securityRefIdentity"
            )
        {
            return Err(fail(
                "REQUEST",
                "Candidate transport requires a private catalog operation",
            ));
        }
        let args = field(&request, "args")
            .ok_or_else(|| fail("REQUEST", "Security arguments are required"))?;
        let (required, allowed): (&[&str], &[&str]) = match operation.as_str() {
            "securityNot" => (&["value"], &["value"]),
            "securityRefIdentity" => (&["ref"], &["ref"]),
            "securityAnd" | "securityOr" => (&["values"], &["values"]),
            "composeSecurityRules" => (&["rules"], &["rules", "protectedFields"]),
            "prepareCandidateCatalogProgram"
            | "planCandidateCatalogProgram"
            | "prepareCandidateCatalogOntology"
            | "planCandidateCatalogOntology"
            | "resolveCandidateCatalogEntityTerm" => (&["input"], &["input"]),
            "compileCandidateCompactCondition" => (
                &["condition", "associationCount"],
                &["condition", "associationCount"],
            ),
            "validateCandidateCatalogStorage" => (
                &["program", "owner", "maxSteps"],
                &["program", "owner", "maxSteps"],
            ),
            "admitCandidateCatalogCut"
            | "planCandidateCatalogRequest"
            | "planCandidateEmptyDisclosures"
            | "admitCandidateCatalogDateProfiles"
            | "candidateAssociationOperandDomain" => (&["input"], &["input"]),
            "selectCandidateCatalogDisclosures"
            | "renderCandidateCatalogCells"
            | "checkCandidateDisclosureIdentities"
            | "assembleCandidateDisclosureBatch"
            | "admitCandidateCatalogOperationBatch"
            | "admitCandidateCatalogScanBatch"
            | "composeCandidateCatalogOperationBatch"
            | "composeCandidateCatalogScanBatch" => (&["input"], &["input"]),
            "admitCandidateCatalogInventory" => (&["inventory"], &["inventory"]),
            "resolveCandidateRecordAssociation" => (&["input"], &["input"]),
            "validateCandidateRelationshipAssociation" => (&["input"], &["input"]),
            "resolveCandidateRelationshipTerm" => (&["input"], &["input"]),
            "candidateWitnessTermCapability" => (&["input"], &["input"]),
            _ => return Err(fail("REQUEST", "Unknown security truth operation")),
        };
        exact_members(args, required, allowed)?;
        let result = match operation.as_str() {
            "securityNot" => security_logic::security_not(
                field(args, "value").ok_or_else(|| fail("REQUEST", "value is required"))?,
            )?,
            "securityRefIdentity" => security_logic::security_ref_identity(
                field(args, "ref").ok_or_else(|| fail("REQUEST", "ref is required"))?,
                &mut context,
            )?,
            "securityAnd" => security_logic::security_and(
                field(args, "values").ok_or_else(|| fail("REQUEST", "values are required"))?,
                &mut context,
            )?,
            "securityOr" => security_logic::security_or(
                field(args, "values").ok_or_else(|| fail("REQUEST", "values are required"))?,
                &mut context,
            )?,
            "composeSecurityRules" => {
                let rules =
                    field(args, "rules").ok_or_else(|| fail("REQUEST", "rules are required"))?;
                let protected = field(args, "protectedFields")
                    .cloned()
                    .unwrap_or_else(|| Value::Array(vec![]));
                let input = Value::Object(vec![
                    ("rules".into(), rules.clone()),
                    ("protectedFields".into(), protected),
                ]);
                security_logic::compose_security_rules(&input, &mut context)?
            }
            "prepareCandidateCatalogProgram"
            | "planCandidateCatalogProgram"
            | "prepareCandidateCatalogOntology"
            | "planCandidateCatalogOntology"
            | "resolveCandidateCatalogEntityTerm" => {
                use umf_core::security_catalog_program as catalog;
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                match operation.as_str() {
                    "prepareCandidateCatalogProgram" => catalog::prepare(input, &mut context)?,
                    "planCandidateCatalogProgram" => catalog::plan(input, &mut context)?,
                    "prepareCandidateCatalogOntology" => {
                        catalog::prepare_ontology(input, &mut context)?
                    }
                    "planCandidateCatalogOntology" => catalog::plan_ontology(input, &mut context)?,
                    _ => catalog::entity_term(input, &mut context)?,
                }
            }
            "compileCandidateCompactCondition" => {
                let condition = field(args, "condition")
                    .ok_or_else(|| fail("REQUEST", "condition is required"))?;
                let Some(Value::Number(count)) = field(args, "associationCount") else {
                    return Err(fail("REQUEST", "associationCount must be an integer"));
                };
                if !count.is_finite() || *count < 0.0 || count.fract() != 0.0 || *count > 256.0 {
                    return Err(fail("REQUEST", "associationCount is out of range"));
                }
                umf_core::security_candidate_condition::compile_compact_condition(
                    condition,
                    *count as usize,
                    &mut context,
                )?
            }
            "validateCandidateCatalogStorage" => {
                let program =
                    field(args, "program").ok_or_else(|| fail("REQUEST", "program is required"))?;
                let owner =
                    field(args, "owner").ok_or_else(|| fail("REQUEST", "owner is required"))?;
                let Some(Value::Number(max_steps)) = field(args, "maxSteps") else {
                    return Err(fail("REQUEST", "maxSteps must be an integer"));
                };
                if !max_steps.is_finite()
                    || *max_steps < 0.0
                    || max_steps.fract() != 0.0
                    || *max_steps > 1_000_000.0
                {
                    return Err(fail("REQUEST", "maxSteps is out of range"));
                }
                umf_core::security_catalog_storage::validate_logical_owner_storage(
                    program,
                    owner,
                    *max_steps as usize,
                    &mut context,
                )?
            }
            "planCandidateEmptyDisclosures" => {
                let input = field(args, "input")
                    .ok_or_else(|| fail("REQUEST", "Catalog disclosures are required"))?;
                umf_core::security_catalog_disclosure::plan_empty_disclosures(input, &mut context)?
            }
            "candidateAssociationOperandDomain" => {
                let input = field(args, "input")
                    .ok_or_else(|| fail("REQUEST", "Association operand is required"))?;
                umf_core::security_catalog_program::association_operand_domain(input, &mut context)?
            }
            "admitCandidateCatalogDateProfiles" => {
                let input = field(args, "input")
                    .ok_or_else(|| fail("REQUEST", "Catalog date profiles are required"))?;
                umf_core::security_catalog_admission::admit_date_profiles(input, &mut context)?
            }
            "planCandidateCatalogRequest" => {
                let input = field(args, "input")
                    .ok_or_else(|| fail("REQUEST", "Catalog request is required"))?;
                umf_core::security_catalog_admission::plan_request(input, &mut context)?
            }
            "admitCandidateCatalogCut" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_catalog_admission::admit_cut(input, &mut context)?
            }
            "selectCandidateCatalogDisclosures" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_catalog_disclosure::select_candidate_catalog_disclosures(
                    input,
                    &mut context,
                )?
            }
            "checkCandidateDisclosureIdentities" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_catalog_disclosure::disclosure_identities_agree(
                    input,
                    &mut context,
                )?
            }
            "renderCandidateCatalogCells" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_catalog_disclosure::render_candidate_catalog_cells(
                    input,
                    &mut context,
                )?
            }
            "assembleCandidateDisclosureBatch" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_catalog_batch::assemble_candidate_disclosure_batch(
                    input,
                    &mut context,
                )?
            }
            "admitCandidateCatalogOperationBatch" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_catalog_batch_orchestration::admit_operation_batch(
                    input,
                    &mut context,
                )?
            }
            "admitCandidateCatalogScanBatch" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_catalog_batch_orchestration::admit_scan_batch(
                    input,
                    &mut context,
                )?
            }
            "composeCandidateCatalogOperationBatch" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_catalog_batch_orchestration::compose_operation_batch(
                    input,
                    &mut context,
                )?
            }
            "composeCandidateCatalogScanBatch" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_catalog_batch_orchestration::compose_scan_batch(
                    input,
                    &mut context,
                )?
            }
            "admitCandidateCatalogInventory" => {
                let inventory = field(args, "inventory")
                    .ok_or_else(|| fail("REQUEST", "inventory is required"))?;
                umf_core::security_catalog_admission::admit_inventory(inventory, &mut context)?
            }
            "resolveCandidateRecordAssociation" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_association_admission::resolve_record_association(
                    input,
                    &mut context,
                )?
            }
            "validateCandidateRelationshipAssociation" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_association_admission::validate_relationship_association(
                    input,
                    &mut context,
                )?
            }
            "resolveCandidateRelationshipTerm" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_association_admission::resolve_relationship_term(input)?
            }
            "candidateWitnessTermCapability" => {
                let input =
                    field(args, "input").ok_or_else(|| fail("REQUEST", "input is required"))?;
                umf_core::security_association_admission::witness_term_capability(input)?
            }
            _ => return Err(fail("REQUEST", "Unknown security truth operation")),
        };
        if candidate {
            context.with_tagged_transport_limit(|context| encode(&result, context))
        } else {
            encode(&result, &mut context)
        }
    })();
    result_envelope(result)
}
