; benchmark generated from python API
(set-info :status unknown)
(declare-fun effective_mode () Int)
(declare-fun ontology_mode () Int)
(declare-fun catalog_mode () Int)
(declare-fun read_disposition () Int)
(declare-fun source_rows () Int)
(declare-fun live_domain () Int)
(declare-fun read_dto_domain () Int)
(declare-fun pre_storage_domain () Int)
(declare-fun operand_domain () Int)
(declare-fun stored () Bool)
(declare-fun input_y () Int)
(declare-fun input_x () Int)
(declare-fun deterministic_transform (Int) Int)
(assert
 (>= effective_mode 0))
(assert
 (<= effective_mode 2))
(assert
 (>= ontology_mode 0))
(assert
 (<= ontology_mode 2))
(assert
 (>= catalog_mode 0))
(assert
 (<= catalog_mode 3))
(assert
 (>= read_disposition 0))
(assert
 (<= read_disposition 3))
(assert
 (>= source_rows 0))
(assert
 (>= live_domain 0))
(assert
 (>= read_dto_domain 0))
(assert
 (>= pre_storage_domain 0))
(assert
 (>= operand_domain 0))
(assert
 (let (($x49 (= read_disposition 1)))
 (let (($x50 (or stored $x49)))
 (=> $x50 (and (distinct catalog_mode 3) true)))))
(assert
 (and (distinct input_x input_y) true))
(assert
 (let ((?x126 (deterministic_transform input_x)))
(= ?x126 (deterministic_transform input_y))))
(check-sat)
