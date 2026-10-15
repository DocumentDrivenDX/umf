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
(declare-fun original_directions () (Array Int Bool))
(declare-fun emitted_directions () (Array Int Bool))
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
 (=> stored (and (distinct live_domain pre_storage_domain) true)))
(assert
 (let (($x51 (= read_disposition 1)))
 (let (($x52 (or stored $x51)))
 (=> $x52 (and (distinct catalog_mode 3) true)))))
(assert
 (let (($x124 (select original_directions 0)))
 (= $x124 false)))
(assert
 (let (($x126 (select original_directions 1)))
 (= $x126 true)))
(assert
 (let (($x140 (select emitted_directions 0)))
 (= $x140 true)))
(assert
 (let (($x142 (select emitted_directions 1)))
 (= $x142 false)))
(assert
 (let (($x136 (forall ((order_index Int) )(let (($x129 (select emitted_directions order_index)))
(let (($x130 (select original_directions order_index)))
(let (($x131 (= $x130 $x129)))
(let (($x133 (>= order_index 0)))
(let (($x134 (and $x133 (< order_index 2))))
(=> $x134 $x131)))))))
))
(not $x136)))
(check-sat)
