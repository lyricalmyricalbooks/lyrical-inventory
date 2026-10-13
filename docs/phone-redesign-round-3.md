# Phone redesign — round 3 backlog

Ranked findings from five Haiku auditors who reviewed every screen and the main pop-ups as phone
screenshots (375px, light and dark), taken with `npm run shots` on 2026-10-13. Payments and
Consignment were redesigned separately in this round and are not listed. Duplicate findings
from different auditors are merged.

**Severity:** broken = the owner can't read or reach something · ugly = works but looks wrong or
wastes the screen · polish = small consistency fixes. **Kind:** redesign = the phone layout needs
restructuring, not just spacing.

Before picking one up: re-run `npm run shots -- --only=<tab>` — the line numbers below are a
snapshot and drift.

### 1. To-do (tab-todo) — broken, redesign
**Status:** Done (batch F)  
**Problem:** Each to-do item squeezes its explanation into a strip about a fifth of the card's width, so sentences break one word per line ("A / st / or / e / ow..."). The action button takes the rest of the row. Items with long explanations are close to unreadable on a phone, so the owner cannot tell what needs doing.  
**Fix:** Under the phone breakpoint, let .todo-row wrap or stack: the text (.todo-copy) takes the full card width, and .todo-row-actions drops to its own line beneath it with the .todo-fix button at full row width. Keep the dismiss control in the top corner, as it already is on hover.  
**Evidence:** shots/before/light-375/tab-todo-01.png, tab-todo-02.png, tab-todo-03.png, tab-todo-04.png (also dark-375/tab-todo-01.png, tab-todo-02.png); src/style.css:18802-18815 (.todo-row is a single non-wrapping flex row), src/style.css:18832 (.todo-copy flex:1 with no minimum width), src/style.css:18846 (.todo-row-actions flex:none); no phone-width override for .todo-row in src/styles/phone.css

### 2. Add new book (sheet, Identity step) — broken, redesign
**Status:** Done — the fold keeps gold and not-yet-shown buttons in place  
**Problem:** The save button is hidden on a phone. The footer shows only Cancel and a "More actions" button. "Next" and "Save Book" are folded behind that toggle, so the main action of the sheet is not visible until the owner finds the toggle. The Back button is also counted in the fold even though it is hidden on this step.  
**Fix:** Exempt the primary action from the fold: keep the gold Save Book, or the Next button on steps 1 and 2, pinned in view. Fold only secondary actions such as Back, and stop counting display:none buttons toward the limit. Alternatively, stack Cancel above a full-width primary button in the footer.  
**Evidence:** shots/before/light-375/modal-add-book-01.png and modal-add-book-02.png (footer shows only CANCEL and MORE ACTIONS); index.html:6053-6063 (footer holds Cancel, Back, Next and Save Book in that order); src/lib/phone-layout.js:111 (FOLD_AFTER = 2) and 113-131 (every footer button after the second is moved behind More actions)

### 3. All Books overview (Combined consignment summary block) — broken, redesign
**Status:** Done (batch F)  
**Problem:** The filter box, the All / Active / Settled tabs and the "Group by book" button run past the right edge of their card, so their right ends are cut off. A large empty gap sits between the filter and the tabs. The block reads as broken on a phone.  
**Fix:** At phone width, make the filter tabs wrap or scroll inside their own bounded box with a visible edge, and set the search box to full width with no minimum width. Let "Group by book" take its own full row. Remove the empty gap by not reserving table height before data arrives.  
**Evidence:** shots/before/light-375/tab-all-overview-05.png (filter field and tabs cut at the right edge, blank gap below the filter); index.html:894-906 (toolbar markup); src/style.css:6259-6261 (.consignment-summary-panel has overflow:hidden, so anything too wide is clipped silently); src/style.css:6311 (.con-toolbar-search has a 220px basis and 180px minimum); src/style.css:6326 and 6481 (.con-toolbar-filters is inline-flex with no wrap)

### 4. Dashboard (Sales by channel table) — broken, redesign
**Status:** Done (batch F)  
**Problem:** The Revenue column, the most important figure in the table, is cut off at the right edge of the screen. The table simply stops, with no sign that it scrolls sideways, so the owner may never see the total. Five columns is too many for a phone.  
**Fix:** On phone, show each channel as a stacked row instead of a five-column grid: channel name and revenue on one line, transactions and units underneath, with the share as a small figure. Reuse the legend pattern already used for the All Books channel breakdown (src/main.js:6261) so the two screens match.  
**Evidence:** shots/before/light-375/tab-dashboard-04.png (REVENUE cut to "REVENU" and the amounts clipped at the edge); index.html:1143 (table with Channel, Transactions, Units, Revenue and Share columns); src/style.css:2174 (.tbl-wrap uses overflow-x:auto, so it scrolls silently with no cue); src/style.css:5392 (.ch-mix-share-col)

