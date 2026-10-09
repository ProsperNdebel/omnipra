# Deploying Omnipra

The steps to put Omnipra on the internet so a host and an owner can be in different places.
Vercel and Supabase are assumed; any Node host works the same way.

## 1. Database (Supabase)

1. Run every file in `supabase/migrations` you haven't run yet, in order, in the SQL editor.
   All of them are safe to run twice.
2. Storage: a private bucket named `audio` (it holds audio and photos).
3. Auth, Providers, Email: on. The default emails carry a sign in link, which works as is.
   With custom SMTP (step 5) you can also edit the templates to show a code, handy when
   someone reads email on another device: add `Your Omnipra code is {{ .Token }}` to both
   "Confirm signup" and "Magic Link".
4. Auth, URL Configuration: Site URL is your domain, for example `https://omnipra.io`, and
   add `https://omnipra.io/**` under Redirect URLs.
5. Auth, SMTP: set a real sender (Resend, Postmark, SES). The built in one sends only a
   few emails an hour, which is not enough for real users.

## 2. Environment (Vercel, Project Settings, Environment Variables)

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase, Connect |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase, API Keys, publishable |
| `SUPABASE_SECRET_KEY` | Supabase, API Keys, secret |
| `ANTHROPIC_API_KEY` | Claude Console |
| `DEEPGRAM_API_KEY` | Deepgram console |
| `OMNIPRA_AUTH` | `1` |
| `CRON_SECRET` | any long random string |
| `OMNIPRA_ADMIN_EMAILS` | your email, to open `/metrics` |
| `OMNIPRA_ALERT_WEBHOOK` | optional: Slack or Discord incoming webhook for errors |

Leave `PRESENCE_FAKE_AI` and `OMNIPRA_DEV_CHECKS` unset in production.

## 3. Deploy

1. Import the repo in Vercel, framework Next.js, defaults otherwise. Deploy.
2. Domains: add yours. HTTPS is automatic. Phones need HTTPS for the microphone.
3. Open `https://YOUR_DOMAIN/api/health`. It should say `"ok": true` and list no problems.
   If it lists migrations, run them.

## 4. The scheduler

`/api/cron/sweep` ends sessions whose host vanished and runs background work that is due
(briefing retries, webhook deliveries). It should run every minute.

1. Vercel Pro: change the schedule in `vercel.json` to `* * * * *`.
2. Vercel Hobby only allows once a day (what `vercel.json` has now). Add a free outside
   pinger such as cron-job.org that calls
   `https://YOUR_DOMAIN/api/cron/sweep` every minute with the header
   `Authorization: Bearer YOUR_CRON_SECRET` (or `?secret=YOUR_CRON_SECRET` if it can't
   set headers).

Without a scheduler things still work: briefings start right after a session ends, and an
open owner page triggers the sweep and retries. The scheduler is the safety net.

## 5. Check it end to end

1. Sign in on your laptop as the owner, on your phone as the host (different emails).
2. Phone: add an event, list yourself. Laptop: make an agent, send it through the phone.
3. Phone: accept, confirm, start, talk for two minutes, end.
4. Laptop: notes appear while live, the briefing after. `/activity` shows every step.
5. `/metrics` shows the session.

## Logs

Unexpected errors are one JSON line each in Vercel, Logs, searchable by `"level":"error"`,
and go to `OMNIPRA_ALERT_WEBHOOK` if set.

## Payments (off until you turn them on)

Owners pay through Omnipra and hosts get paid out by Stripe Connect. The card is held when
the agent is sent, charged when the session ends if it ran at least 10 minutes, and
released if the host declines, the owner cancels, or it's shorter. Omnipra keeps
`OMNIPRA_FEE_PERCENT` (default 15) and the rest goes to the host.

1. Stripe dashboard: activate your account, then turn on Connect (Settings, Connect) and
   choose Express accounts for your connected accounts.
2. Developers, Webhooks: add an endpoint `https://YOUR_DOMAIN/api/stripe/webhook` with the
   event `checkout.session.completed`. Copy its signing secret.
3. Vercel environment: `STRIPE_SECRET_KEY` (start with the test key, `sk_test_...`),
   `STRIPE_WEBHOOK_SECRET`, then `OMNIPRA_PAYMENTS=1`. Redeploy.
4. Run migration `0022_payments.sql`. `/api/health` reports anything missing.
5. Test mode: as a host, Hosting, Set up payouts (Stripe's test data works). As an owner,
   book that host and pay with card `4242 4242 4242 4242`.

Limits to know: a card hold lasts about 7 days, so a booking made more than a week before
the event can't be charged when it ends (it shows as failed). Refunds after a charge are
done in the Stripe dashboard for now.
