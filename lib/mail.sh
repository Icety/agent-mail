#!/bin/bash
# Agent mail drafts for any agent/conversation. This tool cannot send email: only the owner's Send does.
# mail.sh draft < draft.json       create {conversationId?,from?,to,cc?,subject,body,contextLabel?,contextHref?}
# mail.sh revise <id> < edit.json   revise {baseRevision,from?,to?,cc?,subject?,body?}
# mail.sh drafts                   current drafts with revisions for this conversation
# mail.sh replies                  replies in this conversation
# Env: MAIL_API_URL (the app, default http://127.0.0.1:3000), MAIL_TOKEN_FILE (the internal token),
# MAIL_CONVERSATION (filled in when a draft names none).
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
  *) sed -n '2,8p' "$0"; exit 2 ;;
esac
