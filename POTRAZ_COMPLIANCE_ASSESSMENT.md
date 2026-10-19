# POTRAZ Compliance Assessment — Radbit Auto

**Status:** Assessment · **Date:** 2026-10-18 · **Scope:** Radbit Auto portal (`studio-285787437-bc95b`)

> **Not legal advice.** This document maps observable system behaviour against published
> Zimbabwean rules. It is an engineering/compliance gap analysis, not a legal opinion.
> Confirm with Zimbabwean counsel and POTRAZ before relying on it.

## Evidence labels

Every claim carries one label:

- **VERIFIED FACT** — confirmed from a primary source or the code/config in this repo.
- **OBSERVATION** — directly seen in the system, but not independently confirmed.
- **INFERENCE** — reasoned conclusion from facts; may be wrong.
- **HYPOTHESIS / SPECULATION** — belief or guess needing evidence.

## 1. Short answer

**INFERENCE:** The platform is **not** exposed on telecoms licensing. On data
protection, exposure depends on a **legal characterisation that is not yet decided**:

1. **Who is the controller** — each tenant agency, the platform operator, or both
   (see §3). This determines who must be licensed and appoint a DPO.
2. **Exemptions may apply** — a **pure processor** falls outside SI 155/2024's
   controller-licensing and DPO-appointment scope, and **Tier-1 small-scale
   controllers are exempt from appointing a DPO** (see §3).
3. **Cross-border processing (s28/s29) is a certain gap** — all tenant data is hosted
   outside Zimbabwe regardless of controller/processor status (see §7).

The planned notification engine (SMS/WhatsApp/email) adds **consent and unsubscribe
obligations** on top of the above.

## 2. Two regulatory regimes — only one bites

### 2.1 Telecommunications licensing

- **VERIFIED FACT:** The Postal and Telecommunications Act [Chapter 12:05] requires a
  licence to operate a telecommunications service (conveyance of voice/data).
- **INFERENCE:** A multi-tenant SaaS portal is not a telecommunications operator.
  Sending email, opening WhatsApp, or routing SMS through a licensed aggregator/MNO
  does not require Radbit Studios to hold a POTRAZ telecoms licence.
- **INFERENCE:** Exposure is **low**, provided messaging is always sent through a
  licensed provider and Radbit never operates its own conveyance service.

### 2.2 Data protection (the regime that applies)

- **VERIFIED FACT:** POTRAZ is the designated Data Protection Authority under the
  Cyber and Data Protection Act (CDPA) [Chapter 12:07], s5.
- **VERIFIED FACT:** SI 155 of 2024 (Statutory Instrument 155 of 2024) is the "Cyber
  and Data Protection (Licensing of **Data Controllers** and Appointment of Data
  Protection Officers) Regulations, 2024." Licensing (s4) and DPO appointment (s12)
  fall on **data controllers**; it also provides an "Exemption from licensing" (s8)
  and a "Register of licensed data controllers" (s9).
- **VERIFIED FACT:** A DPO is mandatory for a **data controller**, but **Tier-1
  small-scale controllers are exempt from appointing a DPO** (POTRAZ *Guidelines on
  Licensing of Data Controllers, 2025*).
- **VERIFIED FACT:** The CDPA permits trans-border transfer only with conditions
  (s28/s29): notification/authorisation, adequate protection, and — where adequacy is
  not established — explicit consent or another listed exception.
- **VERIFIED FACT:** Contravening the cross-border and consent provisions carries
  penalties up to a level-11 fine and/or imprisonment (reported up to 7 years).
- **VERIFIED FACT:** POTRAZ issued a consent guideline (CDPG 4 of 2024): consent must
  be freely given, positive opt-in, purpose-specific, recorded, and withdrawable.

## 3. Controller, processor and exemptions

### 3.1 The functional test (status is not corporate)

- **VERIFIED FACT (CDPA s3):** *"Data processor refers to a natural person or legal
  person, who processes data for and on behalf of the controller."*
- **VERIFIED FACT (CDPA):** *"the processor … may process data only as instructed by
  the controller, without prejudice to any duty imposed by law."*
- **INFERENCE:** Each tenant **agency** is the data controller for its customers'
  personal data (determines purpose and means).
