; benchmark generated from python API
(set-info :status unknown)
(declare-fun observed_matches () Int)
(declare-fun actual_matches () Int)
(declare-fun next_actual_matches () Int)
(declare-fun fresh_snapshot () Bool)
(declare-fun archive_guard_held () Bool)
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
 (not fresh_snapshot))
(assert
 (= observed_matches 1))
(assert
 (= actual_matches 2))
(assert
 archive_guard_held)
(check-sat)
