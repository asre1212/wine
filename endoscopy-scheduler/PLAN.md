# Endoscopy "Fast Pass" — Gap-Filling Waitlist App for Epic Hyperspace

A planning document for a Resy-Notify-style scheduling app for endoscopy: it watches the
endoscopy schedule for gaps (cancellations, no-shows, unbooked slots), notifies waitlisted
patients that an earlier appointment is available, and lets the first eligible patient claim
it. Patients can add themselves to the waitlist; designated schedulers can add patients too.

---

## 1. Does this already exist? (Yes — read this first)

### Epic's own Fast Pass (the elephant in the room)

Epic already ships this exact workflow natively. **Fast Pass** (part of the Cadence
scheduling module, patient-facing side branded as **MyChart Wait List Offers**) does the
following out of the box:

- Patients add themselves to a wait list from MyChart (or a scheduler adds them in Cadence).
- When an earlier slot opens, Epic reserves it and sends offers to eligible waitlisted
  patients via MyChart notification / SMS / email.
- First patient to accept gets the slot; offers expire on a timer (in one large deployment,
  offers go out after 6 PM to up to 25 patients and expire at 7 AM, first-come-first-served).

Many large health systems (Duke, Johns Hopkins, WakeMed, etc.) already run it. If your
hospital is on Epic, **the fastest path to the outcome you want may be an operational
project — getting Fast Pass turned on and configured for the endoscopy department — not a
new app.** That costs ~zero licensing (it's part of Cadence/MyChart) and needs no security
review, no vendor contract, and no development.

### Third-party competitors

| Product | What it does | Endoscopy-specific? |
|---|---|---|
| **Luma Health** (Smart Waitlist) | Auto-offers open slots to waitlisted patients; bidirectional integration with Epic and 70+ EHRs | No — general purpose |
| **Artera** (formerly WELL Health) | Patient messaging + waitlist/backfill workflows | No |
| **Relatient / QueueDr** | Automated schedule backfill; claims ~10% utilization lift | No |
| **DocASAP, Notable, Prosper AI** | Access/scheduling automation with EHR integration | No |
| **Aescia Health** | **Prep-aware** waitlist backfill for endoscopy/ASCs — routes freed colonoscopy slots only to patients who can be prep-ready in time | **Yes — but** based in Sydney/Montréal and pre-first-customer (running a design-partner program), so **not an established US program** |

**Conclusion:** a generic "notify waitlist, first-accept wins" app is a solved problem and
not viable as a new product. The defensible wedge is the part Epic Fast Pass and the generic
vendors handle poorly: **endoscopy is prerequisite-heavy**. A freed 10 AM colonoscopy slot
tomorrow is only useful to a patient who can complete split-dose bowel prep, hold the right
meds (anticoagulants, GLP-1 agonists), fast correctly, and produce a driver/escort for
sedation. Fast Pass is procedure-naive; it will happily offer that slot to someone who
can't possibly be ready. That "prep-aware eligibility engine" is the product.

---

## 2. Product definition

### One-liner
Prep-aware gap-filling for endoscopy: when a slot opens, offer it only to waitlisted
patients who can actually be procedure-ready by that time, and book the first acceptor
directly into Epic.

### Core loop
1. **Waitlist intake** — patient self-adds (from a MyChart-launched patient app or an
   SMS/web link) or a scheduler adds them (from an app embedded in Hyperspace). Intake
   captures readiness facts: procedure type, prep on hand?, anticoagulant/GLP-1 status,
   driver availability, travel time, earliest-acceptable notice.
2. **Gap detection** — the app monitors the endoscopy department's schedule for
   cancellations, no-shows, and unbooked capacity.
3. **Eligibility matching** — for each open slot, compute which waitlisted patients can be
   ready in the remaining lead time (prep window ≥ required hours, med holds satisfiable,
   escort available, correct procedure/anesthesia/provider/room match).
4. **Offer & claim** — notify eligible patients (ranked, in waves), first to accept wins;
   the slot is held during the offer window; acceptance books the appointment in Epic and
   triggers prep instructions; everyone else is notified the offer is gone.
5. **Audit & analytics** — every offer/accept/decline logged; dashboard of recovered slots,
   fill rate, revenue recovered.

### Roles
- **Patient**: join/leave waitlist, set preferences, receive offers, claim slot.
- **Scheduler (designated staff)**: add/remove patients, override eligibility, configure
  offer rules per room/provider, see the queue in Hyperspace.
- **Admin**: department config, notification templates, audit reports.

---

## 3. How the app gets built (Epic integration architecture)

### Epic developer path
1. Register at **fhir.epic.com / open.epic** (free sandbox, test patients, non-production
   client IDs).
2. Join Epic's vendor program and list in **Epic Showroom** (formerly App Orchard) —
   required for production distribution to health systems; involves program fees, app
   review, and per-customer activation.
3. Each customer health system's Epic team activates your client ID against their
   production endpoints.

### Integration surface
| Need | Mechanism |
|---|---|
| Find open slots | FHIR `Slot` / `Schedule` search, or Epic's `Appointment.$find` convenience operation |
| Book the claimed slot | `Appointment.$book` (books directly into Cadence, no double-entry) |
| Real-time cancellation events | HL7v2 **SIU** feed (S15 cancel / S12 new / S14 reschedule) from the Epic Bridges interface engine — polling FHIR alone adds latency |
| Patient identity & demographics | FHIR `Patient`, MyChart-linked SMART launch |
| Scheduler UI inside Hyperspace | **SMART on FHIR embedded launch** (clinician context) — this is how the app "lives in Hyperspace" |
| Patient UI | SMART on FHIR patient-facing launch from MyChart, plus a plain mobile web app reached by SMS deep link |

### The MyChart messaging constraint (important)
Third-party apps **cannot freely send MyChart messages to patients** — patient-facing
MyChart messaging is largely Epic-internal, and In Basket APIs target provider inboxes.
Practical options, in order of preference:
1. **SMS/email via Twilio (or similar) with a secure deep link** back into the claim flow —
   this is what Luma/Artera/QueueDr all do. Requires TCPA-compliant consent at intake.
2. Trigger Epic's own communication tooling where the customer has it configured (Cheers /
   Fast Pass hybrid deployments).
