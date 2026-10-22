; benchmark generated from python API
(set-info :status unknown)
(declare-fun new_unknown () (Array Int Bool))
(declare-fun old_unknown () (Array Int Bool))
(declare-fun classification_witness () Int)
(assert
 (= old_unknown new_unknown))
(assert
 (select old_unknown classification_witness))
(check-sat)
