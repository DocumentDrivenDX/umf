; benchmark generated from python API
(set-info :status unknown)
(declare-fun scan_count () Int)
(declare-fun limit () Int)
(declare-fun prefix_cost (Int) Int)
(declare-fun cost (Int) Int)
(declare-fun visited_prefix () Int)
(declare-fun local_scans () (Array Int Bool))
(declare-fun bad () Bool)
(declare-fun scan_ok (Int) Bool)
(declare-fun source_preflight () Bool)
(declare-fun index () Int)
(assert
 (> scan_count 0))
(assert
 (> limit 0))
(assert
 (= (prefix_cost 0) 0))
(assert
 (forall ((index Int) )(let ((?x32 (cost index)))
 (let (($x38 (>= ?x32 0)))
 (let (($x39 (and $x38 (= (prefix_cost (+ index 1)) (+ (prefix_cost index) ?x32)))))
 (let (($x40 (< index scan_count)))
 (let (($x41 (>= index 0)))
 (let (($x42 (and $x41 $x40)))
 (=> $x42 $x39))))))))
 )
(assert
 (let (($x51 (forall ((index Int) )(let (($x40 (< index scan_count)))
 (let (($x41 (>= index 0)))
 (let (($x42 (and $x41 $x40)))
 (=> $x42 (= (select local_scans index) (< index visited_prefix)))))))
 ))
 (let (($x30 (exists ((index Int) )(let (($x27 (not (scan_ok index))))
 (let (($x28 (< index visited_prefix)))
 (let (($x41 (>= index 0)))
 (and $x41 $x28 $x27)))))
 ))
 (let (($x18 (>= visited_prefix 0)))
 (and $x18 (<= visited_prefix scan_count) (= $x30 bad) $x51)))))
(assert
 (let (($x56 (not bad)))
 (let (($x55 (= visited_prefix scan_count)))
 (and source_preflight $x55 $x56 (<= (prefix_cost visited_prefix) limit)))))
(assert
 (>= index 0))
(assert
 (< index scan_count))
(assert
 (not (select local_scans index)))
(check-sat)
