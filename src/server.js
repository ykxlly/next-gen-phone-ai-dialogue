import express from "express";
import helmet from "helmet";
import { config, getMissingRequiredConfig } from "./config.js";
import { adminRouter } from "./routes/admin.js";
import { dialogflowRouter } from "./routes/dialogflow.js";

const app = express();

app.use(helmet());
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    service: "next-gen-phone-ai-dialogue",
    status: "ok",
    admin: "/admin",
    dialogflowWebhook: "/webhook/dialogflow"
  });
});

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    missingConfig: getMissingRequiredConfig()
  });
});

app.use("/admin", adminRouter);
app.use("/webhook/dialogflow", dialogflowRouter);

app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.path
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: "Internal server error",
    message: config.nodeEnv === "production" ? undefined : error.message
  });
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
