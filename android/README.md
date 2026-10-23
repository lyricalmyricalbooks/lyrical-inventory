# Putting the inventory app on Google Play

This folder holds everything the Android version needs that lives in the code.
The Android app is a thin shell around the web app you already use. It opens
`https://lyricalmyricalbooks.github.io/lyrical-inventory/` full-screen, in
Chrome's engine, with your icon on the home screen. That means:

- Every change merged here shows up in the Android app on its next launch. You
  only send Google a new version when the shell itself changes, which is rare.
- Offline, sign-in, notifications and the phone layout all behave exactly as
  they do today in Chrome.

Google calls this kind of app a **Trusted Web Activity**. The tools below build
it for you; nobody needs to write Android code.

## Before you start: do you need Play at all?

On any Android phone, opening the app in Chrome and choosing **Add to Home
screen** (or **Install app**) already gives a real app icon, full-screen, with
offline support. If the only people using the app are you and your team, that
may be all you need, and it costs nothing.

Play is worth it when you want people to find and install it from the store, or
want it to update and appear like any other app on a work phone.

## What is already done (in this repository)

- **Icons Play accepts.** `public/android-icon-512x512.png` is the square app
  icon for the listing. `public/maskable-icon-512x512.png` is the version
  Android trims to a circle or rounded shape; the logo now sits safely inside
  the trim line.
- **Store banner.** `store/feature-graphic-1024x500.png` is the 1024 × 500
  "feature graphic" Play shows across the top of your listing.
- **App details.** The web app's install details now carry a fixed identity,
  a category (Business, Productivity) and a language, which the Android
  builder reads.
- **Builder settings.** `twa-manifest.json` has every answer the builder would
  otherwise ask: name, colours, icons, start address and the Android package
  name.
- **Ownership file template.** `assetlinks.example.json` is the file that
  proves to Android that the app and the website belong to the same owner.

To regenerate the pictures after a logo change: `npm run android:assets`.

## The steps only you can do

### 1. Make a Google Play developer account (about 1 to 3 days)

1. Go to https://play.google.com/console and sign up. There is a one-time
   US $25 fee.
2. Choose **Organization** if Lyricalmyrical Books is a registered business,
   otherwise **Personal**. Google checks your ID (and for organizations, a
   D-U-N-S number), which can take a few days.
3. **Important for personal accounts:** before a new personal account can
   publish to everyone, Google requires a **closed test with at least 12
   testers who stay opted in for 14 days in a row**. Line up 12 people (staff,
   friends, other publishers) with Android phones early. Organization accounts
   skip this.

### 2. Decide where the ownership file lives

Android only hides the browser's address bar if it finds the ownership file at
`https://lyricalmyricalbooks.github.io/.well-known/assetlinks.json`. That is
the very top of the address, which this repository does not control. Pick one:

- **A tiny second repository (recommended).** Create a public GitHub repository
  named exactly `lyricalmyricalbooks.github.io` containing only
  `.well-known/assetlinks.json`, plus an empty file named `.nojekyll`. Free,
  ten minutes, and the app's address does not change.
- **Your own web address.** Point an address you own (for example
  `app.lyricalmyrical.com`) at this site. Cleaner, but it needs DNS changes,
  the address must be added to Firebase sign-in's allowed list, and everyone's
  bookmarks move.
- **Skip it.** The app still works, but a thin browser bar with the address
  shows at the top.

### 3. Build the app file

The easiest route needs no software installed:

1. Open https://www.pwabuilder.com, paste
   `https://lyricalmyricalbooks.github.io/lyrical-inventory/` and press Start.
2. Choose **Package for stores → Android → Generate package**, then
   **Options**, and enter the values from `twa-manifest.json`:
   - Package ID: `io.github.lyricalmyricalbooks.inventory`
   - App name: `Lyricalmyrical Inventory`, launcher name: `Lyrical Inv`
   - Version code `1`, version name `1.0.0`
   - Signing key: **Create new**
3. Download the zip. It contains the `.aab` file you upload to Play, an
   `assetlinks.json`, and a **signing key with its passwords**.

> **Keep the signing key and its passwords forever, somewhere safe** (a
> password manager, not email, not this repository). Every future update must
> be signed with it. Turning on **Play App Signing** in step 4 means Google
> holds the real key and yours is only for uploads, so a lost upload key can
> be reset, but it is still a hassle.

The package ID becomes permanent the moment you upload. Change it now if you
want something else, never later.

For a developer: the same build runs from this folder with Google's Bubblewrap
tool (`npm i -g @bubblewrap/cli`, then `bubblewrap update` and
`bubblewrap build` inside `android/`). The generated project and keys are
ignored by git on purpose.

### 4. Create the app in Play Console

1. **Create app** → name "Lyricalmyrical Inventory", type App, Free.
2. **Test and release → Setup → App signing**: accept Play App Signing.
3. Copy the **SHA-256 certificate fingerprint** shown under "App signing key
   certificate". Put it into `assetlinks.json` (use `assetlinks.example.json`
   as the shape) and publish that file where you chose in step 2. Then check
   it with Google's tester:
   https://developers.google.com/digital-asset-links/tools/generator
4. **Internal testing → Create release**, upload the `.aab`, add yourself as a
   tester, and install it on your phone from the link Play gives you. Internal
   testing needs no review and is a good place to stay if only your team uses
   the app.

### 5. Fill in the store listing and the forms

Play will not let you publish until these are done:

- **App icon:** `public/android-icon-512x512.png`.
- **Feature graphic:** `android/store/feature-graphic-1024x500.png`.
- **Phone screenshots:** at least 2. Take them on your phone from the real app,
  ideally Home, a book page and the shipping screen.
- **Short description** (80 characters), for example: "Stock, sales,
  consignment and shipping for Lyricalmyrical Books, even offline."
- **Privacy policy link:** required, because the app signs people in with
  Google. It must be a public web page. See the list below for what it has to
  cover.
- **App access:** the app is behind sign-in, so Google's reviewers need a way
  in. Give them a test Google account with access, or explain that the app is
  for staff only.
- **Data safety form:** what the app collects and why.
- **Content rating** questionnaire and **Target audience** (adults, not for
  children).

What the privacy policy and data safety form need to cover, from what the app
does today. Check this list against how you actually use the app:

- Google sign-in (name, email) through Firebase, used to log you in.
- Inventory, sales, customer names, addresses and order details stored in
  Google Firebase.
- Shipping addresses sent to Canada Post, Chit Chats or Zonos when you buy a
  label or quote.
- Payment details looked up in Stripe and Big Cartel when you connect them.
- Text sent to the AI assistant (OpenRouter) when you use it.
- No ads, no selling of data, no tracking across other apps.

### 6. Go live

After internal testing works: run the closed test (personal accounts, 12
testers for 14 days), then **Production → Create release** with the same
`.aab`, and send for review. First reviews usually take a few days.

## Later updates

Most changes need nothing on Play: merge them here and the app picks them up.
Only rebuild and upload when the shell changes (new icon, new name, Google's
yearly minimum Android version rule). When you do, raise `appVersionCode` by 1
in `twa-manifest.json` and sign with the same key.
