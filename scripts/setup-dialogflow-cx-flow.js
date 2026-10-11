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
const apiRoot = `https://${location}-dialogflow.googleapis.com/v3`;
const agentPath = `projects/${project}/locations/${location}/agents/${agent}`;
const base = `${apiRoot}/${agentPath}`;
const flowDisplayName = "AI Phone Receptionist Flow";
const webhookDisplayName = "Cloud Run Booking Webhook";
const endSessionPage = `${agentPath}/flows/00000000-0000-0000-0000-000000000000/pages/END_SESSION`;

const systemEntity = (id) => `projects/-/locations/-/agents/-/entityTypes/${id}`;
const textMessage = (text) => ({ text: { text: [text] } });
const fulfillmentMessage = (text) => ({ messages: [textMessage(text)] });
const webhookFulfillment = (webhook, tag, text = "") => ({
  webhook,
  tag,
  ...(text ? { messages: [textMessage(text)] } : {})
});

async function request(pathOrUrl, method = "GET", data, query = "") {
  let url;
  if (pathOrUrl.startsWith("https://")) {
    url = pathOrUrl;
  } else if (pathOrUrl.startsWith("projects/")) {
    url = `${apiRoot}/${pathOrUrl}${query}`;
  } else {
    url = `${base}/${pathOrUrl}${query}`;
  }
  const separator = url.includes("?") ? "&" : "?";
  if (!url.includes("languageCode=")) {
    url = `${url}${separator}languageCode=${languageCode}`;
  }
  const response = await client.request({ url, method, data });
  return response.data;
}

async function list(path, keyName) {
  const data = await request(path);
  return data[keyName] ?? [];
}

async function ensureFlow() {
  const flows = await list("flows", "flows");
  const existing = flows.find((flow) => flow.displayName === flowDisplayName);
  if (existing) {
    console.log(`flow exists: ${flowDisplayName}`);
    return existing;
  }

  const created = await request("flows", "POST", {
    displayName: flowDisplayName,
    description: "AI phone receptionist booking, FAQ, callback, and transfer flow."
  });
  console.log(`flow created: ${flowDisplayName}`);
  return created;
}

async function getIntentMap() {
  const intents = await list("intents", "intents");
  return new Map(intents.map((intent) => [intent.displayName, intent.name]));
}

async function getWebhook() {
  const webhooks = await list("webhooks", "webhooks");
  const webhook = webhooks.find((item) => item.displayName === webhookDisplayName) ?? webhooks[0];
  if (!webhook) {
    throw new Error("No Dialogflow CX webhook exists. Create Cloud Run Booking Webhook first.");
  }
  console.log(`webhook: ${webhook.displayName}`);
  return webhook.name;
}

async function ensurePage(flow, displayName, spec) {
  const pages = await list(`${flow.name}/pages`, "pages");
  const existing = pages.find((page) => page.displayName === displayName);
  if (existing) {
    const updated = await request(existing.name, "PATCH", { ...spec, displayName }, "?updateMask=entry_fulfillment,form,transition_routes,event_handlers");
    console.log(`page updated: ${displayName}`);
    return updated;
  }

  const created = await request(`${flow.name}/pages`, "POST", { ...spec, displayName });
  console.log(`page created: ${displayName}`);
  return created;
}

function requiredParam(displayName, entityType, prompt) {
  return {
    displayName,
    required: true,
    entityType,
    fillBehavior: {
      initialPromptFulfillment: fulfillmentMessage(prompt)
    }
  };
}

function noInputNoMatchHandlers(targetPage = "") {
  const target = targetPage ? { targetPage } : {};
  return [
    {
      event: "sys.no-input-default",
      triggerFulfillment: fulfillmentMessage("すみません、聞き取れませんでした。ご予約、営業時間確認、折り返し依頼のどれをご希望ですか？"),
      ...target
    },
    {
      event: "sys.no-match-default",
      triggerFulfillment: fulfillmentMessage("すみません、内容を確認できませんでした。予約、営業時間、折り返し依頼のいずれかでお話しください。"),
      ...target
    }
  ];
}

const flow = await ensureFlow();
const intents = await getIntentMap();
const webhook = await getWebhook();

for (const intentName of [
  "ai_phone.make_booking",
  "ai_phone.ask_business_info",
  "ai_phone.request_callback",
  "ai_phone.request_human",
  "ai_phone.cancel_or_change_booking",
  "ai_phone.goodbye",
  "ai_phone.yes",
  "ai_phone.no"
]) {
  if (!intents.has(intentName)) {
    throw new Error(`Missing intent: ${intentName}. Run npm run setup:cx first.`);
  }
}

const pages = {};

pages.bookingBusy = await ensurePage(flow, "Booking.Busy", {
  entryFulfillment: fulfillmentMessage("申し訳ありません。その時間は埋まっています。別の日時で再度お試しください。"),
  transitionRoutes: [],
  eventHandlers: noInputNoMatchHandlers()
});

pages.bookingDone = await ensurePage(flow, "Booking.Done", {
  entryFulfillment: webhookFulfillment(webhook, "save_call_summary", "予約が完了しました。ご来店をお待ちしております。"),
  transitionRoutes: [{ condition: "true", targetPage: endSessionPage }],
  eventHandlers: noInputNoMatchHandlers()
});