3. Don't promise "sends MyChart messages" in the pitch; promise "notifies patients" and let
   the channel be SMS-first. If native MyChart delivery is a hard requirement, the answer
   is configuring Epic Fast Pass, not a third-party app.

### Suggested stack (boring on purpose)
- **Backend**: TypeScript (NestJS/Fastify) or Python (FastAPI); Postgres; Redis for offer
  hold/expiry timers; a job queue for offer waves.
- **Integration layer**: FHIR client with SMART backend-services auth (OAuth 2.0
  client-credentials + signed JWT); HL7v2 listener (e.g., Mirth/Rhapsody-compatible or a
  small MLLP service) for SIU feeds.
- **Frontend**: React — one patient-facing PWA (offer claim flow, waitlist signup), one
  clinician-facing SMART app (queue management) embedded in Hyperspace.
- **Eligibility engine**: deterministic rules first (prep hours, med-hold windows, escort,
  distance); ML ranking of accept-likelihood later — rules are explainable and safer to
  sell.

### Compliance (non-negotiable, budget for it early)
- **HIPAA**: BAAs with every subprocessor (cloud, Twilio, email, error tracking); encryption
  in transit/at rest; role-based access; immutable audit log of PHI access.
- **SOC 2 Type II** — health systems will ask for it during security review.
- **TCPA/consent** for SMS; state-specific telehealth/communication rules.
- No clinical decision-making → very likely **not** an FDA-regulated device, but the
  med-hold logic should be framed as surfacing the department's own protocol, not giving
  medical advice.

---

## 4. Deployment plan

1. **Hosting**: HIPAA-eligible cloud (AWS/GCP/Azure under BAA). Single-tenant-per-customer
   database schemas (health systems strongly prefer tenant isolation). Environments: dev →
   Epic sandbox; staging → customer's Epic non-prod (POC/TST); prod.
2. **Per-customer go-live** (realistic sequence at each health system):
   - Security/architecture review by the customer's IT (expect 2–6 months; SOC 2 shortens it)
   - Epic team activates client IDs, builds the SIU interface, configures SMART launch
   - Department config: rooms, providers, procedure types, prep protocols, offer rules
   - Pilot in one endoscopy suite → measure → expand
