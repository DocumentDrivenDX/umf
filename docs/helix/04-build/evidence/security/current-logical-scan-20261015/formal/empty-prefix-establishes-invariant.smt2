; benchmark generated from python API
(set-info :status unknown)
(declare-fun population_size () Int)
(declare-fun row_decision (Int) Int)
(declare-fun visited_prefix () Int)
(declare-fun unresolved_seen () Bool)
(declare-fun emitted () (Array Int Bool))
(assert
 (>= population_size 0))
(assert
 (forall ((row_index Int) )(let (($x28 (and (>= (row_decision row_index) 0) (<= (row_decision row_index) 3))))
 (=> (and (>= row_index 0) (< row_index population_size)) $x28)))
 )
(assert
 (= visited_prefix 0))
(assert
 (= unresolved_seen false))
(assert
 (= emitted ((as const (Array Int Bool)) false)))
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
(let (($x18 (and $x15 (<= visited_prefix population_size) (= $x37 unresolved_seen) $x48)))
(not $x18))))))
(check-sat)
