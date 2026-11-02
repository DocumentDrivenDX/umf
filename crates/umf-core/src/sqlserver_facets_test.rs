use super::*;

fn v3_source() -> Utf16 {
    let mut ctx = CoreContext::ordinary();
    let wrapper = NativeJsonTree::parse_json(
        Utf16::from(include_str!(
            "../../../fixtures/validation/facets-sqlserver-discovery-native.json"
        ))
        .units(),
        &mut ctx,
    )
    .unwrap();
    text(field(wrapper.root(), "sourceText"))
        .expect("fixture source text")
        .clone()
}

fn value_member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    value_field(value, name)
}

#[test]
fn sqlserver_facet_interpreters_keep_candidates_scoped_to_native_observations() {
    let source = v3_source();
    let mut ctx = CoreContext::ordinary();
    let catalog = SqlServerCatalog::import(&source, &mut ctx).unwrap();
    let columns = catalog.column_metadata(&mut ctx).unwrap();
    let column = columns
        .iter()
        .find(|column| column.table == Utf16::from("signed8"))
        .expect("signed integer facet column");
    let ty = inspect_sqlserver_facet_type(&column.native_column, &mut ctx).unwrap();
    assert_eq!(
        value_string(value_member(
            value_member(&ty, "meaning").unwrap(),
            "family"
        )),
        Some(&Utf16::from("integer"))
    );

    let predicate = inspect_sqlserver_facet_predicate(
        &Value::string_utf8("[value]>=-128 AND [value]<=127"),
        &Utf16::from("value"),
        &mut ctx,
    )
    .unwrap();
    assert_eq!(
        value_string(value_member(&predicate, "state")),
        Some(&Utf16::from("candidate"))
    );
    for source in ["[value]>=01", "[value]>=-01"] {
        let rejected = inspect_sqlserver_facet_predicate(
            &Value::string_utf8(source),
            &Utf16::from("value"),
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            value_string(value_member(&rejected, "state")),
            Some(&Utf16::from("unsupported"))
        );
    }

    let document = document_value(&Utf16::from("facet-baseline"), &catalog, &mut ctx).unwrap();
    let report = inspect_sqlserver_facet_constraints(&document, &column.path, &mut ctx).unwrap();
    assert_eq!(
        value_string(value_member(&report, "sourceAuthenticity")),
        Some(&Utf16::from("unverified"))
    );
    let Some(Value::Array(observations)) = value_member(&report, "observations") else {
        panic!("constraint observations")
    };
    assert_eq!(
        value_string(value_member(&observations[0], "state")),
        Some(&Utf16::from("interpreted"))
    );
    assert_eq!(
        value_string(value_member(&observations[0], "scope")),
        Some(&Utf16::from("stored-and-ordinary-checked-write-non-null"))
    );
}
