#!/usr/bin/env bash

readonly PAYLOAD=./mock_payload.json
readonly UPSTREAM=http://localhost:8080/webhook

function main {
    curl -v -H 'Content-Type: application/json' --data "@${PAYLOAD}" "${UPSTREAM}"
}


main "$@"
