# AI Phone Receptionist MVP Specification

既存の電話番号にかかってくる電話を、AIが自然会話で受付するMVPです。
従来の「1を押してください」型IVRではなく、利用者が普通に話すだけで、予約、FAQ回答、担当者転送、折り返し依頼を処理できる状態を目指します。

## 1. Product Summary

### Objective

店舗や事業者の既存電話番号をAI受付化し、電話対応の取りこぼしを減らします。

MVPでは、1店舗向けに以下を実現します。

- AIが電話に応答する
- 予約希望を聞き取る
- 空き枠を確認する
- Google Calendarに予約を登録する
- 営業時間、アクセス、料金などのFAQに答える
- 担当者へ転送する
- 転送できない場合は折り返し依頼を保存する
- 通話履歴、要約、予約履歴を管理画面で確認する

### Target Users

最初の対象は、予約や問い合わせの型が比較的決まっている小規模事業者です。

- 美容室
- 整体、整骨院
- 歯科
- クリニック
- 士業事務所
- 飲食店
- 修理、清掃、水道、鍵などのホームサービス

MVPでは、整体または美容室のような「サービス種別 + 日時 + 顧客情報」で予約が成立する業種を想定します。

## 2. System Architecture

### Compact GCP-Based Architecture

```text
Existing phone number
  -> call forwarding
Twilio or Telnyx
  -> telephony integration
Dialogflow CX
  -> webhook
Cloud Run
  -> Firestore
  -> Google Calendar
  -> Email or LINE notification
```

### Components

| Component | Role |
| --- | --- |
| Twilio or Telnyx | 電話番号、着信転送、通話接続 |
| Dialogflow CX | 音声会話、用件分類、会話フロー管理 |
| Cloud Run | Webhook、業務ロジック、管理画面 |
| Firestore | 店舗情報、予約、通話履歴、FAQ保存 |
| Google Calendar API | 空き枠確認、予約登録、変更、キャンセル |
| Email or LINE | 予約完了、折り返し依頼、エラー通知 |

### Design Principle

Dialogflow CXには会話制御を担当させ、業務判断はCloud Runに寄せます。

```text
Dialogflow CX
  - 用件を分類する
  - 必要情報を聞く
  - 確認を取る

Cloud Run
  - 空き枠を確認する
  - 予約を作成する
  - FAQを検索する
  - 折り返し依頼を保存する
  - 転送先を決める
  - 通知を送る

Firestore
  - 店舗設定
  - FAQ
  - 予約履歴
  - 通話履歴
  - 顧客情報
```

## 3. MVP Scope

### In Scope

- AI電話応答
- 用件分類
- 予約受付
- 空き枠確認
- Google Calendar予約登録
- FAQ回答
- 担当者転送
- 転送失敗時の折り返し依頼
- 通話要約保存
- 通話履歴保存
- 予約履歴管理
- 簡易管理画面
- メールまたはLINE通知

### Out of Scope

- 決済
- 複雑なクレーム対応
- 医療判断
- 法律判断
- キャンセル料請求
- 複数店舗管理
- 高度なCRM連携
- 完全自動の例外対応

## 4. Admin Screen Design

管理画面はCloud Run上に同居させ、最初は最小限の画面で運用します。

```text
/admin
/admin/bookings
/admin/calls
/admin/faqs
/admin/settings
```

### Dashboard

表示項目:

- 本日の着信数
- 本日の予約数
- 未対応の折り返し件数
- AI対応成功率
- 直近の通話履歴
- 直近の予約

操作:

- 通話詳細を見る
- 予約詳細を見る
- 未対応折り返しを確認する

### Bookings

表示項目:

- 予約日時
- 顧客名
- 電話番号
- サービス種別
- 人数
- ステータス
- 作成元通話
- メモ

ステータス:

- `confirmed`
- `pending`
- `cancelled`
- `needs_follow_up`

操作:

- 予約詳細を見る
- ステータス変更
- Google Calendarを開く
- メモ追加

### Calls

表示項目:

- 着信日時
- 発信者番号
- 用件
- 対応結果
- 通話要約
- 予約ID
- 録音URL
- 文字起こし

対応結果:

- `booked`
- `answered_faq`
- `transferred`
- `callback_requested`
- `failed`
- `spam`

操作:

- 通話詳細を見る
- 折り返し済みにする
- 予約に紐づける

### FAQs and Business Info

編集項目:

- 店舗名
- 営業時間
- 定休日
- 住所
- アクセス
- 料金
- サービスメニュー
- 予約ルール
- キャンセルポリシー
- よくある質問

FAQ例:

- 駐車場はありますか？
- 当日予約できますか？
- 支払い方法は何がありますか？
- 子ども連れでも大丈夫ですか？

### Settings

設定項目:

- AI受付の名前
- 挨拶文
- 転送先電話番号
- 営業時間外の動作
- 無応答時の動作
- 通知先メール
- LINE通知Webhook
- Google Calendar連携
- 通話録音ON/OFF

## 5. Conversation Design

### Main Flow

