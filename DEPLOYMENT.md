# FinSuite — Vercel Deployment Fix Guide

## Why "Sign-in failed" happens on Vercel

There are 3 separate causes, each must be fixed:

---

## Fix 1 — Add your Vercel domain to Firebase Authorized Domains

This is the **most common cause**. Firebase blocks Google sign-in from unknown domains.

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project **finance-350b5**
3. Left sidebar → **Authentication** → **Settings** tab
4. Scroll to **Authorized domains**
5. Click **Add domain**
6. Add your Vercel URL: `your-project.vercel.app`
7. Also add your custom domain if you have one
8. Click **Save**

> **Note:** localhost is pre-authorized. Any production domain must be added manually.

---

## Fix 2 — Add Environment Variables in Vercel

Your `.env` file is **not uploaded to Vercel** (and should never be committed to Git).
You must add each variable manually in Vercel's dashboard.

1. Go to [vercel.com](https://vercel.com) → your project
2. Click **Settings** → **Environment Variables**
3. Add each variable below (copy exact names and values from your `.env` file):

| Variable Name | Value |
|---|---|
| `REACT_APP_FIREBASE_API_KEY` | `AIzaSyCbPJft_9kE3KTtdyGxVKSlMeMOxX4duJQ` |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | `finance-350b5.firebaseapp.com` |
| `REACT_APP_FIREBASE_PROJECT_ID` | `finance-350b5` |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | `finance-350b5.firebasestorage.app` |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | `212075599716` |
| `REACT_APP_FIREBASE_APP_ID` | `1:212075599716:web:97c82f619b119c183c4c71` |
| `REACT_APP_FIREBASE_MEASUREMENT_ID` | `G-474HHVC2SV` |
| `REACT_APP_ENCRYPTION_SALT` | `ChitFundSecureApp2024` |

4. Set **Environment** to: ✅ Production ✅ Preview ✅ Development
5. Click **Save**
6. **Redeploy** the project (Deployments → Redeploy)

---

## Fix 3 — Enable Google Sign-In in Firebase

1. Firebase Console → **Authentication** → **Sign-in method**
2. Click **Google**
3. Toggle **Enable**
4. Set **Project support email** (your Google account email)
5. Click **Save**

---

## Fix 4 — Firestore Security Rules

Add these rules in Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User sessions (for 4-device limit)
    match /user_sessions/{jti} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.uid;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.uid;
    }
    // All other collections — owner only
    match /{collection}/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## Fix 5 — SPA Routing (already fixed in vercel.json)

The `vercel.json` in this zip handles routing so refreshing any page doesn't give 404.

---

## Deploy Steps (fresh deployment)

```bash
# 1. Extract the zip
unzip finsuite-v14.zip
cd suite

# 2. Install Vercel CLI (if not installed)
npm install -g vercel

# 3. Deploy
vercel

# OR push to GitHub and connect repo in Vercel dashboard
```

**If using GitHub:**
1. Push code to GitHub (`.env` is in `.gitignore` — won't be committed)
2. Connect repo in Vercel dashboard
3. Add Environment Variables (Fix 2 above)
4. Deploy

---

## Checking if env vars are loaded

After deployment, open browser DevTools → Console. If you see:

```
Firebase: Error (auth/invalid-api-key)
```

→ Environment variables are not set in Vercel. Go to Fix 2.

If you see:

```
Firebase: Error (auth/unauthorized-domain)
```

→ Your domain is not added to Firebase. Go to Fix 1.

---

## Quick Checklist

- [ ] Google Sign-In enabled in Firebase Auth
- [ ] Vercel domain added to Firebase Authorized Domains
- [ ] All 8 `REACT_APP_*` variables added in Vercel Settings
- [ ] Redeployed after adding env vars
- [ ] Firestore rules updated
