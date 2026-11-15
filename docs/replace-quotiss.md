# Move a Quotiss tariff book

Checked 15 November 2026 against [Quotiss contract download help](https://help.quotiss.com/help/new-how-to-download-the-rates-in-excel), [rate upload help](https://help.quotiss.com/help/how-to-upload-rates-automatically) and [dashboard export help](https://help.quotiss.com/help/how-to-export-data-from-the-dashboard).

## Export the records you own

A Pricing Manager can select contracts under Rates and download them as Excel. Create Import Excel groups origins under a destination; Create Export Excel groups destinations under an origin. Quotiss says these rates include freight surcharges, with their breakdown and internal comments in the workbook. Keep that original workbook private.

The direct importer supports the FCL matrix pictured in that help article: columns A and B contain location and country; rate columns start at C; the first five rows give the common port, contract, carrier, ISO validity range and equipment; rate rows follow. Merged contract headers are supported. It stops rate reading at a blank location or Comment boundary and retains all original worksheet cells for inspection. It does not treat a surcharge breakdown at the bottom as an additional cost.

The vendor example does not show a currency. Confirm currency in the actual contract, and supply --currency explicitly. Every imported contract in one workbook must use that currency. Split mixed-currency exports. --direction must match which download you chose. No customer export was available; the tests use a synthetic workbook shaped like the public example, not a captured customer file.

## One command after the preview

```bash
npm run freight -- import quotiss ./imports/rates.xlsx --workspace=our-forwarder --direction=import --currency=USD --dry-run --json
npm run freight -- import quotiss ./imports/rates.xlsx --workspace=our-forwarder --direction=import --currency=USD --actor=Operator
```

The preview parses and validates without writing records. Compare the count of nonblank equipment-rate cells, both port names, currency, validity dates and several prices with the original. Blank rate cells are skipped, not converted to zero. A real zero is preserved. Formula cells in rate data are rejected; export fixed values after checking them in the source system. Unrecognised worksheets fail the whole import. Nothing writes until all rates parse successfully.

## CSV and changed layouts

For a flat rate list, save UTF-8 CSV with contract, carrier, origin, destination, equipment, currency, amount, valid_from and valid_to columns. Optional internal_note is retained. Amount is a plain decimal with at most two decimal places; dates are YYYY-MM-DD. examples/quotiss-normalised.csv is a synthetic normalised fixture, not a claim about the vendor's CSV headers.

```bash
npm run freight -- import quotiss ./imports/rates.csv --workspace=our-forwarder --map=./imports/headers.json --dry-run
```

A mapping file is an object from these field names to the actual export headings, for example `{"origin":"Origin Port","amount":"Total Freight"}`. Missing or duplicate columns, invalid dates, ambiguous duplicate rates and malformed money fail the batch. Every CSV field is retained in the source archive, including unknown columns.

Legacy .xls, a different matrix layout, air weight breaks and LCL rates need mapping before import. Do not rename a file extension or pretend those calculations match container pricing. Enterprise DNA scopes the mapping and reconciliation as part of the switch.

## Keep history without changing old quotations

Use the same workspace label for the same source business. Identical file content and import settings are skipped on reimport. Changed rates create a new version and deactivate an earlier imported version with the same workspace, contract, carrier, ports, equipment, currency and validity start date. A changed validity start date is a new tariff period. Missing rows do not deactivate a tariff; explicitly review and deactivate withdrawals. Quote lines keep their original price and source expiry. Open quotes using superseded tariffs appear in compliance checks.

`history` lists batches. `source <batch-id> --json` shows source cells and comments. The archive is a data snapshot; keep the original XLSX too because workbook formatting and embedded objects are not reproduced. `export` includes the rate versions, quotations, notes, source snapshots and audit trail.

## Reconcile before switching

Add local charges from their own current tariff with the correct basis and currency. Do not add freight surcharges twice. Prepare a representative quote, compare its scope, net price, tax and gross total with the source, and record the review. Check both import and export directions on actual routes. Ask the pricing manager to verify exclusions and currency treatment.

The dashboard export is a separate statistics file. The base does not import it as quotation history. Existing client records, historic quotations, local-charge tariffs, attachments, permissions, email history, live carrier connections and booking integrations require their own mapping or retained systems. Keep Quotiss and the services you rely on until those records and workflows have been reconciled. A single supported tariff import does not prove the whole business can switch in a day.
