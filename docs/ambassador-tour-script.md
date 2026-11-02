# Ambassador tour — the script

The tutorial every new ambassador watches once, before they can use the
dashboard, and can rewatch afterwards from **How the ambassador platform works**
on their dashboard home.

**Format:** 16:9, 1920×1080. **Target runtime:** 6:10 (the brief says 5–7).
**Not an advert.** It is instruction: plain, unhurried, no pitch.

---

## Rules this script follows

1. **The word "conversion" never appears.** `src/lib/ambassador-copy.ts` sets the
   house rule: ambassadors are students, not marketers. The count is **paying
   clients referred**.
2. **Nothing internal on camera.** No AI, no QA, no worker or specialist
   wording, no admin screens — the same rule `docs/demo-recording.md` sets for
   the COO video. This tour never leaves the ambassador portal.
3. **Demo data only.** The leaderboard shows real ambassadors' names, so it is
   filmed against the local demo database (`npm run demo:seed`), never
   production.
4. **Every figure must match the live app.** The tier rates come from the
   published cashflow structure, so if a rate ever changes this video is
   re-recorded, not patched.

## The music bed

A single instrumental track under the whole video at **10–15% of the narration
level** — present, never competing. It is mixed into the exported file, not
controlled in the app: the player plays one audio stream, so lowering it in code
would quiet the voice with it.

`video/README.md` records that **no licensed track exists yet**. The founder
supplies one, or approves a licence, before the final mix.

## The voice

Unhurried, warm, second person, short sentences. `video/README.md` records that
Speko's catalogue has no Nigerian-accented English voice — for a tutorial a
student watches once, a Nigerian voice is worth recording by hand.

---

## Chapter 1 — Welcome · 0:00–0:45

**On screen:** EduCraft emblem on the dark ground, then a slow fade into the
ambassador dashboard at rest.

> Welcome to EduCraft, and congratulations — your ambassador account is live.
>
> Your job is simple. You share one link with students on your campus. When
> someone uses it and places an order, you earn a percentage of what they pay.
>
> This tour takes about six minutes and covers every part of your dashboard.
> Watch it once, now, and you will not have to guess at anything later. You can
> come back to it any time from your dashboard.

---

## Chapter 2 — What you earn · 0:45–1:40

**On screen:** the four tiers drawn one line at a time, then the "Your level"
card on the real dashboard with its progress bar.

> Let us start with the money, because that is what you came for.
>
> Everyone starts on Bronze and earns ten percent of every project they bring
> in. Bring six paying clients and you move to Silver, which is twelve percent.
> Sixteen takes you to Gold, at fifteen percent. Thirty-one takes you to
> Platinum — still fifteen percent, with a three thousand naira bonus each
> quarter for every client you referred.
>
> A paying client is someone who used your link and paid their downpayment.
> That is the only thing that moves you up a tier. Not clicks, not sign-ups —
> paid orders.
>
> Your dashboard shows where you are and exactly how many more you need. You
> never ask anyone to move you up; it happens on its own.

---

## Chapter 3 — Your dashboard home · 1:40–2:35

**On screen:** the home page top to bottom — the welcome line and tier badge,
the notice, the link card, the four stats, "See everyone you referred".

> This is your home page.
>
> At the top is your name and your current level.
>
> Under it, the line that matters most: your commission is owed the moment
> someone you referred pays their downpayment — not when the work is finished,
> not when it is delivered. The moment they pay. It is then paid out every
> Saturday to the bank account on your profile.
>
> Then your link, which we will come to in a moment.
>
> Then four numbers. How many people used your link. How many of them became
> paying clients. What share that is. And your commission balance — money that
> is yours and has not been paid out yet.

---

## Chapter 4 — Your link · 2:35–3:40

**On screen:** the referral card; the Copy button; a phone frame showing
WhatsApp opening with the message already written. Then the My link page and its
five tabs.

> This is your link. It is the only one you need, and it is yours alone.
>
> When a student opens it, WhatsApp opens on their phone with a message already
> written that says you referred them. They do not have to type anything, and
> they cannot forget to mention your name. That is how you get credit.
>
> Copy it, or use the QR code when you are standing in front of someone.
>
> Share it where students already are — your department group, your hall, your
> class chat. One link, everywhere.
>
> The My link tab shows what happens after you share it: how many people opened
> it, when, and from where. Quality tells you how many were real, separate
> people rather than the same person opening it twice. None of this is visible
> to anyone else.

---

## Chapter 5 — Your referrals · 3:40–4:25

**On screen:** the referrals list at phone width, then the three filters.

> Referrals is the list of everyone who came through your link.
>
> Each row shows when they joined, what they ordered, and whether their
> downpayment has been paid. You can filter to just the ones who have paid, or
> the ones who have not yet.
>
> Use that second filter. Someone who started an order and has not paid is the
> easiest commission you will ever earn — a single message asking if they need
> help is usually all it takes.

---

## Chapter 6 — Your commissions · 4:25–5:15

**On screen:** the commissions page — the three money figures, then the ledger
scrolling.

> Commissions is your record of every naira.
>
> Three figures at the top. Total earned, since the day you started. Total paid,
> which is what has reached your bank. And your balance — earned, not yet paid.
>
> Underneath, every single commission, with the project it came from and the
> date. Nothing is rounded and nothing is hidden. If a figure here ever looks
> wrong to you, say so, and it gets checked against the same record.
>
> Payouts run every Saturday. The one thing that can hold yours up is missing
> bank details, so put them in before your first client pays.

---

## Chapter 7 — Leaderboard and profile · 5:15–5:50

**On screen:** the leaderboard podium, then the profile page — tier ladder, bank
details, email toggle.

> The leaderboard ranks ambassadors by how many separate people opened their
> link — daily, weekly and all time.
>
> It shows clicks only. Your orders, your clients and your earnings are never on
> it, and you never appear on anybody else's.
>
> Your profile holds your details, your bank account, and the tier ladder again
> for reference. There is also a switch for the Monday summary email, which
> tells you how your link did last week. Leave it on.

---

## Chapter 8 — Close · 5:50–6:10

**On screen:** back to the dashboard home, scrolling to the "How the ambassador
platform works" section that holds this video. Then the emblem.

> That is the whole platform.
>
> Share your link. Watch for the ones who have not paid yet. Check your
> commissions on a Saturday.
>
> This video stays on your dashboard, under "How the ambassador platform works",
> so come back whenever you need it. Join the WhatsApp group from your welcome
> email — that is where questions get answered.
>
> Welcome to the team.

---

## After the render

The chapter list in the app reads its timestamps from `TOUR_CHAPTERS` in
`src/lib/ambassador-tour.ts`, which ships empty. When the final cut exists, put
the eight chapters and their real start seconds there — that, and uploading the
file on **Settings > General**, are the only steps left.
