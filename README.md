# Gmail Order Email Extraction Layer

This Apps Script project searches Gmail for likely order confirmation emails, extracts core order fields from each message body, and writes new order rows to a Google Sheet.

## Sheet tabs (line-item pipeline)

The current pipeline (`runSweep`) maintains five tabs:

- **LineItemTracking** — persistent per-line-item state (one row per `order_number::normalized_name`): status, ordered/shipped/delivered dates, contributing message IDs, `added_to_inventory`, flags, `Price Paid` / `Price Per Unit`, and Amazon-stated **Estimated ETA** fields (see below).
- **Inventory** — gated output: delivered, attributed line items, appended exactly once.
- **Unattributed** — `UNKNOWN`/needs-review items, never guessed onto an order.
- **RunLog** — one row per sweep (counts + errors).
- **ReorderReference** — a DERIVED, reorder-helper view, rebuilt fresh from `LineItemTracking` at the end of every sweep (clear + bulk write, so it never holds stale dedup). One row per **distinct item** (deduplicated by `item_name_normalized`):
  - **Item** — the cleanest raw name seen for that item.
  - **Last Price/Unit** — `price_paid / quantity` from that item's most recent order (by date); blank if price or quantity is missing.
  - **Last Order Date**, **Last Quantity** — from that most-recent order.
  - **Times Ordered** — count of distinct orders containing the item.
  - **Check Current Price** — a clickable `=HYPERLINK("https://www.amazon.com/s?k=<url-encoded item>", "Check current price")`. This is reference only: it lets you read the live price manually. The pipeline does not scrape Amazon or call any price API.

Price extraction reads the per-item amount that follows `Quantity: <n>` in each Amazon item block (e.g. `... Quantity: 1 42.99 USD`), mirroring the existing total-extraction approach. It is additive and does not affect attribution, status, quantity, or dedup logic.

### Package ETA (email-based only)

Shipping and in-transit Amazon emails often include an estimated arrival such as `Arriving today`, `Arriving June 22`, or `Arriving: Wednesday, May 13`. The pipeline extracts these phrases from the email body (no carrier APIs, no tracking-page scraping) and stores them per line item using the same nearest-preceding-block attribution as prices and order numbers.

**LineItemTracking columns:**

- **Estimated ETA** — ISO date parsed from the Amazon-stated phrase. For **Shipped** / **Out for delivery** items this is the active estimate. For **Delivered** items the real arrival remains in **Delivered Date**; the last estimate may still be present for audit.
- **ETA Source** — `amazon_estimate` when the date came from a shipping/in-transit email; `amazon_estimate_low` when inferred from a single standalone `[Weekday], [Month] [day]` in the shipping section (no explicit "Arriving" trigger); `actual` once a delivery email has arrived (meaning **Delivered Date** is the ground truth).
- **Days Until ETA** — computed each sweep as `estimated_eta − today` for in-transit items with `amazon_estimate` or `amazon_estimate_low` (negative = past due).
- **Overdue** — `TRUE` when `estimated_eta` has passed but status is still not **Delivered** (no delivery email yet). Useful for spotting packages that may be delayed.

Supported phrasings include `Arriving: [date]`, `Arriving [weekday]`, `Arriving today` / `tomorrow`, `Estimated delivery: [date]`, `Expected Delivery: [date]`, `your package will arrive: [date]`, `Now Arriving [date]`, subject lines like `Now arriving today` / `Arriving tomorrow` / `Out for delivery today` (resolved relative to the email received date), `delivery date is: [date]`, and `arrive by [date]`. Order confirmations without a shipping marker are left blank — no guessing. Dates without a year default to the email's received year, with year-end rollover when the month would be far in the past relative to the email date.

## Files

- `Config.gs`: Shared configuration, including the base Gmail search query and lookback window.
- `GmailReader.gs`: Gmail search and message extraction functions.
- `Extractor.gs`: Order field extraction helpers and the manual `testExtraction()` smoke test.
- `SheetWriter.gs`: Google Sheets setup, duplicate tracking, row writing, and sheet value formatting.
- `Main.gs`: End-to-end `runOrderScan()` entry point.
- `Triggers.gs`: Installable trigger setup and weekly maintenance reporting.
- `appsscript.json`: Apps Script manifest with Gmail read-only, Google Sheets, MailApp, trigger management, and active-user email scopes.

## Create The Apps Script Project

