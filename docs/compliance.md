# Quotation evidence checks

Sources checked 15 November 2026. The base supports a freight pricing manager's review. It does not perform customs declarations, dangerous-goods assessments, sanctions checks, tax classification, carrier licensing or legal certification.

| Check | What the database does | Basis |
|---|---|---|
| PRICE_SCOPE | Flags open quotes without terms or an explicit charge-coverage review. Refuses approval until these are present. | [NZ Commerce Commission: quotes and estimates](https://www.comcom.govt.nz/business/dealing-with-typical-situations/quotes-estimates-and-invoicing/) says quotes and estimates must not mislead and conditions must be clear. The fields are our evidence control, not a prescribed statutory form. |
| SOURCE_VALIDITY | Compares source expiry with sailing and quote validity and checks the source start date against sailing. Refuses approval when uncovered. | The same NZ pricing guidance supports honest, supportable offers. This date check is an internal commercial safeguard, not a law requiring a particular validity interval. |
| RATE_SUPERSEDED | Flags open quotes based on a deactivated rate. Refuses draft approval using a deactivated tariff. Keeps the original agreed price. | [NZ quote guidance](https://www.comcom.govt.nz/business/dealing-with-typical-situations/quotes-estimates-and-invoicing/) distinguishes agreed quotes from later variations. The software does not decide whether a contract exists or change an accepted contract. |
| RETENTION_REVIEW | Flags a missing purpose or missing/overdue retention review date for client records. No automatic deletion. | [NZ Privacy Principle 9](https://www.privacy.org.nz/privacy-principles/9/) limits retention to the lawful need. An operator sets the period and records the decision, considering other applicable duties. |

The quotation shows net price, tax and total. The operator supplies the tax rate and states inclusions and exclusions. [ACCC price-display guidance](https://www.accc.gov.au/consumers/pricing/price-displays) describes total-price rules and the exception for GST in displays solely to businesses. The base does not decide whether a particular Australian or New Zealand transaction is taxable or whether an exception applies. Check that before confirming coverage.

A named actor and evidence reference record a review. They do not authenticate a person or prove that the underlying document is accurate. The database owner can administer the audit record. Configure identity, permissions, retention, backup and independent review before using this for a shared business process.
