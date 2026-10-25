// SPDX-License-Identifier: MIT OR Apache-2.0
use umf_core::{Context, Utf16, Value};
use umf_core_wire::{decode, encode, parquet_record_type_binding::execute_wire};

fn obj(fields: Vec<(&str,Value)>)->Value { Value::Object(fields.into_iter().map(|(k,v)|(Utf16::from(k),v)).collect()) }
fn text(s:&str)->Value{Value::string_utf8(s)}
fn element(name:&str,rep:Option<&str>,children:Option<f64>,physical:Option<&str>,annotation:Option<&str>)->Value{
    obj(vec![("name",text(name)),("repetition",rep.map(text).unwrap_or(Value::Null)),("numChildren",children.map(Value::Number).unwrap_or(Value::Null)),("physicalType",physical.map(text).unwrap_or(Value::Null)),("annotation",annotation.map(text).unwrap_or(Value::Null))])
}
fn response(index:f64)->serde_json::Value{
    let schema=vec![element("root",None,Some(1.0),None,None),element("items",Some("OPTIONAL"),Some(1.0),None,Some("LIST")),element("list",Some("REPEATED"),Some(2.0),None,None),element("id",Some("REQUIRED"),None,Some("INT64"),None),element("label",Some("OPTIONAL"),None,Some("BYTE_ARRAY"),None)];
    let request=obj(vec![("op",text("parquet.recordType.resolveCandidate")),("bytesHex",text("5041523100ff")),("index",Value::Number(index)),("schema",Value::Array(schema))]);
    let wire=encode(&request,&mut Context::ordinary()).unwrap();
    serde_json::from_str(&execute_wire(&wire)).unwrap()
}

#[test]
fn tagged_candidate_transport_preserves_bytes_and_marks_incomplete(){
    let envelope=response(2.0);let wire=envelope["wire"].as_str().unwrap();
    let result=decode(wire,&mut Context::ordinary()).unwrap();
    let Value::Object(fields)=result else{panic!("object expected")};
    let get=|key:&str|fields.iter().find(|(k,_)|k==&Utf16::from(key)).map(|(_,v)|v).unwrap();
    assert_eq!(get("status"),&text("candidate"));
    assert_eq!(get("complete"),&Value::Bool(false));
    assert_eq!(get("sourceBytesHex"),&text("5041523100ff"));
}

#[test]
fn tagged_transport_refuses_primitive_selection(){
    let envelope=response(3.0);let result=decode(envelope["wire"].as_str().unwrap(),&mut Context::ordinary()).unwrap();
    let Value::Object(fields)=result else{panic!("object expected")};
    assert!(fields.iter().any(|(k,v)|k==&Utf16::from("status")&&v==&text("unsupported")));
}
