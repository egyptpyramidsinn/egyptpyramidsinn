# Abandoned-cart recovery cron

The endpoint `POST /api/cron/cart-recovery` finds pending abandoned carts older than 30 minutes that have not yet been emailed, sends a recovery email via Resend, and marks them `sent`.

It must be triggered by a scheduler — the route does nothing on its own.

## Required env

| Var                                     | Purpose                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET`                           | Required. Header check; the route returns `503 cron_unconfigured` when this is unset.                    |
| `NEXT_PUBLIC_APP_URL`                   | Required. Base URL used to build the recovery link (`/cart/recover/[token]`).                            |
| `RESEND_API_KEY`                        | Required for outbound emails. Per-agency overrides in `agencies.settings.emailSettings` take precedence. |
| `RESEND_FROM_NAME`, `RESEND_FROM_EMAIL` | Default sender when no per-agency override is set.                                                       |

## Auth

Every request must include the header:

```
x-cron-secret: <value of CRON_SECRET>
```

Missing/wrong header → `401 unauthorized`.

## Recommended schedule

Every 10–15 minutes. The recovery delay (`minAgeMinutes`) is 30 minutes, so a 10–15 minute cadence picks up new abandons quickly without spamming the table.

## Wiring options

### Vercel Cron

Add to `vercel.json` (project root):

```json
{
  "crons": [
    {
      "path": "/api/cron/cart-recovery",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Vercel does not let you set custom headers on cron requests, so when deploying on Vercel either:

- Move the secret check to a query param (`?secret=...`) and update the route, **or**
- Have the cron hit a tiny proxy route on the same project that injects the header — e.g. `/api/cron/_proxy?target=cart-recovery` reading `process.env.CRON_SECRET` server-side.

### Supabase scheduled function (`pg_cron` + `pg_net`)

```sql
select cron.schedule(
  'cart-recovery',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/cart-recovery',
    headers := jsonb_build_object(
      'x-cron-secret', current_setting('app.cron_secret', true)
    )
  );
  $$
);
```

Set `app.cron_secret` once with `alter database postgres set "app.cron_secret" = '...'`.

### External scheduler (cron-job.org, Cloudflare Workers, GitHub Actions)

Any HTTP scheduler works; just configure the `x-cron-secret` header.

## Response shape

```json
{
  "ok": true,
  "processed": 7,
  "sent": 6,
  "failed": 1,
  "note": "wire a scheduler ..."
}
```

`processed === 0` is normal during quiet periods.

## Operational notes

- Failed Resend sends still mark the row `sent` to prevent retry storms when an API key is misconfigured. If you change keys, manually re-queue rows by setting `status='pending'` and `recovery_sent_at=null` in `abandoned_carts`.
- Recovered rows (user clicked the link) are stamped `recovered` and skipped on subsequent runs.
- Tokens are 32-byte random URL-safe strings.
