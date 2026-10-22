// SPDX-License-Identifier: MIT OR Apache-2.0
use std::{env, fs, hint::black_box, process, time::Instant};

use umf_core::{
    serialization::{read_json_value, Format},
    Capabilities, Context, Diagnostic, Engine, EngineError, Registry, ResourceSet, Utf16, Value,
};

struct NoCapabilities;

impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &umf_core::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Err(Utf16::from(
            "benchmark workload unexpectedly requested a callback",
        ))
    }
}

fn read_value(path: &str, catalog: bool) -> Result<Value, EngineError> {
    let source = fs::read_to_string(path)
        .map_err(|error| EngineError::new("BENCH_INPUT", Utf16::default(), error.to_string()))?;
    let units = source.encode_utf16().collect::<Vec<_>>();
    let mut ctx = if catalog {
        Context::catalog()
    } else {
        Context::ordinary()
    };
    read_json_value(&units, Format::Json, &mut ctx)
}

fn setup(args: &[String]) -> Result<(Engine, Registry, Value), EngineError> {
    if args.len() != 7 {
        return Err(EngineError::new(
            "BENCH_ARGS",
            Utf16::default(),
            "expected five resource paths, a document path, and a mode",
        ));
    }
    let core_schema = read_value(&args[0], true)?;
    let reference_schema = read_value(&args[1], true)?;
    let package_schema = read_value(&args[2], true)?;
    let constraints = read_value(&args[3], true)?;
    let domain_policy = read_value(&args[4], true)?;
    let document = read_value(&args[5], false)?;
    let mut setup_ctx = Context::catalog();
    let engine = Engine::new(
        ResourceSet::new(
            core_schema,
            reference_schema,
            package_schema,
            constraints,
            domain_policy,
        ),
        &mut setup_ctx,
    )?;
    Ok((engine, Registry::new(), document))
}

fn run_admission(document: &Value) -> Result<(u64, usize), EngineError> {
    let mut ctx = Context::ordinary();
    let admitted = umf_core::copy_json(document, &mut ctx)?;
    if admitted != *document {
        return Err(EngineError::new(
            "BENCH_ASSERT",
            Utf16::default(),
            "admitted copy differs from the source value",
        ));
    }
    black_box(admitted);
    Ok((ctx.charged_work(), ctx.constraint_steps()))
}

fn run_validation(
    engine: &Engine,
    registry: &Registry,
    document: &Value,
) -> Result<(u64, usize, usize), EngineError> {
    let mut ctx = Context::ordinary();
    let result = engine.validate_document(document, registry, &mut NoCapabilities, &mut ctx)?;
    if !result.valid || !result.complete {
        return Err(EngineError::new(
            "BENCH_ASSERT",
            Utf16::default(),
            "representative validation must be valid and complete",
        ));
    }
    if ctx.constraint_steps() == 0 {
        return Err(EngineError::new(
            "BENCH_ASSERT",
            Utf16::default(),
            "representative validation must execute generated constraint instructions",
        ));
    }
    let diagnostics = result.diagnostics.len();
    black_box(result);
    Ok((ctx.charged_work(), ctx.constraint_steps(), diagnostics))
}

fn nanos(duration: std::time::Duration) -> u128 {
    duration.as_nanos()
}

fn main() {
    if let Err(error) = run() {
        eprintln!(
            "{}: {}",
            error.code,
            error.message.to_utf8().unwrap_or_default()
        );
        process::exit(2);
    }
}

fn run() -> Result<(), EngineError> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    let (engine, registry, document) = setup(&args)?;
    let mode = args[6].as_str();
    match mode {
        "--cold-validation" => {
            let started = Instant::now();
            let (work, steps, diagnostics) = run_validation(&engine, &registry, &document)?;
            println!(
                "{{\"mode\":\"cold-validation\",\"validationNanosAfterSetup\":{},\"work\":{},\"constraintSteps\":{},\"diagnostics\":{}}}",
                nanos(started.elapsed()), work, steps, diagnostics
            );
        }
        "--batch" => {
            let iterations = 500usize;
            let admission_start = Instant::now();
            let first_admission = run_admission(&document)?;
            let first_admission_nanos = nanos(admission_start.elapsed());
            let admission_start = Instant::now();
            let mut admission_work = 0u64;
            for _ in 0..iterations {
                admission_work = admission_work.saturating_add(run_admission(&document)?.0);
            }
            let admission_batch_nanos = nanos(admission_start.elapsed());

            let validation_start = Instant::now();
            let first_validation = run_validation(&engine, &registry, &document)?;
            let first_validation_nanos = nanos(validation_start.elapsed());
            let validation_start = Instant::now();
            let mut validation_work = 0u64;
            let mut validation_steps = 0usize;
            let mut validation_diagnostics = 0usize;
            for _ in 0..iterations {
                let (work, steps, diagnostics) = run_validation(&engine, &registry, &document)?;
                validation_work = validation_work.saturating_add(work);
                validation_steps = validation_steps.saturating_add(steps);
                validation_diagnostics = validation_diagnostics.saturating_add(diagnostics);
            }
            let validation_batch_nanos = nanos(validation_start.elapsed());

            println!(
                concat!(
                    "{{\"mode\":\"batch\",\"iterations\":{},",
                    "\"admission\":{{\"firstNanosAfterSetup\":{},\"firstWork\":{},",
                    "\"firstConstraintSteps\":{},\"batchNanos\":{},\"batchWork\":{},",
                    "\"workPerCall\":{}}},",
                    "\"validation\":{{\"firstNanosAfterSetup\":{},\"firstWork\":{},",
                    "\"firstConstraintSteps\":{},\"firstDiagnostics\":{},",
                    "\"batchNanos\":{},\"batchWork\":{},\"batchConstraintSteps\":{},",
                    "\"batchDiagnostics\":{},\"workPerCall\":{},\"stepsPerCall\":{}}}}}"
                ),
                iterations,
                first_admission_nanos,
                first_admission.0,
                first_admission.1,
                admission_batch_nanos,
                admission_work,
                admission_work / iterations as u64,
                first_validation_nanos,
                first_validation.0,
                first_validation.1,
                first_validation.2,
                validation_batch_nanos,
                validation_work,
                validation_steps,
                validation_diagnostics,
                validation_work / iterations as u64,
                validation_steps / iterations,
            );
        }
        _ => {
            return Err(EngineError::new(
                "BENCH_ARGS",
                Utf16::default(),
                "mode must be --cold-validation or --batch",
            ));
        }
    }
    Ok(())
}
