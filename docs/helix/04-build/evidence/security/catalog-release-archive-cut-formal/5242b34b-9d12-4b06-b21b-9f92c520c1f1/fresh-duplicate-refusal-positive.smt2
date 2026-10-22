; benchmark generated from python API
(set-info :status unknown)
(declare-fun observed_matches () Int)
(declare-fun actual_matches () Int)
(declare-fun next_actual_matches () Int)
(declare-fun fresh_snapshot () Bool)
(assert
 (>= observed_matches 0))
(assert
 (>= actual_matches 0))
(assert
 (>= next_actual_matches 0))
(assert
 (let (($x15 (= observed_matches actual_matches)))
 (=> fresh_snapshot $x15)))
(assert
 fresh_snapshot)
(assert
 (= actual_matches 2))
(assert
 (let (($x22 (= observed_matches 1)))
(not $x22)))
(check-sat)
