import express from "express";
import { config } from "../config.js";
import { createCollectionDoc, getBusiness, getCollectionDoc, listCollection, setBusiness, updateCollectionDoc } from "../firestore.js";

export const adminRouter = express.Router();

function requireBasicAuth(req, res, next) {
  if (!config.admin.password) {
    return res.status(503).json({
      error: "Admin password is not configured",
      requiredEnv: "ADMIN_PASSWORD"
    });
  }

  const header = req.headers.authorization ?? "";
  const [scheme, encoded] = header.split(" ");

  if (scheme !== "Basic" || !encoded) {
    res.setHeader("WWW-Authenticate", "Basic realm=\"admin\"");
    return res.status(401).send("Authentication required");
  }

  const [username, password] = Buffer.from(encoded, "base64").toString("utf8").split(":");
  if (username !== config.admin.username || password !== config.admin.password) {
    return res.status(403).send("Forbidden");
  }

  return next();
}

adminRouter.use(requireBasicAuth);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function page(title, body) {
  return `
    <!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: system-ui, sans-serif; margin: 32px; line-height: 1.6; color: #1f2937; background: #f8fafc; }
          main { max-width: 1120px; margin: 0 auto; }
          nav { display: flex; gap: 14px; flex-wrap: wrap; margin: 0 0 24px; }
          a { color: #075985; }
          nav a { font-weight: 650; text-decoration: none; }
          form { display: grid; gap: 14px; max-width: 720px; background: white; border: 1px solid #e5e7eb; padding: 18px; margin: 18px 0; }
          label { display: grid; gap: 6px; font-weight: 650; }
          input, select, textarea { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; padding: 9px 10px; font: inherit; }
          textarea { min-height: 110px; }
          button { width: fit-content; border: 1px solid #075985; background: #075985; color: white; padding: 9px 14px; font-weight: 650; cursor: pointer; }
          table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #e5e7eb; }
          th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
          th { background: #f1f5f9; font-size: 13px; }
          .muted { color: #64748b; }
          .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 0 0 24px; }
          .metric { background: white; border: 1px solid #e5e7eb; padding: 16px; }
          .metric strong { display: block; font-size: 26px; }
          code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <main>
          <nav>
            <a href="/admin">Dashboard</a>
            <a href="/admin/bookings">Bookings</a>
            <a href="/admin/calls">Calls</a>
            <a href="/admin/callbacks">Callbacks</a>
            <a href="/admin/faqs">FAQs</a>
            <a href="/admin/business">Business</a>
            <a href="/admin/readiness">Readiness</a>
            <a href="/admin/logs">Logs</a>
            <a href="/healthz">Health</a>
          </nav>
          ${body}
        </main>
      </body>
    </html>
  `;
}

function input(name, value = "", type = "text") {
  return `<input type="${escapeHtml(type)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`;
}

function textarea(name, value = "") {
  return `<textarea name="${escapeHtml(name)}">${escapeHtml(value)}</textarea>`;
}

