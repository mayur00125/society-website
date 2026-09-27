# Society Management Website

A complete society management website in **one folder** — frontend + backend, ready to host directly.

## Features

**Member panel** (`/member.html`)
- Login with username + password (admin creates accounts)
- Dashboard: profile photo, "Welcome {name}", Previous Balance, Current Month Due, Total Due
- 11 complaint categories (Lift, Electricity, Plumber, Cleaning, Security, Parking, Sewerage, Water, Repair & Maintenance, Notice, Other) with confirmation on submit
- My Complaints with Opening / Pending / Closed tabs + admin responses
- Monthly statements (view / download), Notices, Feedback form + history
- Profile: change password, upload profile photo, one-time email registration (locked to the account forever after first set), forgot-password via email link

**Admin panel** (`/admin.html`, separate login)
- Members: create (username + temp password), edit name/flat, activate/deactivate, set previous balance + current month, reset password manually
- Complaints: filter by status, change status Opening → Pending → Closed, add admin response
- Notices: create / delete
- Statements: upload PDF per member per month with amount
- Feedback: view all
- Reset Requests: see pending password-reset links when SMTP is not configured

## Quick start (local)

```bash
cd society-website
npm install
npm start
```

Open http://localhost:3000 — login as **admin / admin123** (change this password immediately after first login).

## Change society name / logo

Edit `public/config.js`:

```js
window.CONFIG = {
  societyName: "Shantipriya Apartment",
  tagline: "Apki Society, Apki Seva"
};
```

The login page shows an inline SVG logo placeholder — open `public/index.html`, find the `logo-placeholder` SVG and replace it with your society's logo SVG or an `<img src="...">` pointing to a file in `public/` (e.g. `public/logo.png` → `<img src="/logo.png">`). Copy the same SVG into `public/member.html` / `public/admin.html` headers if you want it everywhere.

## Free deploy on Render (step by step)

1. Push this folder to a GitHub repository.
2. Go to https://dashboard.render.com → **New +** → **Web Service** → connect your repo.
3. Settings: **Build Command** `npm install`, **Start Command** `npm start` (already set in `render.yaml` if you use Blueprint).
4. Add environment variable `JWT_SECRET` (Render generates one automatically via `render.yaml`; for manual setup generate one with `openssl rand -hex 32`).
5. Click **Create Web Service**. After the build finishes, open the `.onrender.com` URL and log in with `admin / admin123`.

> Note: Render's free tier has an ephemeral filesystem — uploaded photos/statements and the SQLite DB are wiped on each redeploy/restart. For a real society, attach a persistent disk (`/opt/render/project/src/data` + uploads) or move to a paid tier.

## Email / SMTP setup (optional)

Without SMTP, the forgot-password flow still works: the reset link is shown on screen to the requester, and the admin can copy pending reset links from **Admin → Reset Requests**.

To send real emails, set these environment variables (copy `.env.example` to `.env` for local dev, or set them in Render's dashboard):

```
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=you@example.com
MAIL_PASS=your-app-password
MAIL_FROM=Society <you@example.com>
```

For Gmail, use an **App Password** (Google Account → Security → 2-Step Verification → App passwords), not your login password.

## Tech

Node 18+, Express, better-sqlite3 (DB file at `./data/society.db`, created on boot), bcryptjs password hashing, JWT auth (`Authorization: Bearer`), multer uploads (`./uploads/`), nodemailer.

## Security notes

- **Change the default admin password** (`admin123`) immediately after first login (Admin panel → Members, or log in as admin and use the member password-change endpoint).
- Set a **strong `JWT_SECRET`** in production — never use the example value.
- Password-reset tokens expire after 1 hour and are single-use.
- A member's email can be set only **once** and is then permanently linked to the account.
- Keep the server behind HTTPS in production (Render provides this automatically).
