# Deployment Guide

This guide deploys the MVP to Cloud Run with the lowest practical cost profile.

## Cost Controls

- Cloud Run min instances: `0`
- Cloud Run max instances: `1` for MVP testing
- Region: `asia-northeast1`
- Firestore database: `appdb`
- Telephony is not deployed yet

## Required APIs

Enable these APIs in the Google Cloud project:

- Cloud Run API
- Cloud Build API
- Artifact Registry API
- Firestore API
- Google Calendar API

## Required Cloud Resources

Create an Artifact Registry Docker repository:

```bash
gcloud artifacts repositories create ai-phone-receptionist \
  --repository-format=docker \
  --location=asia-northeast1
```

The runtime service account should be:

```text
next-gen-phone-ai-dialogue@next-gen-phone-ai-dialogue.iam.gserviceaccount.com
```

Required roles:

- Cloud Datastore User
- Logs Writer

Cloud Build also needs permission to deploy Cloud Run and use the runtime service account.

## Secrets and Environment Variables

Do not deploy `.env` or service account JSON files.

Set these variables on Cloud Run:

```text
NODE_ENV=production
GOOGLE_CLOUD_PROJECT=next-gen-phone-ai-dialogue
FIRESTORE_DATABASE_ID=appdb
GOOGLE_CALENDAR_ID=<calendar-id>
DIALOGFLOW_PROJECT_ID=next-gen-phone-ai-dialogue
DIALOGFLOW_LOCATION=us-central1
DIALOGFLOW_AGENT_ID=<agent-id>
DIALOGFLOW_LANGUAGE_CODE=ja
DIALOGFLOW_WEBHOOK_SECRET=<optional-webhook-secret>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password>
SESSION_SECRET=<random-secret>
```

Optional until phone testing:

```text
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_TRANSFER_NUMBER=
```

## Deploy From Cloud Shell

Cloud Shell already has `gcloud`.

```bash
git clone https://github.com/ykxlly/next-gen-phone-ai-dialogue.git
cd next-gen-phone-ai-dialogue

gcloud config set project next-gen-phone-ai-dialogue
gcloud builds submit --config cloudbuild.yaml
```

After the first deploy, set secret environment variables that should not live in `cloudbuild.yaml`:

```bash
gcloud run services update next-gen-phone-ai-dialogue \
  --region asia-northeast1 \
  --set-env-vars GOOGLE_CALENDAR_ID='<calendar-id>',DIALOGFLOW_AGENT_ID='<agent-id>',DIALOGFLOW_WEBHOOK_SECRET='<optional-webhook-secret>',ADMIN_PASSWORD='<strong-password>',SESSION_SECRET='<random-secret>'
```

## Verify

```bash
SERVICE_URL=$(gcloud run services describe next-gen-phone-ai-dialogue \
  --region asia-northeast1 \
  --format='value(status.url)')

curl "$SERVICE_URL/healthz"
```

Open the admin screen:

```text
https://<cloud-run-url>/admin
```

Use `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

## Dialogflow CX Webhook URL

Set the Dialogflow CX webhook URL to:

```text
https://<cloud-run-url>/webhook/dialogflow
```

If `DIALOGFLOW_WEBHOOK_SECRET` is set, use one of these:

```text
https://<cloud-run-url>/webhook/dialogflow?token=<secret>
```

or set this request header in the Dialogflow webhook configuration:

```text
X-Webhook-Secret: <secret>
```

Use these fulfillment tags:

- `check_availability`
- `create_booking`
- `get_business_info`
- `create_callback_request`
- `save_call_summary`

