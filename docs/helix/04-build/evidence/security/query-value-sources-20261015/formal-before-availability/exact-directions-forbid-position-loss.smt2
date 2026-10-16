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
(declare-fun emitted_directions () (Array Int Bool))
(declare-fun original_directions () (Array Int Bool))
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
 (forall ((order_index Int) )(let (($x143 (select emitted_directions order_index)))
 (let (($x144 (select original_directions order_index)))
 (let (($x145 (= $x144 $x143)))
 (let (($x147 (>= order_index 0)))
 (let (($x148 (and $x147 (< order_index 2))))
 (=> $x148 $x145)))))))
 )
(assert
 (exists ((order_index Int) )(let (($x143 (select emitted_directions order_index)))
(let (($x144 (select original_directions order_index)))
(let (($x147 (>= order_index 0)))
(let (($x148 (and $x147 (< order_index 2))))
(and $x148 (and (distinct $x144 $x143) true)))))))
)
(check-sat)
