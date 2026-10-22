// SPDX-License-Identifier: MIT OR Apache-2.0
use crate::{error::EngineError, value::Utf16};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResourceProfile {
    Cooperative,
    HardIsolated,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Limits {
    pub max_text_units: usize,
    pub max_depth: usize,
    pub max_values: usize,
    pub max_constraint_steps: usize,
    pub max_coefficient_digits: usize,
}

impl Limits {
    pub const fn ordinary() -> Self {
        Self {
            max_text_units: 4_000_000,
            max_depth: 128,
            max_values: 100_000,
            max_constraint_steps: 5_000_000,
            max_coefficient_digits: 4_000_000,
        }
    }

    pub const fn catalog() -> Self {
        Self {
            max_values: 1_000_000,
            ..Self::ordinary()
        }
    }
}

pub type WorkMeter<'a> = dyn FnMut(usize) -> Result<(), EngineError> + 'a;
pub type CancellationCheck<'a> = dyn FnMut() -> bool + 'a;
pub type Clock<'a> = dyn FnMut() -> Option<u64> + 'a;
pub type FallibleCancellationCheck<'a> = dyn FnMut() -> Result<bool, EngineError> + 'a;
pub type FallibleClock<'a> = dyn FnMut() -> Result<Option<u64>, EngineError> + 'a;

/// Per-invocation limits and explicit host capabilities. The context owns all
/// counters; no global or ambient runtime state is consulted.
pub struct Context<'a> {
    limits: Limits,
    profile: ResourceProfile,
    charged_work: u64,
    constraint_steps: usize,
    meter: Option<&'a mut WorkMeter<'a>>,
    host_control: Option<&'a mut WorkMeter<'a>>,
    cancellation: Option<&'a mut CancellationCheck<'a>>,
    clock: Option<&'a mut Clock<'a>>,
    fallible_cancellation: Option<&'a mut FallibleCancellationCheck<'a>>,
    fallible_clock: Option<&'a mut FallibleClock<'a>>,
    deadline_ms: Option<u64>,
}

impl<'a> Context<'a> {
    pub fn ordinary() -> Self {
        Self::with_limits(ResourceProfile::Cooperative, Limits::ordinary())
            .expect("the cooperative profile is available")
    }

    pub fn catalog() -> Self {
        Self::with_limits(ResourceProfile::Cooperative, Limits::catalog())
            .expect("the cooperative profile is available")
    }

    pub fn with_limits(profile: ResourceProfile, limits: Limits) -> Result<Self, EngineError> {
        if profile == ResourceProfile::HardIsolated {
            return Err(EngineError::new(
                "RESOURCE_PROFILE_UNAVAILABLE",
                Utf16::default(),
                "HardIsolated resource profile is unavailable",
            ));
        }
        Ok(Self {
            limits,
            profile,
            charged_work: 0,
            constraint_steps: 0,
            meter: None,
            host_control: None,
            cancellation: None,
            clock: None,
            fallible_cancellation: None,
            fallible_clock: None,
            deadline_ms: None,
        })
    }

    pub fn with_meter(mut self, meter: &'a mut WorkMeter<'a>) -> Self {
        self.meter = Some(meter);
        self
    }

    /// Attach an explicit host-owned cooperative control hook. Bindings use
    /// this for cancellation, deadlines, and additional work budgets. It is
    /// called during Rust work admission and never selected by document data.
    pub fn with_host_control(mut self, control: &'a mut WorkMeter<'a>) -> Self {
        self.host_control = Some(control);
        self
    }

    pub fn with_cancellation(mut self, check: &'a mut CancellationCheck<'a>) -> Self {
        self.cancellation = Some(check);
        self
    }

    pub fn with_fallible_cancellation(
        mut self,
        check: &'a mut FallibleCancellationCheck<'a>,
    ) -> Self {
        self.fallible_cancellation = Some(check);
        self
    }

    pub fn with_clock(mut self, clock: &'a mut Clock<'a>, deadline_ms: u64) -> Self {
        self.clock = Some(clock);
        self.deadline_ms = Some(deadline_ms);
        self
    }

    pub fn with_fallible_clock(
        mut self,
        clock: &'a mut FallibleClock<'a>,
        deadline_ms: u64,
    ) -> Self {
        self.fallible_clock = Some(clock);
        self.deadline_ms = Some(deadline_ms);
        self
    }

    pub fn limits(&self) -> Limits {
        self.limits
    }

    pub fn profile(&self) -> ResourceProfile {
        self.profile
    }

    pub fn charged_work(&self) -> u64 {
        self.charged_work
    }

    pub fn constraint_steps(&self) -> usize {
        self.constraint_steps
    }

    /// Admit UTF-16 source/output units before allocating their storage.
    /// Direct value/interpreter copies use `charge_work` without a text ceiling.
    pub fn charge_text(&mut self, units: usize, path: Utf16) -> Result<(), EngineError> {
        if units > self.limits.max_text_units {
            return Err(EngineError::new("LIMIT", path, "Text-unit limit exceeded"));
        }
        self.charge_work(units, Utf16::default())
    }

    pub fn check_tree_value_count(&self, count: usize, path: Utf16) -> Result<(), EngineError> {
        if count > self.limits.max_values {
            return Err(EngineError::new(
                "LIMIT",
                path,
                "JSON structural value limit exceeded",
            ));
        }
        Ok(())
    }

    pub fn charge_constraint_step(&mut self, path: Utf16) -> Result<(), EngineError> {
        self.constraint_steps = self.constraint_steps.saturating_add(1);
        if self.constraint_steps > self.limits.max_constraint_steps {
            return Err(EngineError::new(
                "LIMIT",
                path,
                "Constraint instruction limit exceeded",
            ));
        }
        self.charge_work(1, Utf16::default())
    }

