# MedMinds WhatsApp Sales Agent

A production-oriented WhatsApp sales assistant for MedMinds Learning Centre. It qualifies enquiries, recommends only approved offers, tracks leads, requests human assistance when required, and provides an administrator console for pricing and pipeline management.

## Included

- Meta WhatsApp Cloud API webhook verification and incoming-message handling
- HMAC verification of every webhook payload
- Vercel AI Gateway agent with controlled tools for offers, leads, and handover
- A management-approved catalogue for research, Pa Gym, courses, academic support and digital services
- Admin-controlled standard and rush prices, features, payment instructions, and offer activation
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
5. Open `/admin` to review, search or edit the approved service catalogue and lead pipeline.

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

The browser simulator is disabled by default. Set `ENABLE_SIMULATOR=true` only when public testing is intentional; the route also applies a basic per-instance request limit.

## Meta webhook setup

Use this callback URL in the Meta developer dashboard:

```text
https://YOUR_DOMAIN/api/webhooks/whatsapp
```

Use the same value for Meta's verify token and `WHATSAPP_VERIFY_TOKEN`. Subscribe the WhatsApp Business Account to `messages`. The endpoint accepts text messages and safely ignores unsupported event types.

## Operational controls

- The versioned catalogue is loaded once into new or existing databases. Later admin edits are preserved.
- Research ranges use their midpoint for a 14-day deadline and their upper limit for deadlines under 14 days.
- Payments use the approved Juma Phiri account on 0977259132. Dr. Mustafa Juma Phiri handles payment confirmation and discounts; Dr Kanyembo Ng'andwe handles other enquiries.
- Active custom-quote services may have no numeric price, but must contain approved quotation instructions.
- The AI cannot mark a lead converted. Conversion requires confirmation by the external payment process or an authorised administrator.
- Refunds, disputes, complaints, special discounts, custom quotations, and unavailable verified information trigger human assistance.
- Memory mode is for evaluation only. It is not durable on serverless deployments.

## Checks

```bash
npm run typecheck
npm test
npm run build
```
