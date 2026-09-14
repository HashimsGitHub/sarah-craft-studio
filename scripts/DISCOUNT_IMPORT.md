# Discount Code Import

Sarah Craft Studio discount codes can be managed normally from `/admin/discounts.html`.

For the initial migration from Sarah's existing Excel sheet, use `scripts/import_discounts.py`. The importer is idempotent: running the same file again updates matching codes rather than creating duplicates.

## Supported columns

The importer accepts common header variations and maps them to:

| Field | Example | Notes |
| --- | --- | --- |
| code | WELCOME10 | Required; stored uppercase |
| type | percentage | `percentage`, `fixed`, or `free_shipping` |
| value | 10 | Percentage or CAD amount; ignored for free shipping |
| minimum order | 50 | Optional CAD minimum |
| usage limit | 100 | Optional; blank means unlimited |
| start date | 2026-09-01 | Optional |
| expiry date | 2026-12-31 | Optional |
| active | true | Optional; defaults to true |

Date formats accepted: `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, and `DD-MM-YYYY`.

`PICKUPYYC` is reserved for local pickup and is intentionally skipped by this importer.

## Install dependencies

```bash
python3 -m pip install -r scripts/requirements-discounts.txt
```

## Set MongoDB connection

```bash
export MONGODB_URI='mongodb+srv://...'
export MONGODB_DB='sarahcraftstudio'
```

Do not store the MongoDB URI in Git.

## Validate the spreadsheet first

```bash
python3 scripts/import_discounts.py /path/to/discounts.xlsx --dry-run
```

Review the counts and any rejected rows.

## Import

```bash
python3 scripts/import_discounts.py /path/to/discounts.xlsx
```

The importer upserts by `code`. Existing usage counts and original creation dates are preserved.

A sample file is available at `data/discounts-template.csv`.