    pub fn charge_work(&mut self, amount: usize, path: Utf16) -> Result<(), EngineError> {
        self.charge_work_u64(amount as u64, path)
    }

    /// Wide operation estimates and totals have identical representation on
    /// native and wasm32. Host notifications use the same bounded chunks on
    /// both targets, preserving the existing usize callback interface.
    pub fn charge_work_u64(&mut self, amount: u64, path: Utf16) -> Result<(), EngineError> {
        let Some(total) = self.charged_work.checked_add(amount) else {
            return Err(EngineError::new("LIMIT", path, "Work counter overflow"));
        };
        self.charged_work = total;
        if self.meter.is_none()
            && self.host_control.is_none()
            && self.cancellation.is_none()
            && self.fallible_cancellation.is_none()
            && self.deadline_ms.is_none()
        {
            return Ok(());
        }
        let mut remaining = amount;
        loop {
            let chunk = remaining.min(u64::from(u32::MAX)) as usize;
            if let Some(meter) = self.meter.as_deref_mut() {
                meter(chunk).map_err(EngineError::from_host)?;
            }
            if let Some(control) = self.host_control.as_deref_mut() {
                control(chunk).map_err(EngineError::from_host)?;
            }
            self.check_cancelled(path.clone())?;
            self.check_deadline(path.clone())?;
            remaining -= chunk as u64;
            if remaining == 0 {
                return Ok(());
            }
        }
    }

    pub fn check_cancelled(&mut self, path: Utf16) -> Result<(), EngineError> {
        if let Some(check) = self.fallible_cancellation.as_deref_mut() {
            if check().map_err(EngineError::from_host)? {
                return Err(EngineError::new("CANCELLED", path, "Operation cancelled"));
            }
        }
        if self
            .cancellation
            .as_deref_mut()
            .is_some_and(|check| check())
        {
            return Err(EngineError::new("CANCELLED", path, "Operation cancelled"));
        }
        Ok(())
    }

    pub fn check_deadline(&mut self, path: Utf16) -> Result<(), EngineError> {
        let Some(deadline) = self.deadline_ms else {
            return Ok(());
        };
        if let Some(clock) = self.fallible_clock.as_deref_mut() {
            let Some(now) = clock().map_err(EngineError::from_host)? else {
                return Err(EngineError::new(
                    "CLOCK_CAPABILITY_REQUIRED",
                    path,
                    "Host clock capability did not return a time",
                ));
            };
            if now > deadline {
                return Err(EngineError::new("DEADLINE", path, "Deadline elapsed"));
            }
            return Ok(());
        }
        let Some(clock) = self.clock.as_deref_mut() else {
            return Err(EngineError::new(
                "CLOCK_CAPABILITY_REQUIRED",
                path,
                "Host clock capability is required for deadline requests",
            ));
        };
        let Some(now) = clock() else {
            return Err(EngineError::new(
                "CLOCK_CAPABILITY_REQUIRED",
                path,
                "Host clock capability did not return a time",
            ));
        };
        if now > deadline {
            return Err(EngineError::new("DEADLINE", path, "Deadline elapsed"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn work_accumulator_crosses_u32_without_a_platform_limit() {
        let mut ctx = Context::ordinary();
        ctx.charge_work(u32::MAX as usize, Utf16::default())
            .unwrap();
        ctx.charge_work(1, Utf16::default()).unwrap();
        assert_eq!(ctx.charged_work(), u64::from(u32::MAX) + 1);
    }

    #[test]
    fn work_meter_still_observes_each_charge_above_u32_total() {
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            Ok(())
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        ctx.charge_work(u32::MAX as usize, Utf16::default())
            .unwrap();
        ctx.charge_work(7, Utf16::default()).unwrap();
        assert_eq!(ctx.charged_work(), u64::from(u32::MAX) + 7);
        drop(ctx);
        assert_eq!(observed, vec![u32::MAX as usize, 7]);
    }

    #[test]
    fn wide_work_notifications_have_portable_chunks() {
        let mut observed = Vec::new();
        let mut meter = |amount| {
            observed.push(amount);
            Ok(())
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        ctx.charge_work_u64(u64::from(u32::MAX) * 2 + 19, Utf16::default())
            .unwrap();
        assert_eq!(ctx.charged_work(), u64::from(u32::MAX) * 2 + 19);
        drop(ctx);
        assert_eq!(observed, vec![u32::MAX as usize, u32::MAX as usize, 19]);
    }

    #[test]
    fn wide_work_stops_on_a_meter_refusal_before_later_chunks() {
        let mut calls = 0;
        let mut meter = |_| {
            calls += 1;
            Err(EngineError::new("WIDE_DENIED", Utf16::default(), "denied"))
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = ctx
            .charge_work_u64(u64::from(u32::MAX) + 1, Utf16::default())
            .unwrap_err();
        assert_eq!(error.code, "WIDE_DENIED");
        drop(ctx);
        assert_eq!(calls, 1);
    }

    #[test]
    fn unobserved_wide_charge_needs_no_callback_loop_and_overflow_refuses() {
        let mut ctx = Context::ordinary();
        ctx.charge_work_u64(u64::MAX, Utf16::default()).unwrap();
        assert_eq!(ctx.charged_work(), u64::MAX);
        assert_eq!(
            ctx.charge_work_u64(1, Utf16::default()).unwrap_err().code,
            "LIMIT"
        );
    }
}
