# Freight Rates for Claude Code

Carrier tariffs, local charges, quotation margins and follow-ups in a database you own. A free freight pricing desk for the record-based part of Quotiss.

## Three ways to use it

**Do it yourself.** Free under the MIT licence. Run the demo, review your rate export and use Claude Code, Codex, OpenCode or Cursor to work with the records.

**We customise it.** Enterprise DNA brings your Quotiss records across and builds your fields, price rules and documents. A web front end, different stack and carrier connections can be part of your version. One setup fee, then a retainer.

**We run it for you.** Omni by Enterprise DNA installs, connects and operates your version. One setup fee, then a monthly retainer. [Book a call](https://enterprisedna.co/omni/book?offer=replace-software&utm_campaign=quotiss&utm_medium=github).

Quotiss lists Plus at US$99 per user per month with a minimum of 20 active accounts. Its [pricing page](https://quotiss.com/pricing/) also lists an annual prepayment discount. Checked 15 November 2026. The selection estimate is a list-price scenario, not a verified customer invoice.

## Quick start

Node 22.15 or newer on Windows, Linux or macOS. No database server is needed for the local demo.

```bash
npm install
npm test
npm run demo
```

The demo always creates an isolated local database and reports under .data. It ignores DATABASE_URL. For a persistent fictional working copy:

```bash
npm run migrate
npm run seed
npm run freight -- weekly-review
npm run view
npm run docs
```

Start a real database with migrate only. Never seed it. DATA_DIR selects the local embedded database. DATABASE_URL selects PostgreSQL 15 or newer; remote certificates are verified. OUTPUT_DIR selects where private reports, drafts and exports go.

## What ships

29 slash commands, three read-only HTML dashboards and two document types. Edit brand.json to put your business name, logo and colours on the paperwork. The customer quotation shows scope and selling totals. The internal pricing worksheet shows cost evidence and profit; do not send it to customers.

FCL tariffs are inclusive of freight surcharges in the documented Quotiss export. Local charges are separate, selected explicitly for each quote. Quantities are whole containers. Rates and local charges must share one currency; the CLI refuses mixed currencies. It does not silently convert money. Supported currencies are USD, NZD, AUD, EUR, GBP, SGD and CAD.

Markup applies to the combined cost. Gross margin is profit divided by net selling price. Money is stored in integer minor units. Net price is rounded once after markup; tax is rounded once on that net price. A quote records an explicit tax rate and scope review. The software does not decide the tax treatment of international freight.

Approving a quotation requires complete scope, charge coverage, valid source dates and an evidence reference. Approved terms and price lines are frozen. Changed imported tariffs create a new rate version and flag affected open quotes. Recording an acceptance or loss changes a local record; no command sends a quote, books freight or moves money.

## Bring your Quotiss tariffs

```bash
npm run freight -- import quotiss ./imports/rates.xlsx --workspace=our-forwarder --direction=import --currency=USD --dry-run --json
npm run freight -- import quotiss ./imports/rates.xlsx --workspace=our-forwarder --direction=import --currency=USD --actor=Operator
npm run freight -- history
npm run freight -- export
```

This directly reads the FCL matrix structure shown in the vendor help page. Set direction to match Create Import Excel or Create Export Excel. Confirm the currency for every contract in the workbook first; split mixed-currency files. [The switch guide](docs/replace-quotiss.md) covers the layout, normalised CSV option, retained comments, unsupported formats and reconciliation. A saved supported export imports in one command. No customer workbook was available for this build, so test your actual export before committing to a switch.

## Ten questions to ask today

`npm run freight -- insights` answers these from the demo. They join tariff, quotation and follow-up records; they are not verified claims about what Quotiss custom reporting cannot do.

1. Which overdue quotes rely on a tariff expiring within two weeks?
2. Which drafts have less than a ten percent margin?
3. Which quotations outlive their source tariffs?
4. Which active lanes have only one current tariff?
5. Which customers need a retention review and have open quotes?
6. Which owners have overdue follow-ups, split by currency?
7. Which draft quotes lack an explicit charge-coverage review?
8. Which open quotations use a superseded rate?
9. Which lanes have local charges in another currency?
10. Which clients have more than one open quote currency?

## Your first hour: ten things to ask for

1. Show tariffs expiring before the end of the month.
2. Find quotes whose source price expires before sailing.
3. Show the overdue follow-ups by owner.
4. Explain the difference between markup and margin on Q-101.
5. Find local charges in a different currency from the freight.
6. Draft the Monday pricing meeting without sending it.
7. Preview our exported tariffs and compare the rates with the workbook.
8. Put our business name and logo on the quotation.
9. Use /customise to add our customer purchase-order reference.
10. Use /new-view to show expiring tariffs by carrier.

## Operating limits

This is a trusted operator workspace, not a hosted multi-user service. Actor labels record who an operator says acted. They are not authentication. Database owners can administer the records and audit history. Tables have row security enabled and no grants to public roles. Configure identity, access roles, backups and retention before shared use.

There is no live carrier feed, booking connection, customer portal, CRM sync, email delivery, air-weight rating, LCL minimum calculation, customs filing or tariff marketplace in the free base. Keep those services while testing the record desk. A custom version can connect the systems you keep.

Read [CLI syntax](docs/cli.md), [compliance checks](docs/compliance.md), [research](docs/research.md) and [the screen boundaries](docs/why-no-front-end.md). Tests exercise both good and refused writes, price arithmetic, CSV and XLSX import, retained source history and report generation. The GitHub workflow runs Windows, Linux and PostgreSQL checks. A configured workflow is not itself a passing run.
