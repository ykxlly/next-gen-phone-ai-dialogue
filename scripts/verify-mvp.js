import "dotenv/config";
import { spawn } from "node:child_process";

const baseUrl = process.env.VERIFY_BASE_URL ?? "https://next-gen-phone-ai-dialogue-1023891108593.asia-northeast1.run.app";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: "inherit",
      env: {
        ...process.env,
        ...extraEnv
      }
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function requestJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.json();
  assert(response.ok, `${path} returned ${response.status}`);
  return body;
}

async function requestAdmin(path) {
  assert(adminPassword, "ADMIN_PASSWORD is required for admin readiness verification");
  const token = Buffer.from(`${adminUsername}:${adminPassword}`, "utf8").toString("base64");
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      authorization: `Basic ${token}`
    }
  });
  const text = await response.text();
  assert(response.ok, `${path} returned ${response.status}`);
  return text;
}

console.log(`MVP verification target: ${baseUrl}`);

const health = await requestJson("/healthz/");
assert(health.ok === true, "healthz did not return ok=true");
assert((health.missingConfig ?? []).length === 0, `missing config: ${(health.missingConfig ?? []).join(", ")}`);
console.log("OK healthz");

await run("npm", ["run", "verify:phase8"], {
  VERIFY_BASE_URL: baseUrl,
  VERIFY_BOOKING_TIME: process.env.VERIFY_BOOKING_TIME ?? "17:10"
});

await run("npm", ["run", "verify:cx:form"], {
  VERIFY_CX_DATE: process.env.VERIFY_CX_DATE ?? "2026-11-08",
  VERIFY_CX_TIME: process.env.VERIFY_CX_TIME ?? "17:20"
});

for (const path of [
  "/admin/bookings",
  "/admin/calls",
  "/admin/callbacks",
  "/admin/faqs",
  "/admin/business",
  "/admin/readiness",
  "/admin/logs"
]) {
  await requestAdmin(path);
  console.log(`OK ${path}`);
}

const readiness = await requestAdmin("/admin/readiness");
assert(readiness.includes("MVP Readiness"), "readiness page did not render");
console.log("MVP verification completed.");
