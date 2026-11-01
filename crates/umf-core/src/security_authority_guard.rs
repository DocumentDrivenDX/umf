// SPDX-License-Identifier: MIT OR Apache-2.0
//! Retained generation identity and one-shot transition receipts for the
//! host-scheduled Security authority guard.
use std::collections::HashSet;

use crate::{context::Context, error::EngineError, value::Utf16};

const MAX_GENERATION_UNITS: usize = 4096;
const MAX_GENERATIONS: usize = 1024;

fn refused() -> EngineError {
    EngineError::new(
        "SECURITY_GUARD_REFUSED",
        Utf16::default(),
        "Authority guard unavailable",
    )
}
fn unknown() -> EngineError {
    EngineError::new(
        "SECURITY_TRANSITION_UNKNOWN",
        Utf16::default(),
        "Authority transition outcome unavailable",
    )
}

/// JS retains only queue scheduling; generation and transition meaning live
/// here. Completion receipts can be used once and only for their new value.
pub struct SecurityAuthorityGuardState {
    generation: Utf16,
    seen: HashSet<Utf16>,
    next_token: u64,
    pending: Option<(u64, Utf16)>,
    closed: bool,
}

impl SecurityAuthorityGuardState {
    pub fn new(generation: &Utf16, context: &mut Context<'_>) -> Result<Self, EngineError> {
        context.charge_work(generation.len(), Utf16::default())?;
        if generation.is_empty() || generation.len() > MAX_GENERATION_UNITS {
            return Err(refused());
        }
        Ok(Self {
            generation: generation.clone(),
            seen: HashSet::from([generation.clone()]),
            next_token: 1,
            pending: None,
            closed: false,
        })
    }

    pub fn begin_read(&self, context: &mut Context<'_>) -> Result<Utf16, EngineError> {
        if self.closed || self.pending.is_some() {
            return Err(refused());
        }
        context.charge_work(self.generation.len(), Utf16::default())?;
        Ok(self.generation.clone())
    }

    pub fn begin_change(
        &mut self,
        generation: &Utf16,
        context: &mut Context<'_>,
    ) -> Result<u64, EngineError> {
        context.charge_work(generation.len(), Utf16::default())?;
        if self.closed
            || self.pending.is_some()
            || generation.is_empty()
            || generation.len() > MAX_GENERATION_UNITS
            || self.seen.len() >= MAX_GENERATIONS
            || self.next_token == 0
        {
            return Err(refused());
        }
        if self.seen.contains(generation) {
            return Err(refused());
        }
        let token = self.next_token;
        self.next_token = self.next_token.checked_add(1).ok_or_else(refused)?;
        self.pending = Some((token, generation.clone()));
        Ok(token)
    }

    pub fn complete_change(
        &mut self,
        token: u64,
        committed: bool,
        context: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let Some((expected, generation)) = self.pending.take() else {
            return Err(refused());
        };
        context.charge_work(generation.len(), Utf16::default())?;
        if expected != token {
            self.pending = Some((expected, generation));
            return Err(refused());
        }
        if !committed || self.closed {
            self.closed = true;
            return Err(unknown());
        }
        self.generation = generation.clone();
        self.seen.insert(generation);
        Ok(())
    }

    pub fn close(&mut self) {
        self.closed = true;
    }
}