### 5. tab-taxcenter — broken, redesign
**Status:** Done (batch F)  
**Problem:** The Expense Categorization table is the number that matters at tax time, but on a phone its last column (Total Deductible, CAD) is cut off at the right edge. The table also runs edge to edge while everything around it has a margin, and nothing shows that more columns are hidden to the right.  
**Fix:** Add an entry for tc-category-body to the RECORDS map in src/lib/phone-layout.js with the category name as the lead and Txns and Total Deductible as the summary fields, so each category becomes a stacked card with the deductible total fully visible. Keep the table for wider screens.  
**Evidence:** shots/before/light-375/tab-taxcenter-06.png; index.html:2950-2954 (tbl-wrap around tc-cat-tbl); style.css:2174 (.tbl-wrap overflow-x:auto, so the money column scrolls out of view); src/lib/phone-layout.js RECORDS map has no entry for tc-category-body, so the table never becomes stacked cards on a phone

### 6. Payment QR codes (QR codes tab) — broken, redesign
**Status:** Done (round 4: QR codes, Customers and Intelligence phone pass)  
**Problem:** Each book shows an empty box that says no Stripe link is set, plus two action buttons that look washed out and are hard to read. There is no button on the card to set the link, so the owner has to leave for the book editor. Three books make a long scroll of mostly empty boxes, and in night mode the empty box is a stark white block. (This is the QR codes tab, not the Payments screen.)  
**Fix:** When a book has no link, replace the placeholder with one full-width 'Set payment link' .btn.gold that opens the book editor, and show each card as a compact row (title, price, status pill) instead of a tall card. Give the empty placeholder a --surface-inset fill so night mode is not white.  
**Evidence:** shots/before/light-375/tab-qrcodes-01.png, tab-qrcodes-02.png, tab-qrcodes-03.png; shots/before/dark-375/tab-qrcodes-01.png; src/main.js:2692 (empty placeholder text with no action); src/main.js:2704-2705 (Copy link and Download are disabled, so they take the faded disabled style)

### 7. Import order history (book sales import pop-up) — broken, redesign
**Status:** Done (batch F)  
**Problem:** The import preview is an eight-column table squeezed into a phone pop-up, so the owner sees only a cut-off strip of column names and no rows, and the strip scrolls sideways. The 'Import 0 orders' button is still active even though there is nothing to import, so pressing it does nothing useful.  
**Fix:** Disable the confirm button while the count is 0, with a one-line hint such as 'Choose a file to see its orders here'. On phones, show each parsed order as a compact card (order number, date, total, status) rather than the table, reusing the phone-records card pattern already in src/styles/phone.css.  
**Evidence:** shots/before/light-375/modal-import-01.png and shots/before/dark-375/modal-import-01.png; index.html:5709 (eight table columns); index.html:5719 (the confirm button is never disabled and shows a count of 0)

### 8. tab-expenses — broken, polish
**Status:** Done (round 4) — removing asks first, naming the expense and amount  
**Problem:** Removing an expense is a single tiny, unlabeled X about the size of a fingernail. One tap deletes the expense straight away with no 'are you sure?' step, and the same tiny X sits on every expense card, including the Tax Center's own expense list.  
**Fix:** Replace the bare X with a labeled Remove control in the card's action row, sized to the 44px target class (.sys-target), styled as a destructive outline button. Put a confirm step in front of voidExpense using the modal shell, with Cancel and a destructive Remove button on the far left as the modal-footer rule describes.  
**Evidence:** shots/before/light-375/tab-expenses-03.png and tab-expenses-04.png; src/features/receipts.js:7332 (edit-btn with the X, onclick calls voidExpense directly, aria-label Remove); src/features/receipts.js:7184-7190 (voidExpense filters the expense out, saves and shows a toast with no confirmation); style.css:4391 (.edit-btn is 22x22); the phone report lists the X buttons at 22x22 on tab-expenses and tab-taxcenter

### 9. tab-history — broken, polish
**Status:** Done (batch F)  
**Problem:** The order search box at the top of Order History turns into a large empty block on a phone, so the first screen is mostly blank before any order appears. A 'Clear search' button also sits in that box even when nothing has been searched, so it looks like something to press when there is nothing to clear.  
**Fix:** Remove the fixed 260px basis from the search field when the bar stacks so it sizes to its content, and add a rule so hidden buttons stay hidden even when a button class sets display, e.g. .ledger-filter-row > .btn[hidden]{display:none}.  
**Evidence:** shots/before/light-375/tab-history-01.png (empty block between the search box and Clear search, and Clear search visible with no search typed). src/style.css:5287-5289 (search field has a 260px flex basis, which becomes a 260px height once the bar stacks in the narrow container rule at src/style.css:5357-5366). index.html:1903 (Clear search starts hidden, but the display rule at src/style.css:5290 overrides the hidden state).

### 10. All Books overview (overall length) — ugly, redesign
**Status:** Open  
**Problem:** The All Books screen is roughly 8,000 px tall on a phone. It has seven book cards, each with four counters and a Manage button, and then a full channel breakdown repeated for every book with its own bars and legend. The owner scrolls through about six screens before reaching the consignment summary and the filter, which sit near the bottom.  
**Fix:** Fold each book's channel breakdown behind a "Show channels" control, using the same collapsed pattern the Dashboard already uses for its Show sections. Move the consignment filter bar above the book cards so the first screen shows the search and the summary.  
**Evidence:** shots/before/light-375/tab-all-overview-01.png through tab-all-overview-06.png (page height 7923 px in shots/before/report.json); index.html:883 (Combined sales by channel section); src/main.js:6261 (per-book channel legend rendered for each book)

