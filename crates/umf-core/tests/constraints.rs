// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-089-AC20, US-089-AC24
use umf_core::{
    constraints::{execute_constraints, prepare_program},
    context::Context,
    registry::Registry,
    Utf16, Value,
};

fn obj(items: Vec<(&str, Value)>) -> Value {
    Value::Object(
        items
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn get_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    match value {
        Value::Object(members) => members
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn var(name: &str) -> Value {
    obj(vec![("var", Value::string_utf8(name))])
}
fn op(name: &str, args: Vec<Value>) -> Value {
    obj(vec![
        ("op", Value::string_utf8(name)),
        ("args", Value::Array(args)),
    ])
}

#[test]
fn closed_program_remember_tracks_canonical_keys() {
    let diagnostic = obj(vec![
        ("code", Value::string_utf8("DUPLICATE")),
        (
            "path",
            op("canonical", vec![Value::Array(vec![Value::Number(1.0)])]),
        ),
        ("message", Value::string_utf8("Duplicate value")),
        ("severity", Value::string_utf8("error")),
    ]);
    let program = obj(vec![
        ("profile", Value::string_utf8("umf.constraints/1")),
        (
            "steps",
            Value::Array(vec![
                obj(vec![
                    ("op", Value::string_utf8("let")),
                    ("name", Value::string_utf8("seen")),
                    ("value", op("set", vec![])),
                ]),
                obj(vec![
                    ("op", Value::string_utf8("remember")),
                    ("set", var("seen")),
                    ("key", Value::Number(3.0)),
                ]),
                obj(vec![
                    ("op", Value::string_utf8("remember")),
                    ("set", var("seen")),
                    ("key", Value::Number(3.0)),
                    ("diagnostic", diagnostic),
                ]),
            ]),
        ),
    ]);
    let mut ctx = Context::ordinary();
    let program = prepare_program(&program, &mut ctx).unwrap();
    let docs = obj(vec![]);
    let policy = obj(vec![]);
    let diagnostics = execute_constraints(
        &docs,
        &program,
        &policy,
        &Registry::new(),
        &mut NoCapabilities,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code.to_utf8().unwrap(), "DUPLICATE");
    assert_eq!(diagnostics[0].path.to_utf8().unwrap(), "a[1]");
}

#[test]
fn index_expression_replaces_duplicate_keys_like_a_map() {
    let mut index = op(
        "index",
        vec![Value::Array(vec![Value::Number(1.0), Value::Number(1.0)])],
    );
    if let Value::Object(fields) = &mut index {
        fields.push((Utf16::from("as"), Value::string_utf8("item")));
        fields.push((Utf16::from("value"), var("item")));
    }
    let diagnostic = obj(vec![
        ("code", Value::string_utf8("INDEX_LENGTH")),
        ("path", Value::string_utf8("/")),
        (
            "message",
            Value::string_utf8("Index keeps one entry per key"),
        ),
        ("severity", Value::string_utf8("error")),
    ]);
    let program = obj(vec![
        ("profile", Value::string_utf8("umf.constraints/1")),
        (
            "steps",
            Value::Array(vec![obj(vec![
                ("op", Value::string_utf8("emit")),
                ("diagnostic", diagnostic),
                (
                    "when",
                    op("eq", vec![op("length", vec![index]), Value::Number(1.0)]),
                ),
            ])]),
        ),
    ]);
    let mut ctx = Context::ordinary();
    let program = prepare_program(&program, &mut ctx).unwrap();
    let diagnostics = execute_constraints(
        &obj(vec![]),
        &program,
        &obj(vec![]),
        &Registry::new(),
        &mut NoCapabilities,
        &mut ctx,
    )
    .unwrap();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code.to_utf8().unwrap(), "INDEX_LENGTH");
}

#[test]
fn private_expression_wrappers_do_not_reapply_admitted_tree_depth() {
    fn nested(depth: usize) -> Value {
        let mut value = Value::Null;
        for _ in 0..depth {
            value = Value::Array(vec![value]);
        }
        value
    }
    let program = obj(vec![
        ("profile", Value::string_utf8("umf.constraints/1")),
        (
            "steps",
            Value::Array(vec![
                obj(vec![
                    ("op", Value::string_utf8("let")),
                    ("name", Value::string_utf8("wrapped")),
                    ("value", Value::Array(vec![var("doc")])),
                ]),
                obj(vec![
                    ("op", Value::string_utf8("let")),
                    ("name", Value::string_utf8("copied")),
                    ("value", var("wrapped")),
                ]),
            ]),
        ),
    ]);
    let document = nested(128);
    let mut ctx = Context::ordinary();
    let program = prepare_program(&program, &mut ctx).unwrap();
    let diagnostics = execute_constraints(
        &document,
        &program,
        &Value::Object(vec![]),
        &Registry::new(),
        &mut NoCapabilities,
        &mut ctx,
    );
    assert!(
        diagnostics.is_ok(),
        "private wrapper clone failed: {diagnostics:?}"
    );
}
struct NoCapabilities;
impl umf_core::Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &umf_core::SemanticContext,
    ) -> Result<Vec<umf_core::Diagnostic>, Utf16> {
        Ok(vec![])
    }
}