- **INFERENCE:** The operating company behind Radbit Auto is a **processor** for tenant
  data **only if it processes for and on behalf of each agency, on instruction, with no
  independent purpose**, and is a **controller** for its own account-holder data
  (agency staff/admins).

**Being "the registered company" or "the parent" confers no processor status.** The
test is what the entity *does* and what the contract *says*, not the ownership
structure. A parent that never touches the data is neither; a parent that reuses the
data for its own ends is a controller.

An entity is a processor **only if all hold**:

1. It processes the data **for and on behalf of** the tenant agency (the controller).
2. It **does not determine the purposes or essential means** of processing.
3. It acts **only on the controller's instructions** (written DPA), with no independent
   purpose and no reuse for its own ends.
4. It does **not** also process the same data as a controller.

**Intra-group trap:** if tenant/customer data flows to the parent (Nexus Agronomics)
for the parent's own agritech/commercial purposes, the parent becomes a **controller**
and the processor framing collapses.

### 3.2 Which legal person actually processes

**OBSERVATION:** The registrant must be the legal entity that *operates Radbit Auto and
holds the data*. If that is Nexus Agronomics and "Radbit Studios" is a trading name,
then **Nexus is the registrant**, not a separate parent. Confirm the corporate structure
before filing anything.

### 3.3 Exemptions (from available sources)

| Question | Source finding | Label |
|---|---|---|
| Do processors need a controller **licence**? | SI 155 licensing scope is **data controllers** (s4, s9); no processor licensing provision found | INFERENCE — verify |
| Must processors **appoint a DPO**? | *"It is mandatory for a **data controller** to appoint a DPO"* (POTRAZ DPO Guideline 2024) | VERIFIED |
| Are any **controllers** exempt from a DPO? | *"Data controllers in Tier 1 … small scale … are exempted from appointing a DPO"* (POTRAZ Licensing Guideline 2025) | VERIFIED |
| Exemption from **licensing**? | SI 155 **s8** provides for exemption; listed purposes (personal/household, law enforcement, journalism, historical/archival) do not cover a commercial SaaS | VERIFIED |

**Consequence:** a genuine **processor** is likely outside the SI 155 controller
licensing and DPO duties; and **even as a controller, a Tier-1 small-scale controller
is exempt from a DPO.** Neither is a licence to ignore the CDPA — processors still owe
security, breach-notification and process-only-on-instruction duties.

### 3.4 Open questions for POTRAZ (in writing, naming the entity)

1. Must a **processor** register/license and appoint a DPO under SI 155/2024?
2. Exact **Tier-1 threshold** (number of data subjects) in SI 155 s6 / the DP1 form.
3. Does the operating entity's **retention/backup/admin** behaviour keep it a processor?

### 3.5 Entity determination and authority (Radbit Auto)

**Resolved (user-confirmed):**

- **Operating legal entity:** **Nexus Agronomics** (registered). It owns the portal,
  holds the data, and runs **Radbit Auto as a business line**. There is no separate
  "parent" — Nexus *is* the operator.
- **"Radbit Studios"** is a **trading name/brand**; **"Radbit Auto"** is a
  **product/business line**. Neither is a legal person.
- The **CTO (Tinotenda) cannot be the DPO** — a CTO determines the means of processing
  and so lacks the independence s13–14 of SI 155 requires; such an appointment would be
  conflicted. The CTO acts as an **officer of Nexus**; **Nexus is the controller /
  processor**, the CTO is not personally.
- The CTO holds **33%** → corporate acts (signing DPAs, POTRAZ filings, appointing a
  DPO, committing spend) require **board/owner authority** in the company's
  constitutional form — informal shareholder "flexibility" is not authority.

**Checklist before any filing:**

| # | Item | Status |
|---|---|---|
| 1 | Operator named on POTRAZ forms = **Nexus Agronomics [reg. no.]** | TODO |
| 2 | **Board/owner resolution** authorising the Radbit Auto line + compliance programme | TODO |
| 3 | **IP/ownership note** (Nexus asset vs licensed to Nexus) signed | TODO |
| 4 | **DPO appointed** — independent of the CTO/owners | TODO |
| 5 | Cloud/Firebase account moved from personal `brandontinoz@gmail.com` to a **Nexus-owned** account | TODO |
| 6 | **Register of processing activities** lists the Radbit Auto line | TODO |
| 7 | Confirm Radbit Auto falls within Nexus's registered objects/MOA (agritech → distinct line) | TODO |