### 11. Intelligence (tab-intel) — ugly, redesign
**Status:** Done (round 4: QR codes, Customers and Intelligence phone pass)  
**Problem:** Before the owner can type a question, they scroll past a data-privacy notice, a consent box with an "I understand" button, a blue setup notice, and three quick-ask buttons. The setup notice says to add an AI key in Tax Centre, but it is plain text with no button to get there, and the message box below is greyed out. The quick-ask buttons also use a different typeface from the rest of the app.  
**Fix:** When no AI key is saved, show the setup notice as one row with a .btn that opens Tax Centre settings. Collapse the consent card once it has been acknowledged. Move the message box above the quick asks, and set the quick-ask buttons to inherit the app font.  
**Evidence:** shots/before/light-375/tab-intel-01.png and tab-intel-02.png (typing box sits about 1,400 px down); shots/before/dark-375/tab-intel-01.png; src/features/intel.js:386 (setup notice is text only); index.html:825-834 (quick-ask rail above the message box); src/style.css:18976-18992 (.intel-rail-btn sets no font-family, so the buttons fall back to the system font)

### 12. Sell tab (point of sale) — ugly, redesign
**Status:** Done (Sell redesign)  
**Problem:** Five rows of controls sit above the first book: the sale/fair toggle, the fair name, the currency box, the sync status and today's total. On a phone, the books the shop actually sells start about halfway down the screen. The fair toggle label also wraps with 'Prep' alone on its second line.  
**Fix:** Combine the fair name and currency into one compact line, move the sync status and today's total into a single slim row, and bring the book grid up directly under the register toggle. Shorten the 'Fair Print Kit & Stall Prep' label so it fits on one line at phone width.  
**Evidence:** shots/before/light-375/tab-pos-01.png (controls at about y 420-880 at 2x; first book tile starts near y 1010). The first book appears roughly 270 CSS px below the controls' start.

### 13. Manual entry (Log an order) — ugly, redesign
**Status:** Done (round 4, Manual entry + Home) — Order # and Notes sit under 'More details' on a phone; Qty, price, Channel and Payment type stay in view  
**Problem:** The Manual entry form is one long column of about nine blocks before the Add order button. Optional fields such as Order number and Notes look as important as required ones, so the phone screen is long to scroll through.  
**Fix:** Move Order # and Notes under a collapsed 'More details' disclosure, using the existing disclosure pattern, and keep Channel, Payment type and the price block visible. Keep the pinned save bar as it is.  
**Evidence:** shots/before/light-375/tab-manual-01.png and tab-manual-02.png (form about 1,330 CSS px tall). index.html:1735-1760 (order form with optional Notes and the channel and payment blocks).

### 14. tab-shipping — ugly, redesign
**Status:** Done — the sender address folds to one line on phone; More options folds the pricing preferences  
**Problem:** The shipping screen is about five phone screens of form before the main 'Compare all rates' button. The sender address (nine boxes) repeats on every visit even though it is ticked as the saved default, then the recipient, parcel and customs boxes stack up. The owner has to scroll a long way before the screen does anything useful.  
**Fix:** Once Save default is ticked, collapse the Origin block to a one-line summary with an Edit control. Move Customs and the packaging buffer behind one 'More details' disclosure, using the same pattern as the existing Chit Chats details row. Keep the Compare button directly under Destination and Parcel.  
**Evidence:** shots/before/light-375/tab-shipping-02.png to tab-shipping-06.png; shots/before/report.json pageHeight 13,819px for tab-shipping; index.html:3833 (Origin block with Save default), index.html:3865 (Destination block), index.html:4066 (Compare button)

### 15. tab-taxcenter — ugly, redesign
**Status:** Done (Tax Centre round 4) — the expense form leads on a phone, the summary follows it, and each empty section folds to one line  
**Problem:** The Tax Center is about 12,400 px tall. The Log Business Expense form, the screen's most-used action, starts after a full Cash Flow summary (three tall cards, six stat tiles and a chart). Then three empty sections (Pending, Recurring, Trips) each show a large dashed box with an icon and a blue button, so a new user scrolls past about two screens before reaching anything to act on.  
**Fix:** Move the Log Business Expense card above the Cash Flow summary, or fold the summary behind a disclosure that keeps its headline net figure visible. Collapse each empty section to one line of text with its single button, rather than a full-height dashed panel.  
**Evidence:** shots/before/light-375/tab-taxcenter-01.png to tab-taxcenter-05.png; index.html:2800 (Log Business Expense section, placed after the summary), index.html:2891 (Pending and To Confirm card), index.html:2902 (Recurring Subscriptions card), index.html:2927 (Trip tracking toggle and empty state)

