-- Temporary test supply for the event "ur +1 is a stranger" on Oct 12, 2026.
-- These rows behave like normal host listings so the event and send screens can be tested.
do $$
declare
  v_event uuid;
begin
  select id into v_event
  from events
  where title = 'ur +1 is a stranger'
    and starts_at >= '2026-10-12T00:00:00-07:00'::timestamptz
    and starts_at <  '2026-10-13T00:00:00-07:00'::timestamptz
  order by starts_at
  limit 1;

  if v_event is not null then
    insert into endpoints (id, host_id, kind, capabilities, name, created_at)
    values
      ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'phone_web', array['mic','camera'], 'Maya''s phone', now()),
      ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'phone_web', array['mic','camera'], 'Jordan''s phone', now()),
      ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'phone_web', array['mic','camera'], 'Alex''s phone', now()),
      ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'phone_web', array['mic','camera'], 'Sam''s phone', now()),
      ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'phone_web', array['mic','camera'], 'Taylor''s phone', now())
    on conflict (id) do update set
      host_id = excluded.host_id,
      kind = excluded.kind,
      capabilities = excluded.capabilities,
      name = excluded.name;

    insert into host_listings (
      event_id,
      host_id,
      endpoint_id,
      offers,
      price_cents,
      display_name,
      open_to_requests,
      created_at
    )
    values
      (v_event, '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', array['mic','camera'], 1500, 'Maya R.', true, now()),
      (v_event, '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', array['mic','camera'], 1800, 'Jordan K.', true, now()),
      (v_event, '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', array['mic','camera'], 2200, 'Alex T.', false, now()),
      (v_event, '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', array['mic','camera'], 3000, 'Sam P.', true, now()),
      (v_event, '20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', array['mic','camera'], 4000, 'Taylor C.', false, now())
    on conflict (event_id, host_id) do update set
      endpoint_id = excluded.endpoint_id,
      offers = excluded.offers,
      price_cents = excluded.price_cents,
      display_name = excluded.display_name,
      open_to_requests = excluded.open_to_requests;
  end if;
end $$;
