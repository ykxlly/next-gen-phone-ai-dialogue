import "dotenv/config";

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8080),
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT ?? "",
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID ?? "(default)",
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID ?? "",
  dialogflow: {
    projectId: process.env.DIALOGFLOW_PROJECT_ID ?? "",
    location: process.env.DIALOGFLOW_LOCATION ?? "global",
    agentId: process.env.DIALOGFLOW_AGENT_ID ?? "",
    languageCode: process.env.DIALOGFLOW_LANGUAGE_CODE ?? "ja",
    webhookSecret: process.env.DIALOGFLOW_WEBHOOK_SECRET ?? ""
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    phoneNumber: process.env.TWILIO_PHONE_NUMBER ?? "",
    transferNumber: process.env.TWILIO_TRANSFER_NUMBER ?? ""
  },
  admin: {
    username: process.env.ADMIN_USERNAME ?? "admin",
    password: process.env.ADMIN_PASSWORD ?? ""
  }
};

export function getMissingRequiredConfig() {
  const missing = [];

  if (!config.googleCloudProject) missing.push("GOOGLE_CLOUD_PROJECT");
  if (!config.admin.password) missing.push("ADMIN_PASSWORD");

  return missing;
}
