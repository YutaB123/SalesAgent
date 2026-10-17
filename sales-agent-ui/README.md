# Sales Agent UI

An English-language React and TypeScript interface prototype for a sales conversation assistant.

## Included

- Dashboard and workspace navigation
- New conversation setup with sample product and customer profiles
- AI response suggestion and ongoing conversation views
- Call summary, seller communication score, and follow-up checklist
- Reusable cards, TypeScript interfaces, and fictional demo data

## Run locally

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

This is a front-end demo. It does not connect to a phone system, microphone, speech recognition service, AI model, or backend API. Built-in customer and product examples are fictional.

## Customer Tracking persistence

Customer profiles and call history use a typed `CustomerRepository` in `src/services/customerRepository.ts`. The current prototype stores them in the browser's `localStorage` under `sales-agent-customers-v1`. Follow-up actions and readiness scores are stored under `sales-agent-account-tasks-v1` and `sales-agent-account-scores-v1`.

This storage is local to one browser/device and is not shared between sellers. Call transcripts are saved to the customer selected before the conversation. If no customer was selected, the call summary flow asks the seller to choose an existing profile or create one. A stable call ID prevents a repeated save from adding the same call history item twice. Custom conversations keep the transcript for review; the app only uses the existing demo summary for its matching sample transcript.

To connect shared persistence later, confirm the backend's customer and call-history schemas, authentication, and API contract with the backend owner. Then provide a backend-backed implementation of the `CustomerRepository` methods (`list`, `save`, `remove`, and `appendCall`) and retain the stable customer/call IDs. No backend endpoint or recording protocol is assumed by this prototype.
