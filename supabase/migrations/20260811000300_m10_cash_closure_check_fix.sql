alter table public.cash_days drop constraint cash_days_closure_check;

alter table public.cash_days add constraint cash_days_closure_check check (
  (closed_at is null and closed_by is null and closure_kind is null and closing_balance is null and closure_idempotency_key is null and closure_idempotency_fingerprint is null)
  or (
    closed_at is not null
    and closing_balance is not null
    and closure_kind in ('manual', 'rollover', 'migration')
    and ((closure_kind = 'manual' and closed_by is not null) or closure_kind in ('rollover', 'migration'))
    and ((closure_idempotency_key is null and closure_idempotency_fingerprint is null) or (char_length(btrim(closure_idempotency_key)) between 1 and 200 and char_length(closure_idempotency_fingerprint) = 32))
  )
);