#[test]
fn closed_program_admission_rejects_unknown_fields_and_unbound_variables() {
    let mut ctx = Context::ordinary();
    let unknown = obj(vec![
        ("profile", Value::string_utf8("umf.constraints/1")),
        ("steps", Value::Array(vec![])),
        ("extra", Value::Bool(true)),
    ]);
    assert_eq!(
        umf_core::constraints::check_program(&unknown, &mut ctx)
            .unwrap_err()
            .code,
        "CONSTRAINT_PROGRAM"
    );
    let unbound = obj(vec![
        ("profile", Value::string_utf8("umf.constraints/1")),
        (
            "steps",
            Value::Array(vec![obj(vec![
                ("op", Value::string_utf8("emit")),
                ("diagnostic", var("missing")),
            ])]),
        ),
    ]);
    assert_eq!(
        umf_core::constraints::check_program(&unbound, &mut ctx)
            .unwrap_err()
            .code,
        "CONSTRAINT_TARGET"
    );
}

#[test]
fn prepared_program_is_an_owned_snapshot_and_mutated_source_is_readmitted() {
    let diagnostic = obj(vec![
        ("code", Value::string_utf8("ORIGINAL")),
        ("path", Value::string_utf8("/")),
        ("message", Value::string_utf8("snapshot")),
        ("severity", Value::string_utf8("error")),
    ]);
    let mut source = obj(vec![
        ("profile", Value::string_utf8("umf.constraints/1")),
        (
            "steps",
            Value::Array(vec![obj(vec![
                ("op", Value::string_utf8("emit")),
                ("diagnostic", diagnostic),
            ])]),
        ),
    ]);
    let prepared = prepare_program(&source, &mut Context::ordinary()).unwrap();

    let steps = match get_mut(&mut source, "steps").unwrap() {
        Value::Array(steps) => &mut steps[0],
        _ => unreachable!(),
    };
    let diagnostic = get_mut(steps, "diagnostic").unwrap();
    *get_mut(diagnostic, "code").unwrap() = Value::string_utf8("MUTATED");

    let doc = obj(vec![]);
    let policy = obj(vec![]);
    let run = |program: &umf_core::constraints::PreparedProgram| {
        execute_constraints(
            &doc,
            program,
            &policy,
            &Registry::new(),
            &mut NoCapabilities,
            &mut Context::ordinary(),
        )
        .unwrap()
    };
    let snapshot_diagnostics = run(&prepared);
    assert_eq!(snapshot_diagnostics[0].code, Utf16::from("ORIGINAL"));

    let freshly_prepared = prepare_program(&source, &mut Context::ordinary()).unwrap();
    let fresh_diagnostics = run(&freshly_prepared);
    assert_eq!(fresh_diagnostics[0].code, Utf16::from("MUTATED"));
}

