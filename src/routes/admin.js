import express from "express";
import { config } from "../config.js";
import { getCollectionDoc, listCollection, updateCollectionDoc } from "../firestore.js";

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
            <a href="/admin/logs">Logs</a>
            <a href="/healthz">Health</a>
          </nav>
          ${body}
        </main>
      </body>
    </html>
  `;
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
        `
      )
    );
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
            { label: "Caller", key: "callerPhone" },
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

adminRouter.get("/faqs", async (_req, res, next) => {
  try {
    const faqs = await listCollection("faqs");
    res.type("html").send(
      page(
        "FAQs",
        `
          <h1>FAQs</h1>
          ${renderTable(faqs, [
            { label: "Question", key: "question" },
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
