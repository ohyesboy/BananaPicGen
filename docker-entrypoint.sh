#!/bin/sh
echo "window.env = { API_KEY: \"$GEMINI_API_KEY\" };" > /usr/share/nginx/html/env-config.js
exec "$@"
