import { google } from "googleapis";
import { config } from "./config.js";

const DEFAULT_TIMEZONE = "Asia/Tokyo";

let cachedCalendar;

function getCalendarClient() {
  if (!cachedCalendar) {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ["https://www.googleapis.com/auth/calendar"]
    });

    cachedCalendar = google.calendar({ version: "v3", auth });
  }

  return cachedCalendar;
}

export function buildDateTime(date, time, timezone = DEFAULT_TIMEZONE) {
  const normalizedDate = normalizeDate(date);
  const normalizedTime = normalizeTime(time);

  if (!normalizedDate || !normalizedTime) {
    throw new Error("date and time are required");
  }

  return {
    dateTime: `${normalizedDate}T${normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime}`,
    timeZone: timezone
  };
}

export function normalizeDate(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (typeof value === "object") {
    if (value.year && value.month && value.day) {
      return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
    }
    if (value.date) return normalizeDate(value.date);
  }
  return String(value).slice(0, 10);
}

export function normalizeTime(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/(\d{1,2}):(\d{2})/);
    if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
    return value;
  }
  if (typeof value === "object") {
    if (value.hours !== undefined || value.minutes !== undefined) {
      return `${String(value.hours ?? 0).padStart(2, "0")}:${String(value.minutes ?? 0).padStart(2, "0")}`;
    }
    if (value.hour !== undefined || value.minute !== undefined) {
      return `${String(value.hour ?? 0).padStart(2, "0")}:${String(value.minute ?? 0).padStart(2, "0")}`;
    }
  }
  return String(value);
}

function addMinutes(dateTimeValue, minutes) {
  const date = new Date(dateTimeValue);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

export async function checkCalendarAvailability({ date, time, durationMinutes = 60, timezone = DEFAULT_TIMEZONE }) {
  if (!config.googleCalendarId) {
    return { available: true, reason: "calendar_not_configured" };
  }

  try {
    const calendar = getCalendarClient();
    const normalizedDate = normalizeDate(date);
    const normalizedTime = normalizeTime(time);
    const start = buildDateTime(normalizedDate, normalizedTime, timezone);
    const endIso = addMinutes(`${normalizedDate}T${normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime}+09:00`, durationMinutes);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: `${start.dateTime}+09:00`,
        timeMax: endIso,
        timeZone: timezone,
        items: [{ id: config.googleCalendarId }]
      }
    });

    const busy = response.data.calendars?.[config.googleCalendarId]?.busy ?? [];
    return {
      available: busy.length === 0,
      busy
    };
  } catch (error) {
    return {
      available: true,
      reason: "calendar_check_failed",
      errorMessage: error.message
    };
  }
}

export async function createCalendarEvent({
  customerName,
  customerPhone,
  date,
  time,
  serviceType,
  memo,
  durationMinutes = 60,
  timezone = DEFAULT_TIMEZONE
}) {
  if (!config.googleCalendarId) {
    return { skipped: true, reason: "calendar_not_configured" };
  }

  try {
    const calendar = getCalendarClient();
    const normalizedDate = normalizeDate(date);
    const normalizedTime = normalizeTime(time);
    const start = buildDateTime(normalizedDate, normalizedTime, timezone);
    const endDate = new Date(`${normalizedDate}T${normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime}+09:00`);
    endDate.setMinutes(endDate.getMinutes() + durationMinutes);

    const response = await calendar.events.insert({
      calendarId: config.googleCalendarId,
      requestBody: {
        summary: `${serviceType || "予約"} - ${customerName || "お客様"}`,
        description: [
          customerPhone ? `電話番号: ${customerPhone}` : "",
          memo ? `メモ: ${memo}` : "",
          "Created by AI Phone Receptionist MVP"
        ]
          .filter(Boolean)
          .join("\n"),
        start,
        end: {
          dateTime: endDate.toISOString(),
          timeZone: timezone
        }
      }
    });

    return {
      id: response.data.id,
      htmlLink: response.data.htmlLink
    };
  } catch (error) {
    return {
      skipped: true,
      reason: "calendar_create_failed",
      errorMessage: error.message
    };
  }
}
