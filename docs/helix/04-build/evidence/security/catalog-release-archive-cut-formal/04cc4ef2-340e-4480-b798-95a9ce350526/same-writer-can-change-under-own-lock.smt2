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
 (let (($x18 (= observed_matches actual_matches)))
 (=> fresh_snapshot $x18)))
(assert
 fresh_snapshot)
(assert
 (= observed_matches 1))
(assert
 archive_guard_held)
(assert
 same_writer)
(assert
 (let (($x22 (= next_actual_matches actual_matches)))
 (let (($x20 (not same_writer)))
 (let (($x21 (and archive_guard_held $x20)))
 (=> $x21 $x22)))))
(assert
 (= next_actual_matches 2))
(check-sat)
