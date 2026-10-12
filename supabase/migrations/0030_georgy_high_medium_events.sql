-- Enroll the Georgy agent in every High (H) and Medium (M) event from George.xlsx.
-- Uses the spreadsheet's original Host Assigned value for each event.
-- Safe to rerun: it skips any event Georgy already has a session for.
do $$
declare
  v_agent_id uuid;
  v_agent_count integer;
  r record;
  v_event_id uuid;
  v_endpoint_id uuid;
  v_price_cents integer;
  v_mission_id uuid;
  v_manifestation_id uuid;
begin
  select count(*), min(id)
    into v_agent_count, v_agent_id
  from agents
  where lower(name) = 'georgy';

  if v_agent_count = 0 then
    raise exception 'No agent named Georgy exists.';
  elsif v_agent_count > 1 then
    raise exception 'More than one agent named Georgy exists; disambiguate by owner before running this migration.';
  end if;

  for r in
    with targets(source_url, priority, host_alias) as (
      values
        ('https://www.tech-week.com/calendar/la/events/ai-for-finance-summit-2026-la-1a788789-2a00-4dd3-94dd-042d63bf1e93', 'H', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/family-offices-investors-summit-michelindinnerlos-angelesoct-12-18-7d549a26-54ab-4146-970a-52f360236cfc', 'M', 'Host2'),
        ('https://www.tech-week.com/calendar/la/events/lets-talk-fintech-payments-b1ffa6dc-a3b1-467e-8fbf-0aa8170aacb7', 'H', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/the-official-a16z-tech-week-kickoff-by-hsbc-and-fenwick-bd4905fd-1223-4b6d-8285-65a3e771333f', 'H', 'Host3'),
        ('https://www.tech-week.com/calendar/la/events/founders-tech-professionals-find-a-cofounder-happy-hour-1e32b51c-c474-422d-a2f7-df0059a9f15e', 'M', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/the-capital-room-la-5c7073ec-a8f7-4b6e-b959-f83303f4dacd', 'M', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/critical-industries-brunch-riot-stifel-venture-banking-5da8a844-1f42-43ec-93ad-f38c63c13f5d', 'M', 'Host2'),
        ('https://www.tech-week.com/calendar/la/events/whos-liable-when-your-agent-wires-2m-real-enforcement-real-audit-gaps-one-missin-fffb187b-118b-4e95-85b6-5d84e681ad7d', 'M', 'Host3'),
        ('https://www.tech-week.com/calendar/la/events/fintech-cfo-office-hours-abf6d8a6-140a-489c-90cd-b04ca54eba4f', 'M', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/discovery-to-impact-at-caltech-d96c32ac-6853-49a9-9630-d56351d7e4cc', 'M', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/full-sphere-going-global-with-a16zs-brian-roberts-c14689de-9938-4b74-991c-8756afd40590', 'M', 'Host4'),
        ('https://www.tech-week.com/calendar/la/events/reverse-career-fair-59bef9cc-5cb8-4fc2-9f4b-fe9cd7c2af52', 'M', 'Host3'),
        ('https://www.tech-week.com/calendar/la/events/building-the-enterprise-ai-stack-sovereignty-safety-accountability-quantec-kindo-9329d77a-f9b4-491f-bb71-750bc95cb1b6', 'M', 'Host4'),
        ('https://www.tech-week.com/calendar/la/events/carta-and-holland-knight-present-startups-capital-connections-with-ucla-ventures-ba7d7df2-baed-4e55-bd5a-bf474b6eb70e', 'M', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/jp-morgan-sunset-social-with-the-innovation-economy-2398a733-0d0e-4c8d-833b-55b270507a06', 'H', 'Host2'),
        ('https://www.tech-week.com/calendar/la/events/from-local-to-global-a-wine-tasting-on-scaling-your-team-everywhere-9120807d-dd07-485a-9cfd-9a290a119758', 'M', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/ai-powered-site-selection-for-re-developers-investors-30fbac68-7053-4508-9a5c-87ca7e4aaa90', 'M', 'Host3'),
        ('https://www.tech-week.com/calendar/la/events/ai-for-housing-tech-to-end-the-crisis-68ed7d15-2b05-496a-a5b7-be383391a68e', 'M', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/vcpe-luncheon-keynote-panels-2026-b248de7c-c38f-4682-8521-05c63785ec93', 'M', 'Host3'),
        ('https://www.tech-week.com/calendar/la/events/litquidity-ventures-hospitality-suite-8f7b3558-07e0-4d54-b21c-c6d6e02a24e4', 'H', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/vcpe-family-offices-happy-hour-3c1a89e7-2ede-4804-9279-06f7d41ef3a3', 'M', 'Host4'),
        ('https://www.tech-week.com/calendar/la/events/the-non-diluted-stack-funding-growth-with-sba-debt-cdfis-and-grants-36c2bbae-502e-467e-b565-a9f9ddeb0dd9', 'M', 'Host2'),
        ('https://www.tech-week.com/calendar/la/events/build-anywhere-scale-everywhere-global-founders-picnic-d2637299-5c23-4ac3-be1b-8cd42a06533b', 'M', 'Host3'),
        ('https://www.tech-week.com/calendar/la/events/jp-morgan-software-leaders-investors-forum-b251842b-05ff-4261-83cd-4cc7add51fd9', 'H', 'Host3'),
        ('https://www.tech-week.com/calendar/la/events/lowenstein-sandler-and-qapitapunch-financial-dinner-during-la-tech-week-9e6b6ede-d4b2-466c-a4bd-7628bd5f41dd', 'M', 'Host2'),
        ('https://www.tech-week.com/calendar/la/events/antler-operator-and-future-founder-dinner-b87e9489-a124-467f-b50a-6758d256574a', 'M', 'Host4'),
        ('https://www.tech-week.com/calendar/la/events/vcpe-family-offices-dinner-63d27043-6f7b-4297-8599-9dcf44758b2b', 'M', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/law-in-the-age-of-ai-7c486345-5207-4a2d-843c-59f899ba6739', 'M', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/a16z-speedrun-startup-culture-brunch-advisorsangels-4b986665-d4d5-46fd-b194-6073f36bbf44', 'M', 'Host4'),
        ('https://www.tech-week.com/calendar/la/events/responsible-ai-as-a-value-driver-how-to-make-trustworthy-ai-attractive-to-invest-41947c13-e79d-4d7e-bd70-2996b680058e', 'M', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/a-venice-happy-hour-with-venture-point-legal-startupvc-lawyers-176d7234-540e-44f1-b9be-96bda869d6d5', 'M', 'Host2'),
        ('https://www.tech-week.com/calendar/la/events/gp-fo-happy-hour-hosted-by-fidelity-3i-members-2ca6d411-490b-485c-88f9-c0306e10f05d', 'M', 'Host1'),
        ('https://www.tech-week.com/calendar/la/events/la-fintech-4c7b890a-2345-4c8a-bf5e-febcf86536ae', 'H', 'Host2')
    ),
    host_map(host_alias, host_id) as (
      values
        ('Host1', '20000000-0000-4000-8000-000000000001'::uuid),
        ('Host2', '20000000-0000-4000-8000-000000000002'::uuid),
        ('Host3', '20000000-0000-4000-8000-000000000003'::uuid),
        ('Host4', '20000000-0000-4000-8000-000000000004'::uuid)
    )
    select t.source_url, t.priority, hm.host_id
    from targets t
    join host_map hm on hm.host_alias = t.host_alias
  loop
    select id into v_event_id
    from events
    where source_url = r.source_url
    limit 1;

    if v_event_id is null then
      raise notice 'Skipping missing event: %', r.source_url;
      continue;
    end if;

    -- Do not create a second session if Georgy is already assigned to this event.
    if exists (
      select 1
      from missions m
      join manifestations mf on mf.mission_id = m.id
      where m.agent_id = v_agent_id
        and m.event_id = v_event_id
        and mf.status not in ('declined', 'cancelled')
    ) then
      continue;
    end if;

    select hl.endpoint_id, hl.price_cents
      into v_endpoint_id, v_price_cents
    from host_listings hl
    where hl.event_id = v_event_id
      and hl.host_id = r.host_id
    limit 1;

    if v_endpoint_id is null then
      raise notice 'Skipping event with missing assigned host listing: %', r.source_url;
      continue;
    end if;

    v_mission_id := gen_random_uuid();
    v_manifestation_id := gen_random_uuid();

    insert into missions (
      id,
      agent_id,
      event_id,
      instructions,
      alerts,
      context,
      requires,
      autonomy,
      orders,
      plan,
      created_at
    )
    values (
      v_mission_id,
      v_agent_id,
      v_event_id,
      case
        when r.priority = 'H' then 'High-priority event for Georgy. Attend, listen for the strongest opportunities, people, financing insights, and concrete follow-ups relevant to Georgy''s goals.'
        else 'Medium-priority event for Georgy. Attend and capture useful people, ideas, opportunities, and concrete follow-ups relevant to Georgy''s goals.'
      end,
      '{}',
      array['memory'],
      array['mic'],
      'ask_first',
      '{}',
      null,
      now()
    );

    insert into manifestations (
      id,
      mission_id,
      endpoint_id,
      price_cents,
      status,
      observed_through_sec,
      capture_confirmed_at,
      started_at,
      ended_at,
      last_heard_at,
      created_at
    )
    values (
      v_manifestation_id,
      v_mission_id,
      v_endpoint_id,
      v_price_cents,
      'requested',
      0,
      null,
      null,
      null,
      null,
      now()
    );
  end loop;
end $$;