1. Go to [script.google.com](https://script.google.com/).
2. Click **New project**.
3. Rename the project, for example `Gmail Order Email Search`.
4. Delete the default `Code.gs` file or leave it empty.
5. Create a new script file named `Config` and paste the contents of `Config.gs`.
6. Create a new script file named `GmailReader` and paste the contents of `GmailReader.gs`.
7. Create a new script file named `Extractor` and paste the contents of `Extractor.gs`.
8. Create a new script file named `SheetWriter` and paste the contents of `SheetWriter.gs`.
9. Create a new script file named `Main` and paste the contents of `Main.gs`.
10. Create a new script file named `Triggers` and paste the contents of `Triggers.gs`.

## Configure The Sheet

1. Create or open the Google Sheet that should receive order rows.
2. Copy the spreadsheet ID from the sheet URL. In `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`, the ID is the value between `/d/` and `/edit`.
3. In `Config.gs`, replace `PUT_SHEET_ID_HERE` with that spreadsheet ID.
4. Keep `SHEET_NAME` as `Orders` or change it to the tab name you want the script to use.

`getOrCreateSheet()` opens the configured spreadsheet, creates the configured tab if it does not exist, writes the header row when the sheet is empty, validates the header row when the sheet already exists, and freezes the header row. Existing sheets must keep the expected column order so the Message ID column can be used for dedupe.

## Enable The Scopes

This project uses `GmailApp`, `SpreadsheetApp`, `MailApp`, installable triggers, and the active user email address, so Apps Script will request those permissions the first time you run a function that touches those services.

To make the scope explicit:

1. In the Apps Script editor, open **Project Settings**.
2. Enable **Show "appsscript.json" manifest file in editor**.
3. Open `appsscript.json`.
4. Replace its contents with this project's `appsscript.json`.
5. Save the project.

The manifest requests only:

```json
"https://www.googleapis.com/auth/gmail.readonly",
"https://www.googleapis.com/auth/spreadsheets",
"https://www.googleapis.com/auth/script.send_mail",
"https://www.googleapis.com/auth/script.scriptapp",
"https://www.googleapis.com/auth/userinfo.email"
```

## Run The First Test

1. In the Apps Script editor, select `testSearch` from the function dropdown.
2. Click **Run**.
3. Google will prompt you to authorize the script.
4. Choose your Google account.
5. Review the permissions and allow read-only Gmail access.
6. After authorization completes, run `testSearch` again if it did not continue automatically.
7. Open **Executions** or the execution log to inspect output.

## Expected Output

If matching emails are found, the log should include:

- `Body preview: ...` for each message, showing the first 200 characters of its plain-text body.
- `Messages found: N`
- `Result count: N`
- `First result: { ... }`

The first result object should include fields like:

```json
{
  "messageId": "example-message-id",
  "threadId": "example-thread-id",
  "senderEmail": "orders@example.com",
  "senderName": "Example Store",
  "subject": "Your order confirmation",
  "date": "2026-06-23T17:55:00.000Z",
  "bodyText": "..."
}
```

If nothing is found, the log will show `Result count: 0`. In that case, try increasing `LOOKBACK_DAYS` in `Config.gs` or broadening `GMAIL_SEARCH_QUERY`.

## Run The Extraction Test

After `testSearch()` returns matching messages, select `testExtraction` from the function dropdown and click **Run**. This calls `searchOrderEmails()`, applies `extractOrderData(emailObj)` to each result, and logs compact rows for eyeballing extraction accuracy:

```text
store | orderNumber | total | confidence
Amazon | 123-1234567-1234567 | 42.99 | high
```

`extractOrderData(emailObj)` returns:

```json
{
  "orderNumber": "123-1234567-1234567",
  "total": "42.99",
  "currency": "USD",
  "store": "Amazon",
  "confidence": "high",
  "needsReview": false
}
```

The extractor normalizes body whitespace once, resolves the store from sender domain or sender name, applies sender-specific rules for supported stores before generic fallback patterns, and marks rows for review when either the order number or total is not found.

## Run The Sheet Writer

After `Config.gs` has a real `SHEET_ID`, select `runOrderScan` from the Apps Script function dropdown and click **Run**.

`runOrderScan()` takes a script lock before it searches Gmail or writes rows, which prevents overlapping executions from appending the same messages at the same time. It then calls `searchOrderEmails()`, opens the configured sheet with `getOrCreateSheet()`, reads already-written Gmail message IDs with `getProcessedMessageIds(sheet)`, and skips any message ID that is already present in the sheet. Each new message is passed through `extractOrderData(emailObj)` and appended by `writeOrderRow(sheet, emailObj, extracted)`.

The sheet columns are:

```text
Date | Store | Order Number | Total | Currency | Confidence | Needs Review | Status | Message ID
```

Dates are written as Date objects so Google Sheets can sort and format them. Totals are written as numbers when possible, including totals with comma separators, while `NOT FOUND` remains text. Rows that need manual review have `NEEDS REVIEW` in the Needs Review column, and the Status column is left blank for manual tracking.

When the run completes, the log includes:

```text
Order scan complete.
Total found: N
New rows written: N
Skipped as duplicates: N
Flagged needsReview: N
```

For optional highlighting in Google Sheets, add conditional formatting to the data range with a custom formula like `=$G2="NEEDS REVIEW"`.

Each run also appends a row to the `Run Log` tab with:

```text
timestamp | status | emails found | new rows written | skipped duplicates | needsReview count | error message
```

If `runOrderScan()` catches an uncaught error, it logs the stack trace, emails the active Apps Script user with the subject `Order scanner failed`, writes an `error` row to `Run Log` when possible, and exits without rethrowing so the next scheduled run can still fire.

## Automation

Run `createTimeTrigger()` once from the Apps Script editor after a manual `runOrderScan()` succeeds. It removes existing `runOrderScan()` triggers and creates one hourly trigger.

Run `createWeeklyTrigger()` once to install the Monday morning `weeklyMaintenanceReport()` trigger. The report reads the `Orders` sheet, counts `NEEDS REVIEW` rows grouped by Store, and emails a summary such as `Etsy: 4 unmatched, Amazon: 1 unmatched`.

If `weeklyMaintenanceReport()` catches an uncaught error, it logs the formatted error in Apps Script and exits without rethrowing so the scheduled trigger remains usable.

Use `removeAllTriggers()` if you want to remove all existing `runOrderScan()` triggers.

## Setup Checklist

1. Create a blank Google Sheet for order rows.
2. Copy the spreadsheet ID from the URL and set `SHEET_ID` in `Config.gs`.
3. Run `runOrderScan()` manually once from the Apps Script editor and authorize the requested scopes.
4. Confirm the `Orders` tab has rows and the `Run Log` tab has a `success` row.
5. Run `createTimeTrigger()` manually once to install the hourly order scan.
6. Run `createWeeklyTrigger()` manually once to install the Monday maintenance report.
7. In Apps Script, open **Triggers** and confirm one hourly `runOrderScan` trigger and one Monday `weeklyMaintenanceReport` trigger exist.
8. Open **Executions** to confirm manual and scheduled runs complete successfully.
