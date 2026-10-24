#![cfg(feature = "embedded-adapters")]
// SPDX-License-Identifier: MIT OR Apache-2.0
// Real trusted-host compiler exercise for the Rust prepare/finish boundary.
// This test harness owns filesystem/process access; production umf-core does not.
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{atomic::{AtomicBool, Ordering}, Arc},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use sha2::{Digest, Sha256};
use umf_core::{
    protobuf_document,
    protobuf_source::{self, ProtobufCompilerResult, ProtobufSourceCompiler},
    Context, EngineError, Utf16, Value,
};

struct Protoc {
    executable: PathBuf,
    version: Utf16,
    started: Arc<AtomicBool>,
    killed_running_child_on_control: Arc<AtomicBool>,
    reaped_child_on_control: Arc<AtomicBool>,
    child_completed_before_kill: Arc<AtomicBool>,
}

struct ChildGuard(Option<std::process::Child>);
enum StopOutcome { KilledRunningChild, AlreadyCompleted(std::process::ExitStatus) }
impl ChildGuard {
    fn child(&mut self) -> &mut std::process::Child { self.0.as_mut().expect("child guard is armed") }
    fn reap(&mut self) -> Result<std::process::ExitStatus, EngineError> {
        let status = self.child().wait().map_err(|error| failure(format!("reap protoc: {error}")))?;
        self.0.take();
        Ok(status)
    }
    fn stop_and_reap(&mut self) -> Result<StopOutcome, EngineError> {
        if let Some(observed) = self.child().try_wait().map_err(|error| failure(format!("inspect protoc before stop: {error}")))? {
            let reaped = self.reap()?;
            if observed != reaped { return Err(failure("protoc exit status changed while reaping")); }
            return Ok(StopOutcome::AlreadyCompleted(reaped));
        }
        if let Err(kill_error) = self.child().kill() {
            if let Some(observed) = self.child().try_wait().map_err(|error| failure(format!("kill protoc failed ({kill_error}); inspect failed: {error}")))? {
                let reaped = self.reap()?;
                if observed != reaped { return Err(failure("protoc exit status changed while reaping")); }
                return Ok(StopOutcome::AlreadyCompleted(reaped));
            }
            return Err(failure(format!("kill protoc after control refusal: {kill_error}")));
        }
        let status = self.reap()?;
        if status.success() { return Ok(StopOutcome::AlreadyCompleted(status)); }
        Ok(StopOutcome::KilledRunningChild)
    }
}
impl Drop for ChildGuard {
    fn drop(&mut self) {
        if let Some(child) = self.0.as_mut() {
            if matches!(child.try_wait(), Ok(None)) { let _ = child.kill(); }
            let _ = child.wait();
        }
    }
}

impl ProtobufSourceCompiler for Protoc {
    fn supports_cooperative_controls(&self) -> bool { true }

    fn compile(&mut self, request: &Value, context: &mut Context<'_>) -> Result<ProtobufCompilerResult, EngineError> {
        let fields = object(request)?;
        let files = object(field(fields, "files")?)?;
        let roots = array(field(fields, "roots")?)?;
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let temp = std::env::temp_dir().join(format!("umf-r5-protobuf-protoc-{}-{nonce}", std::process::id()));
        fs::create_dir(&temp).map_err(|error| failure(format!("create compiler input directory: {error}")))?;
        let result = self.compile_in(&temp, files, roots, context);
        let cleanup = fs::remove_dir_all(&temp);
        match (result, cleanup) {
            (Ok(value), Ok(())) => Ok(value),
            (Err(error), Ok(())) => Err(error),
            (Ok(_), Err(cleanup)) => Err(failure(format!("remove compiler temporary directory: {cleanup}"))),
            (Err(error), Err(cleanup)) => Err(failure(format!("compiler callback failed ({}); temporary-directory cleanup failed ({cleanup})", error.message.to_utf8().unwrap_or_default()))),
        }
    }
}

