# Dialogflow CX Blueprint

## Agent

```text
Language: ja
Timezone: Asia/Tokyo
Webhook display name: Cloud Run Booking Webhook
Webhook resource:
projects/next-gen-phone-ai-dialogue/locations/us-central1/agents/e08c7ce8-5124-4bb0-99a8-ed1bf432e867/webhooks/10160eef-d38a-40e6-b9bf-552c7a5c4c57
Webhook URL:
https://next-gen-phone-ai-dialogue-fplejurz2q-an.a.run.app/webhook/dialogflow
```

## Intents

```text
intent.make_booking
- 予約したい
- 明日の15時に予約できますか
- 空いてる時間ありますか
- 整体60分を予約したい
- 予約お願いします

intent.ask_business_info
- 営業時間を教えて
- 場所はどこですか
- 料金はいくらですか
- 駐車場ありますか
- メニューを教えて

intent.request_callback
- 折り返してください
- 後で電話がほしい
- 担当者から連絡ください
- 相談したいので電話ください

intent.request_human
- 人につないで
- 担当者に代わって
- スタッフと話したい
- 受付の人いますか

intent.cancel_or_change_booking
- 予約を変更したい
- キャンセルしたい
- 時間を変えたい

intent.goodbye
- ありがとう
- 大丈夫です
- 失礼します
- 終わりです
```

## Parameters

```text
customer_name: @sys.any
customer_phone: @sys.phone-number
date: @sys.date
time: @sys.time
service_type: @sys.any
people_count: @sys.number
memo: @sys.any
callback_reason: @sys.any
preferred_time: @sys.any
business_info_type: @sys.any
```

## Start Flow

Entry fulfillment:

```text
お電話ありがとうございます。AI受付です。ご予約、営業時間や場所の確認、折り返し依頼、担当者へのおつなぎができます。ご用件をお話しください。
```

Routes:

```text
intent.make_booking -> Booking.CollectDate
intent.ask_business_info -> FAQ.GetBusinessInfo
intent.request_callback -> Callback.CollectName
intent.request_human -> HumanTransfer.TryTransfer
intent.cancel_or_change_booking -> Callback.CollectName
intent.goodbye -> End
```

## Booking Flow

```text
Booking.CollectDate
- Required parameter: date
- Prompt: ご予約ですね。ご希望の日にちはいつですか？
- When filled -> Booking.CollectTime

Booking.CollectTime
- Required parameter: time
- Prompt: ご希望の時間は何時ごろですか？
- When filled -> Booking.CollectService

Booking.CollectService
- Required parameter: service_type
- Prompt: ご希望のメニューや内容を教えてください。
- When filled -> Booking.CheckAvailability

Booking.CheckAvailability
- Webhook tag: check_availability
- availability_status = available -> Booking.CollectName
- availability_status = busy -> Booking.SuggestAlternative

Booking.SuggestAlternative
- Prompt: 申し訳ありません。その時間は埋まっています。別の時間をご希望ですか？
- intent.make_booking -> Booking.CollectTime
- intent.request_callback -> Callback.CollectName
- intent.goodbye -> End

Booking.CollectName
- Required parameter: customer_name
- Prompt: お名前をフルネームでお願いします。
- When filled -> Booking.CollectPhone

Booking.CollectPhone
- Required parameter: customer_phone
- Prompt: 確認のため、お電話番号をお願いします。
- When filled -> Booking.Confirm

Booking.Confirm
- Prompt: {date} の {time}、{service_type}、お名前は {customer_name} 様で予約をお取りしてよろしいですか？
- intent.yes -> Booking.CreateBooking
- intent.no -> Booking.CollectDate

Booking.CreateBooking
- Webhook tag: create_booking
- booking_status = confirmed -> Booking.Done
- booking_status = calendar_failed -> Callback.CollectName
- booking_status = failed -> Callback.CollectName

Booking.Done
- Response: 予約が完了しました。{date} の {time} にお待ちしております。
- Webhook tag: save_call_summary
- End
```

## FAQ Flow

```text
FAQ.GetBusinessInfo
- Optional parameter: business_info_type
- Webhook tag: get_business_info
- intent.make_booking -> Booking.CollectDate
- intent.request_human -> HumanTransfer.TryTransfer
- intent.request_callback -> Callback.CollectName
- intent.goodbye -> End
```

## Callback Flow

```text
Callback.CollectName
- Required parameter: customer_name
- Prompt: 折り返しですね。お名前をお願いします。
- When filled -> Callback.CollectPhone

Callback.CollectPhone
- Required parameter: customer_phone
- Prompt: 折り返し先のお電話番号をお願いします。
- When filled -> Callback.CollectReason

Callback.CollectReason
- Required parameter: callback_reason
- Prompt: ご用件を簡単に教えてください。
- When filled -> Callback.Create

Callback.Create
- Webhook tag: create_callback_request
- Response: 承知しました。担当者より折り返しご連絡いたします。
- Webhook tag: save_call_summary
- End
```

## Human Transfer Flow

```text
HumanTransfer.TryTransfer
- Response: 担当者におつなぎします。つながらない場合は折り返し依頼として承ります。
- Current MVP route: Callback.CollectName
- Fallback response: ただいま直接のおつなぎが難しいため、折り返しとして承ります。
```

## No Input / No Match

```text
Global No Input 1:
すみません、聞き取れませんでした。ご予約、営業時間確認、折り返し依頼のどれをご希望ですか？

Global No Input 2:
もう一度だけお伺いします。ご用件を短くお話しください。

Global No Input 3:
お電話が遠いようです。折り返しをご希望の場合は、再度お電話ください。
Webhook tag: save_call_summary
End

Global No Match 1:
すみません、内容を確認できませんでした。予約、営業時間、場所、折り返し、担当者へのおつなぎからお選びください。

Global No Match 2:
担当者からの折り返しとして承ることもできます。折り返しをご希望ですか？

Global No Match 3:
Callback.CollectName
```

## Minimum Simulator Tests

```text
予約:
明日の15時に整体60分を予約したいです
Expected: check_availability -> create_booking -> booking_status=confirmed

FAQ:
営業時間を教えて
Expected: get_business_info

折り返し:
担当者から折り返してください
Expected: create_callback_request

人間転送:
人につないで
Expected: transfer fallback -> create_callback_request

聞き取り失敗:
えーと、なんか、その
Expected: no-match fallback

無言:
Expected: no-input fallback -> end
```

