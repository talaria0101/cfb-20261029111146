#!/usr/bin/env bash
# Run as a systemd service on each data-plane box. The token needs both
# com.cloudflare.api.account.queues_read and
# com.cloudflare.api.account.queues_write, because acknowledging mutates
# queue state.
set -euo pipefail

ACCOUNT_ID="${CF_ACCOUNT_ID:?set it}"
QUEUE_ID="${CF_QUEUE_ID:?set it}"
TOKEN="${CF_QUEUE_TOKEN:?set it}"

while true; do
  resp="$(curl -qfsS \
    -H "authorization: Bearer ${TOKEN}" \
    -H 'content-type: application/json' \
    -X POST \
    --data '{"visibility_timeout_ms":60000,"batch_size":50}' \
    "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/messages/pull")" \
    || { sleep 5; continue; }

  # Job descriptors live in the message. Payloads live in R2, because the
  # message cap is 128 KB. [A4 2.2]
  echo "$resp" | jq -c '.result.messages[]?' | while read -r msg; do
    lease_id="$(jq -r '.lease_id' <<<"$msg")"
    body="$(jq -r '.body' <<<"$msg")"
    handle_job "$body" || true
    curl -qfsS -X POST \
      -H "authorization: Bearer ${TOKEN}" \
      "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/queues/${QUEUE_ID}/messages/ack" \
      --data "$(jq -n --arg l "$lease_id" '{acks:[{lease_id:$l}]}')" || true
  done
done