#[test]
fn large_variable_and_loop_environment_copies_are_metered_before_allocation() {
    use umf_core::error::EngineError;
    const ITEMS: usize = 4096;
    fn run(program: Value, fail_on_container_copy: usize) -> (String, usize) {
        let mut setup = Context::ordinary();
        let program = prepare_program(&program, &mut setup).unwrap();
        let document = Value::Array(vec![Value::Null; ITEMS]);
        let policy = obj(vec![]);
        let mut copies = 0usize;
        let mut meter = |amount: usize| -> Result<(), EngineError> {
            if amount == ITEMS {
                copies += 1;
                if copies == fail_on_container_copy {
                    return Err(EngineError::new(
                        "COPY_BUDGET",
                        Utf16::default(),
                        "Rejected before container allocation",
                    ));
                }
            }
            Ok(())
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = execute_constraints(
            &document,
            &program,
            &policy,
            &Registry::new(),
            &mut NoCapabilities,
            &mut ctx,
        )
        .unwrap_err();
        (error.code, copies)
    }
    let diagnostic = obj(vec![
        ("code", Value::string_utf8("NEVER")),
        ("path", Value::string_utf8("/")),
        ("message", Value::string_utf8("never emitted")),
        ("severity", Value::string_utf8("error")),
    ]);
    let when = op("and", vec![var("doc"), Value::Bool(false)]);
    let variable_program = obj(vec![
        ("profile", Value::string_utf8("umf.constraints/1")),
        (
            "steps",
            Value::Array(vec![obj(vec![
                ("op", Value::string_utf8("emit")),
                ("diagnostic", diagnostic.clone()),
                ("when", when),
            ])]),
        ),
    ]);
    // execute_constraints copies the admitted input once; the next same-sized
    // charge is the `var` result, before copy_json reserves its array storage.
    assert_eq!(run(variable_program, 2), ("COPY_BUDGET".into(), 2));

    let loop_program = obj(vec![
        ("profile", Value::string_utf8("umf.constraints/1")),
        (
            "steps",
            Value::Array(vec![
                obj(vec![
                    ("op", Value::string_utf8("let")),
                    ("name", Value::string_utf8("big")),
                    ("value", var("doc")),
                ]),
                obj(vec![
                    ("op", Value::string_utf8("for")),
                    ("each", Value::Array(vec![Value::Number(1.0)])),
                    ("as", Value::string_utf8("item")),
                    ("body", Value::Array(vec![])),
                ]),
            ]),
        ),
    ]);
    // The third array-sized charge is clone_env's copy of the large `doc`
    // binding for a loop body. That snapshot is rejected before allocation.
    assert_eq!(run(loop_program, 3), ("COPY_BUDGET".into(), 3));
}

#[test]
fn sort_key_materialization_is_metered_before_building_the_key() {
    use umf_core::error::EngineError;
    const TEXT: usize = 4096;
    let diagnostic = obj(vec![
        ("code", Value::string_utf8("NEVER")),
        ("path", Value::string_utf8("/")),
        ("message", Value::string_utf8("never emitted")),
        ("severity", Value::string_utf8("error")),
    ]);
    let sort = op("sort", vec![var("doc")]);
    let program = obj(vec![
        ("profile", Value::string_utf8("umf.constraints/1")),
        (
            "steps",
            Value::Array(vec![obj(vec![
                ("op", Value::string_utf8("emit")),
                ("diagnostic", diagnostic),
                ("when", op("length", vec![sort])),
            ])]),
        ),
    ]);
    let mut setup = Context::ordinary();
    let program = prepare_program(&program, &mut setup).unwrap();
    let document = Value::Array(vec![
        Value::String(Utf16::new(vec![b'z' as u16; TEXT])),
        Value::String(Utf16::new(vec![b'a' as u16; TEXT])),
    ]);
    let mut matching_charges = 0;
    let mut meter = |amount| {
        if amount == TEXT {
            matching_charges += 1;
            // Input admission (2), var snapshot (2), x materialization (2),
            // then sort's first element traversal. Reject before key storage.
            if matching_charges == 7 {
                return Err(EngineError::new(
                    "SORT_BUDGET",
                    Utf16::default(),
                    "Sort key refused before allocation",
                ));
            }
        }
        Ok(())
    };
    let mut ctx = Context::ordinary().with_meter(&mut meter);
    let error = execute_constraints(
        &document,
        &program,
        &obj(vec![]),
        &Registry::new(),
        &mut NoCapabilities,
        &mut ctx,
    )
    .unwrap_err();
    assert_eq!(error.code, "SORT_BUDGET");
    assert_eq!(matching_charges, 7);
}

#[test]
fn private_canonical_and_raw_string_copies_do_not_use_a_conservative_text_ceiling() {
    // The private canonical buffer's conservative estimate is over 4M units,
    // while the exact output is only about 700K units. The raw lone surrogate
    // also verifies that copying and canonicalization retain the original unit.
    let mut units = vec![b'x' as u16; 700_000];
    units.push(0xd800);
    let document = Value::String(Utf16::new(units));
    let canonical = || op("canonical", vec![var("doc")]);
    let diagnostic = obj(vec![
        ("code", Value::String(Utf16::new(vec![0xd800]))),
        ("path", Value::string_utf8("/")),
        ("message", Value::string_utf8("canonical equality worked")),
        ("severity", Value::string_utf8("error")),
    ]);
    let program = obj(vec![
        ("profile", Value::string_utf8("umf.constraints/1")),
        (
            "steps",
            Value::Array(vec![obj(vec![
                ("op", Value::string_utf8("emit")),
                ("when", op("eq", vec![canonical(), canonical()])),
                ("diagnostic", diagnostic),
            ])]),
        ),
    ]);
    let mut setup = Context::ordinary();
    let program = prepare_program(&program, &mut setup).unwrap();
    let diagnostics = execute_constraints(
        &document,
        &program,
        &obj(vec![]),
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code.units(), &[0xd800]);
}

#[test]
fn raw_utf16_environment_names_and_object_key_removal_are_lossless() {
    let raw = Utf16::new(vec![0xd800]);
    let mut variable = obj(vec![]);
    if let Value::Object(fields) = &mut variable {
        fields.push((Utf16::from("var"), Value::String(raw.clone())));
    }
    let without = op(
        "without",
        vec![variable, Value::Array(vec![Value::String(raw.clone())])],
    );
    let diagnostic = obj(vec![
        ("code", Value::String(raw.clone())),
        ("path", Value::string_utf8("/")),
        (
            "message",
            Value::string_utf8("raw UTF-16 identities matched"),
        ),
        ("severity", Value::string_utf8("error")),
    ]);
    let program = obj(vec![
        ("profile", Value::string_utf8("umf.constraints/1")),
        (
            "steps",
            Value::Array(vec![
                obj(vec![
                    ("op", Value::string_utf8("let")),
                    ("name", Value::String(raw.clone())),
                    ("value", var("doc")),
                ]),
                obj(vec![
                    ("op", Value::string_utf8("emit")),
                    (
                        "when",
                        op(
                            "eq",
                            vec![
                                op("length", vec![op("keys", vec![without])]),
                                Value::Number(1.0),
                            ],
                        ),
                    ),
                    ("diagnostic", diagnostic),
                ]),
            ]),
        ),
    ]);
    let mut setup = Context::ordinary();
    let program = prepare_program(&program, &mut setup).unwrap();
    let document = Value::Object(vec![
        (raw.clone(), Value::Number(1.0)),
        (Utf16::from("keep"), Value::Number(2.0)),
    ]);
    let diagnostics = execute_constraints(
        &document,
        &program,
        &obj(vec![]),
        &Registry::new(),
        &mut NoCapabilities,
        &mut Context::ordinary(),
    )
    .unwrap();
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code.units(), &[0xd800]);
}
