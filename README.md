# Sarah Craft Studio — Azure Static Web Apps rebuild

Clean replacement storefront with no Astro/Vue/Hostinger runtime dependencies.

## Important
This package intentionally does **not** contain `.github/workflows/azure-static-web-apps-gray-plant-097bd000f.yml`. Keep your existing working workflow unchanged.

## Azure Static Web Apps workflow change required for the API
Your current workflow has `api_location: ""`. When you are ready to enable MongoDB/PayPal/admin APIs, change only that value to:

```yaml
api_location: "api"
```

Everything else in the workflow can remain exactly as it is. Until that one change is made, the static storefront deploys but `/api/*` features will not run.

## Azure application settings
Set these in Static Web App > Configuration:
- `MONGODB_URI`
- `MONGODB_DB=sarahcraftstudio`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com` (Sandbox first)
- `PUBLIC_SITE_URL=https://gray-plant-097bd000f.6.azurestaticapps.net`
- `ACS_EMAIL_CONNECTION_STRING`
- `EMAIL_SENDER`
- `ADMIN_EMAIL=info@sarahcraftstudio.com`

Never put the MongoDB password, PayPal secret, or email connection string in browser JavaScript or GitHub source.

## Admin access
The admin pages and `/api/admin/*` require the custom `admin` role. Invite/assign the administrator in Azure Static Web Apps role management. The provided admin page uses the built-in GitHub sign-in endpoint.

## MongoDB collections
Create these collections (they are also auto-created by MongoDB on first insert):
- `products`
- `discounts`
- `orders`

Use `data/products.json` as starter product data. Product image URLs point to your Azure Blob Storage container; adjust them to match the exact blob filenames you upload.

## Local development
Install Azure Static Web Apps CLI and API dependencies:
```bash
cd api && npm install && cd ..
npx @azure/static-web-apps-cli start . --api-location api
```
Copy `api/local.settings.example.json` to `api/local.settings.json` and fill in local secrets.

## Deployment sequence
1. Back up your repo / create a migration branch.
2. Remove old broken HTML, `_astro*`, and `assets.zyrosite.com`.
3. Copy everything from this package into the repo **except your existing `.github` directory**.
4. Commit and push.
5. Verify the static pages and Blob images.
6. Change only `api_location` in the existing workflow from `""` to `"api"` when ready to activate API features.
7. Add Azure application settings.
8. Seed MongoDB products/discounts.
9. Test PayPal Sandbox and email.
10. Cut over DNS only after end-to-end testing.
