# Phase 9-13 Checklist

## P0 Before Phone Testing

- Confirm Dialogflow CX webhook is set to `https://next-gen-phone-ai-dialogue-fplejurz2q-an.a.run.app/webhook/dialogflow`.
- Confirm these tags work in CX simulator:
  - `check_availability`
  - `create_booking`
  - `get_business_info`
  - `create_callback_request`
  - `save_call_summary`
- Confirm simulator booking creates:
  - Firestore booking
  - Google Calendar event
  - `calendarEventId`
  - `booking_status=confirmed`

## Phase 9 Real-Store Test

- New booking: name, phone, date, time, service, people count.
- No availability: suggest alternative times.
- FAQ: hours, address, price, access, cancellation policy.
- Callback: collect name, phone, reason, preferred callback time.
- Name capture: Japanese names, kana/kanji ambiguity.
- Phone capture: mobile number confirmation and read-back.
- Invalid input: vague date, vague time, irrelevant speech.
- Silence: reprompt once or twice, then callback fallback.
- Mid-call abandonment: save partial call record if possible.
- Double booking: same slot should be blocked by Calendar availability.

## Phase 10 Twilio Phone Connection

- Buy or prepare Twilio test number.
- Connect Twilio to Dialogflow CX integration.
- Place test call to Twilio number.
- Verify AI answers with correct greeting.
- Run end-to-end booking by voice.
- Confirm booking appears in Google Calendar, Firestore, and `/admin/bookings`.
- Test FAQ by voice.
- Test callback request by voice.
- Test unclear speech fallback.
- Capture Twilio call SID if possible for future call log linkage.

## Phase 11 Existing Number Forwarding

- Start with no-answer or after-hours forwarding.
- Avoid full-time forwarding until test calls are stable.
- Verify caller ID behavior.
- Create store-side enable, disable, and rollback instructions.
- Test business hours, after hours, no answer, busy line, and forwarding loop prevention.

## Phase 12 Admin Enhancements

- Booking detail page.
- Call detail page.
- Callback list with open/done status.
- Editable business settings.
- Editable services and FAQs.
- Manual status changes.
- Basic filters for today's bookings, open callbacks, and failed calls.

## Phase 13 Security/Ops

- Enable `DIALOGFLOW_WEBHOOK_SECRET`.
- Move secrets to Secret Manager.
- Add Cloud Run log events for booking created, calendar failed, webhook error, callback created.
- Add alerts for Calendar creation failure, webhook 5xx, and high failed booking rate.
- Add GCP budget alert and Twilio spend alert.
- Add audit fields: source, callId, webhook tag.
- Define rollback: disable forwarding, disable Twilio webhook, route calls back to human line.

