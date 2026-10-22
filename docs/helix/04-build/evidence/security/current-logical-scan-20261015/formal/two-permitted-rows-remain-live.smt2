; benchmark generated from python API
(set-info :status unknown)
(declare-fun population_size () Int)
(declare-fun row_decision (Int) Int)
(declare-fun emitted () (Array Int Bool))
(declare-fun visited_prefix () Int)
(declare-fun unresolved_seen () Bool)
(declare-fun supplied_complete_cut () Bool)
(declare-fun source_preflight () Bool)
(assert
 (>= population_size 0))
(assert
 (forall ((row_index Int) )(let (($x28 (and (>= (row_decision row_index) 0) (<= (row_decision row_index) 3))))
 (=> (and (>= row_index 0) (< row_index population_size)) $x28)))
 )
(assert
 (let (($x48 (forall ((row_index Int) )(let ((?x25 (row_decision row_index)))
 (let (($x43 (= ?x25 1)))
 (let (($x44 (select emitted row_index)))
 (let (($x45 (= $x44 $x43)))
 (=> (and (>= row_index 0) (< row_index visited_prefix)) $x45))))))
 ))
 (let (($x37 (exists ((row_index Int) )(let ((?x25 (row_decision row_index)))
 (let (($x34 (>= ?x25 2)))
 (let (($x35 (< row_index visited_prefix)))
 (let (($x30 (>= row_index 0)))
 (and $x30 $x35 $x34))))))
 ))
 (let (($x15 (>= visited_prefix 0)))
 (and $x15 (<= visited_prefix population_size) (= $x37 unresolved_seen) $x48)))))
(assert
 (= population_size 2))
(assert
 (= visited_prefix 2))
(assert
 (= (row_decision 0) 1))
(assert
 (let ((?x85 (row_decision 1)))
 (= ?x85 1)))
(assert
 (let (($x53 (not unresolved_seen)))
 (let (($x52 (= visited_prefix population_size)))
 (and source_preflight supplied_complete_cut $x52 $x53))))
(assert
 (select emitted 0))
(assert
 (select emitted 1))
(check-sat)
