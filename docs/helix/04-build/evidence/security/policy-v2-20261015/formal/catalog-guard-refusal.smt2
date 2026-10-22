; benchmark generated from python API
(set-info :status unknown)
(declare-fun has_catalog_tag () Bool)
(declare-fun has_pin () Bool)
(assert
 (let (($x39 (not has_catalog_tag)))
 (let (($x21 (not has_pin)))
 (and $x21 $x39))))
(assert
 has_catalog_tag)
(check-sat)
