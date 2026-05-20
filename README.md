# 🏎️ Liberty-Runs Aftermarket Parts
**A full-stack car accessories shopping platform**

---

## 📁 Project Structure

```
liberty-runs/
├── index.html              ← Storefront (auth + shop + cart)
├── css/
│   ├── main.css            ← Storefront styles
│   └── admin.css           ← Admin panel styles
├── js/
│   ├── firebase-config.js  ← ⚠️ YOUR CONFIG GOES HERE
│   ├── main.js             ← Storefront logic
│   └── admin.js            ← Admin panel logic
└── pages/
    ├── admin.html          ← Admin panel
    └── seed.html           ← One-time product seeder
```

---

## ⚙️ Setup Steps

### 1. Paste Your Firebase Config
Open `js/firebase-config.js` and replace every `YOUR_*` value with your real Firebase project config from the Firebase console.

### 2. Serve the Project
You MUST use a local server (not file://) because of ES modules and Firebase.

**Option A — VS Code Live Server:**
Install the "Live Server" extension → right-click `index.html` → Open with Live Server

**Option B — Python:**
```bash
cd liberty-runs
python -m http.server 5500
```
Then open: http://localhost:5500

**Option C — Node.js:**
```bash
npx serve .
```

### 3. Seed Sample Products
1. Sign in as Admin on the store
2. Navigate to: http://localhost:5500/pages/seed.html
3. Click **"Seed Products into Firestore"**
4. 25 sample products across all 5 categories will be added

---

## 👤 Accounts

| Role | How to Create |
|------|--------------|
| Admin | Firebase Console → Authentication → Add User manually (e.g. admin@libertyruns.com) |
| Customer | Self-register on the site |

Admin email must match the `email` field in Firestore → `admins` → `admin1` document.

---

## 🔑 Features

### Customer
- Sign Up / Sign In / Reset Password (Firebase Auth)
- Hero slideshow of products
- Category browsing: Body Kits, Rims, Hood, Roof Scoops, Paint & Wraps
- Search by keyword and/or category
- Product detail modal (name, desc, price, stock, delivery date)
- Cart sidebar with quantity controls
- Pagination (8 per page)
- Cash or Credit payment
- Credit limit enforcement (default ₹1,000, admin-adjustable)
- Order confirmation with receipt
- My Orders history

### Admin Panel (`/pages/admin.html`)
- Dashboard with stats + recent orders
- **Inventory CRUD**: Add/Edit inline/Deactivate/Delete products with confirm
- **Customer Management**: View, deactivate, delete customers
- **Credit Management**: Set per-customer credit limits, reset usage
- **Orders**: View all orders, filter by payment type
- **Reports**:
  - Customer: All | Top 10 | Cash purchases | Credit purchases (date range)
  - Inventory: All stock | Category wise | High stock >100 | Low stock <15
  - Sales: All | Category | Cash | Credit | Top 10 items | Bottom 10 items (date range)

---

## 🔥 Firestore Collections

| Collection | Purpose |
|-----------|---------|
| `admins` | Single doc `admin1` with `email` field |
| `products` | Items with cat_id, title, des, qty, price, active |
| `customers` | User profiles with creditLimit, creditUsed |
| `orders` | Orders with items[], total, payType, uid |

---

## ⚠️ Notes
- Cart is stored in localStorage per user
- Stock is decremented on order completion
- Credit used is incremented on credit orders
- Admin is identified by matching email to `admins/admin1` doc
