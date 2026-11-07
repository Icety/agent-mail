#!/bin/bash
# Agent mail drafts for any agent/conversation. This tool cannot send email: only the owner's Send does.
# mail.sh draft < draft.json       create {conversationId?,from?,to,cc?,subject,body,contextLabel?,contextHref?}
# mail.sh revise <id> < edit.json   revise {baseRevision,from?,to?,cc?,subject?,body?}
# mail.sh drafts                   current drafts with revisions for this conversation
# mail.sh replies                  replies in this conversation
# mail.sh inbox [--noise|--done] [--from TEXT]  inbound mail waiting for the owner, newest first (200 max), as JSON lines;
#                                  --noise: the low-priority mail the reader filtered out; --done: everything, closed mail included
# mail.sh done <id> [<id>...]      mark inbound mail done (audited as this agent)
# Env: MAIL_API_URL (the app, default http://127.0.0.1:3000), MAIL_TOKEN_FILE (the internal token),
# MAIL_CONVERSATION (the conversation the agent works in).
set -euo pipefail
URL=${MAIL_API_URL:-http://127.0.0.1:3000}
TOKEN=$(cat "${MAIL_TOKEN_FILE:?MAIL_TOKEN_FILE is required}")
api() { curl -fsS -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' "$@"; echo; }
case "${1:-}" in
  draft) jq --arg c "${MAIL_CONVERSATION:-}" 'if (.conversationId // "") == "" then . + {conversationId: $c} else . end' \
    | api -X POST --data @- "$URL/api/internal/mail/drafts" ;;
  revise)
    [[ "${2:-}" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'A valid draft id is required' >&2; exit 2; }
    api -X POST --data @- "$URL/api/internal/mail/drafts/$2/revision" ;;
  drafts|replies)
    : "${MAIL_CONVERSATION:?conversation is required}"
    api --get --data-urlencode "conversation=$MAIL_CONVERSATION" "$URL/api/internal/mail/$1" ;;
  inbox)
    : "${MAIL_CONVERSATION:?conversation is required}"
    shift; args=(--get --data-urlencode "conversation=$MAIL_CONVERSATION")
    while [[ $# -gt 0 ]]; do case "$1" in
      --done) args+=(--data-urlencode 'view=all'); shift ;;
      --noise) args+=(--data-urlencode 'view=noise'); shift ;;
      --from) [[ -n "${2:-}" ]] || { echo '--from needs a value' >&2; exit 2; }; args+=(--data-urlencode "from=$2"); shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac; done
    api "${args[@]}" "$URL/api/internal/mail/inbound" | jq -c '.[] | {id, received: .receivedAt, from: .fromAddress, subject, status, category}' ;;
  done)
    : "${MAIL_CONVERSATION:?conversation is required}"
    [[ $# -ge 2 ]] || { echo 'At least one mail id is required' >&2; exit 2; }
    for id in "${@:2}"; do
      [[ "$id" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Invalid mail id: $id" >&2; exit 2; }
      jq -n --arg c "$MAIL_CONVERSATION" '{conversation: $c}' | api -X POST --data @- "$URL/api/internal/mail/inbound/$id/done"
    done ;;
  *) sed -n '2,11p' "$0"; exit 2 ;;
esac
