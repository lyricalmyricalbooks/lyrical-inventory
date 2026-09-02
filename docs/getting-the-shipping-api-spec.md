# Getting the Canada Post label instruction sheet

**Who this is for:** the shop owner. No technical knowledge needed.
**How long it takes:** about five minutes, once.
**Why you are doing it:** it is the last thing standing between this app and
printing real Canada Post labels.

---

## What you are getting, in plain terms

Canada Post lets this app buy a shipping label by sending them a parcel's
details — who it is from, who it is going to, how heavy it is. They are very
strict about the exact wording of that message. Send `weight` when they expect
`parcelWeight` and they refuse the whole thing.

The exact wording list is published on their developer website, but only to
people signed in to an account. It is a single file. Once it is in this project,
the app can match their wording exactly and labels will print.

Until then the app is guessing, and a guess that is wrong fails at the post
office rather than on screen — which is why it has not been switched on for real
purchases.

---

## Step by step

1. **Sign in** at the Canada Post Developer Portal
   (`developer-developpeur.canadapost-postescanada.ca`) with the same account
   that has your API keys.

2. Go to **APIs** (sometimes called the API catalogue).

3. Open the **Shipping** API. Check the version says **8.0.0** — if you see a
   different number, tell me which, because that changes things.

   > If you cannot find Shipping in the list at all, that means your app is not
   > subscribed to it yet. Rating (which this app already uses for prices) is a
   > separate subscription. Subscribe your app to Shipping first, then come back.

4. On that page, look for a **download** link for the **OpenAPI definition**.
   It may also be labelled *OpenAPI spec*, *API definition*, or *Swagger*.
   It downloads a single file ending in `.yaml` or `.json`.

5. **Send me that file**, or save it into this project at:

   ```
   docs/shipping-api-openapi.yaml
   ```

That is the whole job.

---

## While you are on that page — two things worth grabbing

Both are quick, and both save a round trip later:

- **Your app's base web address.** The portal shows it on the app's own page.
  It should begin `https://api.canadapost-postescanada.ca/prod/…`. Canada Post
  generates this per app, so if yours differs even in capitalisation, labels
  will fail with a confusing "not found" error.

- **Whether your app is a [Test] app or a [Production] app.** The portal marks
  this. It matters because a Test app never charges you and returns made-up
  data, while a Production app buys real postage with real money. An app cannot
  be switched from one to the other after it is created.

---

## If you would rather not hunt for the file

There is a second way that works just as well. If any tool you already use
successfully buys a Canada Post label on your account — their own website, a
shipping plugin, anything — and you can see the raw message it sends, send me
that message instead. One real, working example tells me the same thing the file
does.

---

## What happens once I have it

I match the app's wording to theirs, run the tests, and open a pull request. It
is roughly an hour of work, and it does not require you to be present.

After that, the sensible next step is to buy **one** real label on purpose — a
cheap domestic parcel you were sending anyway — and confirm it prints and scans
before you rely on it during a busy mailing day.

---

## Related

- [`canada-post-shipping-api.md`](canada-post-shipping-api.md) — the standing
  technical rules, including why guessing these field names is forbidden.
- [`canada-post-rating-api.md`](canada-post-rating-api.md) — the rates side,
  which already works.
