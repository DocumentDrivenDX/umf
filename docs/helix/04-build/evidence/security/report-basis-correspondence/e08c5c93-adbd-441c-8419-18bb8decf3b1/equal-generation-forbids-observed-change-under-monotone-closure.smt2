; benchmark generated from python API
(set-info :status unknown)
(declare-fun generation_after () Int)
(declare-fun generation_before () Int)
(declare-fun generation_after_intermediate_changed_event () Int)
(assert
 (= generation_before generation_after))
(assert
 (> generation_after_intermediate_changed_event generation_before))
(assert
 (>= generation_after generation_after_intermediate_changed_event))
(check-sat)
