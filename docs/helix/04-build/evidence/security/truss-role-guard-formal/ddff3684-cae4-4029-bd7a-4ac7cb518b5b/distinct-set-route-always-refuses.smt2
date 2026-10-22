(declare-fun ordinary_role () String)
(declare-fun selected_role () String)
(declare-fun other_route () Bool)
(declare-fun selected_admin () Bool)
(declare-fun selected_set () Bool)
(declare-fun prior_reason () Bool)
(assert (and (> (str.len selected_role) 0)
     (<= (str.len selected_role) 128)
     (> (str.len ordinary_role) 0)
     (<= (str.len ordinary_role) 128)
     (not (str.contains selected_role "\u{0}"))
     (not (str.contains ordinary_role "\u{0}"))))
(assert (let ((a!1 (ite (or prior_reason
                    (and (distinct selected_role ordinary_role)
                         (or selected_set selected_admin))
                    other_route)
                "scoped_mismatch"
                "scoped_match")))
  (and (distinct selected_role ordinary_role)
       selected_set
       (not selected_admin)
       (= a!1 "scoped_match"))))

(check-sat)