### 16. tab-expenses — ugly, redesign
**Status:** Done (round 4) — each expense is a compact card: description and amount on top, date and receipt beneath, the rest behind Details. Amount shows in its own currency, since the CAD column exists only for publishers.  
**Problem:** Each expense takes about 375 pixels of phone height. Six stacked label-and-value rows (Date, Receipt, Amount, Amount CAD, Reimbursement, Actions) plus a full-width Details button repeat on every card. The Amount CAD row shows a bare dash on every card. Five expenses mean a long scroll of near-identical boxes.  
**Fix:** Show each expense as one compact row: description in bold, amount in DM Mono on the right, and the receipt state as the existing amber or grey status pill. Drop the Amount CAD field from the summary when there is no separate CAD value, and move date and reimbursement into the expanded Details.  
**Evidence:** shots/before/light-375/tab-expenses-02.png to tab-expenses-05.png; src/lib/phone-layout.js:13 (exp-body summary list includes Amount (CAD), Receipt, Reimbursement and Actions); src/styles/phone.css:461-466 (record card and Details toggle styling)

### 17. tab-history — ugly, redesign
**Status:** Done (History redesign)  
**Problem:** Each order is a tall box with a full-width DETAILS button repeated on every card. Nineteen orders take about six screens of scrolling, and the same outlined button on each card gives the eye nothing to scan by. To find one order, the owner has to scroll past most of the list.  
**Fix:** Show each order as one compact row (order number, channel, amount, date) that opens its details when tapped, with no separate Details button. Fold the three summary tiles into a short collapsible header so the list starts higher on the screen.  
**Evidence:** shots/before/light-375/tab-history-02.png through tab-history-06.png (six screens for 19 orders). src/lib/phone-layout.js:65 (adds a Details button to every order). src/styles/phone.css:466-472 (draws that button as a full-width box with a heavy ink outline and shadow). Note: the report's 22px pencil and arrow targets are enlarged by CSS (src/style.css:4392, an enlarged hit area), so that flag overstates the problem.

### 18. Customers (All discovered buyers) — ugly, redesign
**Status:** Done (round 4: QR codes, Customers and Intelligence phone pass)  
**Problem:** Before the owner sees any buyer or a clear next step, they must scroll past a four-field filter panel and three export buttons. The summary line ends in a dangling 'from —' when there is no source, and the 'Pull buyers from Stripe' button appears twice on the screen. Because the list sits far down the page, the screen feels long and unfinished.  
**Fix:** On phones, fold the filter panel behind one 'Filters (n)' .btn.sm disclosure so the results or the empty state sit directly under the main action. Show the 'from …' clause only when there is at least one source, and hide the top Stripe button while the empty state with its own Stripe button is showing.  
**Evidence:** shots/before/light-375/tab-customers-01.png, tab-customers-02.png, tab-customers-03.png; shots/before/dark-375/tab-customers-01.png; index.html:1477 (top Stripe button); src/features/customers.js:768-772 (the empty state repeats the Stripe button and adds Open checkout); src/features/customers.js:704 and 710 (the source list falls back to an em dash after 'from')

### 19. Add consignment store (choose from existing stores) — ugly, redesign
**Status:** Done (polish sweep round 4) — the quick-select shows each store on one full-width row with 'In book' under the name; the first six are listed and a '+ N more' note points to the dropdown
**Problem:** The quick-select list is a small scrolling box inside the form. Store names wrap onto two lines, the 'In book' tag squeezes onto two lines, and the third store is cut off mid-row with no scroll cue, so the owner has to guess that more stores are below. The dropdown placeholder also runs into its arrow.  
**Fix:** Replace the scrolling chip box with a one-line-per-store list that fits the phone width, or a search field showing a few results. Keep each store name on one line, show 'In book' under the name as a small .chip-status.gray, and make the list's overflow visible with a '+ N more' line or a search.  
**Evidence:** shots/before/light-375/modal-add-store-01.png and shots/before/dark-375/modal-add-store-01.png; src/style.css:3835-3841 (the quick list is capped at 120px and scrolls); src/main.js:12217 ('In book' badge); src/main.js:12197 (dropdown placeholder text)

### 20. Sheets in night mode (title and footer bands, e.g. Add new book, Edit expense, Notifications) — ugly, polish
**Status:** Done (batch F)  
**Problem:** In night mode, the pinned title and footer of every sheet show as a darker box inset from the sheet's edges, so each sheet looks like it has a stuck-on panel. In daytime the same bands blend in, so the problem only appears when the owner switches to night mode.  
**Fix:** In src/styles/theme-dark.css, give .modal-title and .modal-footer the sheet's own surface (var(--surface-card)), and let each band bleed to the sheet's edges by cancelling the sheet's side padding on those two elements. The bands then match the sheet and the header icon is no longer cut at the left edge.  
**Evidence:** shots/before/dark-375/modal-add-book-01.png, modal-edit-expense-01.png and modal-notifications-01.png (title band inset from both edges, with hard corners); src/style.css:4094-4101 (.modal-title background is var(--surface-page)); src/style.css:4109-4118 (.modal-footer background is var(--surface-page)); src/styles/theme-dark.css:576-578 (.theme-dark .modal background is var(--surface-card))