function renderTable(items, columns, emptyMessage) {
  if (!items.length) {
    return `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
  }

  const header = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const rows = items
    .map((item) => {
      const cells = columns
        .map((column) => {
          if (column.renderHtml) {
            return `<td>${column.renderHtml(item)}</td>`;
          }
          return `<td>${escapeHtml(column.render ? column.render(item) : item[column.key])}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
}

adminRouter.get("/", (_req, res) => {
  res.type("html").send(
    page(
      "AI Phone Receptionist Admin",
      `
        <h1>AI Phone Receptionist Admin</h1>
        <p class="muted">Cloud Run MVP scaffold is running.</p>
        <p>Use this screen to confirm bookings, calls, and FAQs saved in Firestore.</p>
      `
    )
  );
});

adminRouter.get("/dashboard", async (_req, res, next) => {
  try {
    const [bookings, calls, callbackRequests] = await Promise.all([
      listCollection("bookings", 5),
      listCollection("calls", 5),
      listCollection("callbackRequests", 5)
    ]);

    const openCallbackRequests = callbackRequests.filter((item) => item.status !== "closed");

    res.type("html").send(
      page(
        "Dashboard",
        `
          <h1>Dashboard</h1>
          <section class="grid">
            <div class="metric"><span>Recent bookings</span><strong>${bookings.length}</strong></div>
            <div class="metric"><span>Recent calls</span><strong>${calls.length}</strong></div>
            <div class="metric"><span>Open callbacks</span><strong>${openCallbackRequests.length}</strong></div>
          </section>
          <h2>Recent Bookings</h2>
          ${renderTable(bookings, [
            { label: "Date", render: (item) => `${item.date ?? ""} ${item.startTime ?? ""}` },
            { label: "Customer", renderHtml: (item) => `<a href="/admin/bookings/${encodeURIComponent(item.id)}">${escapeHtml(item.customerName)}</a>` },
            { label: "Service", key: "serviceType" },
            { label: "Status", key: "status" }
          ], "No bookings yet.")}
        `
      )
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/readiness", async (_req, res, next) => {
  try {
    const [business, bookings, calls, callbacks, logs] = await Promise.all([
      getBusiness(),
      listCollection("bookings", 10),
      listCollection("calls", 10),
      listCollection("callbackRequests", 10),
      listCollection("opsLogs", 10)
    ]);

    const checks = [
      { label: "Admin password", ok: Boolean(config.admin.password), detail: config.admin.password ? "configured" : "missing ADMIN_PASSWORD" },
      { label: "Firestore project", ok: Boolean(config.googleCloudProject), detail: config.googleCloudProject || "missing GOOGLE_CLOUD_PROJECT" },
      { label: "Firestore database", ok: Boolean(config.firestoreDatabaseId), detail: config.firestoreDatabaseId || "missing FIRESTORE_DATABASE_ID" },
      { label: "Google Calendar", ok: Boolean(config.googleCalendarId), detail: config.googleCalendarId ? "configured" : "GOOGLE_CALENDAR_ID not set" },
      { label: "Dialogflow project", ok: Boolean(config.dialogflow.projectId), detail: config.dialogflow.projectId || "missing DIALOGFLOW_PROJECT_ID" },
      { label: "Dialogflow agent", ok: Boolean(config.dialogflow.agentId), detail: config.dialogflow.agentId ? "configured" : "missing DIALOGFLOW_AGENT_ID" },
      { label: "Webhook secret", ok: Boolean(config.dialogflow.webhookSecret), detail: config.dialogflow.webhookSecret ? "enabled" : "not enabled yet" },
      { label: "Business profile", ok: Boolean(business?.name), detail: business?.name || "businesses/default is missing name" },
      { label: "Bookings", ok: bookings.length > 0, detail: `${bookings.length} recent records` },
      { label: "Calls", ok: calls.length > 0, detail: `${calls.length} recent records` },
      { label: "Callbacks", ok: callbacks.length > 0, detail: `${callbacks.length} recent records` },
      { label: "Ops logs", ok: logs.length > 0, detail: `${logs.length} recent records` }
    ];

    const rows = checks
      .map((check) => ({
        status: check.ok ? "OK" : "TODO",
        label: check.label,
        detail: check.detail
      }));

    res.type("html").send(
      page(
        "MVP Readiness",
        `
          <h1>MVP Readiness</h1>
          <p class="muted">One-store MVP readiness snapshot. Webhook secret can remain TODO until external CX testing is complete.</p>
          ${renderTable(rows, [
            { label: "Status", key: "status" },
            { label: "Check", key: "label" },
            { label: "Detail", key: "detail" }
          ], "No readiness checks.")}
        `
      )
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/bookings", async (_req, res, next) => {
  try {
    const bookings = await listCollection("bookings");
    res.type("html").send(
      page(
        "Bookings",
        `
          <h1>Bookings</h1>
          ${renderTable(bookings, [
            { label: "Date", render: (item) => `${item.date ?? ""} ${item.startTime ?? ""}` },
            { label: "Customer", renderHtml: (item) => `<a href="/admin/bookings/${encodeURIComponent(item.id)}">${escapeHtml(item.customerName)}</a>` },
            { label: "Phone", key: "customerPhone" },
            { label: "Service", key: "serviceType" },
            { label: "People", key: "peopleCount" },
            { label: "Status", key: "status" },
            { label: "Calendar", render: (item) => item.calendarEventId || item.calendarStatus || "" },
            { label: "Memo", key: "memo" }
          ], "No bookings yet.")}
        `
      )
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/bookings/:id", async (req, res, next) => {
  try {
    const booking = await getCollectionDoc("bookings", req.params.id);
    if (!booking) {
      return res.status(404).type("html").send(page("Booking not found", "<h1>Booking not found</h1>"));
    }

    const calendar = booking.calendarEventUrl
      ? `<a href="${escapeHtml(booking.calendarEventUrl)}">Open Calendar event</a>`
      : escapeHtml(booking.calendarEventId || booking.calendarStatus || "Calendar未連携");

    res.type("html").send(
      page(
        "Booking Detail",
        `
          <h1>Booking Detail</h1>
          <table><tbody>
            <tr><th>ID</th><td>${escapeHtml(booking.id)}</td></tr>
            <tr><th>Customer</th><td>${escapeHtml(booking.customerName)}</td></tr>
            <tr><th>Phone</th><td>${escapeHtml(booking.customerPhone)}</td></tr>
            <tr><th>Date/Time</th><td>${escapeHtml(`${booking.date ?? ""} ${booking.startTime ?? ""}`)}</td></tr>
            <tr><th>Service</th><td>${escapeHtml(booking.serviceType)}</td></tr>
            <tr><th>People</th><td>${escapeHtml(booking.peopleCount)}</td></tr>
            <tr><th>Status</th><td>${escapeHtml(booking.status)}</td></tr>
            <tr><th>Calendar</th><td>${calendar}</td></tr>
            <tr><th>Memo</th><td>${escapeHtml(booking.memo)}</td></tr>
            <tr><th>Created</th><td>${escapeHtml(booking.createdAt)}</td></tr>
            <tr><th>Updated</th><td>${escapeHtml(booking.updatedAt)}</td></tr>
          </tbody></table>
          <form method="post" action="/admin/bookings/${escapeHtml(booking.id)}">
            <label>Status
              <select name="status">
                ${["confirmed", "pending", "cancelled", "completed", "no_show"].map((status) => (
                  `<option value="${status}"${booking.status === status ? " selected" : ""}>${status}</option>`
                )).join("")}
              </select>
            </label>
            <label>Memo ${textarea("memo", booking.memo)}</label>
            <button type="submit">Update booking</button>
          </form>
        `
      )
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/bookings/:id", express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    const allowed = new Set(["confirmed", "pending", "cancelled", "completed", "no_show"]);
    if (!allowed.has(req.body.status)) {
      return res.status(400).send("Invalid status");
    }
    await updateCollectionDoc("bookings", req.params.id, {
      status: req.body.status,
      memo: req.body.memo ?? ""
    });
    res.redirect(`/admin/bookings/${encodeURIComponent(req.params.id)}`);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/calls", async (_req, res, next) => {
  try {
    const calls = await listCollection("calls");
    res.type("html").send(
      page(
        "Calls",
        `
          <h1>Calls</h1>
          ${renderTable(calls, [
            { label: "Caller", renderHtml: (item) => `<a href="/admin/calls/${encodeURIComponent(item.id)}">${escapeHtml(item.callerPhone)}</a>` },
            { label: "Intent", key: "intent" },
            { label: "Result", key: "result" },
            { label: "Summary", key: "summary" },
            { label: "Created", key: "createdAt" }
          ], "No calls yet.")}
        `
      )
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/calls/:id", async (req, res, next) => {
  try {
    const call = await getCollectionDoc("calls", req.params.id);
    if (!call) {
      return res.status(404).type("html").send(page("Call not found", "<h1>Call not found</h1>"));
    }

    res.type("html").send(
      page(
        "Call Detail",
        `
          <h1>Call Detail</h1>
          <table><tbody>
            <tr><th>ID</th><td>${escapeHtml(call.id)}</td></tr>
            <tr><th>Caller</th><td>${escapeHtml(call.callerPhone)}</td></tr>
            <tr><th>Intent</th><td>${escapeHtml(call.intent)}</td></tr>
            <tr><th>Result</th><td>${escapeHtml(call.result)}</td></tr>
            <tr><th>Summary</th><td>${escapeHtml(call.summary)}</td></tr>
            <tr><th>Transcript</th><td>${escapeHtml(call.transcript)}</td></tr>
            <tr><th>Session</th><td><code>${escapeHtml(call.rawSession)}</code></td></tr>
            <tr><th>Created</th><td>${escapeHtml(call.createdAt)}</td></tr>
          </tbody></table>
        `
      )
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/faqs", async (_req, res, next) => {
  try {
    const faqs = await listCollection("faqs");
    res.type("html").send(
      page(
        "FAQs",
        `
          <h1>FAQs</h1>
          <p><a href="/admin/faqs/new">New FAQ</a></p>
          ${renderTable(faqs, [
            { label: "Question", renderHtml: (item) => `<a href="/admin/faqs/${encodeURIComponent(item.id)}">${escapeHtml(item.question)}</a>` },
            { label: "Answer", key: "answer" },
            { label: "Category", key: "category" },
            { label: "Enabled", render: (item) => item.enabled ? "yes" : "no" }
          ], "No FAQs yet.")}
        `
      )
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/faqs/new", (_req, res) => {
  res.type("html").send(
    page(
      "New FAQ",
      `
        <h1>New FAQ</h1>
        <form method="post" action="/admin/faqs">
          <label>Question ${input("question")}</label>
          <label>Answer ${textarea("answer")}</label>
          <label>Category ${input("category", "general")}</label>
          <label>Enabled
            <select name="enabled">
              <option value="true">yes</option>
              <option value="false">no</option>
            </select>
          </label>
          <button type="submit">Create FAQ</button>
        </form>
      `
    )
  );
});

adminRouter.post("/faqs", express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    const created = await createCollectionDoc("faqs", {
      question: req.body.question ?? "",
      answer: req.body.answer ?? "",
      category: req.body.category ?? "general",
      enabled: req.body.enabled === "true"
    });
    res.redirect(`/admin/faqs/${encodeURIComponent(created.id)}`);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/faqs/:id", async (req, res, next) => {
  try {
    const faq = await getCollectionDoc("faqs", req.params.id);
    if (!faq) {
      return res.status(404).type("html").send(page("FAQ not found", "<h1>FAQ not found</h1>"));
    }

    res.type("html").send(
      page(
        "FAQ Detail",
        `
          <h1>FAQ Detail</h1>
          <form method="post" action="/admin/faqs/${escapeHtml(faq.id)}">
            <label>Question ${input("question", faq.question)}</label>
            <label>Answer ${textarea("answer", faq.answer)}</label>
            <label>Category ${input("category", faq.category)}</label>
            <label>Enabled
              <select name="enabled">
                <option value="true"${faq.enabled ? " selected" : ""}>yes</option>
                <option value="false"${!faq.enabled ? " selected" : ""}>no</option>
              </select>
            </label>
            <button type="submit">Update FAQ</button>
          </form>
        `
      )
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/faqs/:id", express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    await updateCollectionDoc("faqs", req.params.id, {
      question: req.body.question ?? "",
      answer: req.body.answer ?? "",
      category: req.body.category ?? "general",
      enabled: req.body.enabled === "true"
    });
    res.redirect(`/admin/faqs/${encodeURIComponent(req.params.id)}`);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/business", async (_req, res, next) => {
  try {
    const business = await getBusiness() ?? {};
    res.type("html").send(
      page(
        "Business Settings",
        `
          <h1>Business Settings</h1>
          <form method="post" action="/admin/business">
            <label>Name ${input("name", business.name)}</label>
            <label>Phone ${input("phone", business.phone)}</label>
            <label>Address ${input("address", business.address)}</label>
            <label>Timezone ${input("timezone", business.timezone ?? "Asia/Tokyo")}</label>
            <label>Calendar ID ${input("calendarId", business.calendarId)}</label>
            <label>Transfer Phone ${input("transferPhone", business.transferPhone)}</label>
            <label>Business Hours Text ${textarea("businessHoursText", business.businessHoursText)}</label>
            <label>Services JSON ${textarea("servicesJson", JSON.stringify(business.services ?? [], null, 2))}</label>
            <button type="submit">Update business</button>
          </form>
        `
      )
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/business", express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    let services = [];
    try {
      services = JSON.parse(req.body.servicesJson || "[]");
      if (!Array.isArray(services)) {
        return res.status(400).send("Services JSON must be an array");
      }
    } catch {
      return res.status(400).send("Invalid services JSON");
    }

    await setBusiness({
      name: req.body.name ?? "",
      phone: req.body.phone ?? "",
      address: req.body.address ?? "",
      timezone: req.body.timezone ?? "Asia/Tokyo",
      calendarId: req.body.calendarId ?? "",
      transferPhone: req.body.transferPhone ?? "",
      businessHoursText: req.body.businessHoursText ?? "",
      services
    });
    res.redirect("/admin/business");
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/callbacks", async (_req, res, next) => {
  try {
    const callbacks = await listCollection("callbackRequests");
    res.type("html").send(
      page(
        "Callbacks",
        `
          <h1>Callbacks</h1>
          ${renderTable(callbacks, [
            { label: "Customer", renderHtml: (item) => `<a href="/admin/callbacks/${encodeURIComponent(item.id)}">${escapeHtml(item.customerName)}</a>` },
            { label: "Phone", key: "customerPhone" },
            { label: "Reason", key: "reason" },
            { label: "Preferred", key: "preferredTime" },
            { label: "Status", key: "status" },
            { label: "Created", key: "createdAt" }
          ], "No callback requests yet.")}
        `
      )
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/callbacks/:id", async (req, res, next) => {
  try {
    const callback = await getCollectionDoc("callbackRequests", req.params.id);
    if (!callback) {
      return res.status(404).type("html").send(page("Callback not found", "<h1>Callback not found</h1>"));
    }

    res.type("html").send(
      page(
        "Callback Detail",
        `
          <h1>Callback Detail</h1>
          <table><tbody>
            <tr><th>ID</th><td>${escapeHtml(callback.id)}</td></tr>
            <tr><th>Customer</th><td>${escapeHtml(callback.customerName)}</td></tr>
            <tr><th>Phone</th><td>${escapeHtml(callback.customerPhone)}</td></tr>
            <tr><th>Reason</th><td>${escapeHtml(callback.reason)}</td></tr>
            <tr><th>Preferred Time</th><td>${escapeHtml(callback.preferredTime)}</td></tr>
            <tr><th>Status</th><td>${escapeHtml(callback.status)}</td></tr>
            <tr><th>Created</th><td>${escapeHtml(callback.createdAt)}</td></tr>
          </tbody></table>
          <form method="post" action="/admin/callbacks/${escapeHtml(callback.id)}">
            <label>Status
              <select name="status">
                <option value="open">open</option>
                <option value="done">done</option>
                <option value="ignored">ignored</option>
              </select>
            </label>
            <button type="submit">Update</button>
          </form>
        `
      )
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/callbacks/:id", express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    const allowed = new Set(["open", "done", "ignored"]);
    if (!allowed.has(req.body.status)) {
      return res.status(400).send("Invalid status");
    }
    await updateCollectionDoc("callbackRequests", req.params.id, { status: req.body.status });
    res.redirect(`/admin/callbacks/${encodeURIComponent(req.params.id)}`);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/logs", async (_req, res, next) => {
  try {
    const logs = await listCollection("opsLogs", 50);
    res.type("html").send(
      page(
        "Ops Logs",
        `
          <h1>Ops Logs</h1>
          ${renderTable(logs, [
            { label: "Created", key: "createdAt" },
            { label: "Level", key: "level" },
            { label: "Event", key: "event" },
            { label: "Tag", key: "tag" },
            { label: "Message", key: "message" }
          ], "No ops logs yet.")}
        `
      )
    );
  } catch (error) {
    next(error);
  }
});
