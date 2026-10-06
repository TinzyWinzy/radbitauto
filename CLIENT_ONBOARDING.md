# Set up your account — dealership onboarding wizard

Portal: https://studio-285787437-bc95b.web.app
Support: brandontinoz@gmail.com

Each dealership registers independently. Do not share accounts between dealerships.

Think of onboarding as a short wizard. Finish each step before moving on.

**Step 1 — Create your owner account**
Open the portal and choose **Create your dealership workspace**. Enter your name, email and a password, then verify the email we send you. Return to the portal and tap **I have verified my email**.

**Step 2 — Register your dealership**
Set your dealership name, your unique showroom address (e.g. `/showroom/city-motors`), WhatsApp number, case prefix (e.g. `CM`), default arrival port and operation type: sourcing, clearing or both. All records use USD.

**Step 3 — Set your branding**
Choose your brand colour. Your workspace starts with a first-customer checklist on the dashboard, which shows active cases, outstanding USD balances and actions waiting on you.

**Step 4 — Add your first customer**
Add the customer before opening an enquiry. A vehicle is optional at first — attach it once it's sourced. Japanese chassis/frame numbers are accepted.

**Step 5 — Invite your team and customers**
From Team → Invitations, create a staff or customer invite. Copy the private link, or share it via WhatsApp or email. Links expire after seven days and only work with the invited email address. A customer who already has history keeps it when they join.

**Step 6 — Add your stock**
Open Dealer to register vehicles — owned or consigned. Add photos, pick the cover shot, set the asking price and location, then publish to your public showroom. Unpublished stock stays private.

**Step 7 — Work your first enquiry**
For a customer import, enter the supplier listing and stock/invoice references (supplier records are staff-only). Enter the actual invoice and itemised freight, insurance, border transport, port charges, local delivery and your agency fee, then issue a USD quotation. Customers can accept and print/save a PDF.

**Step 8 — Record payments and receipts**
Record each payment with its transaction reference, then confirm it after checking the bank, cash or mobile-money evidence. The portal records payments — it never moves money. Print a receipt after confirmation. Owners can reverse mistakes while keeping the audit history.

**Step 9 — Keep buyers informed**
Use the case WhatsApp action to send a secure portal link, so customers can follow their own case, documents and balance on their phone.

**Step 10 — Review your numbers**
Reports show dealership-wide cases, confirmed collections, outstanding balances and quoted fees. Collections are not profit. On busy days, refresh the overview after clearing actions.

Before your first real import, confirm customer details, tax rates, quotation and document checklist with your administrator. Report issues with the case number — never email passwords or supplier login credentials.

**On your phone:** use the browser's install/add-to-home-screen action. HTTPS and a supported browser are required, and you need internet for live records. Sign out on shared devices. Password recovery is on the sign-in page.

New workspaces begin with pilot access and no automatic subscription charge. Platform subscription invoices are handled manually; the platform owner agrees the USD price directly with each agency. Agency service fees entered on import quotations belong to that agency.

For retail sales, open Dealer. Capture leads, convert an enquiry into a customer, then register/add stock or choose available stock and reserve it for the buyer. Upload vehicle photos, choose the cover and publish the listing to your public showroom. Confirm payments only after checking evidence; refund the recorded balance before cancelling. Handover requires full payment.

Open Purchase details and documents to issue a sale agreement, receipt, balance statement or handover record. Issued documents retain their original amounts and can be printed or saved as PDF. Owners can create the buyer's private invitation here; buyers see their purchases in My vehicles. An existing linked customer already has purchase access.

For vehicles bought with your own funds, use Buy and import dealer stock. Record the actual supplier purchase, freight, clearance and preparation costs and evidence. Progress the acquisition through its stages, then transfer it into available stock after preparation. Its costs carry forward into the later retail sale.

For customer imports, distinguish payments received by your agency from payments made directly to suppliers. Reports separate these amounts. Owners can record earned service fees/commissions and expenses borne by the business. Collections, pass-through funds and recorded deal results have different meanings; recorded results exclude overheads and missing expenses.

Before your first real import, confirm your customer details, applicable tax rates, quotation, transaction references and document checklist with your agency administrator. Report issues with the case number; never email passwords or supplier login credentials.

## Public marketing and car discovery

The home page serves car buyers and prospective dealership clients. Buyers can search intentionally published, available stock by make/model, dealer or location and filter by maximum USD budget. Each listing leads to the owning dealer's showroom, where WhatsApp contact and the enquiry form already create the dealer/customer conversation. The catalogue does not expose VINs, buyer details, acquisition costs or private stock.