impl Protoc {
    fn cleanup_after_control_refusal(&self, child: &mut ChildGuard, error: EngineError) -> EngineError {
        match child.stop_and_reap() {
            Err(cleanup) => failure(format!("host control refused ({}) and protoc cleanup failed ({})", error.code, cleanup.message.to_utf8().unwrap_or_default())),
            Ok(StopOutcome::KilledRunningChild) => {
                self.reaped_child_on_control.store(true, Ordering::Release);
                self.killed_running_child_on_control.store(true, Ordering::Release);
                error
            }
            Ok(StopOutcome::AlreadyCompleted(status)) => {
                let _successful_compilation = status.success();
                self.reaped_child_on_control.store(true, Ordering::Release);
                self.child_completed_before_kill.store(true, Ordering::Release);
                error
            }
        }
    }

    fn compile_in(&self, temp: &Path, files: &[(Utf16, Value)], roots: &[Value], context: &mut Context<'_>) -> Result<ProtobufCompilerResult, EngineError> {
        for (name, content) in files {
            let name = name.to_utf8().map_err(|_| failure("non-UTF-8 compiler path"))?;
            let relative = Path::new(&name);
            if relative.is_absolute() || relative.components().any(|part| !matches!(part, std::path::Component::Normal(_))) {
                return Err(failure("compiler path is outside supplied source map"));
            }
            let text = string(content)?.to_utf8().map_err(|_| failure("non-UTF-8 compiler source"))?;
            let target = temp.join(relative);
            if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|error| failure(format!("create source parent: {error}")))?; }
            fs::write(target, &text).map_err(|error| failure(format!("write compiler source: {error}")))?;
            context.charge_work(name.len().saturating_add(text.len()), Utf16::default())?;
        }
        let output = temp.join("descriptor-set.pb");
        let mut command = Command::new(&self.executable);
        command.current_dir(temp).arg("--include_imports").arg("--include_source_info").arg("--retain_options")
            .arg(format!("--descriptor_set_out={}", output.display())).arg("-I").arg(temp);
        for root in roots {
            command.arg(string(root)?.to_utf8().map_err(|_| failure("non-UTF-8 compiler root"))?);
        }
        let stdout = File::create(temp.join("protoc.stdout")).map_err(|error| failure(format!("create protoc stdout log: {error}")))?;
        let stderr = File::create(temp.join("protoc.stderr")).map_err(|error| failure(format!("create protoc stderr log: {error}")))?;
        let child = command.stdin(Stdio::null()).stdout(Stdio::from(stdout)).stderr(Stdio::from(stderr)).spawn()
            .map_err(|error| failure(format!("start pinned protoc: {error}")))?;
        let mut child = ChildGuard(Some(child));
        self.started.store(true, Ordering::Release);
        if let Err(error) = context.charge_work(1, Utf16::default()) {
            return Err(self.cleanup_after_control_refusal(&mut child, error));
        }
        let started = Instant::now();
        loop {
            let completion = match child.child().try_wait() {
                Ok(completion) => completion,
                Err(error) => {
                    child.stop_and_reap().map_err(|cleanup| failure(format!("poll protoc failed ({error}); cleanup failed: {}", cleanup.message.to_utf8().unwrap_or_default())))?;
                    return Err(failure(format!("poll protoc failed ({error}); child cleanup completed")));
                }
            };
            if let Some(status) = completion {
                let reaped = child.reap()?;
                if status != reaped { return Err(failure("protoc exit status changed while reaping")); }
                if !status.success() {
                    let stderr = fs::read(temp.join("protoc.stderr")).map_err(|error| failure(format!("read protoc diagnostics: {error}")))?;
                    return Err(failure(format!("protoc refused source: {}", String::from_utf8_lossy(&stderr).trim())));
                }
                let descriptor_set = fs::read(&output).map_err(|error| failure(format!("read protoc descriptor set: {error}")))?;
                return Ok(ProtobufCompilerResult { descriptor_set, compiler: self.version.clone() });
            }
            if let Err(error) = context.charge_work(1, Utf16::default()) {
                return Err(self.cleanup_after_control_refusal(&mut child, error));
            }
            if started.elapsed() > Duration::from_secs(60) {
                child.stop_and_reap()?;
                return Err(failure("protoc exceeded 60-second host limit"));
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
}

#[test]
#[ignore = "local qualification requires the exact protoc 36.2 binary; see R5 HELIX evidence"]
fn trusted_protoc_compiles_frozen_sources_through_prepare_finish_and_refuses_bad_sources() {
    let executable = std::env::var_os("UMF_PROTOC_PATH").map(PathBuf::from)
        .expect("set UMF_PROTOC_PATH to the exact protoc 36.2 binary recorded in R5 HELIX evidence");
    let executable_bytes = fs::read(&executable).expect("read pinned protoc for identity check");
    assert_eq!(format!("{:x}", Sha256::digest(&executable_bytes)), "acb9d966be4bc739afc77f1f55f14bd5d277e50efd31de49678edb7f3843d784", "unexpected protoc binary");
    let version_output = Command::new(&executable).arg("--version").output().expect("installed protoc must run");
    assert!(version_output.status.success(), "protoc --version failed");
    let version_text = String::from_utf8(version_output.stdout).unwrap();
    assert_eq!(version_text.trim(), "libprotoc 36.2", "unexpected compiler cohort");
    let mut compiler = Protoc { executable: executable.clone(), version: Utf16::from(version_text.trim()), started: Arc::new(AtomicBool::new(false)), killed_running_child_on_control: Arc::new(AtomicBool::new(false)), reaped_child_on_control: Arc::new(AtomicBool::new(false)), child_completed_before_kill: Arc::new(AtomicBool::new(false)) };

    let mut files = Vec::new();
    let repository = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    for name in ["legacy.proto", "modern.proto", "edition.proto", "google/protobuf/descriptor.proto"] {
        let path = if name.starts_with("google/") { repository.join("fixtures/protobuf/upstream").join(name) } else { repository.join("fixtures/protobuf").join(name) };
        let text = fs::read_to_string(path).expect("frozen source fixture");
        files.push((Utf16::from(name), Value::string_utf8(text)));
    }
    let request = Value::Object(vec![
        (Utf16::from("files"), Value::Object(files)),
        (Utf16::from("roots"), Value::Array(["legacy.proto", "modern.proto", "edition.proto"].into_iter().map(Value::string_utf8).collect())),
    ]);
    let doc = protobuf_source::import_sources(&request, "r5-real-protoc", &mut compiler, &mut Context::ordinary())
        .expect("trusted protoc callback should compile the frozen source corpus");
    let inspected = protobuf_document::inspect(&doc, &mut Context::ordinary()).unwrap();
    assert!(inspected.valid);
    assert!(!inspected.complete, "compiler invocation does not silently promote semantic completeness");
    let modules = get(&doc, "modules");
    let module = &array(modules).unwrap()[0];
    let elements = get(module, "elements");
    let element = &array(elements).unwrap()[0];
    let archive = get(get(get(element, "extensions"), "umf.protobuf"), "sourceArchive");
    assert_eq!(get(archive, "compiler"), &Value::string_utf8("libprotoc 36.2"));
    assert_eq!(get(archive, "files"), get(&request, "files"));
    assert_eq!(get(archive, "roots"), get(&request, "roots"));
    let bytes = protobuf_document::export_descriptor_set(&doc, &mut Context::ordinary()).unwrap();
    assert!(!bytes.is_empty());
    if let Some(path) = std::env::var_os("UMF_R5_PROTOBUF_DESCRIPTOR_OUT") {
        fs::write(path, &bytes).expect("write test output requested by qualification harness");
    }
    let descriptor_hash = format!("{:x}", Sha256::digest(&bytes));
    println!("R5_PROTOBUF_REAL_COMPILER version={} descriptor_set_sha256={} descriptor_bytes={}", version_text.trim(), descriptor_hash, bytes.len());

    let missing_import = source_request("a.proto", "syntax = \"proto3\"; import \"not-supplied.proto\"; message A {}", "a.proto");
    assert_eq!(protobuf_source::import_sources(&missing_import, "missing", &mut compiler, &mut Context::ordinary()).unwrap_err().code, "PROTOBUF_SOURCE");
    let duplicate_field = source_request("a.proto", "syntax = \"proto3\"; message A { string x = 1; int32 y = 1; }", "a.proto");
    assert_eq!(protobuf_source::import_sources(&duplicate_field, "invalid", &mut compiler, &mut Context::ordinary()).unwrap_err().code, "PROTOBUF_SOURCE");

    let started = Arc::new(AtomicBool::new(false));
    let killed = Arc::new(AtomicBool::new(false));
    let reaped = Arc::new(AtomicBool::new(false));
    let completed = Arc::new(AtomicBool::new(false));
    let mut controlled_compiler = Protoc { executable, version: Utf16::from(version_text.trim()), started: started.clone(), killed_running_child_on_control: killed.clone(), reaped_child_on_control: reaped.clone(), child_completed_before_kill: completed.clone() };
    let mut control = move |_: usize| {
        if started.load(Ordering::Acquire) { Err(EngineError::new("R5_TEST_CONTROL", Utf16::default(), "stop after native process starts")) } else { Ok(()) }
    };
    let mut context = Context::ordinary().with_host_control(&mut control);
    let error = protobuf_source::import_sources(&request, "controlled", &mut controlled_compiler, &mut context).unwrap_err();
    assert_eq!(error.code, "R5_TEST_CONTROL", "host-control refusal must be preserved after child cleanup");
    assert!(reaped.load(Ordering::Acquire), "callback must reap protoc after Context control refusal");
    assert!(killed.load(Ordering::Acquire) || completed.load(Ordering::Acquire), "record whether the running child was killed or had completed before termination");
    println!("R5_PROTOBUF_CONTROL reaped=true killed_running={} completed_before_kill={}", killed.load(Ordering::Acquire), completed.load(Ordering::Acquire));
}

fn source_request(name: &str, text: &str, root: &str) -> Value {
    Value::Object(vec![
        (Utf16::from("files"), Value::Object(vec![(Utf16::from(name), Value::string_utf8(text))])),
        (Utf16::from("roots"), Value::Array(vec![Value::string_utf8(root)])),
    ])
}
fn get<'a>(value: &'a Value, name: &str) -> &'a Value {
    match value { Value::Object(fields) => fields.iter().find(|(key, _)| key.to_utf8().is_ok_and(|text| text == name)).map(|(_, value)| value).unwrap(), Value::Array(values) => &values[name.parse::<usize>().unwrap()], _ => panic!("container expected") }
}
fn object(value: &Value) -> Result<&[(Utf16, Value)], EngineError> { if let Value::Object(value) = value { Ok(value) } else { Err(failure("expected object")) } }
fn array(value: &Value) -> Result<&[Value], EngineError> { if let Value::Array(value) = value { Ok(value) } else { Err(failure("expected array")) } }
fn field<'a>(object: &'a [(Utf16, Value)], name: &str) -> Result<&'a Value, EngineError> { object.iter().find(|(key, _)| key.to_utf8().is_ok_and(|text| text == name)).map(|(_, value)| value).ok_or_else(|| failure("missing request field")) }
fn string(value: &Value) -> Result<&Utf16, EngineError> { if let Value::String(value) = value { Ok(value) } else { Err(failure("expected string")) } }
fn failure(message: impl AsRef<str>) -> EngineError { EngineError::new("PROTOBUF_SOURCE", Utf16::default(), message.as_ref()) }
