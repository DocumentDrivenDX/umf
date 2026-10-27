use std::time::Instant;
use umf_core::{arrow_schema as arrow, Context, Utf16};

const SOURCE: &str = r#"{"fields":[{"name":"x","nullable":true,"type":{"name":"utf8"}}]}"#;
fn ms(d: std::time::Duration) -> f64 { d.as_secs_f64() * 1000.0 }
fn main() {
    let mut build = Vec::new();
    for _ in 0..5 {
        let start = Instant::now();
        let mut ctx = Context::ordinary();
        let resources = arrow::ArrowSchemaResources::new(&mut ctx).unwrap();
        std::hint::black_box(resources);
        build.push(ms(start.elapsed()));
    }
    println!("resources_ms={build:?}");
    let mut setup = Context::ordinary();
    let resources = arrow::ArrowSchemaResources::new(&mut setup).unwrap();
    let mut import_ctx = Context::ordinary();
    let doc = arrow::import_arrow_schema(&SOURCE.encode_utf16().collect::<Vec<_>>(), &Utf16::from("perf"), &resources, &mut import_ctx).unwrap();
    let n=8;
    let start=Instant::now();
    for _ in 0..n { let mut c=Context::ordinary(); std::hint::black_box(arrow::import_arrow_schema(&SOURCE.encode_utf16().collect::<Vec<_>>(), &Utf16::from("perf"), &resources, &mut c).unwrap()); }
    println!("import_ms_each={}",ms(start.elapsed())/n as f64);
    let start=Instant::now();
    for _ in 0..n { let mut c=Context::ordinary(); std::hint::black_box(arrow::export_arrow_schema(&doc,&resources,&mut c).unwrap()); }
    println!("export_ms_each={}",ms(start.elapsed())/n as f64);
    let start=Instant::now();
    for _ in 0..n { let mut c=Context::ordinary(); std::hint::black_box(arrow::inspect_arrow(&doc,&resources,&mut c).unwrap()); }
    println!("inspect_ms_each={}",ms(start.elapsed())/n as f64);
    let start=Instant::now();
    for _ in 0..n { let mut c=Context::ordinary(); std::hint::black_box(arrow::get_arrow_node(&doc,&Utf16::from("/fields/0/name"),&resources,&mut c).unwrap()); }
    println!("getNode_ms_each={}",ms(start.elapsed())/n as f64);
    let start=Instant::now();
    for _ in 0..n { let mut c=Context::ordinary(); std::hint::black_box(arrow::propose_arrow_node_edit(&doc,&Utf16::from("/fields/0/name"),&r#""y""#.encode_utf16().collect::<Vec<_>>(),&resources,&mut c).unwrap()); }
    println!("proposeNodeEdit_ms_each={}",ms(start.elapsed())/n as f64);

    let start = Instant::now();
    for i in 0..52 {
        let mut c=Context::ordinary();
        std::hint::black_box(arrow::import_arrow_schema(&SOURCE.encode_utf16().collect::<Vec<_>>(), &Utf16::from(format!("session-{i}")), &resources, &mut c).unwrap());
        let mut c=Context::ordinary();
        std::hint::black_box(arrow::export_arrow_schema(&doc, &resources, &mut c).unwrap());
        let mut c=Context::ordinary();
        std::hint::black_box(arrow::inspect_arrow(&doc, &resources, &mut c).unwrap());
        let mut c=Context::ordinary();
        std::hint::black_box(arrow::get_arrow_node(&doc, &Utf16::from("/fields/0/name"), &resources, &mut c).unwrap());
        let mut c=Context::ordinary();
        std::hint::black_box(arrow::propose_arrow_node_edit(&doc, &Utf16::from("/fields/0/name"), &r#""y""#.encode_utf16().collect::<Vec<_>>(), &resources, &mut c).unwrap());
    }
    println!("reused_session_260_ops_ms={}",ms(start.elapsed()));
}