```text
Incoming call
  -> greeting
  -> intent classification
  -> booking / FAQ / transfer / callback / other
  -> collect required information
  -> confirmation
  -> execute action
  -> closing message
```

### Opening Message

```text
お電話ありがとうございます。{businessName}です。
ご予約、営業時間の確認、アクセス、担当者へのおつなぎなどを承れます。
ご用件をお話しください。
```

### Intents

| Intent | Description |
| --- | --- |
| `make_booking` | 新規予約 |
| `change_booking` | 予約変更 |
| `cancel_booking` | 予約キャンセル |
| `ask_hours` | 営業時間確認 |
| `ask_location` | 場所、アクセス確認 |
| `ask_price` | 料金確認 |
| `ask_service` | サービス内容確認 |
| `request_human` | 担当者転送 |
| `request_callback` | 折り返し依頼 |
| `other` | その他 |

### Booking Flow

Required parameters:

- `name`
- `phone`
- `date`
- `time`
- `people_count`
- `service_type`
- `memo`

Example:

```text
AI:
ご予約ですね。ご希望の日にちはいつですか？

User:
明日の午後で。

AI:
ありがとうございます。ご希望の時間帯はありますか？

User:
15時くらい。

AI:
15時で空き状況を確認します。お名前をフルネームでお願いします。

User:
山田太郎です。

AI:
ありがとうございます。山田太郎様、明日15時、整体60分で予約をお取りしてよろしいですか？
```

Confirmation success:

```text
予約が完了しました。
明日15時にお待ちしております。
変更やキャンセルの場合は、こちらの番号へ再度お電話ください。
```

No availability:

```text
申し訳ありません。その時間は埋まっています。
15時30分、または16時でしたら空きがあります。どちらがよろしいですか？
```

### FAQ Flow

Example:

```text
User:
営業時間を教えて。

AI:
営業時間は平日10時から20時、土日祝日は10時から18時です。
定休日は水曜日です。
```

### Transfer Flow

```text
User:
人につないで。

AI:
承知しました。担当者におつなぎします。
つながらない場合は折り返し依頼として承ります。
```

Transfer failure:

```text
ただいま担当者が電話に出られません。
折り返しをご希望の場合は、お名前とご用件をお伺いします。
```

### Callback Flow

Required parameters:

- `name`
- `phone`
- `reason`
- `preferred_time`

Completion:

```text
承知しました。担当者より折り返しご連絡いたします。
```

## 6. API Design

Cloud RunにAPIと管理画面をまとめます。

### Dialogflow Webhook

```text
POST /webhook/dialogflow
```

Webhook tags:

- `check_availability`
- `create_booking`
- `update_booking`
- `cancel_booking`
- `get_business_info`
- `create_callback_request`
- `transfer_call`
- `save_call_summary`

Example request:

```json
{
  "fulfillmentInfo": {
    "tag": "create_booking"
  },
  "sessionInfo": {
    "session": "projects/example/locations/global/agents/example/sessions/abc",
    "parameters": {
      "name": "山田太郎",
      "phone": "09012345678",
      "date": "2026-10-10",
      "time": "15:00",
      "service_type": "整体60分",
      "people_count": 1
    }
  }
}
```

Example response:

```json
{
  "fulfillment_response": {
    "messages": [
      {
        "text": {
          "text": [
            "予約が完了しました。明日15時にお待ちしております。"
          ]
        }
      }
    ]
  },
  "sessionInfo": {
    "parameters": {
      "booking_status": "confirmed"
    }
  }
}
```

### Admin APIs

```text
GET    /admin/dashboard
GET    /admin/bookings
GET    /admin/bookings/:id
PATCH  /admin/bookings/:id
GET    /admin/calls
GET    /admin/calls/:id
PATCH  /admin/calls/:id
GET    /admin/business
PATCH  /admin/business
GET    /admin/faqs
POST   /admin/faqs
PATCH  /admin/faqs/:id
DELETE /admin/faqs/:id
GET    /admin/settings
PATCH  /admin/settings
```

## 7. Database Design

Firestoreを利用します。

```text
businesses/{businessId}
businesses/{businessId}/faqs/{faqId}
businesses/{businessId}/bookings/{bookingId}
businesses/{businessId}/calls/{callId}
businesses/{businessId}/callbackRequests/{callbackId}
businesses/{businessId}/settings/{settingId}
```

### businesses

```json
{
  "name": "サンプル整体院",
  "phone": "0312345678",
  "address": "東京都渋谷区...",
  "timezone": "Asia/Tokyo",
  "calendarId": "primary",
  "transferPhone": "09012345678",
  "businessHours": {
    "mon": [{"open": "10:00", "close": "20:00"}],
    "tue": [{"open": "10:00", "close": "20:00"}],
    "wed": [],
    "thu": [{"open": "10:00", "close": "20:00"}],
    "fri": [{"open": "10:00", "close": "20:00"}],
    "sat": [{"open": "10:00", "close": "18:00"}],
    "sun": [{"open": "10:00", "close": "18:00"}]
  },
  "createdAt": "2026-10-09T10:00:00+09:00",
  "updatedAt": "2026-10-09T10:00:00+09:00"
}
```

