; benchmark generated from python API
(set-info :status unknown)
(declare-fun definer () Bool)
(declare-fun executable () Bool)
(declare-fun namespace_usage () Bool)
(declare-fun prior_reason () Bool)
(declare-fun unsafe_role () Bool)
(declare-fun other_selected () Bool)
(assert
 definer)
(assert
 executable)
(assert
 (not namespace_usage))
(assert
 (not prior_reason))
(assert
 (not unsafe_role))
(assert
 (let (($x11 (and definer executable)))
(let (($x12 (or $x11 other_selected)))
(let (($x14 (not (or $x12 prior_reason unsafe_role))))
(not $x14)))))
(check-sat)
