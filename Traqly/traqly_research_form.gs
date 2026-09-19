/**
 * Traqly Pre-Launch Research Form Generator
 * -----------------------------------------
 * This script builds a Google Form based on The Mom Test principles:
 * past behavior over future intent, no leading questions, no product mention.
 *
 * HOW TO USE:
 * 1. Go to https://script.google.com and click "New project"
 * 2. Delete the default code and paste this entire file
 * 3. Click Save (name it "Traqly Research Form")
 * 4. Click Run and select the function: createTraqlyResearchForm
 * 5. Authorize the script when prompted (Google will ask for permission
 *    to create forms on your behalf — this is normal)
 * 6. When it finishes, check the execution log (View > Executions) for
 *    the form share URL, edit URL and response spreadsheet URL.
 *
 * The form will appear in your Google Drive automatically.
 */

function createTraqlyResearchForm() {
  // ============================================================
  // CREATE FORM
  // ============================================================
  var form = FormApp.create('A quick 2-minute research on how small businesses in Nigeria promote themselves online');

  form.setDescription(
    "Hi 👋 I'm doing independent research on how Nigerian small business owners " +
    "promote their businesses online — WhatsApp, Instagram, Facebook, etc. " +
    "Your answers will help me understand what's really working (and what isn't) " +
    "for people running businesses today.\n\n" +
    "This takes about 2 minutes. Nothing is being sold, and no follow-up unless " +
    "you choose it at the end."
  );

  // Progress bar disabled — Google Forms counts every page break as a page
  // in the total, even ones a given respondent will never see. That produces
  // a misleading "Page X of 3" on a form that any single respondent only
  // sees 2 pages of. Turning the bar off is the cleanest fix.
  form.setProgressBar(false);
  form.setShowLinkToRespondAgain(false);
  form.setConfirmationMessage(
    "Thank you 🙏 If you left your WhatsApp number, I'll reach out within the week. " +
    "Your answers will genuinely help a lot."
  );
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);

  // ============================================================
  // Q1 — FILTER: Do they even market online?
  // (Branching configured after all pages exist below)
  // ============================================================
  var q1 = form.addMultipleChoiceItem();
  q1.setTitle('In the last 30 days, have you posted or shared something to promote your business online?')
    .setHelpText('WhatsApp, Instagram, Facebook, TikTok, X (Twitter), etc.')
    .setRequired(true);

  // ============================================================
  // MAIN QUESTIONS SECTION — reached when user answers "Yes" on Q1
  // Section is told to submit at the end so it never falls through
  // onto the end page meant for No / I don't run a business.
  // ============================================================
  var mainSection = form.addPageBreakItem()
    .setTitle('A few quick questions about your last promotion')
    .setHelpText('This is the meat of the research — answers can be short.');
  mainSection.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  // Q2 — Past behavior, specific and recent
  form.addParagraphTextItem()
    .setTitle('Think about the last promotion or post you shared. What did you share, and where did you share it?')
    .setHelpText('One sentence is totally fine — e.g. "A discount post on my WhatsApp status"')
    .setRequired(true);

  // Q3 — Reveal the pain (rewritten for clarity)
  form.addParagraphTextItem()
    .setTitle('After you shared it, how did you know if it brought any results to your business — like customers, orders, DMs, or sales?')
    .setHelpText('Whatever your honest way of measuring is — even "I just checked likes" or "I didn\'t really check" is a valid answer.')
    .setRequired(true);

  // Q4a — Money question (yes/no)
  form.addMultipleChoiceItem()
    .setTitle('In the last 3 months, have you spent money on any kind of promotion?')
    .setHelpText('Boosting a post, running ads, paying an influencer, printing flyers, etc.')
    .setChoiceValues(['Yes', 'No'])
    .setRequired(true);

  // Q4b — Money follow-up (optional)
  form.addParagraphTextItem()
    .setTitle('If yes — roughly how much, and how did you decide whether it was worth it?')
    .setHelpText('Skip if you answered No above.')
    .setRequired(false);

  // Q5 — Frequency
  form.addMultipleChoiceItem()
    .setTitle('How often do you post or share something to promote your business?')
    .setChoiceValues([
      'Multiple times a week',
      'Once a week',
      'A few times a month',
      'Rarely / when I remember',
      'First time recently'
    ])
    .setRequired(true);

  // Q6 — Open pain (optional, last time not "in general")
  form.addParagraphTextItem()
    .setTitle('What was the most frustrating thing about the last time you tried to promote your business online?')
    .setHelpText('Optional — but even a short honest answer helps a lot.')
    .setRequired(false);

  // Q7 — THE FILTER: conversation invite
  form.addTextItem()
    .setTitle("I'd love to have a short 10-minute conversation to understand your experience better. If you're open to it, drop your WhatsApp number below.")
    .setHelpText('Completely optional — no sales, no product being pitched. Leave blank if you prefer.')
    .setRequired(false);

  // ============================================================
  // END PAGE — reached when user answers "No" or "I don't run a business"
  // ============================================================
  var endSection = form.addPageBreakItem()
    .setTitle('Thanks for your time!')
    .setHelpText(
      "No further questions for you — this research is specifically for people " +
      "actively promoting a business online right now. Really appreciate you stopping by 🙏"
    );
  endSection.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  // ============================================================
  // WIRE UP Q1's BRANCHING (both target pages exist)
  //   Yes                       -> Main questions section
  //   No                        -> End "thanks" page
  //   I don't run a business    -> End "thanks" page
  // ============================================================
  q1.setChoices([
    q1.createChoice('Yes', mainSection),
    q1.createChoice('No', endSection),
    q1.createChoice("I don't run a business", endSection)
  ]);

  // ============================================================
  // LINK RESPONSES TO A SPREADSHEET (auto-created)
  // ============================================================
  var ss = SpreadsheetApp.create('Traqly Research Form — Responses');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // ============================================================
  // OUTPUT — Print URLs to the execution log
  // ============================================================
  var publishedUrl = form.getPublishedUrl();
  var editUrl = form.getEditUrl();
  var sheetUrl = ss.getUrl();

  Logger.log('✅ Form created successfully!');
  Logger.log('');
  Logger.log('📋 SHARE THIS LINK (send to respondents):');
  Logger.log(publishedUrl);
  Logger.log('');
  Logger.log('✏️  EDIT THE FORM HERE (for tweaks):');
  Logger.log(editUrl);
  Logger.log('');
  Logger.log('📊 VIEW RESPONSES HERE (spreadsheet):');
  Logger.log(sheetUrl);
  Logger.log('');
  Logger.log('Both the form and the responses spreadsheet are now in your Google Drive.');
}
