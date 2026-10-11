import "dotenv/config";
import fs from "fs";
import { google } from "googleapis";

const requiredEnv = [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "DIALOGFLOW_PROJECT_ID",
  "DIALOGFLOW_LOCATION",
  "DIALOGFLOW_AGENT_ID"
];

const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env: ${missing.join(", ")}`);
  process.exit(1);
}

const key = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
const client = new google.auth.JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});

const project = process.env.DIALOGFLOW_PROJECT_ID;
const location = process.env.DIALOGFLOW_LOCATION;
const agent = process.env.DIALOGFLOW_AGENT_ID;
const languageCode = process.env.DIALOGFLOW_LANGUAGE_CODE ?? "ja";
const base = `https://${location}-dialogflow.googleapis.com/v3/projects/${project}/locations/${location}/agents/${agent}`;

const intentSpecs = [
  ["ai_phone.make_booking", ["予約したい", "明日の15時に予約できますか", "空いてる時間ありますか", "整体60分を予約したい", "予約お願いします"]],
  ["ai_phone.ask_business_info", ["営業時間を教えて", "場所はどこですか", "料金はいくらですか", "駐車場ありますか", "メニューを教えて"]],
  ["ai_phone.request_callback", ["折り返してください", "後で電話がほしい", "担当者から連絡ください", "相談したいので電話ください"]],
  ["ai_phone.request_human", ["人につないで", "担当者に代わって", "スタッフと話したい", "受付の人いますか"]],
  ["ai_phone.cancel_or_change_booking", ["予約を変更したい", "キャンセルしたい", "時間を変えたい"]],
  ["ai_phone.goodbye", ["ありがとう", "大丈夫です", "失礼します", "終わりです"]],
  ["ai_phone.yes", ["はい", "お願いします", "それで大丈夫です", "予約してください"]],
  ["ai_phone.no", ["いいえ", "違います", "やめます", "別の日にします"]]
];

async function list(path) {
  const response = await client.request({ url: `${base}/${path}`, method: "GET" });
  return response.data[path] ?? [];
}

async function ensureIntent(displayName, phrases) {
  const intents = await list("intents");
  const existing = intents.find((intent) => intent.displayName === displayName);
  if (existing) {
    await client.request({
      url: `${base}/intents/${existing.name.split("/").pop()}?languageCode=${languageCode}&updateMask=training_phrases`,
      method: "PATCH",
      data: {
        displayName,
        trainingPhrases: phrases.map((text) => ({
          parts: [{ text }],
          repeatCount: 1
        }))
      }
    });
    console.log(`intent exists and localized: ${displayName} (${languageCode})`);
    return existing;
  }

  const response = await client.request({
    url: `${base}/intents?languageCode=${languageCode}`,
    method: "POST",
    data: {
      displayName,
      trainingPhrases: phrases.map((text) => ({
        parts: [{ text }],
        repeatCount: 1
      }))
    }
  });

  console.log(`intent created: ${displayName}`);
  return response.data;
}

async function ensureFlow(displayName) {
  const flows = await list("flows");
  const existing = flows.find((flow) => flow.displayName === displayName);
  if (existing) {
    console.log(`flow exists: ${displayName}`);
    return existing;
  }

  const response = await client.request({
    url: `${base}/flows`,
    method: "POST",
    data: {
      displayName,
      description: "AI phone receptionist booking, FAQ, callback, and transfer flow."
    }
  });

  console.log(`flow created: ${displayName}`);
  return response.data;
}

for (const [displayName, phrases] of intentSpecs) {
  await ensureIntent(displayName, phrases);
}

const flow = await ensureFlow("AI Phone Receptionist Flow");
console.log(`flow resource: ${flow.name}`);
console.log("Next: use docs/dialogflow-cx-blueprint.md to create pages/routes in the CX console.");
