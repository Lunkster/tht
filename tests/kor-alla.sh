#!/usr/bin/env bash
# Kör alla webbläsartester och räknar fel per test. Kräver att appen körs på http://localhost:8765.
cd "$(dirname "$0")"
for f in *.mjs; do
  case "$f" in backup.test.mjs) continue ;; esac
  ut=$(timeout 150 node "$f" 2>&1)
  printf '%-18s %s\n' "$f" "$(echo "$ut" | grep -ciE 'pageerror|ERR |TypeError|timeout')"
done
