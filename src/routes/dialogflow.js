import express from "express";
import { checkCalendarAvailability, createCalendarEvent, normalizeDate, normalizeTime } from "../calendar.js";
import { config } from "../config.js";
import { createCollectionDoc, createOpsLog, getBusiness } from "../firestore.js";

export const dialogflowRouter = express.Router();

dialogflowRouter.post("/", async (req, res, next) => {
  try {
    if (config.dialogflow.webhookSecret) {
      const headerSecret = req.headers["x-webhook-secret"];
      const querySecret = req.query.token;
      if (headerSecret !== config.dialogflow.webhookSecret && querySecret !== config.dialogflow.webhookSecret) {
        await createOpsLog({
          event: "webhook_unauthorized",
          level: "warn",
          message: "Dialogflow webhook request rejected due to invalid secret"
        });
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const tag = req.body?.fulfillmentInfo?.tag ?? "default";
    const parameters = req.body?.sessionInfo?.parameters ?? {};

    const handler = webhookHandlers[tag] ?? webhookHandlers.default;
    const result = await handler(parameters, req.body);

    res.json({
      fulfillment_response: {
        messages: [
          {
            text: {
              text: [result.message]
            }
          }
        ]
      },
      sessionInfo: {
        parameters: result.parameters ?? {}
      }
    });
  } catch (error) {
    await createOpsLog({
      event: "webhook_failed",
      level: "error",
      message: error.message,
      tag: req.body?.fulfillmentInfo?.tag ?? "unknown"
    });
    next(error);
  }
});

const webhookHandlers = {
  async check_availability(parameters) {
    const date = normalizeDate(parameters.date);
    const time = normalizeTime(parameters.time);
    const availability = await checkCalendarAvailability({
      date,
      time,
      durationMinutes: Number(parameters.duration_minutes ?? 60)
    });

    const message = availability.available
      ? "空き状況を確認しました。現時点ではご希望時間で受付可能です。"
      : "申し訳ありません。その時間はすでに予約が入っています。別の時間をご希望ください。";

    return {
      message,
      parameters: {
        ...parameters,
        date,
        time,
        availability_status: availability.available ? "available" : "busy"
      }
    };
  },

  async create_booking(parameters) {
    const date = normalizeDate(parameters.date);
    const time = normalizeTime(parameters.time);
    const durationMinutes = Number(parameters.duration_minutes ?? 60);
    const availability = await checkCalendarAvailability({
      date,
      time,
      durationMinutes
    });

    if (!availability.available) {
      return {
        message: "申し訳ありません。その時間はすでに予約が入っています。別の時間をご希望ください。",
        parameters: {
          booking_status: "busy",
          availability_status: "busy"
        }
      };
    }

    const calendarEvent = await createCalendarEvent({
      customerName: parameters.name ?? "",
      customerPhone: parameters.phone ?? "",
      date,
      time,
      serviceType: parameters.service_type ?? "",
      memo: parameters.memo ?? "",
      durationMinutes
    });

    if (calendarEvent.skipped && calendarEvent.reason === "calendar_create_failed") {
      await createOpsLog({
        event: "calendar_failed",
        level: "error",
        message: calendarEvent.errorMessage ?? "Calendar event creation failed",
        tag: "create_booking"
      });

      return {
        message: "予約カレンダーへの登録に失敗しました。恐れ入りますが、担当者から折り返し確認いたします。",
        parameters: {
          booking_status: "calendar_failed",
          calendar_status: "failed"
        }
      };
    }

    const booking = {
      customerName: parameters.name ?? "",
      customerPhone: parameters.phone ?? "",
      date,
      startTime: time,
      serviceType: parameters.service_type ?? "",
      peopleCount: parameters.people_count ?? 1,
      durationMinutes,
      status: "confirmed",
      memo: parameters.memo ?? "",
      calendarEventId: calendarEvent.id ?? "",
      calendarEventUrl: calendarEvent.htmlLink ?? "",
      calendarStatus: calendarEvent.skipped ? "skipped" : "created"
    };

    const created = await createCollectionDoc("bookings", booking);
    await createOpsLog({
      event: "booking_created",
      level: "info",
      message: "Booking created from Dialogflow webhook",
      tag: "create_booking",
      bookingId: created.id,
      metadata: {
        customerName: booking.customerName,
        date: booking.date,
        startTime: booking.startTime,
        calendarEventId: booking.calendarEventId
      }
    });

    if (booking.calendarEventId) {
      await createOpsLog({
        event: "calendar_created",
        level: "info",
        message: "Calendar event created for booking",
        tag: "create_booking",
        bookingId: created.id,
        metadata: {
          calendarEventId: booking.calendarEventId
        }
      });
    }

    return {
      message: "予約が完了しました。ご来店をお待ちしております。",
      parameters: {
        booking_id: created.id,
        booking_status: "confirmed",
        calendar_event_id: calendarEvent.id ?? "",
        booking_date: date,
        booking_time: time
      }
    };
  },

  async get_business_info(parameters) {
    const business = await getBusiness();
    const hours = business?.businessHoursText ?? "営業時間は平日10時から20時、土日祝日は10時から18時です。定休日は水曜日です。";

    return {
      message: hours,
      parameters
    };
  },

  async create_callback_request(parameters) {
    const created = await createCollectionDoc("callbackRequests", {
      customerName: parameters.name ?? "",
      customerPhone: parameters.phone ?? "",
      reason: parameters.reason ?? parameters.memo ?? "",
      preferredTime: parameters.preferred_time ?? "",
      status: "open"
    });
    await createOpsLog({
      event: "callback_created",
      level: "info",
      message: "Callback request created from Dialogflow webhook",
      tag: "create_callback_request",
      callbackId: created.id
    });

    return {
      message: "承知しました。担当者より折り返しご連絡いたします。",
      parameters: {
        callback_request_id: created.id,
        callback_status: "open"
      }
    };
  },

  async save_call_summary(parameters, body) {
    const created = await createCollectionDoc("calls", {
      callerPhone: parameters.phone ?? "",
      intent: parameters.intent ?? "",
      result: parameters.result ?? "handled",
      summary: parameters.summary ?? "",
      transcript: parameters.transcript ?? "",
      rawSession: body?.sessionInfo?.session ?? ""
    });

    return {
      message: "通話内容を保存しました。",
      parameters: {
        call_id: created.id
      }
    };
  },

  async default(parameters) {
    await createOpsLog({
      event: "unknown_webhook_tag",
      level: "warn",
      message: "Unknown or missing Dialogflow webhook tag",
      tag: "default"
    });

    return {
      message: "Webhookは正常に応答しています。",
      parameters
    };
  }
};
