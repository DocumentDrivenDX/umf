; benchmark generated from python API
(set-info :status unknown)
(declare-fun definer () Bool)
(declare-fun executable () Bool)
(declare-fun namespace_usage () Bool)
(assert
 definer)
(assert
 executable)
(assert
 (not namespace_usage))
(assert
 (let (($x11 (and definer executable)))
(not $x11)))
(check-sat)