### 21. Edit expense (sheet) — ugly, polish
**Status:** Done (round 4) — "Choose receipt" button with the file name beside it, and the currency select has room for CAD.  
**Problem:** The receipt picker is the browser's default grey "Choose File / No file chosen" box in the system font, placed beside a Riso-styled Camera button, so the two look like they came from different apps. The currency selector (CAD) is squeezed to 70 px and its arrow runs into the letters.  
**Fix:** Hide the native file input and put a .btn labelled "Choose receipt" in its place that opens the file picker, the same way the batch expense sheet's browse link works. Widen the currency selector to match the other inputs in the row so its arrow is clear of the text.  
**Evidence:** shots/before/light-375/modal-edit-expense-01.png and shots/before/dark-375/modal-edit-expense-01.png; index.html:5335 (native file input with inline styling); index.html:5311 (select#edit-exp-cur with max-width:70px)

### 22. Log several expenses at once (sheet, bulk tools row) — ugly, polish
**Status:** Done (round 4) — each bulk control has a caption, the Apply buttons say what they set, and the trip field sits above the bulk bar. Not done: the bulk row still shows on an empty sheet.  
**Problem:** The bulk tools sit between the receipt drop zone and the list of expenses. There are two identical "Apply" buttons with an empty dropdown that has no label, and a date box between them. Nothing explains that the first Apply sets the category for ticked rows and the second sets the date, so the owner has to guess before picking receipts.  
**Fix:** Give each bulk control a short caption above it, such as "Category for all ticked rows" and "Date for all ticked rows", and place its own Apply directly beside it. Show the bulk row only once at least one expense row exists, so the empty sheet opens on the receipt drop zone.  
**Evidence:** shots/before/light-375/modal-batch-expense-01.png and modal-batch-expense-02.png (empty unlabelled dropdown, two Apply buttons flanking the date box); index.html:2371-2379 (Select all, Select none, Deselect duplicates, and two buttons both labelled Apply)

### 23. Add new book (sheet, Project Accent Theme swatches) — ugly, polish
**Status:** Done (polish sweep round 4) — one swatch per colour (the second red and second purple are dropped; stored hex values are unchanged), and the chosen colour's name shows under the row. Not verified: the circles look cut at the bottom in the 375px shot; this appears to be the scroll edge of the form, not a clipping bug
**Problem:** The colour choices are near-duplicates: two reds and two purples. They are told apart only by a hover tooltip, so the owner cannot pick reliably by sight. The circles also look sliced off along their bottom edge in the screenshot, and several colours (bright violet, sky blue, orange) are outside the app's printed-ink palette.  
**Fix:** Keep one swatch per distinct colour and drop the second red and the second purple. Use Riso ink tokens rather than the extra bright hues. Show the chosen colour's name as a caption under the row, and make sure the swatch container does not clip the circles.  
**Evidence:** shots/before/light-375/modal-add-book-01.png and modal-add-book-02.png (swatch row cut flat along the bottom); index.html:5884-5892 (eight swatch buttons; two use var(--gold)/var(--rose) reds and two use var(--violet) purples); src/style.css:10149-10160 (swatches are 28 px circles that wrap); src/styles/phone.css:757 (phone size 40 px)

### 24. Today (home) tab, night mode — ugly, polish
**Status:** Done (round 4, Manual entry + Home) — the night Sell card has a deeper clay fill, and the upload strip is square and inked  
**Problem:** In night mode the big red SELL card turns a pale salmon, and its small caption 'Open your register' is faint and hard to read against it. The main action looks washed out compared with the daytime version.  
**Fix:** In the dark theme, give the Sell card a deeper ink-red fill (for example var(--gold-text) or a darker riso red) instead of the pale salmon token, keeping the light text at 4.5 to 1 or better.  
**Evidence:** shots/before/dark-375/tab-today-01.png (card at about y 760-1015 at 2x). Sampled caption contrast is about 2.5 to 1 from the screenshot, versus about 3 to 1 in daytime; the 4.5 to 1 target applies to small text. src/styles/theme-dark.css:79 (dark --gold #D97757) used by src/styles/phone.css:427 (#tab-today .today-card-ink uses var(--gold) with var(--on-accent) text).

### 25. Shipping label (pop-up) — ugly, polish
**Status:** Done (batch F)  
**Problem:** The Shipping label form shows a stray warning triangle under the Country box even when the country is fine. There are no words beside it, so it looks like an error the owner has to fix.  
**Fix:** Add .field-warn[hidden]{display:none} next to the .field-warn rule at src/style.css:4221 so the hidden attribute is respected. This also fixes any other field warnings that rely on hidden.  
**Evidence:** shots/before/light-375/modal-shipping-label-02.png (triangle at about y 1395-1415 under 'Canada'). src/style.css:4221-4230 (.field-warn sets display:flex, which overrides the browser's hidden attribute, and .field-warn::before adds the triangle). index.html:5681 (sl-country-hint has the hidden attribute). src/features/shipping.js:483-493 (hint text is cleared while hidden).

### 26. tab-taxcenter — ugly, polish
**Status:** Done (Tax Centre round 4) — the reason AI Scan is greyed out now shows as text under the button  
**Problem:** The AI Scan button on the expense form looks washed out and cannot be pressed until a receipt is added. The only explanation ('Select or capture a receipt first') is a hover tooltip, and a phone never shows that, so the owner sees a faded button with no reason why.  
**Fix:** Keep the button looking enabled and show the reason as visible helper text under the button, reusing the existing small helper-text line that reads 'Storage: Cloud'. Do not rely on the title attribute for the explanation.  
**Evidence:** shots/before/light-375/tab-taxcenter-03.png (pale AI Scan beside the blue Camera button); index.html:2857 (button is disabled and its reason lives only in the title attribute); style.css:2524 (.btn:disabled sets opacity .35)

### 27. tab-taxcenter — ugly, polish
**Status:** Done (Tax Centre round 4) — flat fills, an undistorted year label, and the income and expense figures printed beside each bar  
**Problem:** The Income vs Expenses chart squashes its year label into a thin sliver because the drawing is stretched to fit. Its bars use shiny top-to-bottom gradients rather than the flat ink fills used across the app, and it has no value scale, so the two bars give the owner no number to read.  
**Fix:** Replace the two gradients with flat fills from the existing green and red tokens. Remove preserveAspectRatio none, or draw the year label as HTML so it keeps its shape. Print the income and expense totals as numbers beside each bar.  
**Evidence:** shots/before/light-375/tab-taxcenter-02.png; src/features/taxcentre.js:3866 (svg uses preserveAspectRatio none, which distorts the label); src/features/taxcentre.js:3868-3875 (income-grad and expense-grad linear gradients)

### 28. tab-history — ugly, polish
**Status:** Done (History redesign; round 4) — Gratuity tag is now the neutral channel tag  
**Problem:** Red is used for normal things. Every Store sale gets a red tag, and the Stock on Hand number is in the same red as an alert. The app's own colour rule reserves red for owed, voided or error, so a healthy store sale looks like a problem to the owner.  
**Fix:** Give Store a neutral or blue tag, keep red for real problems, and show the Stock on Hand figure in the normal ink with only the accent bar. Map the Website and Direct tags into the four existing status colours.  
**Evidence:** shots/before/light-375/tab-history-01.png (Stock on Hand 68 in red). shots/before/light-375/tab-history-02.png (STORE tags in red). src/main.js:9419-9427 (formatChannelBadge sends Store to the gold tone, which is the red ink). src/style.css:374-378 (.ch-badge.ch-store uses the red ink). src/style.css:223-225 (highlight accent on the Stock on Hand tile). Website (violet) and Direct (slate) tags use hues outside the four status colours (src/style.css:362-366 and 380-384).

### 29. tab-history — ugly, polish
**Status:** Done (History redesign)  
**Problem:** On each order card the right-hand column (order number, total, and the edit or ship button) starts at a different horizontal position from card to card. Amounts and order numbers don't line up as you scroll, so the eye has to re-find the column on every card.  
**Fix:** Give the right-hand column a fixed width that fits the largest total, so amounts and order numbers sit on one vertical line down the list.  
**Evidence:** shots/before/light-375/tab-history-01.png and tab-history-02.png (the order number column starts at different positions on the Store, Book Fair, Direct and Website cards). src/style.css:20091 (the card grid uses an auto-sized right column, so its width changes with each card's content).

### 30. tab-bigcartel — ugly, polish
**Status:** Done (polish sweep round 4) — the password box says 'Paste your token here', each field has a one-line hint, and the two buttons stack full width
**Problem:** The Big Cartel setup form is confusing before anything is typed. The password box shows a row of dots, which looks like a saved password even when none is saved. There is no line saying where to find the subdomain, username or token. The two buttons share one row, so 'Test Connection' wraps onto two lines.  
**Fix:** Use a plain text placeholder such as 'Paste your token here' in the password box, add a short line under the fields saying where each value is found in the Big Cartel dashboard, and stack the two buttons full-width so neither wraps.  
**Evidence:** shots/before/light-375/tab-bigcartel-01.png (dots in the password box; Test Connection on two lines). index.html:3616 (password placeholder is a row of dots). index.html:3605-3622 (three fields and two buttons with no help text). src/styles/phone.css:105-106 (the buttons share the row and grow to fill it).

### 31. tab-website — ugly, polish
**Status:** Done (polish sweep round 4) — each label reserves three lines so the figures line up, and 'Website orders in your books' is now 'Website orders'
**Problem:** The four status boxes at the top of the Website tab don't line up. Labels such as 'Website orders in your books' wrap onto three lines, so the numbers sit at different heights from box to box and the row looks ragged.  
**Fix:** Give each label a fixed-height area, or move the value above the label, so every number sits on the same line. Shorten the longest labels too.  
**Evidence:** shots/before/light-375/tab-website-01.png (values sit at different heights across the four boxes). src/styles/website-link.css:86-101 (labels have no fixed height, so the value moves with the label). src/features/website-link.js:851-854 (the label text).

### 32. tab-website — ugly, polish
**Status:** Done (polish sweep round 4) — the empty box no longer repeats Scan Gmail, and a reason line sits under Apply all new orders while it is greyed out
**Problem:** The Website tab shows two identical 'Scan Gmail' buttons on one screen. The main 'Apply all new orders' button sits greyed out at the bottom with no line saying what it is waiting for, so it reads as broken.  
**Fix:** Keep one Scan Gmail button at the top and point the empty-state box to it. Show a one-line reason under Apply all new orders, such as 'Scan Gmail first to find new orders.'  
**Evidence:** shots/before/light-375/tab-website-02.png (full-width Scan Gmail near the top, a second one in the empty-state box, and the disabled apply button at the bottom). index.html:1295 (apply button is disabled with no explanation beside it).

### 33. tab-webanalytics — ugly, polish
**Status:** Done (polish sweep round 4) — shorter intro, a flat line icon instead of the emoji, a palette surface for the link panel, and tighter padding on phone
**Problem:** The Web Analytics setup screen puts a large hero (big chart icon, long title, paragraph) across the first screen, so the one box the owner needs, the dashboard link field, starts about three-quarters of the way down. Its panel is tinted pink with a colour that is not part of the app's palette, and it turns muddy brown at night.  
**Fix:** Shorten the intro to a line or two and cut the top padding so the link field sits near the top. Use a palette surface token in place of the pink tint, and swap the full-colour emoji for a flat icon in the app's ink style.  
**Evidence:** shots/before/light-375/tab-webanalytics-01.png (link field near the bottom of the first screen). shots/before/dark-375/tab-webanalytics-01.png (panel tinted reddish-brown). index.html:4588 (48px emoji). index.html:4589 (large heading styled inline). index.html:4592 (hard-coded rgba tint instead of a palette token). index.html:4598 (button height set inline).

### 34. Open call (contributors) — ugly, polish
**Status:** Done (polish sweep round 4) — Add and Import show once (in the empty box while the list is empty), and Check replies becomes a line of text. Not reproduced: the search placeholder is not cut off at 375px, so it was left as 'Search contributors'
**Problem:** The same two actions, 'Add contributors' and 'Import from Gmail', appear in the top card and again in the empty box directly below. 'Check replies' is faded and unexplained until a contributor exists, and in night mode it nearly disappears. The search placeholder is cut off mid-word, so the owner cannot read what the search covers.  
**Fix:** Show the add and import buttons once: keep them in the empty box and leave them out of the top card while the list is empty. Shorten the search placeholder to 'Search name or email…' and replace the faded Check replies button with a line of plain text such as 'Add a contributor to check for replies'.  
**Evidence:** shots/before/light-375/tab-opencall-01.png and tab-opencall-02.png; shots/before/dark-375/tab-opencall-01.png; src/features/opencall.js:1032-1034 (top-card actions; Check replies is disabled when there are no contributors); src/features/opencall.js:1231-1232 (the empty state repeats both actions); src/features/opencall.js:947 (placeholder text too long for the field)

### 35. Help and questions — ugly, polish
**Status:** Done (polish sweep round 4) — phone rows use a hairline border and no shadow; the category tiles keep their heavy outline
**Problem:** Each of the 21 questions is its own box with a heavy black outline and a hard shadow, so the list reads like twenty-one buttons stacked on top of each other. Heavy outlines are meant for big objects, and list rows are supposed to use a thin line, so the page is loud and hard to scan.  
**Fix:** Change .help-q to the hairline border (var(--stroke-hair) in var(--border-default)) and drop its shadow, keeping the 44px summary target. Keep the heavy 2px outline on the category tiles, which are the real buttons.  
**Evidence:** shots/before/light-375/tab-help-01.png through tab-help-04.png; shots/before/dark-375/tab-help-02.png; src/style.css:21003-21004 (.help-q has a 2px ink border and a shadow around each 44px summary row)

### 36. Backups — ugly, polish
**Status:** Done (polish sweep round 4) — plain wording (no Firestore or Publisher mode), a one-line note under each backup button, the heading in the content colour, and 'How restoring works' folded. Two backup buttons remain, each explained
**Problem:** The page uses words an owner will not know, such as 'Firestore' and 'Publisher mode'. It has two backup buttons, 'Create backup now' and 'Save backup to my computer', with no line explaining how they differ. The section heading is printed in the red used for errors, and the restore section opens with several paragraphs before any button.  
**Fix:** Rewrite the intro lines in plain words (for example 'The app keeps an automatic daily copy online' and 'Save a copy to your computer'). Put one short sentence under each backup button saying what it does, set the section heading in the content colour instead of red, and move the restore detail behind a 'How restoring works' disclosure.  
**Evidence:** shots/before/light-375/tab-backups-01.png through tab-backups-04.png; index.html:4946 (heading in the gold-text red); index.html:4947 and 4960 ('Firestore' and 'Publisher mode' copy); index.html:4950 ('Create backup now'); index.html:4986 ('Save backup to my computer')

### 37. Sheets settings (Book Catalog and Sandbox) — ugly, polish
**Status:** Done (polish sweep round 4) — catalogue cards left-aligned on phone, and the Sandbox empty state has '+ Add a test book' and a neutral tag. Test books are matched on the exact title or ID 'test'
**Problem:** In the Book Catalog, each title starts at a slightly different left position because its dot-and-name block sits centred in the card, so the list looks uneven. The Sandbox empty state explains what would appear there but offers no button to add a test book. Its 'Isolated test sandbox' tag uses a lilac colour that is not part of the day or night palette.  
**Fix:** Left-align the catalog card contents, with a fixed-width dot column before the title, so the names line up. Add a next-step button to the Sandbox empty state that leads to adding a test book. Replace the lilac tag with an existing .chip-status tone such as .gray.  
**Evidence:** shots/before/light-375/tab-sheets-01.png and tab-sheets-02.png; shots/before/dark-375/tab-sheets-02.png; src/style.css:6894-6897 (.catalog-card centres its contents; the exact cause of the offset was not fully traced); src/main.js:2432-2441 (empty-state text with no action button); index.html:4694 (inline lilac tag)

### 38. Today (home) tab — polish, polish
**Status:** Open  
**Problem:** The home screen mixes colourful emoji pictures (shopping bag, check mark, receipt, card, people) with plain text symbols (grid, lines). The emoji look like they belong to a different app next to the flat ink style.  
**Fix:** Replace the emoji on the tiles and workspace rows with single-colour line icons drawn in the current text colour at the existing icon size, so the set looks uniform in both themes.  
**Evidence:** shots/before/light-375/tab-today-01.png (tile icons at about y 790-840 and 1070-1130). shots/before/light-375/tab-today-02.png (workspace rows at about y 870-1350). index.html:1323, 1329, 1337 (tile icons), index.html:1346-1347 (workspace row icons).

### 39. Transfer stock (pop-up) — polish, polish
**Status:** Done (polish sweep round 4) — the empty preview box is hidden, and the label reads 'On hand'
**Problem:** The Transfer stock form shows an empty outlined box between the note field and the buttons until a quantity is entered. It looks like a missing message. The 'Publisher On-Hand' label also breaks at its hyphen onto two lines.  
**Fix:** Hide the preview box while it is empty by adding .st-preview-box:empty{display:none} next to the rule at src/style.css:2396. Shorten the 'Publisher on-hand' label to 'On hand' so it fits on one line.  
**Evidence:** shots/before/light-375/modal-stock-transfer-01.png (empty box at about y 1380-1425). index.html:6697 (empty st-preview-box is always rendered). src/style.css:2396 (.st-preview-box styling).

### 40. tab-shipping — polish, polish
**Status:** Done (polish sweep round 4) — Save to Preset sits on its own line under the preset dropdown, and the Duties option reads 'Auto'
**Problem:** Small layout collisions. The Duties dropdown cuts its selected text off with an ellipsis ('Auto, DDP to the US, DDU elsewh...') and the arrow sits on the last letters. The Save to preset button is jammed onto the 'Load package from' label line rather than sitting beside the dropdown it saves.  
**Fix:** Shorten the option label to 'Auto' because the helper text directly below already explains DDP and DDU. Move the Save to preset button onto its own line under the preset dropdown, using the same outline button style as Save to book preset.  
**Evidence:** shots/before/light-375/tab-shipping-05.png (Duties dropdown) and tab-shipping-01.png (preset row); index.html:3953 (long option text that truncates), index.html:3811-3812 (Load Package From label with the Save button inline on the same line)

### 41. tab-shipping — polish, polish
**Status:** Partly done — the batch button is now a solid ink outline. The expense category swatches are on the Tax Centre screen, not the shipping screen, so they are left for that screen
**Problem:** Off-system styling creeps in. The 'Ship several orders at once' button uses a dashed border, while Riso Press outlines are solid. The six expense categories each get their own swatch colour (blue, orange, pink, green, grey), and category names are underlined red links. The app's rule is that only two inks stand out and the rest report.  
**Fix:** Give .ship-flow-batch a solid 2px ink outline like the other outline buttons. Use one neutral swatch for categories, or the press blue and flare inks only. Make category names plain text with a chevron as the tap cue, not underlined red links.  
**Evidence:** shots/before/light-375/tab-shipping-06.png (dashed batch button); style.css:10725 (.ship-flow-batch sets border-style dashed); shots/before/light-375/tab-taxcenter-06.png (six swatch colours and red underlined category links); src/features/taxcentre.js:983 (per-category dotColor swatch and tc-cat-link)
### Found while fixing (not from the screenshot audit)

- **Import after a Google Sheets restore** — done (round 4, reproduced and fixed). The restore path overwrites the import
  window's confirm button (removing `#import-count`), so the next spreadsheet import can fail
  with "Could not read file". Found by reading the code (`src/main.js`, the Sheets restore path
  near `setImportReady`); not yet reproduced.
- **Register currency on a fresh device** — done (round 4). Before the books load, the register falls
  back to EUR (`_getPosDefaultCurrency` in `src/main.js`), so a brand-new phone opens the Sell
  screen charging in euros until a currency is picked once.

- **History return entries** — open. Consignment return rows on a phone use a different card
  layout (big store name, a lone dash) from sale rows after the History redesign.
- **Author view bottom menu** — done (round 4, owner chose "fade at the edge"). The author
  view's bottom menu holds more tabs than a phone can show, with no sign that it scrolls.
  Its right edge now fades into the menu while more tabs sit off-screen, and the fade goes
  once the strip is scrolled to the end.
