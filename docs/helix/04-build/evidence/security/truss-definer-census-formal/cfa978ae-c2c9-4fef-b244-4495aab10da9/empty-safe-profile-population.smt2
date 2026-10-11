; benchmark generated from python API
(set-info :status unknown)
(declare-fun definer () Bool)
(declare-fun executable () Bool)
(declare-fun other_selected () Bool)
(declare-fun prior_reason () Bool)
(declare-fun unsafe_role () Bool)
(assert
 (not definer))
(assert
 (not executable))
(assert
 (not other_selected))
(assert
 (not prior_reason))
(assert
 (not unsafe_role))
(assert
 (let (($x11 (and definer executable)))
(let (($x12 (or $x11 other_selected)))
(not (or $x12 prior_reason unsafe_role)))))
(check-sat)
