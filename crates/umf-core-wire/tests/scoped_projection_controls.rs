// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{Context, EngineError, Utf16, Value};
fn request() -> String {
    let raw =
        r#"{"profile":"umf.binding-public/1.0.0","op":"inspectBinding","binding":{},"logical":{}}"#;
    let value = umf_core::serialization::read_json_value(
        &raw.encode_utf16().collect::<Vec<_>>(),
        umf_core::serialization::Format::Json,
        &mut Context::ordinary(),
    )
    .unwrap();
    umf_core_wire::encode(&value, &mut Context::ordinary()).unwrap()
}
#[test]
fn scoped_default_and_explicit_control_routes_have_the_same_semantic_result() {
    let wire = request();
    let scoped = umf_core_wire::native_family_binding::execute_wire("binding-public", &wire);
    let mut work = 0u64;
    let mut control = |n: usize| {
        work += n as u64;
        Ok(())
    };
    let ordinary = umf_core_wire::native_family_binding::execute_wire_with_control(
        "binding-public",
        &wire,
        &mut control,
    );
    assert_eq!(scoped, ordinary);
    assert!(work > 0);
}
#[test]
fn warming_default_resources_never_bypasses_explicit_host_refusals() {
    let wire = request();
    let _ = umf_core_wire::native_family_binding::execute_wire("binding-public", &wire);
    let mut calls = 0;
    let mut control = |_: usize| {
        calls += 1;
        Err(EngineError::new(
            "CANCELLED",
            Utf16::from("/host"),
            "caller stop",
        ))
    };
    let reply = umf_core_wire::native_family_binding::execute_wire_with_control(
        "binding-public",
        &wire,
        &mut control,
    );
    let envelope: serde_json::Value = serde_json::from_str(&reply).unwrap();
    assert_eq!(calls, 1);
    assert_eq!(envelope["code"], "CANCELLED");
    assert_eq!(
        envelope["pathUnits"],
        serde_json::json!([47, 104, 111, 115, 116])
    );
}
#[test]
fn scoped_default_keeps_ordinary_structural_admission_limits() {
    let mut deep = Value::Null;
    for _ in 0..130 {
        deep = Value::Array(vec![deep]);
    }
    let mut limits = umf_core::Limits::ordinary();
    limits.max_depth = 256;
    let wire = umf_core_wire::encode(
        &deep,
        &mut Context::with_limits(umf_core::ResourceProfile::Cooperative, limits).unwrap(),
    )
    .unwrap();
    let reply = umf_core_wire::native_family_binding::execute_wire("binding-public", &wire);
    assert!(reply.contains("LIMIT"));
}

#[test]
fn admitted_record_member_reuse_matches_standalone_receipts_and_conflicts() {
    use umf_core::sqlserver_adapter::{document_value, SqlServerCatalog};
    fn member_mut<'a>(value: &'a mut Value, name: &str) -> &'a mut Value {
        let Value::Object(fields) = value else {
            panic!("expected object")
        };
        &mut fields
            .iter_mut()
            .find(|(key, _)| key == &Utf16::from(name))
            .unwrap()
            .1
    }
    let native = Utf16::from(include_str!("../../../fixtures/sqlserver/catalog.json"));
    let mut ctx = Context::ordinary();
    let catalog = SqlServerCatalog::import(&native, &mut ctx).unwrap();
    let original = document_value(&Utf16::from("records"), &catalog, &mut ctx).unwrap();
    for conflict in [false, true] {
        let mut source = original.clone();
        if conflict {
            let Value::Array(modules) = member_mut(&mut source, "modules") else {
                panic!()
            };
            let Value::Array(elements) = member_mut(&mut modules[0], "elements") else {
                panic!()
            };
            let Value::Object(fields) = &mut elements[0] else {
                panic!()
            };
            fields.push((Utf16::from("kind"), Value::string_utf8("field")));
        }
        let mut request = umf_core::serialization::read_json_value(
            r#"{"profile":"umf.sqlserver-wire/1","op":"sqlserver.classifyRecord","source":null,"request":{"recordModule":"records","recordId":"record","mode":"report","nativeSource":"","relation":{"schema":"sales","name":"Types"}}}"#.encode_utf16().collect::<Vec<_>>().as_slice(),
            umf_core::serialization::Format::Json, &mut Context::ordinary(),
        ).unwrap();
        *member_mut(&mut request, "source") = source;
        *member_mut(member_mut(&mut request, "request"), "nativeSource") =
            Value::String(native.clone());
        let wire = umf_core_wire::encode(&request, &mut Context::ordinary()).unwrap();
        let reused = umf_core_wire::sqlserver_binding::execute_wire(&wire);
        let mut notifications = 0;
        let mut control = |_: usize| {
            notifications += 1;
            Ok(())
        };
        let original =
            umf_core_wire::sqlserver_binding::execute_wire_with_control(&wire, &mut control);
        assert_eq!(reused, original);
        let envelope: serde_json::Value = serde_json::from_str(&reused).unwrap();
        assert_eq!(envelope["status"], "ok");
        assert!(notifications > 0);
    }
}

