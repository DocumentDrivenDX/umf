; benchmark generated from python API
(set-info :status unknown)
(declare-fun captured_generation () Int)
(declare-fun generation () Int)
(declare-fun permitted () Bool)
(declare-fun row_found () Bool)
(declare-fun next_generation () Int)
(assert
 (let (($x16 (= generation captured_generation)))
(let (($x18 (not permitted)))
(let (($x15 (and (> generation 0) (> captured_generation 0) (> next_generation 0))))
(and $x15 row_found $x18 $x16)))))
(check-sat)
