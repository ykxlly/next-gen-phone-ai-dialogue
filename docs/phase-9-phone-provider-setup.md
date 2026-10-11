# Phase 9 Phone Provider Setup

Phase 9 connects the completed Dialogflow CX MVP to a real test phone number.

## Recommended MVP Path

Use Twilio first.

Reason:

- Twilio has a native Dialogflow CX Connector and Virtual Agent flow.
- Dialogflow CX can launch the Twilio one-click telephony setup.
- Twilio Studio can connect the virtual agent to a purchased phone number.
- This avoids building a custom audio streaming bridge for the first MVP.

Telnyx remains a good later option, but it is better treated as a custom Voice API / webhook implementation after the Twilio path proves the call flow.

## Current MVP Inputs

Cloud Run:

```txt
https://next-gen-phone-ai-dialogue-1023891108593.asia-northeast1.run.app
```

Dialogflow CX:

```txt
Project: next-gen-phone-ai-dialogue
Location: us-central1
Agent: e08c7ce8-5124-4bb0-99a8-ed1bf432e867
Flow: AI Phone Receptionist Flow
Language: ja
```

MVP verification command:

```bash
npm run verify:mvp
```

## Twilio Setup Checklist

### 1. Create or Open Twilio Account

Open Twilio Console:

```txt
https://console.twilio.com/
```

### 2. Grant Twilio Access To Dialogflow CX

In Google Cloud IAM, grant this principal access:

```txt
virtualagent-ccai-prod@dialogflow-prod-env.iam.gserviceaccount.com
```

Required roles:

```txt
Dialogflow API Reader
Dialogflow API Client
```

### 3. Connect Dialogflow CX To Twilio

In Dialogflow CX:

```txt
Manage -> Integrations -> One-click telephony -> Twilio -> Connect
```

Use:

```txt
Environment: Draft or configured test environment
Language: ja
```

If Draft is rejected by the integration, create a CX Environment and point the integration to that environment.

### 4. Confirm Twilio Virtual Agent Connector

In Twilio Console:

```txt
Voice -> Virtual agents
```

Confirm the Dialogflow CX connector exists and points to:

```txt
Project: next-gen-phone-ai-dialogue
Location: us-central1
Agent ID: e08c7ce8-5124-4bb0-99a8-ed1bf432e867
```

### 5. Buy Test Phone Number

In Twilio Console:

```txt
Communications -> Numbers & senders -> Phone Numbers
```

Buy a number with Voice capability. Keep it separate from the real store number until Phase 13.

### 6. Connect Number To Studio Flow

Twilio's Dialogflow CX integration creates or uses a Studio Flow with a Connect Virtual Agent widget.

On the phone number:

```txt
Voice Configuration -> A call comes in -> Studio Flow -> select the virtual agent flow -> Save
```

### 7. Test Call

Call the Twilio number and test:

```txt
予約したい
2026-11-08
17:20
整体60分
山田太郎
09012345678
```

Expected:

- AI answers.
- Booking flow completes.
- Google Calendar event is created.
- Firestore booking is created.
- Admin `/admin/bookings` shows the booking.
- Admin `/admin/calls` has the call summary if `save_call_summary` runs.

## Twilio Environment Values

Store these locally only if you use Twilio APIs or later automate number management:

```txt
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_TRANSFER_NUMBER=
TWILIO_VIRTUAL_AGENT_CONNECTOR_NAME=
TWILIO_STUDIO_FLOW_SID=
```

The one-click CX integration can be completed without adding these values to the app.

## Telnyx Alternative Path

Use Telnyx only if:

- Twilio number availability/cost is not acceptable.
- You want to own the custom voice webhook/audio bridge.
- You are ready to implement Telnyx Voice API or TeXML handling.

Telnyx setup checklist:

1. Create a Telnyx account.
2. Create an API key.
3. Search and buy a voice-capable number.
4. Create a Voice API or TeXML application.
5. Configure webhook URL to a future app endpoint.
6. Implement call events, speech recognition or AI gather, and Dialogflow CX bridging.

Telnyx environment values:

```txt
TELNYX_API_KEY=
TELNYX_PHONE_NUMBER=
TELNYX_CONNECTION_ID=
TELNYX_TRANSFER_NUMBER=
TELNYX_PUBLIC_KEY=
```

## Phase 9 Completion Criteria

Phase 9 is complete when:

- Test phone number exists.
- Number is connected to the Dialogflow CX agent.
- Calling the number reaches the AI.
- Initial greeting is heard.
- A FAQ utterance receives a correct spoken answer.
- A test booking reaches `booking_status=confirmed`.
- Calendar, Firestore, and Admin reflect the call.

## Rollback

If a test call fails:

1. Disconnect the Twilio number from the Studio Flow.
2. Set the number to a simple fallback TwiML message or voicemail.
3. Disable existing-number forwarding if Phase 13 has started.
4. Continue taking calls manually.