pages.callbackCreate = await ensurePage(flow, "Callback.Create", {
  entryFulfillment: webhookFulfillment(webhook, "create_callback_request"),
  transitionRoutes: [{ condition: "true", targetPage: endSessionPage }],
  eventHandlers: noInputNoMatchHandlers()
});

pages.callbackCollect = await ensurePage(flow, "Callback.Collect", {
  entryFulfillment: fulfillmentMessage("折り返しとして承ります。"),
  form: {
    parameters: [
      requiredParam("name", systemEntity("sys.any"), "お名前をお願いします。"),
      requiredParam("phone", systemEntity("sys.phone-number"), "折り返し先のお電話番号をお願いします。"),
      requiredParam("reason", systemEntity("sys.any"), "ご用件を簡単に教えてください。")
    ]
  },
  transitionRoutes: [{ condition: '$page.params.status = "FINAL"', targetPage: pages.callbackCreate.name }],
  eventHandlers: noInputNoMatchHandlers()
});

pages.bookingCreate = await ensurePage(flow, "Booking.CreateBooking", {
  entryFulfillment: webhookFulfillment(webhook, "create_booking"),
  transitionRoutes: [
    { condition: '$session.params.booking_status = "confirmed"', targetPage: pages.bookingDone.name },
    { condition: '$session.params.booking_status = "calendar_failed"', targetPage: pages.callbackCollect.name },
    { condition: '$session.params.booking_status = "busy"', targetPage: pages.bookingBusy.name }
  ],
  eventHandlers: noInputNoMatchHandlers()
});

pages.bookingCheck = await ensurePage(flow, "Booking.CheckAvailability", {
  entryFulfillment: webhookFulfillment(webhook, "check_availability"),
  transitionRoutes: [
    { condition: '$session.params.availability_status = "available"', targetPage: pages.bookingCreate.name },
    { condition: '$session.params.availability_status = "busy"', targetPage: pages.bookingBusy.name }
  ],
  eventHandlers: noInputNoMatchHandlers()
});

pages.bookingCollect = await ensurePage(flow, "Booking.Collect", {
  entryFulfillment: fulfillmentMessage("ご予約ですね。必要事項を順番に確認します。"),
  form: {
    parameters: [
      requiredParam("date", systemEntity("sys.date"), "ご希望の日にちを西暦のYYYY-MM-DD形式でお願いします。たとえば2026-11-07です。"),
      requiredParam("time", systemEntity("sys.time"), "ご希望の時間をHH:mm形式でお願いします。たとえば16:50です。"),
      requiredParam("service_type", systemEntity("sys.any"), "ご希望のメニューや内容を教えてください。"),
      requiredParam("name", systemEntity("sys.any"), "お名前をフルネームでお願いします。"),
      requiredParam("phone", systemEntity("sys.phone-number"), "確認のため、お電話番号をお願いします。")
    ]
  },
  transitionRoutes: [{ condition: '$page.params.status = "FINAL"', targetPage: pages.bookingCheck.name }],
  eventHandlers: noInputNoMatchHandlers()
});

pages.faq = await ensurePage(flow, "FAQ.GetBusinessInfo", {
  entryFulfillment: webhookFulfillment(webhook, "get_business_info"),
  transitionRoutes: [
    { intent: intents.get("ai_phone.make_booking"), targetPage: pages.bookingCollect.name },
    { intent: intents.get("ai_phone.request_callback"), targetPage: pages.callbackCollect.name },
    { intent: intents.get("ai_phone.goodbye"), targetPage: endSessionPage }
  ],
  eventHandlers: noInputNoMatchHandlers()
});

// Resolve placeholder routes now that all target pages exist.
await request(pages.bookingBusy.name, "PATCH", {
  displayName: "Booking.Busy",
  entryFulfillment: fulfillmentMessage("申し訳ありません。その時間は埋まっています。別の日時で再度お試しください。"),
  transitionRoutes: [
    { intent: intents.get("ai_phone.make_booking"), targetPage: pages.bookingCollect.name },
    { intent: intents.get("ai_phone.request_callback"), targetPage: pages.callbackCollect.name },
    { intent: intents.get("ai_phone.goodbye"), targetPage: endSessionPage }
  ],
  eventHandlers: noInputNoMatchHandlers()
}, "?updateMask=entry_fulfillment,transition_routes,event_handlers");

const startRoutes = [
  { intent: intents.get("ai_phone.make_booking"), targetPage: pages.bookingCollect.name },
  { intent: intents.get("ai_phone.ask_business_info"), targetPage: pages.faq.name },
  { intent: intents.get("ai_phone.request_callback"), targetPage: pages.callbackCollect.name },
  { intent: intents.get("ai_phone.request_human"), targetPage: pages.callbackCollect.name },
  { intent: intents.get("ai_phone.cancel_or_change_booking"), targetPage: pages.callbackCollect.name },
  { intent: intents.get("ai_phone.goodbye"), targetPage: endSessionPage }
];

await request(flow.name, "PATCH", {
  displayName: flowDisplayName,
  description: "AI phone receptionist booking, FAQ, callback, and transfer flow.",
  transitionRoutes: startRoutes,
  eventHandlers: noInputNoMatchHandlers(pages.callbackCollect.name)
}, "?updateMask=transition_routes,event_handlers,description");

console.log("CX flow pages and routes are ready.");
console.log(`Flow: ${flow.name}`);
console.log("Next: open the CX simulator and select AI Phone Receptionist Flow.");