3. **Distribution**: Epic Showroom listing once the first reference customer is live.

**Note on building this as a clinician at your own hospital:** the cheapest possible pilot
is at your own institution — but anything built on hospital time/data usually triggers
institutional IP and conflict-of-interest policies, and Epic integration requires the
hospital's Epic team to cooperate. Talk to your innovation office early; many systems have
a co-development path (and a design-partner hospital is exactly what this product needs).

---

## 5. Monetization

The economic argument is strong: a lost colonoscopy slot is roughly **$1,000–$3,000+ of
facility+professional revenue**, and endoscopy late-cancel/no-show rates commonly run
10–20%. A single recovered slot per room per day pays for almost any reasonable price.

| Model | Shape | Notes |
|---|---|---|
| **SaaS subscription** (primary) | Per endoscopy room or per site, per month (e.g., $1–3k/room/mo) | Predictable; what hospital procurement understands |
| **Performance pricing** (pilot hook) | Fee per recovered slot (e.g., $75–150/backfilled appointment) | "You only pay when we fill a hole" — great for pilots; convert to SaaS at renewal |
| **Tiering** | Base = waitlist + offers; Plus = prep-aware engine + analytics; Enterprise = multi-site, SIU real-time | |
| Costs to plan for | Epic Showroom program fees, per-customer integration effort, SOC 2 audit, Twilio | Epic's vendor program takes fees/review — factor into pricing |

**Buyer**: not the gastroenterologist — the **endoscopy nurse manager / director of
perioperative or procedural services / VP of access**, with the CFO signing off on the
recovered-revenue math. The pitch metric: *slots recovered per month × average
reimbursement*, shown on a dashboard they can screenshot into their own leadership deck.

---

## 6. Step-by-step roadmap

**Phase 0 — Validate (2–6 weeks, no code)**
1. Pull (or estimate) your own department's numbers: late cancellations/no-shows per week,
   how many are currently backfilled, average slot value.
2. Ask your Epic team two questions: (a) is Fast Pass enabled for endoscopy, and if not,
   why not; (b) would they turn on a SIU feed / SMART app for a pilot.
3. Interview 5–10 endoscopy schedulers at other institutions — confirm Fast Pass's
   procedure-naivety is a felt pain, and that Aescia hasn't already locked the niche.
4. **Kill criterion**: if Fast Pass + a manual call-list solves 80% of the problem, stop —
   run the operational fix instead and enjoy the win.

**Phase 1 — Prototype against Epic sandbox (6–10 weeks)**
5. Register on fhir.epic.com; build the slot-watcher + eligibility engine + SMS offer/claim
   loop against sandbox data (`Appointment.$find`/`$book`, `Slot`, `Patient`).
6. Build the two thin UIs: patient claim PWA, scheduler SMART app.
7. Codify one real prep protocol (split-dose colonoscopy + anticoagulant holds + escort
   rule) with a GI clinician review.

**Phase 2 — Design-partner pilot (3–6 months)**
8. Sign one hospital/ASC as design partner (ideally your own, via the innovation office).
9. Security review, BAA, non-prod integration, then live in one endoscopy suite.
10. Measure: recovered slots, offer-accept rate, time-to-fill, prep-adequacy of backfilled
    patients (the differentiating stat vs Fast Pass).