### faqs

```json
{
  "question": "駐車場はありますか？",
  "answer": "近隣のコインパーキングをご利用ください。",
  "category": "access",
  "enabled": true,
  "createdAt": "2026-10-09T10:00:00+09:00",
  "updatedAt": "2026-10-09T10:00:00+09:00"
}
```

### bookings

```json
{
  "customerName": "山田太郎",
  "customerPhone": "09012345678",
  "date": "2026-10-10",
  "startTime": "15:00",
  "endTime": "16:00",
  "serviceType": "整体60分",
  "peopleCount": 1,
  "status": "confirmed",
  "calendarEventId": "abc123",
  "callId": "call_001",
  "memo": "腰痛相談",
  "createdAt": "2026-10-09T10:00:00+09:00",
  "updatedAt": "2026-10-09T10:00:00+09:00"
}
```

### calls

```json
{
  "callerPhone": "09012345678",
  "startedAt": "2026-10-09T10:00:00+09:00",
  "endedAt": "2026-10-09T10:03:00+09:00",
  "intent": "make_booking",
  "result": "booked",
  "summary": "山田太郎様から整体60分の予約。10月10日15時で確定。",
  "transcript": "...",
  "recordingUrl": "https://example.com/recordings/call_001.mp3",
  "bookingId": "booking_001",
  "needsFollowUp": false,
  "createdAt": "2026-10-09T10:00:00+09:00",
  "updatedAt": "2026-10-09T10:03:00+09:00"
}
```

### callbackRequests

```json
{
  "customerName": "佐藤花子",
  "customerPhone": "08012345678",
  "reason": "料金について詳しく聞きたい",
  "preferredTime": "本日18時以降",
  "status": "open",
  "callId": "call_002",
  "createdAt": "2026-10-09T11:00:00+09:00",
  "updatedAt": "2026-10-09T11:00:00+09:00"
}
```

### settings

```json
{
  "assistantName": "AI受付",
  "greetingMessage": "お電話ありがとうございます。サンプル整体院です。",
  "afterHoursMode": "callback",
  "noAnswerMode": "ai_reception",
  "notificationEmail": "owner@example.com",
  "lineWebhookUrl": "",
  "recordingEnabled": true,
  "createdAt": "2026-10-09T10:00:00+09:00",
  "updatedAt": "2026-10-09T10:00:00+09:00"
}
```

## 8. Implementation Plan

### Phase 1: Foundation

- GCPプロジェクト作成
- Firestore作成
- Cloud Run用アプリ作成
- Dialogflow CX Agent作成
- TwilioまたはTelnyx番号取得
- Secret Manager設定

### Phase 2: Dialogflow CX Conversation

- 開始フロー作成
- 用件分類Intent作成
- 予約Intent作成
- FAQ Intent作成
- 転送Intent作成
- 折り返しIntent作成
- 予約パラメータ定義
- 確認フロー作成

### Phase 3: Webhook

- `POST /webhook/dialogflow` 実装
- `check_availability` 実装
- `create_booking` 実装
- `get_business_info` 実装
- `create_callback_request` 実装
- `save_call_summary` 実装

### Phase 4: Google Calendar

- Google Calendar API有効化
- サービスアカウント設定
- 空き枠確認
- イベント作成
- イベント更新
- イベントキャンセル

### Phase 5: Admin

- `/admin/dashboard`
- `/admin/bookings`
- `/admin/calls`
- `/admin/faqs`
- `/admin/settings`

### Phase 6: Phone Integration

- TwilioとDialogflow CXを接続
- Twilio番号へ発信テスト
- 日本語音声テスト
- 担当者転送テスト
- 通話ログ保存テスト
- 既存番号からの転送テスト

### Phase 7: Notifications

- 予約完了通知
- 折り返し依頼通知
- エラー通知
- 管理者向け日次サマリー

### Phase 8: Tests

- 予約成功
- 空きなし
- FAQ回答
- 担当者転送
- 転送失敗から折り返し
- 聞き取り失敗
- 無言
- 途中切断
- 営業時間外

## 9. MVP Completion Criteria

MVPは以下を満たしたら完成とします。

- 電話をかけるとAIが応答する
- AIが予約希望を聞き取れる
- AIが空き枠を確認できる
- 予約をGoogle Calendarに登録できる
- FAQに回答できる
- 担当者へ転送できる
- 担当者が出ない場合、折り返し依頼を保存できる
- 通話履歴が保存される
- 通話要約が保存される
- 管理画面で予約、通話、FAQ、設定を確認できる

## 10. Future Enhancements

- 複数店舗対応
- 業種別テンプレート
- LINE公式アカウント連携
- SMS確認
- CRM連携
- 顧客台帳
- 予約変更とキャンセルの完全自動化
- 通話品質分析
- FAQ自動改善
- 人間オペレーターへのエスカレーション管理
- 料金プラン管理
- Stripe決済
