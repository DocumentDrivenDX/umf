; benchmark generated from python API
(set-info :status unknown)
(declare-fun observed_matches () Int)
(declare-fun actual_matches () Int)
(declare-fun next_actual_matches () Int)
(declare-fun fresh_snapshot () Bool)
(declare-fun archive_guard_held () Bool)
(declare-fun same_writer () Bool)
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
 (= observed_matches 1))
(assert
 (not archive_guard_held))
(assert
 (not same_writer))
(assert
 (let (($x19 (= next_actual_matches actual_matches)))
 (let (($x17 (not same_writer)))
 (let (($x18 (and archive_guard_held $x17)))
 (=> $x18 $x19)))))
(assert
 (= next_actual_matches 2))
(check-sat)
