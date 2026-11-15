# Freight CLI

Every command is `npm run freight -- <command>` or `node scripts/freight.mjs <command>`. Add --json for structured output. Use --actor="Operator Name" on each write. Store input JSON under ignored imports/ or private-*.json. Unknown fields and options fail.

## Reads

clients, rates, rate-expiry, charges, quotes, margin-review, followups-due, lane-review, sales-review, attention, compliance, history and audit take no positional arguments. weekly-review combines expiry, follow-ups, margins and compliance. insights runs ten cross-record questions.

`quote <code-or-id-or-name>` reads one quotation with its lines and notes. `source <batch-id>` reads the preserved import data. Name matching is case-insensitive. Partial ids are accepted. An ambiguous match lists candidates and exits with code 1; select the exact code or a longer id.

## Add records

```bash
npm run freight -- add client ./imports/client.json --actor=Operator
npm run freight -- add rate ./imports/rate.json --actor=Operator
npm run freight -- add charge ./imports/charge.json --actor=Operator
```

- Client: code, name, optional purpose and retention_review (YYYY-MM-DD). Missing purpose or retention review is flagged.
- Rate: code, contract, carrier, origin, destination, equipment (20GP, 40GP, 40HC), currency, buy_cents (nonnegative integer), valid_from, valid_to, source_ref, optional internal_note. The tariff is per container and includes the freight surcharges in the source. Local charges are separate.
- Charge: code, name, location, basis (container or shipment), currency, buy_cents, valid_to, source_ref. Locations must exactly match the selected rate's origin or destination when quoting.

Supported currencies use two decimal minor units: USD, NZD, AUD, EUR, GBP, SGD and CAD. Monetary input is always explicit. The base does not look up exchange rates or choose a tax rule. A rate is capped at one billion minor units, a quote at one thousand containers and one hundred local charges; these limits keep calculated money within exact integer range.

## Prepare and decide a quotation

```bash
npm run freight -- prepare-quote ./imports/quote.json --actor=Operator
npm run freight -- quote Q-NEW
npm run freight -- compliance
npm run freight -- decide Q-NEW approved "Tariff and scope reviewed under reference REVIEW-1" --actor=Operator
npm run freight -- decide Q-NEW won "Customer acceptance recorded under reference ACCEPT-1" --actor=Operator
```

The quotation JSON has code, client, rate, owner, containers (positive whole number), markup_bps, tax_bps, sail_date, valid_until, terms, coverage_confirmed (true or false), followup_on, and charges (array of charge codes). Basis points: 1500 means 15 percent. Use examples/new-quote.json as a shape, replacing its dates and fictional values. The example intentionally leaves coverage_confirmed false.

Drafts may have missing scope or source dates that need repair; the compliance report calls them out. To correct a draft's commercial terms, withdraw it and prepare a new quotation. Price lines are immutable even in draft. Approval requires source dates to cover both the sailing date and quote validity, a current active tariff, nonblank terms, charge coverage confirmed, and approval evidence. Coverage is a human attestation that the applicable charges, included freight surcharges, exclusions and tax treatment have been checked. It is not proof supplied by the software.

Transitions: draft to approved or withdrawn; approved to won, lost or withdrawn. Expired quotations cannot be marked won. Won, lost and withdrawn are terminal. This is local record-keeping; approval never sends anything and won never books freight.

## Follow-up and retention

```bash
npm run freight -- log Q-101 "Customer asked for the next sailing option" --actor=Operator
npm run freight -- retention-review C-2 2027-11-15 "Freight quotations and contract administration" --actor=Operator
npm run freight -- deactivate-rate R-3 "Carrier withdrew this tariff" --actor=Operator
```

Notes and audit records are append-only through ordinary operations. Actor labels are not authenticated identities. Database owners can administer these records. Retention dates are review reminders, not automatic deletion deadlines.

## Import, export and drafts

Read [the switch guide](replace-quotiss.md) for imports. `export` writes every business record, source batch and audit entry as JSON under exports/. The export is a portable archive, not a restore command; retain database backups too.

`draft-weekly-review` and `draft-quote <code>` write internal Markdown to drafts/. These contain private cost details. `npm run docs` writes a separate customer quotation and internal pricing worksheet under docs-out/. `npm run view` writes read-only dashboards under views/. OUTPUT_DIR moves those folders to another private location.