**Phase 3 — Productize & sell (ongoing)**
11. SOC 2 Type II audit; Epic Showroom listing.
12. Publish the pilot results (poster at DDW/ACG — GI leaders read those, and it's free
    marketing that generic vendors can't copy).
13. Land customers 2–5 on performance pricing; convert to SaaS; expand from colonoscopy to
    EGD/EUS/ERCP protocols and then to other prep-heavy specialties (imaging with contrast,
    cardiac cath, infusion).

---

## 7. Top risks

1. **Epic ships prep-awareness into Fast Pass** — Epic absorbs adjacent features regularly.
   Mitigation: speed, published outcomes, multi-EHR support (Oracle Health, athenahealth).
2. **Aescia Health** is already positioned exactly here — do the Phase 0 competitive
   diligence before writing code; the answer may be "join/partner" rather than "compete."
3. **Health-system sales cycles** (6–18 months) will outlast enthusiasm — the design-partner
   pilot at your own institution is the only realistic way to shortcut this.
4. **Messaging channel** — if a customer insists on native MyChart delivery, a third-party
   app can't fully deliver it; be honest that the channel is SMS-first.
5. **Clinical safety optics** — a backfilled patient who skipped a med hold is a serious
   event; the eligibility engine must fail closed (when in doubt, don't offer).

---

## 8. Verified US programs that do this with Epic (link check, July 2026)

The honest headline: **the only proven, US-deployed, Epic-integrated program doing
waitlist gap-filling specifically for GI endoscopy is Epic's own Fast Pass.** Third-party
US vendors do it generically (any specialty); the one endoscopy-specific vendor found
(Aescia) is foreign-based and pre-customer.

### Epic Fast Pass used for GI endoscopy in US health systems (published evidence)
- **npj Health Systems (Nature) — "Implementing Epic Fast Pass for echocardiogram and
  endoscopy"** — peer-reviewed implementation report of Fast Pass for endoscopy:
  https://www.nature.com/articles/s44401-024-00005-0
  (preprint: https://www.researchsquare.com/article/rs-4869598/v1)
- **UCSF retrospective cohort study (JMIR/PMC)** — Fast Pass across UCSF filled 11% of
  canceled slots (~$3M revenue); for endoscopy, 48% of offers were accepted with an
  average **50-day** wait-time improvement, 96% of offers being colonoscopies:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC10988365/
- **EpicShare write-up of the UCSF work**:
  https://www.epicshare.org/news-watch/ucsf-uses-automated-self-rescheduling-tool-to-improve-patient-access
- **Duke Health MyChart Waitlist Offers patient guide** (operational detail of the
  offer/claim flow): https://lms.duhs.duke.edu/prodcontent/DHAS/DHAS-0024/1.6/story_content/external_files/MyChart%20Waitlist%20Offers%20Guide.pdf
- **Epic product page**: https://www.epic.com/software/appointment-scheduling/

### US third-party vendors with Epic-integrated waitlist/backfill (general, not GI-specific)
- **Luma Health — Smart Waitlist**: https://www.lumahealth.io/patient-success-platform/patient-waitlist/
  and Epic integration: https://www.lumahealth.io/luma-integrated-with-epic/
- **Relatient — Dash Schedule (absorbed QueueDr's automated waitlist)**:
  https://www.relatient.com/dash-epic-ehr-software-integration/ and
  https://www2.relatient.net/patient-self-scheduling-automated-waitlist/
- **Artera** — automated waitlist backfill for surgical/procedural slots (marketed for
  ortho; Epic listing is for self-rescheduling): https://artera.io/blog/patient-no-shows/

### Endoscopy-specific (not US-established)
- **Aescia Health — prep-aware backfill**: https://www.aesciahealth.com/prep-aware-backfill
  — Sydney/Montréal, pre-first-customer, recruiting US ASC design partners.

### Link-reliability notes
- These URLs were verified against live search indexes in July 2026, but several of these
  sites (lumahealth.io, aesciahealth.com, marketplace.aviahealth.com) sit behind
  bot-protection/CDNs that return **403 to automated fetchers and some corporate
  networks** — if a link "doesn't work," retry in a normal browser off VPN.
- The AVIA Marketplace FastPass listing (https://marketplace.aviahealth.com/product/25004)
  appears login-gated.
- Vendor marketing pages move often; the stable citations are the Nature/PMC papers above.

---

## 9. IP protection — what actually protects you (and what doesn't)

*Not legal advice; engage a health-tech IP attorney before the design-partner phase.*

The scenario to plan for: someone (Epic, a vendor, or a hospital's internal IT team) sees
the product working and builds a **site-tailored clone**. What stops them?

| Protection | What it covers | Honest strength here |
|---|---|---|
| **Copyright** | Your actual code, UI, docs — automatic, free | **Weak vs. clones.** Protects against copying your code, not against reimplementing the idea. A hospital that builds its own version from scratch infringes nothing. |
| **Utility patent** | The method/system, if granted | **Weak-to-moderate.** Post-*Alice v. CLS Bank* (2014), "scheduling/notification on a computer" claims are routinely invalidated as abstract ideas. A claim has a chance only if drafted around a *specific technical mechanism* (e.g., the prep-readiness computation combining med-hold windows, prep pharmacokinetics, and slot lead-time into a fail-closed offer gate). Cost: ~$15–30k+ and 2–4 years. A **provisional patent (~$2–5k)** is the pragmatic move: it timestamps the invention for 12 months while you validate. |
| **Trade secret** | Eligibility rules, ranking models, accept-likelihood data, per-site config playbooks | **Your strongest legal tool.** Costs nothing but discipline: keep the engine server-side (never ship logic to the browser or the customer's Epic instance), NDAs with every design partner, confidentiality + no-reverse-engineering clauses in customer contracts, access controls and logging. Trade secrets survive as long as you keep them secret — and a site-tailored clone built by ex-partners using your rules is actionable misappropriation. |
| **Trademark** | The product name/brand | Cheap (~$350/class) and worth doing early — in hospital procurement, the *name attached to published outcomes* is the asset. |
| **Contracts** | Whatever you negotiate | The real workhorse: design-partner agreements that state **you own all IP and generalized learnings**; customer terms barring reverse engineering and competitive benchmarking; IP-assignment agreements with every contractor. |

### Three special traps for this product

1. **Your employer may own it.** If you're clinical staff and build this using hospital
   time, data, Epic access, or resources, most academic/health-system IP policies give the
   institution ownership or a license. Get a written determination from the tech-transfer /
   innovation office **before** writing code, or build entirely on personal time/equipment
   against Epic's public sandbox (fhir.epic.com) and document that separation.
2. **Nothing stops Epic.** Fast Pass is theirs; if prep-aware offers prove valuable, Epic
   can add the feature natively, and Epic's vendor-program terms will not let you patent
   your way into blocking them. The defense is speed + published outcomes + multi-EHR
   reach, not IP.
3. **Nothing stops a hospital's internal build.** A health system can lawfully build a
   site-tailored version with its own Epic tooling (Cadence rules + Fast Pass config get
   surprisingly far). Your protection is making the *maintained product* cheaper than an
   internal build: continuously updated prep protocols (GLP-1 guidance changes yearly),
   cross-site benchmarks, SOC 2, support — the things one hospital's IT shop won't sustain.

### Priority order (pragmatic)
1. Written IP clarity with your institution (free, existential) →
2. Trade-secret hygiene + contractor IP assignment (cheap, immediate) →
3. Trademark the name (~$350) →
4. Provisional patent on the prep-aware gating mechanism (~$2–5k, optional) →
5. Full utility patent only if the pilot proves the market (defer the $25k).

---

## 10. Third-party waitlist/backfill apps on non-Epic EMRs (July 2026 survey)

Outside Epic there is no MyChart, so **every product in this space is SMS/email-first by
default** — the third-party model is the norm, not the workaround.

### Oracle Health (Cerner)
- **Luma Health Smart Waitlist for Oracle Health** — automated backfill integrated with
  Cerner Millennium: https://go.lumahealth.io/luma-smart-waitlist-for-oracle-health
- **Relatient Dash** — listed in the Cerner App Gallery with self-scheduling + waitlist:
  https://www.relatient.com/relatient-joins-cerner-app-gallery-with-mobile-first-self-scheduling-and-waitlist/
- **Curogram** — appointment texting/backfill for Oracle Health users:
  https://curogram.com/en-us/oracle-health-integration-curogram/appointment-reminders-oracle-health-users

### athenahealth (most developer-friendly)
- athenahealth exposes a **public Appointment Waitlist API** — a documented endpoint for
  exactly this workflow (far easier than Epic's program):
  https://docs.athenahealth.com/api/api-ref/appointment-waitlist (plus
  https://docs.athenahealth.com/api/api-ref/appointment-slot)
- athenahealth is also shipping **native AI-driven waitlist scheduling** that auto-refills
  cancellations — same "platform absorbs the feature" risk as Epic Fast Pass.
- Third-party apps in the athenahealth Marketplace (https://marketplace.athenahealth.com/):
  **Curogram** waitlist-backfill engine
  (https://curogram.com/blog/emr-integration/athenahealth/waitlist-backfill-same-day-cancellation-sms-automation)
  and **Emitrr**
  (https://emitrr.com/blog/how-to-minimize-empty-slots-with-waitlist-automation-in-athenahealth/).
- Notable for GI: many mid-size GI groups run **athenahealth + Provation** for endoscopy —
  so an athena-first build may reach independent GI/ASCs faster than Epic ever will.

### NextGen
- NextGen's own **Self Scheduling module is white-labeled Luma**, including Smart Waitlist:
  https://www.nextgen.com/solutions/patient-experience/patient-self-scheduling — i.e., the
  "third party" is already inside the platform.

### eClinicalWorks / MEDITECH
- No dominant native waitlist feature; covered by the cross-EHR engagement platforms
  (Luma, Curogram, Emitrr, WaitWell, Prosper AI, Cevi AI) via HL7/FHIR interfaces.
  Example roundups: https://waitwellsoftware.com/resources/articles/best-patient-scheduling-software/

### GI-specific EHR/PM systems — the interesting gap
- **ModMed gGastro** (the dominant GI-specialty EHR/PM for independent practices) has
  scheduling, reminders, kiosk, and portal — but **no prep-aware automated waitlist
  backfill** surfaced: https://www.modmed.com/specialties/gastroenterology/practice-management/
- **Provation Apex** is procedure *documentation*, not scheduling:
  https://www.provationmedical.com/apex/
- Meaning: the prep-aware gap-filling niche is open on the **non-Epic side too**, and the
  independent-GI/ASC market (gGastro or athena+Provation shops) has shorter sales cycles,
  no Showroom gatekeeping, and a public API path (athena). A plausible strategy inversion:
  **launch on athenahealth/ASC market first, use the revenue and outcomes data to earn the
  Epic health-system market later.**

### 10a. Integrating with ModMed gGastro — feasibility (checked July 2026)

Verdict: **yes, and notably easier than Epic.** ModMed runs a public developer portal
(https://portal.api.modmed.com/) with a FHIR R4 API that explicitly covers **both the
EMA/MMPM platform and gGastro**, and everything the core loop needs is documented:

- **Slot search** for open times (https://portal.api.modmed.com/reference/slot) — note the
  constraint that slot searches run in **5-day increments**, so the gap-watcher polls in
  rolling windows.
- **Appointment create/update** against a valid Slot
  (https://portal.api.modmed.com/reference/appoitments-and-slots) — i.e., true booking
  write-back, not just read access.
- OAuth2 auth, a **sandbox environment**, and CREATE/READ/SEARCH/UPDATE operations in the
  proprietary/partner API (MMI API docs:
  https://www.modmed.com/wp-content/uploads/2023/04/MMI-API-Documentation-April-2023.pdf).
- Enablement is per-practice via **feature flags requested through synapsys@modmed.com**
  (ModMed's Synapsys interoperability program:
  https://www.modmed.com/modmed-synapsys-api/). Practices have reported API access priced
  around **$25/provider/month** — a real but small line item to fold into pricing.
- Proof it works for this exact use case: **Relatient Dash already does bi-directional
  scheduling with ModMed via these FHIR APIs**
  (https://www.relatient.com/modmed-ehr-dash-integration/).

Differences vs. Epic worth planning around:
1. **Gap detection is polling-based** — no documented real-time SIU-style cancellation
   feed on the public API, so the watcher polls Appointments/Slots on a short interval
   (fine for offers with hours-to-days lead time, which prep-aware offers inherently have).
2. **No MyChart equivalent** — notifications are SMS/email with a claim link (which was
   the plan anyway); gGastro's gPortal is not a notification channel for third parties.
3. **Partner agreement, not app-store review** — a vendor/API license with ModMed replaces
   Epic's Showroom process; expect weeks, not the months of an Epic security cycle.

Combined with §10's market logic, this makes **gGastro + athenahealth the pragmatic
launch surface**: same eligibility engine, two APIs, thousands of independent GI practices
and ASCs, no health-system procurement in the critical path.