**Warden flag:** informal "flexible" arrangements and an unwritten build mandate become
ownership disputes the moment the apparatus has value. Sign items 2 and 3 **before
revenue**, not after.

## 4. What the system actually does (code-grounded)

| Area | Reality | Label |
|---|---|---|
| Hosting location | Help page states records are hosted "using Google Firebase in the United States" (`web/src/pages/Help.tsx`) | VERIFIED FACT |
| Regions | Functions `us-central1` (global options); Firestore/Storage on Firebase default | OBSERVATION |
| Personal data stored | Account names/emails, customer names + phone numbers (`customers.ts:26`), case/vehicle/import records, uploaded documents, quotations, payments, audit history | VERIFIED FACT |
| Sensitive documents | Uploaded `bill_of_lading`, `export_certificate`, `eaa_certificate`, `import_licence`, `condition_report`, proof of payment (`constants.ts:20`) — may contain identifiers | OBSERVATION |
| Consent capture | Required signup checkbox; immutable `consents` docs with `NOTICE_VERSION` (`firebase/functions/src/consent.ts`); staff intake attestation writes processing consent | VERIFIED FACT |
| Policy disclosure | `/help` documents data categories, US hosting, 28-day backups, 7-day PITR, correction/export/deletion via agency + support | VERIFIED FACT |
| DPO | No DPO named or contactable in the product | VERIFIED FACT (absence) |
| Data-subject rights | Self-service JSON export + erasure request (`dataRights.ts`, `Account.tsx`); agency admin resolution queue (`ErasureRequests.tsx`); correction via support | VERIFIED FACT |
| Breach notification | No documented POTRAZ breach-notification process | VERIFIED FACT (absence) |
| Security controls | CSP, HSTS, Firestore rules, tenant isolation, storage validation, audit trail | VERIFIED FACT |
| Unsubscribe | Per-channel preferences enforced by the dispatcher (`notificationPolicy.ts`); marketing opt-in defaults off; no live email/SMS/WhatsApp transport yet | VERIFIED FACT |

## 5. Gap map

| Obligation | System reality | Status |
|---|---|---|
| Data-controller registration/licensing (SI 155/2024) | No evidence of POTRAZ registration | **GAP (unless pure processor)** — highest priority |
| Certified DPO appointment | None; obligation depends on controller/processor + tier (§3.3) | **GAP unless processor or Tier-1 exempt** |
| Cross-border transfer authorisation (s28/29) | US Firebase hosting; no POTRAZ notification/authorisation | **GAP — structural** |
| Explicit consent to cross-border transfer | Privacy consent captured at signup and disclosed in `/help` (US Firebase hosting); no separate s28 explicit-consent wording | **PARTIAL** |
| Lawful basis + consent records (CDPG 4/2024) | Signup checkbox + intake attestation; immutable `consents` records with notice version; `marketing` opt-in separate and default off | **COVERED (software)** |
| Data-subject rights (access/correct/erase/portable) | Self-service JSON export and erasure request; agency admin resolution queue; correction still via support | **COVERED (software); identity verification + backup retention manual** |
| Breach notification to POTRAZ | No process | **GAP** |
| Processor agreement between platform and agencies | `AGENCY_DATA_PROCESSING_AGREEMENT.md` drafted; unsigned | **PARTIAL** |
| Entity/authority alignment (Nexus Agronomics = operator) | Operator confirmed; no signed resolution or IP note | **GAP (governance)** |
| Security safeguards | Strong (rules, CSP, HSTS, audit) | **OK** |
| Outbound messaging consent/unsubscribe (future) | Per-channel prefs enforced in dispatcher (`email`/`sms`/`whatsapp` default off, marketing opt-in); no live email/SMS/WhatsApp transport yet | **COVERED (policy); transport PENDING** |

## 6. What is already strong

- **VERIFIED FACT:** Tenant isolation is enforced in Firestore rules and callable
  functions; platform-admin access is audited.
