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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const key = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
const client = new google.auth.JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});

const agent = `projects/${process.env.DIALOGFLOW_PROJECT_ID}/locations/${process.env.DIALOGFLOW_LOCATION}/agents/${process.env.DIALOGFLOW_AGENT_ID}`;
const api = `https://${process.env.DIALOGFLOW_LOCATION}-dialogflow.googleapis.com/v3`;
const flows = (await client.request({ url: `${api}/${agent}/flows` })).data.flows ?? [];
const flow = flows.find((item) => item.displayName === "AI Phone Receptionist Flow");
assert(flow, "AI Phone Receptionist Flow was not found");

const session = `${agent}/sessions/cx-form-${Date.now()}`;
const turns = [
  process.env.VERIFY_CX_START_TEXT ?? "予約したい",
  process.env.VERIFY_CX_DATE ?? "2026-11-07",
  process.env.VERIFY_CX_TIME ?? "16:50",
  process.env.VERIFY_CX_SERVICE ?? "整体60分",
  process.env.VERIFY_CX_NAME ?? "CXフォーム確認",
  process.env.VERIFY_CX_PHONE ?? "09033334444"
];

async function detect(text, index) {
  const data = {
    queryInput: {
      text: { text },
      languageCode: process.env.DIALOGFLOW_LANGUAGE_CODE ?? "ja"
    },
    queryParams: {}
  };

  if (index === 0) {
    data.queryParams.currentPage = `${flow.name}/pages/START_PAGE`;
  }

  const response = await client.request({
    url: `${api}/${session}:detectIntent`,
    method: "POST",
    data
  });

  const result = response.data.queryResult;
  const messages = (result.responseMessages ?? [])
    .map((message) => message.text?.text?.join(" / "))
    .filter(Boolean);

  console.log(JSON.stringify({
    input: text,
    intent: result.intent?.displayName ?? "",
    page: result.currentPage?.displayName ?? "",
    messages,
    booking_status: result.parameters?.booking_status ?? "",
    calendar_event_id: result.parameters?.calendar_event_id ?? ""
  }, null, 2));

  return result;
}

let lastResult;
for (const [index, text] of turns.entries()) {
  lastResult = await detect(text, index);
}

assert(lastResult.currentPage?.displayName === "End Session", `expected End Session, got ${lastResult.currentPage?.displayName}`);
assert(lastResult.parameters?.booking_status === "confirmed", `expected booking_status=confirmed, got ${lastResult.parameters?.booking_status}`);
assert(lastResult.parameters?.calendar_event_id, "calendar_event_id was not returned");

console.log("CX form verification completed.");
