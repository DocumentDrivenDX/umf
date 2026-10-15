; benchmark generated from python API
(set-info :status unknown)
(declare-fun replacement_scalars () Int)
(declare-fun input_scalars () Int)
(declare-fun match_count () Int)
(declare-fun removed_scalars () Int)
(assert
 (let ((?x75 (* match_count replacement_scalars)))
(let (($x80 (> (+ (- input_scalars removed_scalars) ?x75) (* input_scalars (+ replacement_scalars 1)))))
(let (($x94 (= removed_scalars 0)))
(let (($x57 (>= input_scalars 0)))
(and $x57 (> replacement_scalars 0) (= match_count (+ input_scalars 1)) $x94 $x80))))))
(check-sat)
