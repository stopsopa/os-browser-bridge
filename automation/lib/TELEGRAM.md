# Telegram Setup

## How to get TELEGRAM_CHAT_ID

1. Send any message to your bot (e.g. `t.me/PlaywrightMotBot`)
2. Visit this URL in your browser:
   ```
   https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates
   ```
3. Find `result[0].message.chat.id` in the JSON response — that is your `TELEGRAM_CHAT_ID`

## .env variables required

```
TELEGRAM_BOT_TOKEN="..."
TELEGRAM_CHAT_ID="..."
```
