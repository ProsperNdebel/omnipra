-- Seed George's LA Tech Week event supply from George.xlsx.
-- Reuses the temporary host identities introduced in 0028. Matching is by source_url,
-- so title punctuation and emoji do not affect the assignment.
--
-- Spreadsheet aliases:
-- Host1 = Maya R.   ($15)
-- Host2 = Jordan K. ($18)
-- Host3 = Alex T.   ($22)
-- Host4 = Sam P.    ($30)
--
-- Demo density:
-- 7 selected events have 2 hosts total.
-- "Full Sphere: Going Global with a16z's Brian Roberts" has 3 hosts total.

-- Ensure the dummy devices exist even if 0028 was never run.
insert into endpoints (id, host_id, kind, capabilities, name, created_at)
values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'phone_web', array['mic','camera'], 'Maya''s phone', now()),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'phone_web', array['mic','camera'], 'Jordan''s phone', now()),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'phone_web', array['mic','camera'], 'Alex''s phone', now()),
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'phone_web', array['mic','camera'], 'Sam''s phone', now())
on conflict (id) do update set
  host_id = excluded.host_id,
  kind = excluded.kind,
  capabilities = excluded.capabilities,
  name = excluded.name;

with assignments(source_url, host_alias) as (
  values
    ('https://www.tech-week.com/calendar/la/events/ai-for-finance-summit-2026-la-1a788789-2a00-4dd3-94dd-042d63bf1e93', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/family-offices-investors-summit-michelindinnerlos-angelesoct-12-18-7d549a26-54ab-4146-970a-52f360236cfc', 'Host2'),
    ('https://www.tech-week.com/calendar/la/events/lets-talk-fintech-payments-b1ffa6dc-a3b1-467e-8fbf-0aa8170aacb7', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/the-official-a16z-tech-week-kickoff-by-hsbc-and-fenwick-bd4905fd-1223-4b6d-8285-65a3e771333f', 'Host3'),
    ('https://www.tech-week.com/calendar/la/events/founders-tech-professionals-find-a-cofounder-happy-hour-1e32b51c-c474-422d-a2f7-df0059a9f15e', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/the-capital-room-la-5c7073ec-a8f7-4b6e-b959-f83303f4dacd', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/critical-industries-brunch-riot-stifel-venture-banking-5da8a844-1f42-43ec-93ad-f38c63c13f5d', 'Host2'),
    ('https://www.tech-week.com/calendar/la/events/whos-liable-when-your-agent-wires-2m-real-enforcement-real-audit-gaps-one-missin-fffb187b-118b-4e95-85b6-5d84e681ad7d', 'Host3'),
    ('https://www.tech-week.com/calendar/la/events/fintech-cfo-office-hours-abf6d8a6-140a-489c-90cd-b04ca54eba4f', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/discovery-to-impact-at-caltech-d96c32ac-6853-49a9-9630-d56351d7e4cc', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/full-sphere-going-global-with-a16zs-brian-roberts-c14689de-9938-4b74-991c-8756afd40590', 'Host4'),
    ('https://www.tech-week.com/calendar/la/events/reverse-career-fair-59bef9cc-5cb8-4fc2-9f4b-fe9cd7c2af52', 'Host3'),
    ('https://www.tech-week.com/calendar/la/events/building-the-enterprise-ai-stack-sovereignty-safety-accountability-quantec-kindo-9329d77a-f9b4-491f-bb71-750bc95cb1b6', 'Host4'),
    ('https://www.tech-week.com/calendar/la/events/carta-and-holland-knight-present-startups-capital-connections-with-ucla-ventures-ba7d7df2-baed-4e55-bd5a-bf474b6eb70e', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/jp-morgan-sunset-social-with-the-innovation-economy-2398a733-0d0e-4c8d-833b-55b270507a06', 'Host2'),
    ('https://www.tech-week.com/calendar/la/events/from-local-to-global-a-wine-tasting-on-scaling-your-team-everywhere-9120807d-dd07-485a-9cfd-9a290a119758', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/ai-powered-site-selection-for-re-developers-investors-30fbac68-7053-4508-9a5c-87ca7e4aaa90', 'Host3'),
    ('https://www.tech-week.com/calendar/la/events/ai-for-housing-tech-to-end-the-crisis-68ed7d15-2b05-496a-a5b7-be383391a68e', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/quantum-from-research-to-real-world-impact-fac1902b-2ccb-4e9d-b8dc-1e92798a8a93', 'Host2'),
    ('https://www.tech-week.com/calendar/la/events/vcpe-luncheon-keynote-panels-2026-b248de7c-c38f-4682-8521-05c63785ec93', 'Host3'),
    ('https://www.tech-week.com/calendar/la/events/litquidity-ventures-hospitality-suite-8f7b3558-07e0-4d54-b21c-c6d6e02a24e4', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/vcpe-family-offices-happy-hour-3c1a89e7-2ede-4804-9279-06f7d41ef3a3', 'Host4'),
    ('https://www.tech-week.com/calendar/la/events/the-non-diluted-stack-funding-growth-with-sba-debt-cdfis-and-grants-36c2bbae-502e-467e-b565-a9f9ddeb0dd9', 'Host2'),
    ('https://www.tech-week.com/calendar/la/events/build-anywhere-scale-everywhere-global-founders-picnic-d2637299-5c23-4ac3-be1b-8cd42a06533b', 'Host3'),
    ('https://www.tech-week.com/calendar/la/events/techstars-aerospace-defense-happy-hour-w-us-space-force-and-nasa-jpl-0a3f7b85-9584-447a-9d6e-12e4f587e285', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/jp-morgan-software-leaders-investors-forum-b251842b-05ff-4261-83cd-4cc7add51fd9', 'Host3'),
    ('https://www.tech-week.com/calendar/la/events/lowenstein-sandler-and-qapitapunch-financial-dinner-during-la-tech-week-9e6b6ede-d4b2-466c-a4bd-7628bd5f41dd', 'Host2'),
    ('https://www.tech-week.com/calendar/la/events/antler-operator-and-future-founder-dinner-b87e9489-a124-467f-b50a-6758d256574a', 'Host4'),
    ('https://www.tech-week.com/calendar/la/events/vcpe-family-offices-dinner-63d27043-6f7b-4297-8599-9dcf44758b2b', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/law-in-the-age-of-ai-7c486345-5207-4a2d-843c-59f899ba6739', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/a16z-speedrun-startup-culture-brunch-advisorsangels-4b986665-d4d5-46fd-b194-6073f36bbf44', 'Host4'),
    ('https://www.tech-week.com/calendar/la/events/responsible-ai-as-a-value-driver-how-to-make-trustworthy-ai-attractive-to-invest-41947c13-e79d-4d7e-bd70-2996b680058e', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/a-venice-happy-hour-with-venture-point-legal-startupvc-lawyers-176d7234-540e-44f1-b9be-96bda869d6d5', 'Host2'),
    ('https://www.tech-week.com/calendar/la/events/reindustrializing-the-manufacturing-industry-robot-mixer-launchpad-hq-la-techwee-e379901b-7a7d-4e1a-b864-079f196f2a91', 'Host3'),
    ('https://www.tech-week.com/calendar/la/events/gp-fo-happy-hour-hosted-by-fidelity-3i-members-2ca6d411-490b-485c-88f9-c0306e10f05d', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/la-fintech-4c7b890a-2345-4c8a-bf5e-febcf86536ae', 'Host2'),
    ('https://www.tech-week.com/calendar/la/events/ai-for-finance-summit-2026-la-1a788789-2a00-4dd3-94dd-042d63bf1e93', 'Host2'),
    ('https://www.tech-week.com/calendar/la/events/the-official-a16z-tech-week-kickoff-by-hsbc-and-fenwick-bd4905fd-1223-4b6d-8285-65a3e771333f', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/critical-industries-brunch-riot-stifel-venture-banking-5da8a844-1f42-43ec-93ad-f38c63c13f5d', 'Host4'),
    ('https://www.tech-week.com/calendar/la/events/discovery-to-impact-at-caltech-d96c32ac-6853-49a9-9630-d56351d7e4cc', 'Host3'),
    ('https://www.tech-week.com/calendar/la/events/jp-morgan-sunset-social-with-the-innovation-economy-2398a733-0d0e-4c8d-833b-55b270507a06', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/quantum-from-research-to-real-world-impact-fac1902b-2ccb-4e9d-b8dc-1e92798a8a93', 'Host4'),
    ('https://www.tech-week.com/calendar/la/events/la-fintech-4c7b890a-2345-4c8a-bf5e-febcf86536ae', 'Host3'),
    ('https://www.tech-week.com/calendar/la/events/full-sphere-going-global-with-a16zs-brian-roberts-c14689de-9938-4b74-991c-8756afd40590', 'Host1'),
    ('https://www.tech-week.com/calendar/la/events/full-sphere-going-global-with-a16zs-brian-roberts-c14689de-9938-4b74-991c-8756afd40590', 'Host2')
),
hosts(host_alias, host_id, endpoint_id, display_name, price_cents, open_to_requests) as (
  values
    ('Host1', '20000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, 'Maya R.',   1500, true),
    ('Host2', '20000000-0000-4000-8000-000000000002'::uuid, '10000000-0000-4000-8000-000000000002'::uuid, 'Jordan K.', 1800, true),
    ('Host3', '20000000-0000-4000-8000-000000000003'::uuid, '10000000-0000-4000-8000-000000000003'::uuid, 'Alex T.',   2200, false),
    ('Host4', '20000000-0000-4000-8000-000000000004'::uuid, '10000000-0000-4000-8000-000000000004'::uuid, 'Sam P.',    3000, true)
)
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
select
  e.id,
  h.host_id,
  h.endpoint_id,
  array['mic','camera'],
  h.price_cents,
  h.display_name,
  h.open_to_requests,
  now()
from assignments a
join events e on e.source_url = a.source_url
join hosts h on h.host_alias = a.host_alias
on conflict (event_id, host_id) do update set
  endpoint_id = excluded.endpoint_id,
  offers = excluded.offers,
  price_cents = excluded.price_cents,
  display_name = excluded.display_name,
  open_to_requests = excluded.open_to_requests;
