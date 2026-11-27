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