Publishing an available stock listing makes it eligible for both your showroom and the shared marketing catalogue. Reserved and sold vehicles are excluded. Unpublish a listing to remove it from public discovery. Add genuine vehicle photographs and accurate prices/location before publishing. Do not create demonstration stock in production.

The initial catalogue returns a bounded selection of up to 100 published records and labels limited results as a selection. Sourcing enquiries go through the chosen dealer's showroom. If no stock has been published, the page gives an honest empty state and asks buyers to use their dealer's shared showroom link. Business prospects can create their agency workspace or contact brandontinoz@gmail.com about pilot access. There is no invented pricing, customer testimonial or supplier partnership claim.

## Invitations

Open Team → Invite staff or customers for the dedicated Invitations screen. Owners choose staff or customer access; customer invitations require an active customer record without an existing login. Staff invitations do not grant owner privileges.

Create the link, then copy it, open WhatsApp sharing or open an email draft. No invitation is automatically sent. The recipient must sign in/create an account with the invited email, verify that email and accept. Google sign-in can satisfy email verification. Links expire after seven days.

Review invitation history and revoke unused links when sent to the wrong recipient or no longer needed. Accepted invitations remain in history; deactivate established access from Team. Links are only displayed when generated, so revoke a lost pending link and create a new one. The list shows a bounded selection of up to 200 invitation records. Keep links private.

## CSV and Excel onboarding imports

Owners can open Team → Import customers or stock. CSV supports comma, semicolon and tab delimiters. Excel supports .xlsx; save old .xls files as .xlsx first. Choose a worksheet, header row and data range, suggest/confirm column matches, then validate and preview. Import up to 100 data rows per batch from a file up to 2 MB; choose another range for subsequent batches. Workbooks are limited to 20 sheets, 5,000 rows and 100 columns per sheet.

Customer imports need name and phone. Use phone columns formatted as text: Zimbabwe local numbers beginning 0 are normalised to +263, or supply +country-code numbers. Customers are created without accounts; invite them separately. Exact normalised name/phone matches in existing records and repeated file rows are skipped. Matching is deliberately conservative and does not merge people automatically.

Stock imports need VIN/chassis, make, model, year, supported category, asking price and location. Categories use sedan_station_wagon, pickup_up_to_800kg, pickup_801_to_1400kg, pickup_over_1400kg or double_cab; alternatively choose a category explicitly for rows without mapped category values. Ownership is owned or consigned, defaulting to owned. For consignment, acquisition cost is the owner's settlement amount, not a dealer vehicle purchase.

All prices/costs are USD. Blank acquisition/settlement or direct costs remain unknown (null), and margin remains unavailable while either cost is unknown. Complete costs require both amounts, including explicit 0 where appropriate. Imported stock starts available and unpublished. Check its details and add actual photos before publishing. Existing VIN/chassis records are skipped rather than updated or silently allocated from an import.

Preview each row before committing. Invalid and duplicate rows are skipped; successful rows are kept if another row fails. Download the result CSV to identify source row numbers requiring correction. A repeat upload safely skips existing records. No sales, payment confirmations, customer logins, cases or WhatsApp messages are created by this import.

Files are read locally; only mapped record fields are submitted. Formula/error cells must be replaced with plain values in the source file before import. Formatting, merged report sections and multiple tables are handled by selecting one header and contiguous data range at a time. Customer/stock imports are the first release; lead, customer-case, acquisition and opening-balance imports are later workflows.


## Subscription launch (4 October 2026)

New agencies start a 14-day Dealer trial (USD 29/month thereafter by manual arrangement; 5 business team members, 50 active vehicles/enquiries). Solo is USD 15/month (2 business team members, 15 active vehicles/enquiries). Customers are free. Core journeys are shared. Completed history is retained. See [SUBSCRIPTION_RELEASE.md](SUBSCRIPTION_RELEASE.md) for precise counting, enforcement, legacy migration, export and measurement boundaries.

Owners use **Plan & billing** in the workspace. A plan request does not change access. The platform operator reviews agency usage, verifies payment externally and records the invoice/payment references, plan and access end date in **Agency subscriptions**. Paid activation requires both references. For an agreed subscription lapse use paused/read-only, rather than security suspension. Existing pilot agencies require an agreed migration/start date; no silent price change or automatic cutoff is applied.

In-app renewal reminders run daily at 08:00 Africa/Harare. Check the `subscriptionMaintenance` scheduled job and Cloud Functions errors after deployment. Usage snapshots measure current live file bytes/objects and collection counts; Cloud Billing remains authoritative for charges. Record actual onboarding/support minutes against a ticket reference, then review the agency commercial report to understand support effort.

Owner JSON export remains available on expiry. It includes customer/cost information and must be stored privately; file attachments are excluded, and records can change during export. The export is not a restore-tested backup.
