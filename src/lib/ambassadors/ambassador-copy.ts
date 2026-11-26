/**
 * Every word on the public recruitment page at /join — the page a printed
 * EduCraft card's QR code opens.
 *
 * One file, for two reasons. The founder can read and edit the whole pitch in
 * one place without touching a component, and `check:client-copy` scans this
 * path: the page is public, so a client or a competitor can scan a card, and
 * the external rule holds without exception. EduCraft is a team of specialists
 * who research, write and review academic work. How the work gets done is not
 * on this page, in any wording.
 *
 * NO FIGURE LIVES HERE. Rates, prices, open positions and counts all arrive as
 * arguments from live reads — the published cashflow structure, the service
 * catalogue, the roster — so a republished structure or a repriced service
 * moves the page, and the page can never contradict the books.
 */

const naira = (amount: number) => `\u20a6${amount.toLocaleString("en-NG")}`;

export const JOIN_TEXT = {
  meta: {
    title: "Become an EduCraft campus representative",
    description:
      "Introduce final year students to EduCraft and earn a share of every project they pay for. Paid weekly, straight to your own account.",
  },

  /* 01 — the fold. A post-pitch scanner is verifying, not discovering, so
     this confirms and gets out of the way. It never says "welcome" or
     "thanks for scanning": many scans happen days after the pitch. */
  hero: {
    /** Shown when there are positions open. Honest scarcity: these are real roster places. */
    openPositions: (open: number, total: number) =>
      `${open} of ${total} campus positions open`,
    /**
     * Shown when no slot is vacant — never "0 open", and the button still
     * works. It must not imply a waiting list: with nothing vacant the roster
     * simply issues the next number, so an application is not held up. It
     * says what is actually true, which is that each one is read.
     */
    noPositions: "Every application is read individually",
    headline: ["Your course mates", "already need this."],
    promise: (topRate: number) =>
      `Every year, final year students in your department pay for help with their project. EduCraft pays you up to ${topRate}% of what each one you introduce spends. You never write a word.`,
    cta: "Apply for a position",
    secondary: "See what you would earn",
  },

  /* 02 — the clip. One line above, one under. Nothing competes with it. */
  video: {
    label: "30 seconds, from the founder",
    caption: "What the role is, in his own words.",
  },

  /* 03 — the job, understated because understating it is the honest pitch. */
  whatYouDo: {
    eyebrow: "The role",
    heading: ["Three things.", "That is the job."],
    steps: [
      {
        title: "Tell people EduCraft exists",
        body: "Your department, your hostel, your year group. You are not cold-calling strangers — you are telling people you already know about something they already need.",
      },
      {
        title: "Share your link",
        body: "You get your own link and code the day you are approved. Anyone who orders through it is counted as yours, permanently.",
      },
      {
        title: "Get paid when they pay",
        body: "Your share is yours the moment your student pays their deposit. You do not wait for the project to be finished.",
      },
    ],
    reassurance:
      "There is no joining fee. There is nothing to buy and nothing to keep in stock. You are not given a target to hit, and you never handle anyone's money — students pay EduCraft directly.",
  },

  /* 04 — the money. Every figure is passed in. */
  money: {
    eyebrow: "What it pays",
    heading: ["The more students", "you bring, the", "higher your rate."],
    intro:
      "Your rate rises with the number of students you have introduced who went on to pay. It never falls back.",
    tableHeads: { tier: "Tier", clients: "Paying students", rate: "Your rate", earns: "You earn" },
    tierClients: (min: number) => (min === 0 ? "Your first few" : `${min} or more`),
    basis: (price: number) =>
      `Worked out on a full final year project at ${naira(price)}, which is the service most students order. Every other service pays the same percentage of its own price, so bigger orders pay you more.`,
    cadence: "Paid every Saturday, straight into the account you give us when you apply.",
    trigger: (downpaymentPercent: number) =>
      `Owed to you as soon as your student pays their ${downpaymentPercent}% deposit — not when the project is delivered.`,
    unavailable: "Our rates are being updated. Apply and we will send you the current ones.",
  },

  /* 05 — "we are a firm". Structure and standards only: what EduCraft has, and
     what it holds work to. Never how the work is produced. */
  whyUs: {
    eyebrow: "Who you would be representing",
    heading: ["A company,", "not a side hustle."],
    points: [
      {
        title: "Offices, not one person with a phone",
        body: "EduCraft has a Chief Executive, a Chief Operating Officer who runs delivery, a Chief Financial Officer who runs the money, and a Head of Growth who runs this programme. You will know who to call.",
      },
      {
        title: "A written standard every project is held to",
        body: "Font, spacing, margins, heading levels, table and figure captions, reference style, chapter structure to your department's own template. It is written down, and nothing reaches a student until it meets it.",
      },
      {
        title: "Checked by a second specialist",
        body: "No piece of work goes out on one person's word. A second specialist reviews it against the standard first, and we keep working on it until it passes.",
      },
      {
        title: "A real system behind you",
        body: "Your own login and dashboard, your own referral code, every student you introduce tracked, every naira you are owed listed before it is paid. You are not being added to a group chat and hoped for.",
      },
    ],
  },

  /* 06 — proof. Capability, not volume: every number here is a live read, and
     the screenshot is seeded sample data and says so. */
  receipts: {
    eyebrow: "What is already running",
    heading: ["You can see", "the whole thing."],
    ambassadors: (count: number) => `${count} campus representatives active right now`,
    campuses: (count: number) =>
      count === 1
        ? "1 university where a representative is already working"
        : `${count} universities where a representative is already working`,
    dashboardCaption: "A sample dashboard. The figures in it are illustrative.",
    dashboardBody:
      "This is the screen you get. Your link, your students, what each one has paid, what you are owed and when it goes out.",
    agreement:
      "You sign a written agreement when you apply, and payment goes to your own bank account in your own name.",
  },

  /* 07 — the three questions a final year student actually has. Answers are
     visible, never folded into an accordion: hiding them costs applications. */
  questions: {
    eyebrow: "Straight answers",
    heading: ["Before you", "apply."],
    items: [
      {
        q: "Could I get in trouble for this?",
        a: "You are not writing anything and you are not submitting anything. Your part is the introduction: you tell a student EduCraft exists and share your link. From there EduCraft deals with that student directly, and what they order is between them and us. Nothing is done in your name and nothing is submitted under it.",
      },
      {
        q: "Will I actually be paid?",
        a: "You give us your bank account when you apply, and that is where the money goes. Every naira you are owed appears on your dashboard before it is paid, so you can see it coming. Payments go out every Saturday, and your share is owed from the moment your student pays their deposit, not when their project is finished.",
      },
      {
        q: "Does it cost anything, or do I have to hit a target?",
        a: "Nothing, and no. There is no joining fee, nothing to buy and no minimum. Your position is held for as long as you are active, and the roster is reviewed from time to time — so if you stop entirely for a few months, your place may go to someone else.",
      },
    ],
  },

  /* 08 — the close. One statement, one button, nothing else. */
  close: {
    heading: ["The students are", "already looking", "for you."],
    body: "Applying takes a few minutes. You will need your university, your department and your bank details.",
    cta: "Apply for a position",
  },
} as const;
