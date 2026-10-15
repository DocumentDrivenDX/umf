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
(declare-fun paired_operation () Bool)
(declare-fun random_token () Bool)
(declare-fun same_native_scope () Bool)
(declare-fun no_selected_gaps () Bool)
(declare-fun complete_compiler () Bool)
(declare-fun verified_sources () Bool)
(declare-fun original_action_purpose () Bool)
(declare-fun distinct_action () Bool)
(declare-fun exact_designation () Bool)
(declare-fun retained_properties () Bool)
(declare-fun current_action_permission () Bool)
(declare-fun live_present () Bool)
(declare-fun read_row_eligible () Bool)
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
 (let (($x72 (not (and (= effective_mode 1) random_token paired_operation))))
 (let (($x56 (= catalog_mode 3)))
 (let (($x58 (or $x56 (= effective_mode catalog_mode))))
 (let (($x55 (= effective_mode ontology_mode)))
 (let (($x60 (and $x55 $x58 (and (distinct effective_mode 0) true))))
 (and verified_sources complete_compiler no_selected_gaps $x60 (or (not paired_operation) same_native_scope) $x72)))))))
(assert
 (let (($x78 (and exact_designation distinct_action original_action_purpose)))
 (or (and (distinct effective_mode 2) true) $x78)))
(assert
 (let (($x83 (and (and (distinct read_disposition 2) true) (and (distinct read_disposition 3) true) retained_properties)))
 (let (($x61 (= effective_mode 2)))
 (and read_row_eligible live_present (ite $x61 current_action_permission $x83)))))
(assert
 (= effective_mode 1))
(assert
 (= read_disposition 1))
(assert
 (and (distinct read_dto_domain live_domain) true))
(assert
 (= operand_domain live_domain))
(check-sat)