- **VERIFIED FACT:** Retention and backup behaviour is disclosed on `/help`
  (28-day daily backups, 7-day point-in-time recovery).
- **VERIFIED FACT:** The portal does not move money; it records confirmed payments.
- **VERIFIED FACT:** WhatsApp is external and explicitly governed by its own terms.
- **INFERENCE:** The compliance problem is **registration + cross-border + consent**,
  not a security failure. This is cheaper to fix than a breach.

## 7. Highest-risk single item

**Cross-border processing without POTRAZ notification/authorisation (s28).**

- Firebase US hosting is a deliberate architecture choice; moving it is expensive.
- The DP1 registration form explicitly asks whether personal data is stored outside
  Zimbabwe and requires a separate authorisation when the answer is yes.
- **INFERENCE:** The realistic path is: register → lodge cross-border authorisation +
  DPIA/DTIA → sign transfer terms with agencies → obtain explicit consent where
  required — rather than migrating regions.

## 8. Recommended actions (ordered)

1. **Decide the controller/processor split** — who registers: platform, each agency,
   or both. Get written POTRAZ guidance.
2. **Register/licence** the relevant entities and **appoint a certified DPO** (DP1).
3. **Lodge cross-border authorisation + DPIA/DTIA**; sign data-transfer terms with
   tenant agencies and with Google (processor terms).
4. **Add consent capture + records** at signup and customer intake; surface a real
   privacy notice, not only a link.
5. **Add unsubscribe + consent state** before any SMS/WhatsApp/email channel ships.
6. **Add a breach-notification runbook** with POTRAZ contact and timelines.
7. **Add customer self-service rights** (download my data / request deletion).

## 9. Evidence still needed

- **Written POTRAZ position** on whether a **processor** must register/license and
  appoint a DPO under SI 155/2024 (naming the actual processing entity).
- Exact **Tier-1 threshold** (number of data subjects) that exempts a controller from
  a DPO — SI 155 s6 and the DP1/DP2 forms.
- Current (2026) POTRAZ registration window.
- Exact **DP1 cross-border authorisation** procedure and available DTIA/DPIA template.
- Whether Google Cloud/Firebase terms satisfy POTRAZ adequacy for outward transfer
  (likely still requires the authorisation + explicit consent).
- POTRAZ guidance on processor contracts in a multi-tenant SaaS model.

## 9.1 Sources consulted

- Cyber and Data Protection Act [Chapter 12:07] — `potraz.gov.zw` (definition s3;
  duties s13-20; trans-border s28/29).
- SI 155 of 2024 — `potraz.gov.zw` / `veritaszim.net` / `zimlii.org` (licensing s4,
  exemption s8, DPO appointment s12, DPO functions s14).
- POTRAZ *Implementation Guidelines on Appointment of DPOs, 2024* (mandatory for a
  controller; purpose exemptions).
- POTRAZ *Guidelines on Licensing of Data Controllers, 2025* (Tier-1 small-scale
  controllers exempt from a DPO; registration/licensing deadline 12 March 2025).
- POTRAZ Regulatory Circular 2 of 2013 (unsolicited bulk SMS).

## 10. Messaging note (for the notification engine)

- **VERIFIED FACT:** POTRAZ Regulatory Circular 2 of 2013 on unsolicited bulk SMS is
  addressed to licensed mobile network operators and requires subscriber consent and
  a functional unsubscribe for commercial messaging.
- **INFERENCE:** The MNO/aggregator is the regulated party for SMS conveyance, but
  Radbit inherits consent/unsubscribe obligations contractually and under the CDPA.
- **INFERENCE:** Transactional messages (case status, payment confirmation) are lower
  risk than marketing messages, but consent records and an unsubscribe path remain
  required for commercial content.
- **Design consequence:** the notification engine must store channel preferences and
  consent per recipient before Phase 2 (email/SMS/WhatsApp) ships.

## 11. Warden verdict

- **Known:** no registration/DPO; US hosting; no consent capture.
- **Wanted:** a compliant, sellable multi-tenant portal.
- **Imagined:** that "we have a privacy page" equals compliance. It does not.

> Completion outranks expansion. Do the registration and cross-border authorisation
> before adding outbound messaging channels; otherwise every new channel increases
> the surface of an unresolved structural gap.
