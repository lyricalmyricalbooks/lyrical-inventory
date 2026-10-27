# UX daily — run log

The memory for the `/ux-daily` skill. Every run reads this file **first** and appends to it in the
same commit as the change it ships.

Why it exists: dedupe used to be `git log --oneline -30` plus a pull-request listing. With several
runs merging per day and the repo past PR #577, thirty commits covers about a day — so the skill was
steadily losing sight of its own history and had no record at all of ideas it had already considered
and rejected. This file is append-only, so it never truncates.

**How to append.** Newest at the bottom. One row per run, even the runs that ship nothing — a run
that surveyed the app and decided nothing was worth a PR is a useful thing to have recorded, so
write it down rather than leaving a silent gap. Keep *What shipped* in the shop owner's language,
the same voice as the commit subject.

**The `Kind` column is load-bearing.** `visual` means the look of the screen changed — spacing,
hierarchy, type, colour, alignment, density, elevation. `behavioural` means new copy, validation,
counts, filtering or guards: useful, but not a design change. The skill reads the last five rows
and forces a visual run when three or more were behavioural, so classify honestly. A change that
did both is `visual` only if a screenshot with the words blurred out would show the difference.

---

## Shipped

| Date | Kind | Surface | What shipped | PR |
| :-- | :-- | :-- | :-- | :-- |
| 2026-08-18 | behavioural | Order History | Gave the empty table a way forward | #555 |
| 2026-08-18 | visual | POS checkout | Made the cart safe to tap at a fair | #556 |
| 2026-08-18 | behavioural | Consignment ledger | Totalled what the stores still owe | #557 |
| 2026-08-18 | visual | Catalogue | Made the stock bars readable in dark mode | #558 |
| 2026-08-18 | behavioural | Expenses | Made a missing receipt impossible to miss | #559 |
| 2026-08-18 | behavioural | Opening screen | Showed the catalogue arriving instead of nothing | #560 |
| 2026-08-19 | behavioural | Manual entry | Showed what an order does to stock before it's saved | #563 |
| 2026-08-19 | behavioural | Customers | Showed who "Email segment" is actually about to reach | #564 |
| 2026-08-19 | visual | Ledgers | Kept the column labels in view while you scroll | #565 |
| 2026-08-19 | visual | Main navigation | Made the tab labels readable on every screen | #566 |
| 2026-08-19 | behavioural | Dashboard | Showed which channel is actually carrying the book | #567 |
| 2026-08-19 | behavioural | Website orders | Showed what the Gmail scan actually found | #568 |
| 2026-08-19 | behavioural | Sync status | Said when the connection drops and what's still unsaved | #569 |
| 2026-08-19 | behavioural | Artist payouts | Showed what a payment does before you record it | #570 |
| 2026-08-19 | behavioural | Consignment store card | Explained what doesn't add up on a store card | #571 |
| 2026-08-19 | behavioural | Shipping rates | Pointed at the box that is actually empty | #574 |
| 2026-08-19 | behavioural | Dialogs | Stopped Cancel quietly throwing away what you typed | #576 |
| 2026-08-19 | behavioural | Consignment ledger | Showed one store's rows, and what that store owes | #577 |
| 2026-08-19 | behavioural | Event POS | Showed how many copies are left before you sell them | #579 |
| 2026-08-19 | behavioural | Expenses | Stopped the expense total mixing currencies into one wrong number | #580 |
| 2026-08-19 | behavioural | Order History | Made it possible to find one order without scrolling | #581 |
| 2026-08-20 | visual | POS checkout | Gave the checkout column a readable total and an even rhythm | #589 |
| 2026-08-20 | visual | Order History | Made the stock figures at the top of the page line up and lead | #590 |
| 2026-08-20 | visual | Consignment store cards | Let the shop's name lead its card instead of its numbers | #591 |
| 2026-08-20 | visual | Book dashboard | Gave the row of numbers at the top one figure that leads | #592 |
| 2026-08-20 | visual | Invoices | Let the amount lead each invoice, and lined the totals up | #593 |
| 2026-08-20 | visual | Customers | Lined up what each buyer spent so the column can be read down | #594 |
| 2026-08-20 | visual | Dialogs | Kept a dialog's heading in view and stopped its buttons cutting the form off | #597 |
| 2026-08-20 | visual | Opening screen | Gave the home screen real headings instead of the faintest type in the app | #598 |
| 2026-08-20 | visual | Sales by book | Made the per-book sales cards match the chart above them and line their figures up | #601 |
| 2026-08-20 | visual | QR codes page | Redesigned the payment QR cards so the book title and price lead | #602 |
| 2026-08-24 | visual | Consignment tab | Gave the consignment screen one set of headings, so the ledger stops wearing the faintest type in the app | #616 |
| 2026-08-28 | visual | Book dashboard | Let the copies-on-hand number lead the Inventory panel instead of hiding under the bar | #636 |
| 2026-08-29 | visual | POS checkout | Grew the register's quantity buttons to a full, tappable size | #643 |
| 2026-08-29 | visual | Tax Centre | Gave the Business Trips header the same card-level heading its neighbours already have | #644 |
| 2026-08-29 | visual | Web Analytics | Fixed the "Connected" badge so it matches the app's colours in night mode | #646 |
| 2026-08-29 | visual | Book dashboard | Gave the profit-sharing money row its own proper cards instead of a stretched header style | #650 |
| 2026-08-29 | visual | Catalog & Stock | Made hovering a book card actually lift it in dark mode | #658 |
| 2026-08-29 | visual | Settings — Book Catalog | Gave the Book Catalog and Test Book Catalog cards a real heading instead of a plain caption | #651 |
| 2026-08-29 | visual | Dashboard | Gave the "awaiting transfer" and "awaiting payment" cards the same flagged-tile accent bar and even spacing as the rest of the app | #661 |
| 2026-08-29 | visual | Payments (Stripe reconciliation) | Gave the reconciliation screen a real heading instead of a bare caption | #652 |
| 2026-08-29 | visual | Customers | Gave the buyer filter panel back its background, in both themes | #653 |
| 2026-08-29 | visual | Event POS | Made hovering a book card at the register actually lift it in dark mode | #666 |
| 2026-08-29 | visual | Tax Centre | Gave the subscriptions summary strip one leading figure instead of four equal ones | #654 |
| 2026-08-29 | visual | Financials | Fixed an unreadable "missing receipts" tag on the expense breakdown table | #655 |
| 2026-08-29 | visual | Header — book switcher | Gave the book switcher a visible focus ring and made its menu keyboard-usable | #664 |
| 2026-08-30 | visual | Order History | Fixed the sale-channel tags so they still show their colour tint in dark mode | #673 |
| 2026-08-31 | visual | Tax Centre — Receipts Vault | Made the Overview/Gallery view switcher actually show which view you're on | #677 |
| 2026-09-01 | visual | Invoices | Gave the store details preview on a new invoice a real, visible card instead of near-invisible text | #692 |
| 2026-09-01 | visual | Order History | Gave the Total column its intended weight instead of a bolder one the digit font fakes and blurs | #695 |
| 2026-09-02 | visual | Settings — Profit Tiers | Gave the production-cost/revenue/earned strip a card you can actually see in dark mode | #711 |
| 2026-09-03 | visual | Big Cartel, Shippo linking, Web Analytics | Fixed several cards and panels that had no visible background at all in light mode | #726 |
| 2026-09-03 | visual | Payment QR modal | Gave the price override fields their intended lined-up numbers and card background back | #730 |
| 2026-09-04 | visual | Connect your Google Sheet | Made the simulated spreadsheet's row numbers actually readable | #736 |
| 2026-09-05 | visual | App-wide chrome (tab bar, book switcher, header menus) | Gave the dark navigation bar and dropdown menus back their fill in dark mode | #739 |
| 2026-09-05 | visual | Tax Centre — Shipping reconciliation | Gave the shipping reconciliation panel a real card background in light mode, not just dark | #740 |
| 2026-09-05 | visual | POS checkout | Gave the register's cart panel a shadow that still shows once the page goes dark | #741 |
| 2026-09-06 | visual | Customers — Email Campaigns | Gave each campaign row its own visible tile instead of blending into the card behind it | #750 |
| 2026-09-07 | visual | Tax Centre — Shipping (US customs prepayment) | Made the US customs card's gold border and "valid" checkmarks actually change color in dark mode | #753 |
| 2026-09-08 | visual | Book dashboard | Gave "Sales by channel", "Consignment overview" and "Inventory" real headings instead of the faintest type in the app | #766 |
| 2026-09-10 | visual | Book dashboard | Gave the Break-even tracker a real heading like its dashboard siblings, instead of the faintest type in the app | #786 |
| 2026-09-11 | visual | Book dashboard | Gave the Profit Sharing Breakdown card a real heading like its dashboard siblings, instead of the faintest type in the app | #794 |
| 2026-09-11 | visual | Consignment ledger | Made the book/store jump links in the ledger table show a visible focus ring when tabbed to | #795 |
| 2026-09-12 | visual | Book dashboard | Gave "Pending artist transfers" and "Pending expense reimbursements" real headings like their dashboard siblings, instead of the faintest type in the app | #802 |
| 2026-09-15 | visual | Book dashboard — payment banners | Made the small "opens payment link" / "no payment link yet" note under Send Payment actually readable, instead of nearly invisible | #817 |
| 2026-09-16 | visual | Invoices list | Gave the invoice-row badges (Stripe, shared, person, chase) one matching shape, and fixed a failed-reminder badge that had no color at all | #839 |
| 2026-09-16 | visual | Dashboard — expenses owed to artist | Gave the expense table real column headers, an even row rhythm and a themed category tag, instead of hand-picked padding per cell and no header at all | #839 |
| 2026-09-16 | visual | Dashboard — artist reimbursement & pending-transfer banners | Gave both author-facing money summaries a shared row divider and tag style instead of two copies of the same hand-rolled row, and swapped a raw hex for the emerald token | #839 |
| 2026-09-17 | visual | Event POS — search with no matches | Fixed the register's "no books match" message so the search term you typed is actually visible instead of blending into the background | #847 |
| 2026-09-17 | visual | Whole app — new look ("Riso Press") | Repainted the entire app: flat print-shop inks, square corners, bold outlines and hard offset shadows instead of soft rounded ones, with a matching night mode. New type throughout | #850, #852 |
| 2026-09-17 | visual | Printed invoice | Redesigned the invoice sheet to match the new look, and kept it deliberately fixed so it prints the same whatever theme you are using | #853 |
| 2026-09-21 | visual | Whole app — leftovers from the repaint | Swept the values the repaint missed: shadows that were still soft, and colours still keyed to the previous palette. Hover effects on the book cards now show up in night mode for the first time | #861 |
| 2026-09-21 | visual | Shipping — manual link dialog, sending overlay, updating screen | Three windows had been built their own way and missed the repaint. The updating screen was still glowing in the old brand gold | #861 |
| 2026-09-21 | visual | Whole app — each screen's own pieces | Flattened the last faded panels, including two table headers, and squared the register's rounded corners so it matches everything else | #862 |
| 2026-09-21 | fix | Add-a-store banner, consignment balances popup, shipping rate rows | Three things were quietly not working: the "store connected" banner had no background at all, the balances popup opened with nothing dimmed behind it, and hovering a shipping rate highlighted nothing | #862 |
| 2026-09-21 | perf | Shipping label window, sending overlay | Removed a blur effect that was redrawing the whole screen on every keystroke while you filled in a shipping label | #862 |
| 2026-09-22 | visual | Whole app, night mode — cards, buttons, the pop-up window, tags, and the summary tiles | Night mode redone as "Press Proof": the screen background stays black, but every box on it — a card, a button, a tag — is now white/cream with dark text, the same look daylight mode already uses, instead of a slightly-less-dark box on a dark screen | #865 |
| 2026-09-22 | fix | Night mode — the all-books consignment summary table and the Tax Centre master ledger | Fixed a real bug in the new night mode: the consignment summary table and the tax ledger still showed alternating dark and light rows you could barely read, and the tax-category dropdown in the ledger showed up as a solid black box with white text instead of matching the rest of the redesign | #868 |
| 2026-09-22 | visual | Book dashboard — Danger zone | Gave the "Danger zone" section a real heading and a warm red warning colour instead of the same faint caption every other section on the page had already moved on from | #875 |
| 2026-09-23 | visual | Phone bottom nav bar & the "More" sheet | Gave the buttons in the new phone navigation bar and its "More" menu a visible press when tapped, and a visible outline when reached by keyboard — before this, tapping them changed nothing you could see happen | #917 |
| 2026-09-23 | visual | Settings — Book Catalog | Stopped each book's Edit/Remove buttons from getting squeezed off the edge of the screen on a phone held upright | #926 |
| 2026-09-24 | visual | Shipping — Shippo rate list | Made the Shippo rate cards match the Canada Post rows beside them: a full-size Buy Label button instead of a squeezed tiny one, prices in plain ink instead of green on every row, a colour for the "Canada Post" tag, and the same lift on hover | #984 |
| 2026-09-24 | visual | Phone header, held upright | Stopped the sticky header's top padding from resetting to a flat 12px on a phone, which planted the logo and header buttons under a notch or Dynamic Island | #992 |
| 2026-09-25 | visual | Author view — "Money to send to your publisher" box and the thank-you pop-up | In night mode the author's payment box and the "Payment sent!" pop-up had no fill at all — the same colour as the page, just an outline. Both are now a proper card, and each sale waiting to be paid sits one step brighter inside the box so it still stands out | #1026 |
| 2026-09-29 | visual | Phone record cards (customers, tax, consignment, stock lists) | Gave the record cards on a phone the same bold outline and offset shadow as the rest of the app, with small caps labels and more space between cards | — |
| 2026-09-30 | visual | Review inbox (receipts and labels to check) | Brought the Review inbox into the house look: the filter buttons are now square, outlined tabs with the one you're on filled in, the details pane is a proper card, and the item's name heads it in the big title lettering | #1058 |
| 2026-09-30 | visual | Phone record cards — Show details button | Made the details button on a phone record card a square, outlined caps button that presses in when tapped, instead of a soft pill | — |
| 2026-10-01 | visual | Order History & Expenses — rows waiting for your approval | Gave Approve / Reject the same square, outlined caps buttons as the rest of the app, and stopped fading the waiting row: it now keeps full-strength text with an amber stripe down its edge, so the one row that needs you stands out instead of looking spent | — |
| 2026-10-06 | visual | Phone "More" sheet | Gave the More menu on a phone the same bold outlined, offset-shadow tiles and square close button as the rest of the app, with the screen you're on inked in instead of ringed in gold | — |
| 2026-10-07 | visual | Phone register (Fair Mode) | Gave the register tiles and buttons the same hard shadow as the rest of the app, and made them press in when tapped | — |
| 2026-10-07 | visual | Phone home screen (Today) | Gave the four big job cards the same bold outline and offset shadow as the rest of the app, pressing in when tapped, with a square count stamp and a sharper heading over the list below | — |
| 2026-10-08 | fix | Phone header, register, Add sale, More button | Stopped the bell and account button being drawn on top of each other, lifted messages clear of the register's Undo bar and the update notice clear of the bottom bar, showed a missing payment type right under its buttons, pinned Add order and Log gratuity above the bottom bar, and made the More dot light up as soon as something needs you | — |
| 2026-10-08 | behavioural | Every pop-up, on Android phones | The back gesture now closes the pop-up on top (asking first if you'd lose typing) instead of leaving the app; Esc closes the one opened last, not the one last in the page | — |
| 2026-10-08 | behavioural | Number boxes across the app, on phones | Copy counts bring up the whole-number keypad and prices, weights and sizes the decimal one (about 30 boxes had neither), and commission rates now accept a decimal such as 37.5% | — |
| 2026-10-08 | visual | Phone bottom bar, pop-up sheets, register tabs | Gave the bottom bar a printed ink rule and square marks instead of a soft glow, and gave pop-up sheets a square ink grip, square corners and a square outlined close button; the register's tabs now ink in the one you're on and press in when tapped | — |
| 2026-10-08 | visual | Phone home screen (Today) | Added a 'Sold today · all books' slip at the top (sales, books and takings per currency, tap for History) with the register's upload pill under it, so the day's numbers and whether they've reached the cloud are the first thing you see | — |
| 2026-10-08 | visual | Phone Add Sale (Sale/Gift switch, payment and channel buttons) | Gave the Add Sale toggles on a phone square ink outlines and the offset shadow, pressing in when tapped, instead of a soft grey well | — |
| 2026-10-08 | visual | Phone Website orders | Gave each web order card on a phone the same bold outline and offset shadow as the other cards, keeping its coloured status stripe, pressing in when tapped | — |
| 2026-10-09 | visual | Phone header — book switcher | Gave the "which book am I in" button on a phone a firm outline, an offset shadow, caps lettering and a visible arrow, pressing in when tapped, instead of a faint see-through box | — |
| 2026-10-09 | visual | Phone register — take-back (−) buttons and in-cart count | Made the round − buttons on the register tiles and cart lines, and the copy-count badge, square inked stamps with the offset shadow, pressing in when tapped, to match the rest of the register | — |
| 2026-10-12 | visual | Phone section picker (Tax Centre, Settings, Customers) | Gave the section dropdown on a phone a small caps label, an inked outline with the offset shadow, a bold name that no longer runs under the arrow, and a press-in when tapped | — |
| 2026-10-12 | visual | Phone register — Charge and Undo bars, charge sheet | Made the pinned Charge and Undo bars square slabs, turned the round green check into an inked square stamp, and made the total larger with small caps labels | — |
| 2026-10-13 | visual | Phone Order History | Turned each order on a phone into its own inked card with an offset shadow and a gap between, with the amount leading and the channel in small caps, pressing in when tapped | — |
| 2026-10-13 | visual | Phone Payments (Stripe reconcile) | Put the payments that still need you at the top of the Payments screen on a phone, each one a tidy form with a full-width Record sale button and a plain hint when no book is chosen, and folded the Stripe key, card-reader codes, alerts and accepted payment methods into sections you open when needed | — |
| 2026-10-13 | visual | Phone Consignment | Split the consignment screen on a phone into Stores, Invoices and Ledger tabs with counts, folded each store's secondary actions and the ledger's filters behind a button, and put the ledger totals above the list | — |
| 2026-10-13 | fix | Phone To-do, All Books, Dashboard, Tax Centre, Order History, import and night-mode pop-ups | Stopped the to-do text being squeezed beside its buttons, the consignment toolbar overflowing, the channel and tax tables being cut off at the right edge and the empty boxes and stray warning sign on a phone; night-mode pop-up headers match their sheet, and the import button stays off until a file is read | — |
| 2026-10-13 | visual | Phone Sell (top of the register) | Put the fair name and currency on one line, upload status and today's total on another, shortened the fair-kit toggle to "Fair kit" on a phone, and made the book tiles shorter, so the first book now shows near the top of the screen | — |
| 2026-10-13 | visual | Phone Tax Centre | Put Log business expense first on a phone, folded the empty Pending, Recurring and Trips sections to one line each, said why AI Scan is greyed out, and printed the income and expense figures beside the cash-flow bars | — |
| 2026-10-13 | visual | Phone Order History | Made each order on a phone a compact card: the channel and a Details tap (anywhere on the card) sit on top, the order number and date below, and the total and action line up in one right-hand column; the three summary figures now sit in one row so the first order shows on the first screen. Store tags are blue rather than red, Website and Direct are neutral, and Stock on Hand is ink with only its accent bar | — |
| 2026-10-13 | visual | Expenses (phone, round 4) | Made each expense a compact card with its amount up top, a proper receipt button, and labelled bulk controls in the batch sheet | pending |
| 2026-10-13 | visual | QR codes, Customers, Intelligence (phone, round 4) | A book with no payment link shows one Set payment link button instead of an empty box, payment QR cards are compact rows with a status pill, Customers puts the buyer list first with Filter and Export folded behind toggles, and Intelligence collapses the acknowledged privacy note to one line with the question box in the first screen | pending |
| 2026-10-13 | visual | Manual entry + Home (phone, round 4) | Tucked the order number and notes under "More details" on a phone, made the Sell card readable at night, squared the upload strip on Home, and made the gratuity tag neutral in History | pending |
| 2026-10-14 | visual | Phone Dashboard — expenses owed to artist | Made each expense on a phone a compact card (description and amount on top, date beneath, tap anywhere for details) so the list is about a quarter shorter and the book's own dashboard comes into view sooner | pending |
| 2026-10-15 | visual | Phone All Books overview | Put each book's cover beside its title instead of on a row of its own, so every book card on a phone is about a third shorter and the next book comes into view sooner | pending |
| 2026-10-16 | visual | Phone Order History | Made the pencil beside each order number easy to tap (a 44px touch area around a slightly larger square, was a tiny 22px one) without making the cards taller, and stretched the Import button across the row | pending |
| 2026-10-17 | visual | Phone Customers | Made each buyer a compact card: the name with what they spent beside it, the email a full-size tap (was a 14px-tall link), and the list buttons side by side, so each card is about a quarter shorter | pending |
| 2026-10-18 | visual | Phone All Books — sales by book cards | Made each book's name lead its card in big title lettering with an inked outline and offset shadow, instead of being outweighed by the channel names under it | pending |
| 2026-10-20 | visual | Phone To-do | Put each group's count beside its label (Stock, Money to chase…) instead of on a line of its own, so every group is a row shorter and the first items come into view sooner | pending |
| 2026-10-20 | visual | Phone book dashboard — headline numbers | Stock on hand and Revenue keep a row each and the smaller counts (units sold, on consignment) now sit two to a row instead of four full-width slabs, so the book's own sections come into view a screen sooner | pending |
| 2026-10-20 | visual | Customers (computer) | Put "+ List" and "Unsubscribe" side by side on each buyer row instead of stacked, so every row is about half as tall and the buttons line up down the column; on a narrower screen they stack at one shared width | pending |
| 2026-10-21 | visual | Expenses (computer) — expense history table | Dates and receipt numbers now stay on one line (a date was breaking over three), the description reads in one or two lines instead of a word per line, and a slightly tighter gutter keeps all ten columns, including the remove button, in view without scrolling sideways | pending |
| 2026-10-21 | visual | Phone Settings — Book Catalog | Made each book card snugger with the title in big display lettering and Edit / Remove sharing the width evenly, so more books fit on screen | pending |
| 2026-10-21 | visual | Order History (computer) | Order numbers and dates now sit on one line (an order number was breaking over three), so each sale is a shorter row, and the Approve button on an artist's sale fits inside the table instead of being cut off at its right edge | pending |
| 2026-10-22 | visual | Shipping — carrier price tiles | Once you get rates, each carrier's price is now the biggest thing on its tile instead of the same size as its name, and on a computer Shippo runs across the top with Canada Post and Chit Chats side by side underneath, instead of two tiles and a lonely third with a gap beside it | pending |
| 2026-10-22 | visual | Phone Website orders — status tiles | Tightened the small captions on the four website facts (Last brought in, Stock sent…) so each fits two lines, so the figures start on the same line instead of dropping lower under each wrapped caption | pending |
| 2026-10-23 | visual | Phone Shipping — parcel specifications | Put Length, Width and Height side by side (and copies beside weight) with centred figures, instead of six full-width boxes in a column, so the parcel card is about a third shorter | pending |
| 2026-10-23 | visual | Phone All Books — book card facts | The author, price and print-run line on each book card now separates its facts with space instead of typed dots, so a dot no longer lands alone at the start of the second line | pending |
| 2026-10-23 | visual | Phone All Books — consignment summary | Put Outstanding stock on a row of its own and Active accounts beside Sell-through, instead of three full-width slabs, so the store filter and list come into view a screen sooner | (this PR) |
| 2026-10-23 | visual | Phone Expenses — amount | Put the currency picker (CAD, USD…) and the amount on one row, same height, instead of a full-width picker stacked over the amount box, so the Log an expense form is a row shorter | (this PR) |
| 2026-10-23 | visual | Phone Help — topic buttons | Laid the five topic buttons (Running the press, Sales & orders…) out as an even two-column grid with the odd last one full width, instead of a ragged wrapped row with uneven widths | (this PR) |
| 2026-10-23 | visual | Phone Intelligence — the two notes above the question box | Turned the pale blue "Add your AI key…" strip and the thin-lined "Before you start" card into the same bold outlined, offset-shadow slabs as the rest of the app, with easier-to-read type | (this PR) |
| 2026-10-24 | visual | Phone Dashboard — sales by channel | Put Units, Revenue and Share of revenue side by side with Details beside the channel name, instead of a name, a full-width Details bar and three figures stacked, so each channel card is about half as tall | (this PR) |
| 2026-10-24 | visual | Phone Expenses — expense cards | Stacked the receipt status above its "+ Receipt" button on each expense card, instead of side by side, so the expense description gets the full width (one or two lines, not four) | (this PR) |
| 2026-10-24 | visual | Phone All tools sheet (More menu) | Laid the menu tiles out two to a row instead of one full-width tile each, so the whole list is about half as tall and far less scrolling to reach a screen | (this PR) |
| 2026-10-24 | visual | Phone Dashboard — pending expense reimbursements | Made each pending reimbursement an inked slab with the amount larger and the two buttons (payment link, Mark received) sharing one full width, instead of a wide outline bar over a half-width fill | (this PR) |
| 2026-10-24 | visual | Phone Consignment — store card figures | Kept "On shelf" on one line so Sent, Sold, On shelf and Owed all line up on the same row of figures, and the store card is a line shorter | (this PR) |
| 2026-10-24 | visual | Phone Home — workspace rows | Gave the four workspace rows (Books & stock, Money, Audience, All tools) the same square inked stamp as the job cards above, instead of four loose glyphs of different widths | (this PR) |
| 2026-10-24 | visual | Phone Audience — action buttons | Made Pull buyers, Filter and Export share one full width, with Filter and Export a full fingertip tall, instead of a wide button over two small orphaned stubs each on its own row | (this PR) |
| 2026-10-24 | visual | Phone All Books — notifications | Made each notification an inked slab with the offset shadow and a coloured edge stripe, a bigger title and an underlined action link, instead of a pale hairline box matching nothing around it | (this PR) |
| 2026-10-24 | visual | Phone Dashboard — author submissions notice | Made the "Author Submissions" notice an inked slab with an amber edge and its review buttons sharing one full width, instead of a pale hairline box with a half-width stub button | (this PR) |
| 2026-10-24 | visual | Phone Manual entry — price paid | Put the currency picker (Book currency, USD…) and the price on one row, same height, instead of a full-width picker stacked over the price box, so the Log an order form is a row shorter | (this PR) |
| 2026-10-24 | visual | Phone To-do — attention cards | Made each To-do card an inked slab with the offset shadow and a coloured edge stripe, a bolder title, and a wider gap between cards, instead of a pale hairline box matching nothing around it | (this PR) |
| 2026-10-24 | visual | Phone Payment QR codes — book titles | Put each book's title in the big display lettering the Book Catalog cards use, so the book leads its card instead of reading like the author line under it | (this PR) |
| 2026-10-24 | visual | Phone Dashboard — pending reimbursement cards | Put what the expense was on its own line first, with the date and category chip on one line beneath, instead of a ragged run with a stranded dot at each wrap | (this PR) |
| 2026-10-24 | visual | Phone Order History — header | Made the Import button reach the same right edge as the search card and cards beneath, and closed the ~50px dead gap under the "Order history" heading so the first order shows on the first screen | (this PR) |
| 2026-10-24 | visual | Phone Tax Centre — cash-flow cards | Put the arrow icon beside the label and figure on Money in, Money out and Net cash flow instead of above them, so each card is about a third shorter, and let the odd last small figure (Net after payouts) fill its row instead of leaving a gap | (this PR) |
| 2026-10-24 | visual | Phone book banner (Manual entry, Expenses and other book screens) | Made the book banner at the top an inked slab with the offset shadow and the book's colour as an edge stripe, with the book's name in big display lettering, instead of a pale tinted band matching nothing around it | (this PR) |
| 2026-10-24 | visual | Phone Payments — payment cards | Lined up the paired boxes on each payment to check (Quantity beside Stripe amount, Currency beside Exchange rate) so they sit level, instead of one box dropping below its neighbour whenever its caption wrapped to two lines | (this PR) |
| 2026-10-24 | visual | Phone Order History — edit pencil | Parked the edit pencil in the bottom-right corner of every order card, lined up with the arrow on return cards, instead of trailing each order number at a different spot on every card | (this PR) |
| 2026-10-24 | visual | Phone Web Analytics — setup card | Set the setup title in the same capital display lettering as other card titles (it was smeared mixed-case) and put the Not Connected tag beside the page heading instead of a line below | (this PR) |
| 2026-10-24 | visual | Phone Shipping — Save to Preset | Stretched the Save to Preset button to the same width as the dropdown above it and a full fingertip tall, instead of a half-width stub hanging off the left | (this PR) |
| 2026-10-24 | visual | Phone Payment QR codes — cards | Gave every code card the same light offset shadow as the other cards, trimmed the roomy "No link yet" card to the compact padding of its neighbours, and made its status tag a square tag instead of a soft lozenge | (this PR) |
| 2026-10-24 | visual | Phone Intelligence — question box | Lined the question box and the note under it up with the messages and Quick asks above, instead of the box sticking out wider than everything else in the panel | (this PR) |
| 2026-10-24 | visual | Phone Dashboard — count tiles | Lined up the figures on Units sold & gifted and On consignment so they sit level, instead of one dropping below its neighbour because its title wraps to two lines | (this PR) |
| 2026-10-25 | visual | Phone All Books — book cards | Made each book card an inked slab with the bold outline, square corner and offset shadow (a wider colour stripe still names the book), instead of a pale hairline box with a soft corner matching nothing around it | (this PR) |
| 2026-10-25 | visual | Phone Stripe payments — filter box | Kept "Dismiss all shown" on one line instead of folding to two cramped lines, and made the "Group identical" label a readable size beside its tick-box | (this PR) |
| 2026-10-25 | visual | Phone Payments — payment settings | Made the Stripe key box and the three settings cards (automatic recording, short codes, notify me) inked slabs with the bold outline and offset shadow, and gave the key box proper padding so its long hint no longer runs off the edge | (this PR) |
| 2026-10-25 | visual | Phone Settings — Book Catalog rows | Made each book in the Book Catalog an inked slab with the bold outline, square corner and offset shadow, instead of a pale hairline box with a soft corner matching nothing around it | (this PR) |
| 2026-10-25 | visual | Phone Website orders — Storage check | Made each book in the Storage check lead with its name in bold and the reason sit smaller and softer beneath, instead of the name and the sentence under it reading as one same-size block | (this PR) |
| 2026-10-25 | visual | Phone Expenses — receipt column | Dropped the repeated "Receipt" caps label above the "No receipt" tag and "+ Receipt" button, and gave the tag the square corner of other tags, so each expense card is a line shorter and the tag leads | (this PR) |
| 2026-10-25 | visual | Phone Audience — buyer cards | Put +List, Unsubscribe and Details on one row at the foot of each buyer card instead of two rows, so every card is about a quarter shorter and more buyers show per screen | (this PR) |
| 2026-10-25 | visual | Phone bottom bar | Made the four icons in the bottom bar sit in same-height boxes so the Sell label no longer rides a few pixels above Home, Manual entry and More | (this PR) |
| 2026-10-25 | visual | Phone Help — audience switch | Made the "For artists / For the publisher" switch run the full width in two equal halves, like the search box and topic tiles under it, instead of stopping two-thirds across | (this PR) |
| 2026-10-25 | visual | Phone Tax Centre — receipt buttons and Cash Flow head | Made Camera and AI Scan share the card width in two equal halves instead of two stubs on the left, and set the Cash Flow Summary title in capital display lettering with a square currency tag | (this PR) |
| 2026-10-25 | visual | Phone Dashboard — pending reimbursement buttons | Gave the two-line "Ask author to add payment link" button even line spacing, roomier top and bottom, and an even split of its words, instead of two cramped lines with one stranded word | (this PR) |
| 2026-10-25 | visual | Phone Customers — buyers heading | Set the "All Discovered Buyers" heading in the same capital display lettering as the other card titles instead of plain mixed-case text, so the buyer list has a clear entry point | (this PR) |
| 2026-10-25 | visual | Phone header — Website button | Gave the Website button beside the book picker the same firm outline, offset shadow, caps lettering and press-in as the picker, instead of a thin see-through outline that matched nothing beside it | (this PR) |
| 2026-10-25 | behavioural | Phone Order History — search box | Shortened the hint inside the "Find an order" box so it fits on a phone instead of being cut off mid-phrase; the full list of what it searches stays in the line beneath | (this PR) |
| 2026-10-25 | visual | Phone Sell — book tiles | Made the two book tiles in each row the same height with prices on one line, instead of a shorter tile hanging beside a taller one | (this PR) |
| 2026-10-25 | visual | Phone Big Cartel — heading | Put the Disconnected / Connected state beside the heading as a square tag instead of a loose dot and word on a line of its own, so the intro starts a line sooner | (this PR) |
| 2026-10-25 | visual | Phone Dashboard — Expenses owed to artist | Moved the "Artist has not set a payment link yet" line to the left under the expense count, at a readable size, instead of floating alone at the right edge of the banner | (this PR) |
| 2026-10-25 | visual | Phone Manual entry — Channel buttons | Let the last Channel button (Other) run the full width of the row instead of sitting alone beside an empty gap | (this PR) |
| 2026-10-25 | visual | Phone Intelligence — question box | Put the Send arrow inside the question box beside what you type, like a messaging app, instead of a tall empty box with Send on a row of its own, and cleared the dark-mode field's second dark box | (this PR) |
| 2026-10-25 | visual | Phone Expenses — receipt controls | Made the "7 without a receipt" filter a square outlined tag like the other tags instead of a big soft lozenge, and let AI Scan run the full card width like the buttons under it instead of a stub on the left | (this PR) |
| 2026-10-25 | visual | Phone Today — icon stamps | Made the two-letter stamps beside Orders, To-do, Snap a receipt and the workspace rows a readable size instead of tiny 10px lettering | (this PR) |
| 2026-10-25 | visual | Phone Payment QR codes — title | Stopped the page title wrapping with a stray dash at the start of its second line; "All books" now sits as its own quieter line under the title | (this PR) |
| 2026-10-25 | visual | Phone Settings, Big Cartel, Tax Centre — accent-stripe cards | Made the left stripe on these cards a solid red instead of a faded pink smudge and squared the rounded corners, so they match the other inked cards | (this PR) |
| 2026-10-26 | visual | Phone Payments — worklist toolbar | Gave the search box, type and sort drop-downs, currency chips and the frame around them the bold ink outline, and made the chips and "Direct sale" style tags square instead of soft lozenges | (this PR) |
| 2026-10-26 | visual | Phone Consignment — store rows | Moved the "Payment due" tag under each store's name and city so the city line no longer folds onto two lines, and the amount now sits level with the store name | (this PR) |
| 2026-10-26 | visual | Phone Shipping — readiness tag | Made the "10 still needed" / "Ready to quote" tag above Get rates a square inked caps tag like the other tags on a phone, instead of the one soft rounded pill on the screen | (this PR) |
| 2026-10-27 | visual | Phone tick-boxes ("Group identical" and other labelled tick-boxes) | Made tick-boxes on a phone square with the bold ink outline, filled with ink and a tick when on, instead of the browser's soft grey rounded box | (this PR) |
| 2026-10-27 | visual | Phone Order History — figure strip | Lined up the Total printed / Stock on hand / Distributed figures and their captions on one level across the three tiles, instead of the middle figure sitting lower than its neighbours | (this PR) |
| 2026-10-27 | visual | Phone Dashboard — expenses owed to artist | Made the "Awaiting payment" tag and the category chip on each owed expense square inked tags like the rest of the phone app, instead of two soft rounded lozenges inside a square card | (this PR) |
| 2026-10-27 | visual | Phone Today — book picker row | Faded the right edge of the row of book buttons while more books sit off-screen, so a half-cut-off book reads as "swipe for more" | (this PR) |
| 2026-10-27 | visual | Phone Website — Storage check tag | Put the "Needs a look" / "All good" tag on its own line above the Storage check sentence with a gap, instead of the tag butting against the first words and the sentence wrapping under it | (this PR) |
| 2026-10-27 | visual | Phone All Books — combined sales by channel | Gave the combined revenue card the same bold outline and hard shadow as the per-book cards under it, and made its "TOP" tag a readable square inked tag instead of a tiny pale lozenge | (this PR) |

| 2026-10-27 | visual | Phone Shipping — key box and destination picker | Gave the Shippo key box and the "Load destination from" picker the same bold ink outline as the fields under them, instead of faint beige hairline boxes | (this PR) |
| 2026-10-27 | visual | Phone on/off switches (Stripe payments, payment methods, Big Cartel automation) | Made the on/off switches square inked slots with a square ink knob and a red fill when on, instead of soft rounded pills with a faint outline | (this PR) |
| 2026-10-27 | visual | Phone Manual entry — Required tag and order total | Made the "Required" tag a square inked caps tag and the order-total box an inked slab with the offset shadow (and a square "In stock" tag), instead of a pink lozenge and a pale hairline box that were the only soft shapes in the form | (this PR) |
---
| 2026-10-27 | visual | Phone primary buttons (+ Add store, Set payment link and others) | Gave the book-coloured buttons the same bold ink outline as the buttons beside them, instead of being the only button on the screen with no dark edge | (this PR) |
| 2026-10-27 | visual | Phone Stripe payments — figures | Gave the second row of figures (Reconciled, Total) room under the Need review row so its rule no longer sits on top of the caption above | (this PR) |

## Considered and rejected

Dead ends and settled calls. Check this before proposing anything — an idea here has already been
looked at, and re-proposing it costs a run.

| Idea | Ruling |
| :-- | :-- |
| View Transitions on tab and book switching | **Rejected.** Shipped in PR #128, reverted in #129 seven minutes later. `withViewTransition()` in `src/lib/motion.js` stays deliberately unwired. A narrow single-widget use may be fine; navigation is settled. See `.agents/UX_PATTERNS.md` §1. |
| Migrating the palette to `oklch()` | **Not now.** Worth it only alongside a full palette migration — mixing colour spaces piecemeal makes the tokens harder to reason about, not easier. See `.agents/UX_PATTERNS.md` §8. |
| Raising `.btn` to a 44px minimum height | **Rejected.** Deliberately ~33px; raising it reflows every screen and the density is wanted. Use `.sys-target` on individual controls that genuinely need a full target. See `.agents/UX_PATTERNS.md` → Decisions on record. |
| CSS anchor positioning for dropdowns and tooltips | **Not yet.** The right model, but support is still Chromium-led. Revisit later. See `.agents/UX_PATTERNS.md` §8. |
| Scroll-driven animations | **Rejected.** This is a dense financial tool; scroll-jacking hurts more than it delights. See `.agents/UX_PATTERNS.md` §8. |
| 2026-10-13 | behavioural | Shipping (phone) | Sender address folds to one line once saved; pricing options fold under More options; selects clear their arrow; batch button and chips get solid outlines | pending |
| 2026-10-13 | behavioural | Phone polish round 4 | Help is a plain list; Backups uses plain words with one note under each backup button; Website figures line up and Apply all explains itself; Open Call shows Add and Import once; Big Cartel fields have hints; store picker, accent swatches, Book Catalog, transfer and shipping preset tidied | pending |
| 2026-10-13 | behavioural | Bottom menu (phone, author view) | When the bottom menu has more tabs than fit, its right edge fades so it reads as "swipe for more"; the fade disappears at the end of the strip | pending |
| 2026-10-23 | visual | Phone Open Call | Made the project card and contributor list inked slabs with the offset shadow, put the project buttons on one full-width row, and gave search and sort the full width with even padding instead of half-width boxes with dead space | pending |
| 2026-10-23 | behavioural | Phone Tax Centre — links | Made the expense-category links and the subscription "charges logged" / "Adjust price" links a full fingertip tall (were 14–16px) without making any row taller, and the All/Active tabs 44px | pending |
| 2026-10-23 | visual | Phone Backups, Google Sheet, Big Cartel, Web Analytics | Gave the setup and status cards on a phone the same bold outline and offset shadow as every other card, and made the Connected / Not Connected badge a square tag instead of a soft pill | pending |
| 2026-10-23 | visual | Phone All Books — consignment accounts | Made each account a compact card: the book leads with its status beside it, the store sits under as one line, Returned and Outstanding share a row, and the book and store names are a full fingertip tall (were 14–16px); the screen is about 740px shorter | pending |
| 2026-10-23 | visual | Phone Shipping — order tick-boxes | Gave the tick-box beside each order in the shipping ledger (and Select all) a full fingertip-sized tap area around the same small box, without making any row taller | pending |
| 2026-10-24 | visual | Phone Dashboard — More metrics | Made the "More metrics" fold-out match the inked tiles above it (bold outline, offset shadow), with a +/− marker and a full fingertip-tall row | pending |
| 2026-10-25 | visual | Phone Consignment — store cards | Gave the "On shelf" figure strip on each store card wider room so its caption no longer touches the Owed box beside it, and trimmed Sent and Sold, which only hold a short number | (this PR) |
| 2026-10-26 | visual | Phone To-do — count tags | Made the "23 to do" total and each group's count square inked tags like the other tags on a phone, instead of soft rounded lozenges | (this PR) |
| 2026-10-26 | visual | Phone forms — Expenses, Manual Order Entry and every other form | Gave the text boxes and drop-downs on a phone the same bold ink outline as the cards and buttons around them, instead of a faint grey hairline | (this PR) |
| 2026-10-26 | visual | Phone approval banner ("1 sale to approve", every screen) | Made the yellow "sale to approve" notice an inked slab with the bold outline, offset shadow and amber edge stripe, instead of a pale hairline box matching nothing around it | (this PR) |
| 2026-10-26 | visual | Phone Website — status tags | Made the Checking / Needs a look / Connected tags on the Website screen square outlined tags at a readable size instead of tiny pale lozenges | (this PR) |
| 2026-10-26 | visual | Phone Settings — Test Book Catalog tag | Made the "Isolated test sandbox" tag a square inked caps tag like the other tags on a phone, instead of a pale hairline chip | (this PR) |
| 2026-10-26 | visual | Phone Order History — edit pencil | Gave the pencil on each order card the same bold ink outline as the Approve and Ship buttons instead of a faint beige square that looked switched off | (this PR) |
| 2026-10-26 | visual | Phone Intelligence — quick asks | Made the four starter questions on the Intelligence screen white slabs with the bold ink outline and a full fingertip height, instead of faint grey boxes | (this PR) |
| 2026-10-26 | visual | Phone Dashboard — Author Submissions card | Set the "Author Submissions" title in the same capital display lettering as the other card titles and made the "Pending" tag a square inked tag instead of a soft rounded lozenge | (this PR) |
| 2026-10-26 | visual | Phone All Books — status tags | Made the "Paid for itself", "Low" and "Selling" tags on each book (and the same tags on the Stores list) square inked tags with the bold outline instead of soft hairline lozenges | (this PR) |
| 2026-10-26 | visual | Phone Tax Centre — card titles | Set "Pending & To Confirm", "Recurring Subscriptions" and "Receipts & Proof of Payment" in the same bold capital lettering as the other card titles instead of a thin caption-weight line | (this PR) |
| 2026-10-26 | visual | Phone Order History — heading | Dropped the second big "Order history" title stacked under "Full order history" so the screen has one title and the first order and the Import button sit about 80px higher | (this PR) |
| 2026-10-26 | visual | Phone Customers — buyer card buttons | Gave the + List, Unsubscribe and Details buttons on each buyer card room for their own words, so "Unsubscribe" no longer touches its border | (this PR) |
| 2026-10-26 | visual | Phone ledger lists — record cards | Squared the corners on the cards that make up every phone list (expenses, orders, consignment, owed-to-artist), so they match the square inked cards around them instead of being the one slightly rounded shape | (this PR) |
| 2026-10-27 | visual | Phone Settings — Book Catalog | Gave the Remove button beside each book a solid red outline like Edit has, instead of a faint pink hairline that looked switched off | (this PR) |
| 2026-10-27 | visual | Phone Today — "13 open" tag | Made the "13 open" tag on the To-do card a square inked caps tag like the other tags on a phone, instead of the one soft rounded lozenge on the screen | (this PR) |
| 2026-10-27 | visual | Phone Expenses — "Log an expense" heading | Stepped "Log an expense" down to a small caps label with a rule running to the edge, so "Project expenses" is the one big title instead of two near-equal headlines stacked | (this PR) |