#[test]
fn indexed_tablespec_default_matches_controlled_import_and_keeps_host_refusals() {
    let value = Value::Object(vec![
        (Utf16::from("profile"), Value::string_utf8("umf.tablespec-wire/1")),
        (Utf16::from("op"), Value::string_utf8("importTableSpec")),
        (Utf16::from("id"), Value::string_utf8("fixed-tablespec")),
        (Utf16::from("format"), Value::string_utf8("json")),
        (Utf16::from("source"), Value::string_utf8(r#"{"version":"1.0","table_name":"orders","future":{"exact":9007199254740993},"columns":[{"name":"id","data_type":"INTEGER","future":"keep"}]}"#)),
    ]);
    let wire = umf_core_wire::encode(&value, &mut Context::ordinary()).unwrap();
    let default = umf_core_wire::tablespec_binding::execute_wire(&wire);
    assert_eq!(serde_json::from_str::<serde_json::Value>(&default).unwrap()["status"], "ok");
    assert_eq!(default, umf_core_wire::tablespec_binding::execute_wire(&wire));
    let mut work = 0;
    let controlled = umf_core_wire::tablespec_binding::execute_wire_with_control(&wire, &mut |n| {work += n; Ok(())});
    assert_eq!(default, controlled);
    assert!(work > 0);
    let mut calls = 0;
    let stopped = umf_core_wire::tablespec_binding::execute_wire_with_control(&wire, &mut |_| {
        calls += 1;
        Err(EngineError::new("TABLESPEC_STOP", Utf16::from("/caller"), "stop"))
    });
    let error: serde_json::Value = serde_json::from_str(&stopped).unwrap();
    assert_eq!(calls, 1);
    assert_eq!(error["code"], "TABLESPEC_STOP");
    assert_eq!(error["pathUnits"], serde_json::json!([47,99,97,108,108,101,114]));
}

#[test]
fn arrow_fixed_grammars_preserve_controlled_receipts_and_cancellation() {
    let root=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/arrow/metadata");
    let manifest:serde_json::Value=serde_json::from_slice(&std::fs::read(root.join("manifest.json")).unwrap()).unwrap();
    let case=&manifest["cases"][0];
    let bytes=std::fs::read(root.join(case["file"].as_str().unwrap())).unwrap();
    let hex=bytes.iter().map(|byte|format!("{byte:02x}")).collect::<String>();
    for flatbuffer in [false,true] {
        let request=if flatbuffer {
            serde_json::json!({"profile":"umf.arrow-flatbuffer-model-wire/1","op":"arrow-flatbuffer-model.decodeArrowFlatbuffer","id":"controlled-arrow","rootType":case["rootType"],"bytes":hex})
        }else{serde_json::json!({"op":"arrow.ipc.capture","id":"controlled-arrow","bytes":hex})};
        let value=umf_core::serialization::read_json_value(&request.to_string().encode_utf16().collect::<Vec<_>>(),umf_core::serialization::Format::Json,&mut Context::ordinary()).unwrap();
        let wire=umf_core_wire::encode(&value,&mut Context::ordinary()).unwrap();
        let default=||if flatbuffer{umf_core_wire::arrow_flatbuffer_model_binding::execute_wire(&wire)}else{umf_core_wire::arrow_ipc_capture_binding::execute_wire(&wire)};
        let first=default();assert_eq!(serde_json::from_str::<serde_json::Value>(&first).unwrap()["status"],"ok");assert_eq!(first,default());
        let mut work=0;let mut control=|n:usize|{work+=n;Ok(())};
        let original=if flatbuffer{umf_core_wire::arrow_flatbuffer_model_binding::execute_wire_with_control(&wire,&mut control)}else{umf_core_wire::arrow_ipc_capture_binding::execute_wire_with_control(&wire,&mut control)};
        assert_eq!(first,original);assert!(work>0);
        let mut calls=0;let mut stop=|_:usize|{calls+=1;Err(EngineError::new("ARROW_STOP",Utf16::from("/caller"),"stop"))};
        let stopped=if flatbuffer{umf_core_wire::arrow_flatbuffer_model_binding::execute_wire_with_control(&wire,&mut stop)}else{umf_core_wire::arrow_ipc_capture_binding::execute_wire_with_control(&wire,&mut stop)};
        assert_eq!(calls,1);assert_eq!(serde_json::from_str::<serde_json::Value>(&stopped).unwrap()["code"],"ARROW_STOP");
    }
}

#[test]
fn prepared_openapi_grammar_keeps_per_call_unknown_content_and_live_controls() {
    let mut scoped=Context::ordinary_construction();
    let prepared=umf_core::openapi_adapter::OpenapiRuntime::prepared(&mut scoped).unwrap();
    assert!(matches!(prepared,umf_core::resource_cache::Prepared::Shared(_)));
    let source=r#"{"openapi":"3.1.1","info":{"title":"Scoped","version":"1"},"paths":{},"x-future":{"keep":[true,null,"value"]}}"#;
    let request=serde_json::json!({"profile":umf_core_wire::openapi_binding::PROFILE,"op":"openapi.import","id":"scoped-openapi","format":"json","source":source});
    let value=umf_core::serialization::read_json_value(&request.to_string().encode_utf16().collect::<Vec<_>>(),umf_core::serialization::Format::Json,&mut Context::ordinary()).unwrap();
    let wire=umf_core_wire::encode(&value,&mut Context::ordinary()).unwrap();
    let first=umf_core_wire::openapi_binding::execute_wire(&wire);
    assert_eq!(serde_json::from_str::<serde_json::Value>(&first).unwrap()["status"],"ok");
    assert_eq!(first,umf_core_wire::openapi_binding::execute_wire(&wire));
    let mut events=0;let controlled=umf_core_wire::openapi_binding::execute_wire_with_control(&wire,&mut |n|{events+=n;Ok(())});
    assert_eq!(first,controlled);assert!(events>0);
    let mut calls=0;let refused=umf_core_wire::openapi_binding::execute_wire_with_control(&wire,&mut |_|{calls+=1;Err(EngineError::new("OPENAPI_STOP",Utf16::from("/caller"),"stop"))});
    assert_eq!(calls,1);assert_eq!(serde_json::from_str::<serde_json::Value>(&refused).unwrap()["code"],"OPENAPI_STOP");
}

#[test]
fn delta_fixed_resources_share_only_without_live_controls_or_custom_limits() {
    use umf_core::{delta_schema::DeltaSchemaResources, delta_table::DeltaTableResources, delta_log::DeltaLogResources, delta_actions::DeltaActionResources, resource_cache::Prepared};
    macro_rules! check {
        ($kind:ty) => {{
            assert!(matches!(<$kind>::prepared(&mut Context::ordinary_construction()).unwrap(), Prepared::Shared(_)));
            let mut calls = 0;
            let mut control = |_: usize| { calls += 1; Ok(()) };
            let resource = <$kind>::prepared(&mut Context::ordinary().with_host_control(&mut control)).unwrap();
            assert!(matches!(resource, Prepared::Owned(_)));
            assert!(calls > 0);
            let mut limits = umf_core::Limits::ordinary(); limits.max_values = 0;
            let mut bounded = Context::with_limits(umf_core::ResourceProfile::Cooperative, limits).unwrap();
            assert_eq!(<$kind>::prepared(&mut bounded).err().unwrap().code, "LIMIT");
        }};
    }
    check!(DeltaSchemaResources); check!(DeltaTableResources); check!(DeltaLogResources); check!(DeltaActionResources); check!(umf_core::iceberg_table::IcebergTableResources); check!(umf_core::native_contract_adapters::ContractRuntime); check!(umf_core::rdf::RdfRuntime); check!(umf_core::jsonld_source::JsonLdRuntime);
}

#[test]
fn delta_default_and_controlled_routes_keep_complete_receipts_and_host_refusals() {
    use umf_core_wire::{decode, encode, native_family_binding};
    fn wire(profile: &str, op: &str, fields: Vec<(&str, Value)>) -> String {
        let mut all = vec![(Utf16::from("profile"), Value::string_utf8(profile)), (Utf16::from("op"), Value::string_utf8(op))];
        all.extend(fields.into_iter().map(|(k,v)| (Utf16::from(k),v)));
        encode(&Value::Object(all), &mut Context::ordinary()).unwrap()
    }
    let schema = wire("umf-r8-delta-source/0.1.0", "delta/schema.import", vec![("id",Value::string_utf8("schema")),("source",Value::string_utf8(include_str!("../../../fixtures/delta/metadata-unknown.json")))]);
    let table = wire("umf-r8-delta-source/0.1.0", "delta/table.import", vec![("id",Value::string_utf8("table")),("source",Value::string_utf8(include_str!("../../../fixtures/delta/mapped-nested/name-legacy/context.json")))]);
    let log = wire("umf-r8-delta-log/0.1.0", "delta/log.capture", vec![("id",Value::string_utf8("log")),("source",Value::string_utf8("{\"future\":{\"exact\":9223372036854775808}}\n"))]);
    let bytes=include_bytes!("../../../fixtures/delta/parquet-actions/authored/typed-statistics.parquet");
    let hex=bytes.iter().map(|b|format!("{b:02x}")).collect::<String>();
    let capture=wire(umf_core_wire::parquet_capture_binding::PROFILE,"parquet.capture",vec![("id",Value::string_utf8("checkpoint")),("bytes",Value::string_utf8(&hex))]);
    let envelope:serde_json::Value=serde_json::from_str(&native_family_binding::execute_wire("delta-parquet",&capture)).unwrap();
    assert_eq!(envelope["status"],"ok");
    let document=decode(envelope["wire"].as_str().unwrap(),&mut Context::ordinary()).unwrap();
    let parquet=wire(umf_core_wire::parquet_capture_binding::PROFILE,"delta.parquet.projectActions",vec![("document",document)]);
    for (family,request) in [("delta-schema",schema),("delta-table",table),("delta-log",log),("delta-parquet",parquet)] {
        let first=native_family_binding::execute_wire(family,&request);
        let envelope:serde_json::Value=serde_json::from_str(&first).unwrap(); assert_eq!(envelope["status"],"ok","{family}: {first}");
        assert_eq!(native_family_binding::execute_wire(family,&request),first);
        let mut work=0u64; let mut meter=|n:usize|{work+=n as u64;Ok(())};
        assert_eq!(native_family_binding::execute_wire_with_control(family,&request,&mut meter),first); assert!(work>0);
        for code in ["CANCELLED","METER_FAILURE"] {
            let mut calls=0;let mut refuse=|_:usize|{calls+=1;Err(EngineError::new(code,Utf16::from("/caller"),"stop"))};
            let result=native_family_binding::execute_wire_with_control(family,&request,&mut refuse);
            let failure:serde_json::Value=serde_json::from_str(&result).unwrap();assert_eq!(failure["code"],code);assert_eq!(failure["pathUnits"],serde_json::json!([47,99,97,108,108,101,114]));assert_eq!(calls,1);
        }
    }
}
