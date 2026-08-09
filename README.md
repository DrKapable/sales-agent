# MedMinds WhatsApp Sales Agent

A production-oriented WhatsApp sales assistant for MedMinds Learning Centre. It qualifies enquiries, recommends only approved offers, tracks leads, requests human assistance when required, and provides an administrator console for pricing and pipeline management.

## Included

- Meta WhatsApp Cloud API webhook verification and incoming-message handling
- HMAC verification of every webhook payload
- Vercel AI Gateway agent with controlled tools for offers, leads, and handover
- Pa Gym, research, data analysis, and tutorial offer templates
- Admin-controlled prices, features, payment instructions, and offer activation
- Lead pipeline with MedMinds sales statuses
- Persistent Postgres support, with clearly marked temporary memory mode
- Secure signed administrator session
- Browser-based conversation simulator
- Health and configuration endpoint at `/api/health`

## Local setup

Requirements: Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add your local credentials to `.env.local`. Never commit this file.

## Vercel deployment

1. Import `DrKapable/sales-agent` into Vercel.
2. Add a Neon or compatible Postgres database and expose its connection string as `DATABASE_URL`.
3. Configure the environment variables listed in `.env.example`.
4. Deploy. Vercel AI Gateway can authenticate through the deployment's automatically managed OIDC token; an AI Gateway API key is an alternative.
5. Open `/admin`, sign in, enter verified offer details, and activate only approved offers.

### Required production variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Persistent leads, messages, and approved offers |
| `WHATSAPP_VERIFY_TOKEN` | Secret chosen for Meta webhook verification |
| `WHATSAPP_ACCESS_TOKEN` | Permanent WhatsApp Cloud API system-user token |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone number ID used to send replies |
| `WHATSAPP_APP_SECRET` | Verifies the `X-Hub-Signature-256` webhook signature |
| `WHATSAPP_GRAPH_VERSION` | Explicit supported Graph version, for example the version enabled in the Meta app |
| `ADMIN_PASSWORD` | Admin dashboard password |
| `SESSION_SECRET` | Long random value used to sign admin sessions |

Optional: `AI_MODEL` defaults to `openai/gpt-5.6-luna`; `AI_GATEWAY_API_KEY` is needed only when Vercel OIDC is unavailable.

## Meta webhook setup

Use this callback URL in the Meta developer dashboard:

```text
https://YOUR_DOMAIN/api/webhooks/whatsapp
```

Use the same value for Meta's verify token and `WHATSAPP_VERIFY_TOKEN`. Subscribe the WhatsApp Business Account to `messages`. The endpoint accepts text messages and safely ignores unsupported event types.

## Operational controls

- Offers are inactive by default and have no price. This prevents the assistant from inventing commercial information.
- An active offer requires both a verified price and approved payment instructions.
- The AI cannot mark a lead converted. Conversion requires confirmation by the external payment process or an authorised administrator.
- Refunds, disputes, complaints, special discounts, custom quotations, and unavailable verified information trigger human assistance.
- Memory mode is for evaluation only. It is not durable on serverless deployments.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

