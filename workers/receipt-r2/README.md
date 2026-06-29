# Cloudflare Worker — chứng từ R2

Xem hướng dẫn đầy đủ: [`docs/R2_RECEIPT_STORAGE.md`](../../docs/R2_RECEIPT_STORAGE.md)

```bash
npm install
wrangler r2 bucket create vietmy-lead-receipts
wrangler secret put UPLOAD_TOKEN
npm run dev      # http://localhost:8787
npm run deploy
```

Từ thư mục gốc app: `npm run deploy:receipt-r2`
