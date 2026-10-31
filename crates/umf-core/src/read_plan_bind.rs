//! Bounded read-plan selection and callback ordering for the Python adapter.
//!
//! The host owns validation, target observations, pin matching and model
//! construction. This module owns only the ordered selection protocol.

/// Lazy host operations needed to select and prepare one compiled read variant.
pub trait ReadPlanBindHost {
    type Identity;
    type Error;

    fn preflight_artifact(&mut self, variant: usize) -> Result<(), Self::Error>;
    fn target_identity(&mut self) -> Result<Self::Identity, Self::Error>;
    fn presence_matches(&mut self, variant: usize) -> Result<bool, Self::Error>;
    fn pin_matches(
        &mut self,
        identity: &Self::Identity,
        variant: usize,
    ) -> Result<bool, Self::Error>;
    fn selected_artifact(&mut self, variant: usize) -> Result<(), Self::Error>;
    fn build_parameters(&mut self, variant: usize) -> Result<(), Self::Error>;
}

/// Run the observable selection sequence. Candidate matching is deliberately
/// exhaustive: the predecessor evaluates every presence-eligible variant.
pub fn bind<H: ReadPlanBindHost>(
    variant_count: usize,
    host: &mut H,
) -> Result<Option<usize>, H::Error> {
    for variant in 0..variant_count {
        host.preflight_artifact(variant)?;
    }

    let identity = host.target_identity()?;
    let mut selected = None;
    let mut matches = 0usize;
    for variant in 0..variant_count {
        if host.presence_matches(variant)? && host.pin_matches(&identity, variant)? {
            selected = Some(variant);
            matches += 1;
        }
    }
    if matches != 1 {
        return Ok(None);
    }

    let selected = selected.expect("one match has a selected variant");
    host.selected_artifact(selected)?;
    host.build_parameters(selected)?;
    Ok(Some(selected))
}

#[cfg(test)]
mod tests {
    use super::{bind, ReadPlanBindHost};

    #[derive(Default)]
    struct Host {
        trace: Vec<String>,
        matching: Vec<bool>,
        presence: Vec<bool>,
        fail_at: Option<&'static str>,
    }

    impl Host {
        fn step(&mut self, name: String) -> Result<(), String> {
            self.trace.push(name.clone());
            if self.fail_at == Some(name.as_str()) {
                Err(name)
            } else {
                Ok(())
            }
        }
    }

    impl ReadPlanBindHost for Host {
        type Identity = ();
        type Error = String;

        fn preflight_artifact(&mut self, variant: usize) -> Result<(), Self::Error> {
            self.step(format!("preflight:{variant}"))
        }
        fn target_identity(&mut self) -> Result<Self::Identity, Self::Error> {
            self.step("identity".into())?;
            Ok(())
        }
        fn presence_matches(&mut self, variant: usize) -> Result<bool, Self::Error> {
            self.step(format!("presence:{variant}"))?;
            Ok(self.presence[variant])
        }
        fn pin_matches(&mut self, _: &Self::Identity, variant: usize) -> Result<bool, Self::Error> {
            self.step(format!("match:{variant}"))?;
            Ok(self.matching[variant])
        }
        fn selected_artifact(&mut self, variant: usize) -> Result<(), Self::Error> {
            self.step(format!("selected:{variant}"))
        }
        fn build_parameters(&mut self, variant: usize) -> Result<(), Self::Error> {
            self.step(format!("parameters:{variant}"))
        }
    }

    #[test]
    fn preflights_before_identity_and_calls_late_callbacks_only_for_one_match() {
        let variants = 2;
        let mut host = Host {
            matching: vec![false, true],
            presence: vec![true, true],
            ..Host::default()
        };
        assert_eq!(bind(variants, &mut host), Ok(Some(1)));
        assert_eq!(
            host.trace,
            [
                "preflight:0",
                "preflight:1",
                "identity",
                "presence:0",
                "match:0",
                "presence:1",
                "match:1",
                "selected:1",
                "parameters:1"
            ]
        );
    }

    #[test]
    fn rejects_zero_or_multiple_matches_before_late_callbacks() {
        let variants = 2;
        for matching in [vec![false, false], vec![true, true]] {
            let mut host = Host {
                matching,
                presence: vec![true, true],
                ..Host::default()
            };
            assert_eq!(bind(variants, &mut host), Ok(None));
            assert_eq!(host.trace.last().map(String::as_str), Some("match:1"));
        }
    }

    #[test]
    fn callback_failures_stop_the_sequence_at_the_throwing_observation() {
        let variants = 2;
        let mut host = Host {
            matching: vec![false, true],
            presence: vec![true, true],
            fail_at: Some("preflight:1"),
            ..Host::default()
        };
        assert_eq!(bind(variants, &mut host), Err("preflight:1".into()));
        assert_eq!(host.trace, ["preflight:0", "preflight:1"]);

        let mut host = Host {
            matching: vec![false, true],
            presence: vec![true, true],
            fail_at: Some("presence:0"),
            ..Host::default()
        };
        assert_eq!(bind(variants, &mut host), Err("presence:0".into()));
        assert_eq!(
            host.trace,
            ["preflight:0", "preflight:1", "identity", "presence:0"]
        );
    }
}
