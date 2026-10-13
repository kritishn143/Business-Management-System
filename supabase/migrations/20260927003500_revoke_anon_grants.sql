-- Defence in depth (SPEC §53).
--
-- Supabase's default privileges on the public schema grant SELECT to `anon`,
-- so the tables added in the preceding migrations picked that up. Row level
-- security already means anon matches no policy and reads no rows, but the
-- grant is unnecessary and the older tables do not carry it. A later permissive
-- policy should not be one line away from exposing the audit trail.

revoke all on public.audit_logs          from anon;
revoke all on public.fiscal_years        from anon;
revoke all on public.fiscal_year_balances from anon;
revoke all on public.invoice_settings    from anon;

-- And stop the same thing happening to whatever comes next.
alter default privileges in schema public revoke all on tables from anon;
