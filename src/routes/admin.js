import express from "express";
import { config } from "../config.js";
import { listCollection } from "../firestore.js";

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
            <a href="/admin/faqs">FAQs</a>
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
        .map((column) => `<td>${escapeHtml(column.render ? column.render(item) : item[column.key])}</td>`)
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
            { label: "Customer", key: "customerName" },
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
            { label: "Customer", key: "customerName" },
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
