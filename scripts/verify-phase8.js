import "dotenv/config";

const baseUrl = process.env.VERIFY_BASE_URL ?? "https://next-gen-phone-ai-dialogue-1023891108593.asia-northeast1.run.app";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "";
const webhookSecret = process.env.DIALOGFLOW_WEBHOOK_SECRET ?? "";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function futureDate(daysFromNow = 21) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${text}`);
  }

  return body;
}

async function callWebhook(tag, parameters) {
  const headers = { "content-type": "application/json" };
  if (webhookSecret) {
    headers["x-webhook-secret"] = webhookSecret;
  }

  return requestJson("/webhook/dialogflow", {
    method: "POST",
    headers,
    body: JSON.stringify({
      fulfillmentInfo: { tag },
      sessionInfo: {
        session: `phase8-verify-${Date.now()}`,
        parameters
      }
    })
  });
}

async function requestAdmin(path) {
  if (!adminPassword) {
    return null;
  }

  const token = Buffer.from(`${adminUsername}:${adminPassword}`, "utf8").toString("base64");
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      authorization: `Basic ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  return response.text();
}

const date = process.env.VERIFY_BOOKING_DATE ?? futureDate();
const time = process.env.VERIFY_BOOKING_TIME ?? "15:40";
const customerName = process.env.VERIFY_CUSTOMER_NAME ?? "Phase8確認";
const customerPhone = process.env.VERIFY_CUSTOMER_PHONE ?? "09000000000";

console.log(`Phase 8 verification target: ${baseUrl}`);
console.log(`Booking test slot: ${date} ${time}`);

const health = await requestJson("/healthz/");
assert(health.ok === true, "healthz did not return ok=true");
assert((health.missingConfig ?? []).length === 0, `missing config: ${(health.missingConfig ?? []).join(", ")}`);
console.log("OK healthz");

const availability = await callWebhook("check_availability", {
  date,
  time,
  duration_minutes: 60
});
assert(availability.sessionInfo?.parameters?.availability_status, "availability status was not returned");
console.log(`OK check_availability: ${availability.sessionInfo.parameters.availability_status}`);

const businessInfo = await callWebhook("get_business_info", {});
assert(businessInfo.fulfillment_response?.messages?.[0]?.text?.text?.[0], "business info message was not returned");
console.log("OK get_business_info");

const callback = await callWebhook("create_callback_request", {
  name: customerName,
  phone: customerPhone,
  reason: "Phase 8 verification",
  preferred_time: "明日午前"
});
assert(callback.sessionInfo?.parameters?.callback_status === "open", "callback_status was not open");
console.log(`OK create_callback_request: ${callback.sessionInfo.parameters.callback_request_id}`);

const callSummary = await callWebhook("save_call_summary", {
  phone: customerPhone,
  intent: "phase8_verification",
  result: "handled",
  summary: "Phase 8 verification call summary",
  transcript: "テスト通話です"
});
assert(callSummary.sessionInfo?.parameters?.call_id, "call_id was not returned");
console.log(`OK save_call_summary: ${callSummary.sessionInfo.parameters.call_id}`);

const booking = await callWebhook("create_booking", {
  name: customerName,
  phone: customerPhone,
  date,
  time,
  service_type: "整体60分",
  people_count: 1,
  duration_minutes: 60,
  memo: "Phase 8 verification booking"
});

const bookingParameters = booking.sessionInfo?.parameters ?? {};
assert(bookingParameters.booking_status === "confirmed", `booking_status was ${bookingParameters.booking_status}`);
assert(bookingParameters.calendar_event_id, "calendar_event_id was not returned");
console.log(`OK create_booking: ${bookingParameters.booking_id}`);
console.log(`OK calendar_event_id: ${bookingParameters.calendar_event_id}`);

const adminBookings = await requestAdmin("/admin/bookings");
if (adminBookings) {
  assert(adminBookings.includes(customerName), "admin bookings did not include test customer");
  console.log("OK admin bookings");
}

const adminCallbacks = await requestAdmin("/admin/callbacks");
if (adminCallbacks) {
  assert(adminCallbacks.includes(customerPhone), "admin callbacks did not include test phone");
  console.log("OK admin callbacks");
}

const adminLogs = await requestAdmin("/admin/logs");
if (adminLogs) {
  assert(adminLogs.includes("booking_created"), "admin logs did not include booking_created");
  console.log("OK admin logs");
}

console.log("Phase 8 verification completed.");
