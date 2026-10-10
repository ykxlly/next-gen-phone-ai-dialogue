import "dotenv/config";
import { businessRef, setBusiness } from "../src/firestore.js";

const business = {
  name: "サンプル整体院",
  phone: "0312345678",
  address: "東京都渋谷区サンプル1-2-3",
  timezone: "Asia/Tokyo",
  calendarId: process.env.GOOGLE_CALENDAR_ID ?? "",
  transferPhone: process.env.TWILIO_TRANSFER_NUMBER ?? "",
  businessHoursText: "営業時間は平日10時から20時、土日祝日は10時から18時です。定休日は水曜日です。",
  businessHours: {
    mon: [{ open: "10:00", close: "20:00" }],
    tue: [{ open: "10:00", close: "20:00" }],
    wed: [],
    thu: [{ open: "10:00", close: "20:00" }],
    fri: [{ open: "10:00", close: "20:00" }],
    sat: [{ open: "10:00", close: "18:00" }],
    sun: [{ open: "10:00", close: "18:00" }]
  },
  services: [
    { name: "整体60分", durationMinutes: 60, price: 6000 },
    { name: "整体90分", durationMinutes: 90, price: 9000 },
    { name: "初回カウンセリング", durationMinutes: 30, price: 0 }
  ]
};

const faqs = [
  {
    question: "駐車場はありますか？",
    answer: "専用駐車場はありません。近隣のコインパーキングをご利用ください。",
    category: "access",
    enabled: true
  },
  {
    question: "当日予約できますか？",
    answer: "空きがあれば当日予約も可能です。",
    category: "booking",
    enabled: true
  },
  {
    question: "支払い方法は何がありますか？",
    answer: "現金、クレジットカード、主要なQR決済に対応しています。",
    category: "payment",
    enabled: true
  }
];

await setBusiness(business);

const now = new Date().toISOString();
const faqCollection = businessRef().collection("faqs");
for (const faq of faqs) {
  await faqCollection.add({
    ...faq,
    createdAt: now,
    updatedAt: now
  });
}

console.log("Seeded Firestore business/default and FAQs.");
