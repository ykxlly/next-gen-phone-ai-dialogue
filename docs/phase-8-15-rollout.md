# Phase 8-15 Rollout Checklist

This document is the operator checklist from Dialogflow CX simulator validation through productization.

## Phase 8: CX Simulator Validation

Use the Dialogflow CX simulator against the Cloud Run webhook:

```txt
https://next-gen-phone-ai-dialogue-1023891108593.asia-northeast1.run.app/webhook/dialogflow
```

Required simulator cases:

| Case | User utterance example | Expected tag | Expected result |
| --- | --- | --- | --- |
| New booking | `明日の15時に整体60分を予約したいです` | `check_availability`, then `create_booking` | `booking_status=confirmed`, Firestore booking, Calendar event |
| Busy slot | Use a time already booked | `check_availability` | `availability_status=busy`, asks another time |
| FAQ | `営業時間を教えて` | `get_business_info` | Business hours answer |
| Callback | `担当者から折り返してください` | `create_callback_request` | `callback_status=open`, callback request in Admin |
| Fallback | Random or unclear utterance | no-match route | Re-prompt or callback/transfer suggestion |
| Silence | No input | no-input route | Short re-prompt, then callback/transfer route |

Acceptance:

- CX simulator receives webhook responses without 4xx/5xx.
- Firestore has the created booking under `businesses/default/bookings`.
- Google Calendar has the event.
- Booking webhook response includes `booking_status=confirmed`.
- Admin `/admin/bookings`, `/admin/callbacks`, and `/admin/logs` reflect the test.

Before using the CX simulator, run the webhook-level verification:

```bash
npm run verify:phase8
```

Optional overrides:

```bash
VERIFY_BASE_URL=https://your-cloud-run-url \
VERIFY_BOOKING_DATE=2026-11-01 \
VERIFY_BOOKING_TIME=15:40 \
npm run verify:phase8
```

This script intentionally creates a real test booking and a real Google Calendar event. Delete the test event after validation if needed.

The CX pages and routes can be recreated with:

```bash
npm run setup:cx
npm run setup:cx:flow
```

The script creates/updates these pages:

- `Booking.Collect`
- `Booking.CheckAvailability`
- `Booking.CreateBooking`
- `Booking.Busy`
- `Booking.Done`
- `FAQ.GetBusinessInfo`
- `Callback.Collect`
- `Callback.Create`

Configured fulfillment tags:

- `check_availability`
- `create_booking`
- `get_business_info`
- `create_callback_request`
- `save_call_summary`

Rollback:

- Disable the CX route that calls the webhook.
- Point CX webhook back to a previous Cloud Run revision if needed.
- Cancel test Calendar events manually.

## Phase 9: Phone Connection Prep

Choose one phone provider for MVP:

| Provider | MVP fit | Notes |
| --- | --- | --- |
| Twilio | Recommended first | Easier docs, trial-friendly, common Dialogflow integrations |
| Telnyx | Good later option | Often flexible for production telephony |

Prep checklist:

- Create provider account.
- Buy or verify one test phone number.
- Confirm Japanese voice availability and caller ID behavior.
- Decide transfer destination number.
- Keep phone number separate from the production store number until Phase 13.
- Document emergency fallback: manually disable forwarding and answer calls normally.

## Phase 10: Real Phone Test

Run these tests with the test number:

- AI answers with the expected greeting.
- New booking completes by voice.
- FAQ answer works by voice.
- Callback request is saved.
- Misheard name/phone number can be corrected.
- Silence triggers no-input handling.
- Hang-up does not create a false confirmed booking.
- Firestore, Calendar, Admin, and logs all update.

Pass criteria:

- 8 of 10 normal booking calls complete without human help.
- Failed calls leave enough logs to classify the cause.
- Calendar double-booking does not happen.

## Phase 11: Admin Strengthening

Implemented MVP admin surfaces:

- Booking list and detail.
- Booking status and memo update.
- Call list and detail.
- Callback list and status update.
- FAQ list, create, and edit.
- Business settings edit.
- Ops logs.

Next hardening:

- Add delete/disable actions only after confirmation UI exists.
- Add per-admin user accounts before external users access Admin.
- Add pagination/search after data volume grows.

## Phase 12: Security And Operations

Webhook secret rollout:

1. Generate a random secret.
2. Set `DIALOGFLOW_WEBHOOK_SECRET` in Cloud Run.
3. Configure Dialogflow CX webhook to send the same secret as `x-webhook-secret`, or append `?token=...` temporarily.
4. Test simulator.
5. Confirm rejected requests create `webhook_unauthorized` logs.

Secret Manager migration:

- Move `ADMIN_PASSWORD`, `SESSION_SECRET`, Google credentials, Twilio credentials, and webhook secret to Secret Manager.
- Grant Cloud Run service account secret accessor access.
- Remove plaintext secrets from local command history and deployment scripts.

Operations:

- Enable Cloud Run error log alert.
- Add budget alert for GCP.
- Add Twilio/Telnyx usage alert.
- Review `/admin/logs` daily during MVP.
- Classify failed conversations into FAQ missing, slot unavailable, ASR mistake, flow bug, or provider issue.

## Phase 13: Existing Number Forwarding

Forwarding tests:

- Business hours forwarding.
- After-hours forwarding.
- No-answer forwarding.
- Busy forwarding.
- Always-forwarding.
- Caller ID preservation.
- Manual rollback to original phone operation.

Do not run this phase until Phase 10 real phone tests are stable.

## Phase 14: MVP Validation

Run with one test store for one week.

Metrics:

- Total calls.
- Booking attempts.
- Confirmed bookings.
- Calendar creation failures.
- Callback requests.
- Human transfer requests.
- No-match/no-input count.
- Average booking completion time.

Success target:

- Booking success rate above 70%.
- No double bookings.
- Store staff can understand and act on Admin data.
- Top 10 failed utterances are turned into FAQ or route improvements.

## Phase 15: Productization

Build only after MVP validation:

- Multi-store data model.
- Store-specific Calendar.
- Store-specific FAQ, business hours, services, transfer number.
- Onboarding flow.
- Twilio/Telnyx number lifecycle management.
- Usage analytics.
- Billing and plan limits.
- Store suspension and cancellation flow.
- Admin roles and audit trail.

Productization exit criteria:

- A new store can be onboarded without code changes.
- A store can pause AI answering safely.
- Billing maps to actual usage.
- Logs are sufficient for support.
