; benchmark generated from python API
(set-info :status unknown)
(declare-fun prior_reason () Bool)
(declare-fun unsafe_role () Bool)
(declare-fun other_selected () Bool)
(declare-fun executable () Bool)
(declare-fun definer () Bool)
(assert
 prior_reason)
(assert
 (let (($x11 (and definer executable)))
(let (($x12 (or $x11 other_selected)))
(not (or $x12 prior_reason unsafe_role)))))
(check-sat)
