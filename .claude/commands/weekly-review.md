---
description: Run rate-expiry, followups-due and margin-review, then compliance
---

Run rate-expiry, followups-due and margin-review, then compliance. Summarise rate renewals, follow-ups and margin exceptions by owner and currency.

node scripts/freight.mjs weekly-review --json

Read CLAUDE.md first. Start with current records. Report missing information without filling it in. No sends, payments or freight bookings.
