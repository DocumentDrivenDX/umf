# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed source-table boundaries, including incoming references and triggers."""

# Parameters: complete module relation OIDs twice, then schema/table names.
# Constraint triggers must belong to known module constraints and native
# pg_catalog implementations. User triggers and cross-module incoming FKs are
# outside this profile even if a prior table witness did not record them.
TABLE_BOUNDARY = """SELECT c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,
c.relispartition,c.relhassubclass,c.relhasrules,c.relreplident,c.relowner,c.relam,
EXISTS(SELECT FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid),
(SELECT count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid),
EXISTS(SELECT FROM pg_catalog.pg_trigger t
 LEFT JOIN pg_catalog.pg_constraint k ON k.oid=t.tgconstraint
 LEFT JOIN pg_catalog.pg_proc f ON f.oid=t.tgfoid
 LEFT JOIN pg_catalog.pg_namespace fn ON fn.oid=f.pronamespace
 WHERE t.tgrelid=c.oid AND (NOT t.tgisinternal OR t.tgenabled<>'O'
 OR k.oid IS NULL OR k.contype NOT IN ('f','p','u')
 OR NOT k.conrelid=ANY(%s::pg_catalog.oid[]) OR fn.nspname<>'pg_catalog')),
EXISTS(SELECT FROM pg_catalog.pg_constraint k WHERE k.contype='f' AND k.confrelid=c.oid
 AND NOT k.conrelid=ANY(%s::pg_catalog.oid[]))
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname=%s AND c.relname=%s"""
