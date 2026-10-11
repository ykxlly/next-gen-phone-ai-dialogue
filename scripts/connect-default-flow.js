import "dotenv/config";
import fs from "fs";
import { google } from "googleapis";

const key = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
const client = new google.auth.JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});

const project = process.env.DIALOGFLOW_PROJECT_ID;
const location = process.env.DIALOGFLOW_LOCATION;
const agentId = process.env.DIALOGFLOW_AGENT_ID;
const api = `https://${location}-dialogflow.googleapis.com/v3`;
const agent = `projects/${project}/locations/${location}/agents/${agentId}`;

const flows = (await client.request({ url: `${api}/${agent}/flows` })).data.flows ?? [];
const defaultFlow = flows.find((flow) => flow.displayName === "Default Start Flow");
const aiFlow = flows.find((flow) => flow.displayName === "AI Phone Receptionist Flow");

if (!defaultFlow || !aiFlow) {
  throw new Error("Default Start Flow or AI Phone Receptionist Flow was not found");
}

const intents = (await client.request({ url: `${api}/${agent}/intents` })).data.intents ?? [];
const intentMap = new Map(intents.map((intent) => [intent.displayName, intent.name]));
const routeIntentNames = [
  "ai_phone.make_booking",
  "ai_phone.ask_business_info",
  "ai_phone.request_callback",
  "ai_phone.request_human",
  "ai_phone.cancel_or_change_booking",
  "ai_phone.goodbye"
];

const transitionRoutes = routeIntentNames
  .filter((name) => intentMap.has(name))
  .map((name) => ({
    intent: intentMap.get(name),
    targetFlow: aiFlow.name
  }));

const currentDefaultFlow = (await client.request({ url: `${api}/${defaultFlow.name}` })).data;
const existingRoutes = currentDefaultFlow.transitionRoutes ?? [];
const existingNonAiRoutes = existingRoutes.filter((route) => !route.intent || !routeIntentNames.includes(
  [...intentMap.entries()].find(([, intent]) => intent === route.intent)?.[0] ?? ""
));
const mergedRoutes = [...existingNonAiRoutes, ...transitionRoutes];

await client.request({
  url: `${api}/${defaultFlow.name}?updateMask=transition_routes,event_handlers`,
  method: "PATCH",
  data: {
    displayName: defaultFlow.displayName,
    transitionRoutes: mergedRoutes,
    eventHandlers: [
      {
        event: "sys.no-input-default",
        triggerFulfillment: {
          messages: [{ text: { text: ["ご予約、営業時間確認、折り返し依頼のどれをご希望ですか？"] } }]
        }
      },
      {
        event: "sys.no-match-default",
        triggerFulfillment: {
          messages: [{ text: { text: ["予約、営業時間、折り返し依頼のいずれかでお話しください。"] } }]
        }
      }
    ]
  }
});

console.log(JSON.stringify({
  patchedDefaultFlow: defaultFlow.name,
  targetFlow: aiFlow.name,
  addedRoutes: transitionRoutes.length,
  totalRoutes: mergedRoutes.length
}, null, 2));
