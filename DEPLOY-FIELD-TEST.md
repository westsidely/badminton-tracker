# Badminton Tracker — Field Test Deployment (Vercel + Supabase)

**Goal:** Use the app on your iPhone anywhere (gym, etc.) without localhost or same Wi‑Fi.

**Cost:** Free (Vercel Hobby + existing Supabase).

---

## 1. Deployment plan (overview)

| Step | Where | What |
|------|--------|------|
| A | Local | Push code to GitHub (if not already). |
| B | Vercel | Import project, add env vars, deploy. |
| C | Supabase | Add production redirect URL for auth. |
| D | iPhone | Open production URL, run test checklist. |

Same Supabase project; only new env vars and redirect URL for production.

---

## 2. Exact step-by-step

### Step A — Get code on GitHub

**A1.** In the project folder, ensure git is initialized and create a repo on GitHub (if you don’t have one yet).

```bash
cd /Users/wesleyhsieh/Cursor/badminton-tracker
git status
```

**Verification:** You see either "On branch …" or "not a git repository". If not a repo:

```bash
git init
git add .
git commit -m "Prepare for Vercel deploy"
```

**A2.** Create a new repository on GitHub (e.g. `badminton-tracker`), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/badminton-tracker.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

**Verification:** Refresh the repo on GitHub; you see your files.

---

### Step B — Deploy on Vercel

**B1.** Sign in at [vercel.com](https://vercel.com) (GitHub login is easiest).

**B2.** Click **Add New… → Project**.

**B3.** Import your GitHub repo: select `badminton-tracker` (or the repo you pushed). Click **Import**.

**B4.** Before clicking **Deploy**, open **Environment Variables** and add:

| Name | Value | Environment |
|------|--------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (from Supabase Dashboard → Settings → API) | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key (same place) | Production, Preview, Development |

Copy these from your local `.env.local` or from [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Settings** → **API** (Project URL and anon public key).

**B5.** Click **Deploy**. Wait for the build to finish.

**Verification:** Build succeeds and you get a URL like `https://badminton-tracker-xxx.vercel.app`. Open it in a browser; you should see the app (login may fail until Step C).

---

### Step C — Supabase redirect URL

**C1.** Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.

**C2.** Go to **Authentication** → **URL Configuration**.

**C3.** Under **Redirect URLs**, add your Vercel URL (and optional custom domain later):

- `https://badminton-tracker-xxx.vercel.app/auth/callback`
- If you add a custom domain later: `https://yourdomain.com/auth/callback`

**C4.** Save.

**Verification:** From your desktop browser, open the Vercel URL → Login → enter your email → open magic link. You should land on `/matches` (or login flow completes).

---

### Step D — Use on iPhone

**D1.** On your iPhone, open Safari and go to your Vercel URL (e.g. `https://badminton-tracker-xxx.vercel.app`).

**D2.** Optional: **Add to Home Screen** (Share → Add to Home Screen) for an app-like icon.

**Verification:** You can log in with magic link and see matches. Then run the checklist below.

---

## 3. Environment variables in Vercel

You only need these two (same as local):

| Variable | Where to get it |
|----------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon public |

Add them in Vercel: Project → **Settings** → **Environment Variables**. Use for **Production**, **Preview**, and **Development** so preview deploys work too.

---

## 4. Supabase redirect URL updates

In **Authentication** → **URL Configuration** → **Redirect URLs**, you must have:

- Development: `http://localhost:3000/auth/callback` (usually already there)
- Production: `https://YOUR_VERCEL_URL/auth/callback`  
  Example: `https://badminton-tracker-abc123.vercel.app/auth/callback`

No other Supabase config is required for this setup.

---

## 5. Recommended order

1. Push code to GitHub (Step A).  
2. Deploy on Vercel and add env vars (Step B).  
3. Add production redirect URL in Supabase (Step C).  
4. Test in browser, then on iPhone (Step D + checklist below).

Doing Supabase redirect **after** first deploy is fine; you’ll have the exact Vercel URL to paste.

---

## 6. iPhone field-test checklist

Use this on your iPhone (on cellular or any Wi‑Fi, not tied to your home network):

- [ ] Open production URL in Safari; page loads (no “can’t connect”).
- [ ] **Auth:** Request magic link → receive email → tap link → land on app (e.g. Matches).
- [ ] **Matches:** List loads; can open an existing match.
- [ ] **New match:** Create match → scoring page works.
- [ ] **Scoring:** Add points; finish match; result saves.
- [ ] **Stats:** Stats page loads and reflects data.
- [ ] **Leaderboard:** Leaderboard loads (if you use it).
- [ ] **Profile/display name:** Can set or see display name.
- [ ] **Off-network:** Turn off Wi‑Fi, use cellular only; repeat one flow (e.g. open app → view matches). Then turn Wi‑Fi back on.

If any step fails, note: WiFi vs cellular, and which action (e.g. “tap magic link”, “finish match”).

---

## 7. HANDOFF REPORT

**Project:** Badminton Tracker — field-test deployment  
**Date:** 2025-03-03  
**Scope:** Deploy to Vercel, keep existing Supabase; use on iPhone anywhere.

**What was done (for you to execute):**

- Deployment plan: Vercel (frontend) + existing Supabase (backend). No new paid services.
- Step-by-step: GitHub → Vercel (import, env vars, deploy) → Supabase redirect URL → iPhone testing.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel for Production, Preview, Development.
- Supabase: Add `https://<your-vercel-url>/auth/callback` under Authentication → URL Configuration → Redirect URLs.
- Order: Push to GitHub → Deploy Vercel + env → Add redirect URL → Test in browser → Test on iPhone with checklist.

**Artifacts:**

- This file: `DEPLOY-FIELD-TEST.md` (in repo root).
- Optional: `.env.example` listing the two vars (no secrets) for future reference.

**How to validate:**

- Build: `npm run build` succeeds locally.
- Production: Vercel build succeeds; app loads at Vercel URL; magic-link login works after redirect URL is set.
- Field: Complete “iPhone field-test checklist” above on device.

**Known assumptions:**

- GitHub account and repo for the project.
- Vercel account (free).
- Supabase project already working locally; same project used for production.
- No custom domain required for field test (Vercel default URL is enough).

**If something breaks:**

- 500 or “env not set”: Re-check both env vars in Vercel and redeploy.
- “Invalid redirect” or login fails after magic link: Add exact `https://<vercel-url>/auth/callback` in Supabase and save.
- Blank page on iPhone: Check Safari (not only Chrome); try “Add to Home Screen” and open from there.

**Next steps (optional, not required for field test):**

- Custom domain in Vercel and add `https://yourdomain.com/auth/callback` in Supabase.
- TestFlight later if you want a native wrapper; same Vercel URL can be loaded inside a WebView.

---

*End of deployment guide.*
