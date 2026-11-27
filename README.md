# DO — DESI OFFICIALS: site + admin

```
do-site/
├─ worker.js          API: products, photos, orders, UPI payments, admin login
├─ wrangler.toml      Cloudflare config (your UPI ID is set here)
└─ public/
   ├─ index.html      the storefront
   ├─ admin.html      your admin: Products + Orders  (yourdomain/admin.html)
   └─ assets/images/  <-- put your existing images here (1.png … 5.png, do-logo.png)
```

## One-time setup (about 10 minutes)

You need Node.js installed. Run these in the `do-site` folder.

1. **Log in to Cloudflare**
   `npx wrangler login`

2. **Create the storage for products and photos**
   `npx wrangler kv namespace create STORE`
   Copy the `id` it prints and paste it into `wrangler.toml` in place of `PASTE_YOUR_KV_NAMESPACE_ID_HERE`.

3. **Set your admin password** (choose a long one, 12+ characters)
   `npx wrangler secret put ADMIN_PASSWORD`

4. **Copy your images** into `public/assets/images/` (the same files your site uses now).

5. **Deploy**
   `npx wrangler deploy`

If `name` in `wrangler.toml` matches your current Worker (`do-desiofficials`), this replaces the live site.

## Adding a product (daily use)

1. Open `https://<your-site>/admin.html` and sign in.
2. Tap **+ New product**.
3. Choose photos (up to 6). Any size or shape works. Each photo is shrunk to a web-friendly size and compressed automatically before upload, and the first one is the main photo.
4. Fill in name, price, sizes, description. Pick a status:
   - **Live**: can be bought
   - **Sold out**: still shown, can't be bought
   - **Archived**: leaves the Collection and appears in the Archive section
5. **Save**. It appears on the site within about a minute.

Use ▲ ▼ in the list to change the order products appear on the site.

## How photos are made to fit

Photos are never cropped or stretched. The whole picture always shows inside the frame, and a soft blurred copy of the same photo fills any leftover space, so wide, tall and square photos all look clean in the same grid.

## UPI payments & orders

**What customers see:** at checkout they enter their delivery details, then a payment screen shows the exact amount, a QR code and a **Pay in UPI app** button on phones. After paying they enter the 12-digit **UTR / reference number** from their UPI app and confirm.

**What you do:** open `/admin.html` → **Orders**. New payments show a yellow badge.
1. Open the order. It shows the customer's details, items, total and the UTR they entered.
2. Check your UPI app / bank statement for a payment of that amount with that UTR.
3. Tap **Mark as paid**, pack the order, then **Mark as shipped**. Add a courier/tracking note if you like; customers see the status and note under the ◎ icon on the site.

**Where the UPI ID lives:** `wrangler.toml` → `UPI_ID` and `PAYEE_NAME`. The payee name is what UPI apps show as the merchant name, so it is set to the brand ("DO DESI OFFICIALS"). Change it there, then `npx wrangler deploy`. The QR is generated on the page from your UPI ID plus the order amount, so no personal photo or name is embedded. To hide the UPI ID text and show only the QR / pay button, set `SHOW_UPI_ID: false` in `index.html`.

**Safety built in:** prices and totals are always calculated on the server from your product list, so customers can't change the amount. Customer addresses are visible only in the admin. Order spam from one connection is rate-limited.

## Good to know

- **Payments are verified by you, not automatically.** A customer-entered UTR is not proof of payment. Always match it in your own UPI app or bank statement before marking an order paid. Automatic verification needs a payment gateway such as Razorpay (needs a registered business or merchant account).
- **UPI apps show the account holder's registered name** to the payer on the confirmation screen. The site never displays it, but this can't be hidden for a personal UPI ID. A business/merchant UPI ID shows the business name instead.
- **Personal UPI IDs have limits** (for example per-day receiving or transaction caps and bank checks on business-like activity). If you start getting many orders, move to a business account or a gateway.
- **Order alerts:** there is no push alert yet. Check the Orders tab (the badge shows payments to verify). Customers can also tap a WhatsApp button after paying if you set `WHATSAPP` in the `CONFIG` block of `index.html`. Email or WhatsApp alerts can be added later.
- **Bids and contact messages** still arrive by WhatsApp/email.
- **Social links** (Instagram, YouTube, LinkedIn) are in the footer and Contact section.
- **Changes can take up to about a minute** to show for visitors (caching).
- **Free-plan limits:** Cloudflare KV allows about 1,000 writes per day on the free plan. A product save, photo upload or order is a few writes each, which is plenty at the start.
- **Delete is permanent** and also removes that product's photos.
- If the API is unreachable, the storefront shows your three original products, and checkout still shows the UPI QR; the order details are then sent to you by WhatsApp/email instead.
- Sign-in lasts 12 hours. Signing out or closing the tab ends it sooner.
