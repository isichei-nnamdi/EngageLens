# EngageLens: Chat Analytics for Google Meet

EngageLens is a Chrome extension that shows a host what happened in a Google Meet chat as soon as the call ends. It answers four questions: who took part, who stayed silent, what still needs a reply, and how the room felt.

All analysis runs inside your browser. Chat messages are never sent to a server.

---

## What you get

Each meeting report includes:

| Section | What it shows |
|---|---|
| **Headline numbers** | Messages, people who chatted (and who stayed silent), overall mood, open follow-ups, links shared, and the top contributor's share of messages |
| **Key takeaways** | Plain-language findings, for example: *"4 questions or requests got no reply in the chat, including 1 addressed to you"*, *"The chat went quiet for 31m"* |
| **Chat activity over time** | Messages per interval, with quiet periods (10 minutes or more) shaded |
| **Participants** | A sortable table with message count, share of messages, words, questions, links, @mentions received, average sentiment, active time and engagement level (*Highly active / Active / Occasional / Silent*) |
| **Sentiment** | Counts of positive, neutral and negative messages, and the most positive and most negative quotes |
| **Questions & requests** | Each question or request, whether it got a reply in the chat, and whether it was addressed to you. Items for you are listed first. |
| **Shared resources** | Every link, labelled by type (Google Doc, Google Form, WhatsApp invite and so on). Links shared more than once are grouped together. |
| **Chat transcript** | Every message, searchable and filterable by person, sentiment and questions |

**Exports:** a participants CSV, a messages CSV, *Save as PDF* (uses the browser's print dialog), and *Copy summary*, which copies a plain-text digest you can paste into an email or chat.

## Two ways to analyse a meeting

1. **Live capture (main path).** Join a call on `meet.google.com` and open the chat panel once. EngageLens records chat messages and everyone it sees in the call (video tiles and the People panel). When you leave the call, the report opens in a new tab. You can also click **End & analyse** in the toolbar popup at any time.
2. **Import an `.sbv` file (fallback).** When a Workspace meeting is recorded, Meet saves the chat as `<Title> - <date> - Chat.sbv` next to the recording in Google Drive. Drop that file onto the EngageLens page. Because the file only contains messages, imported meetings can't list silent attendees.

> Set **Your name in Google Meet** on the EngageLens page. Meet labels your own messages "You"; EngageLens replaces that label with your name and uses it to flag requests addressed to you. You can also change "You are…" on any individual report.

## Install for development

Requirements: Node.js 20 or newer, and Chrome (or Edge).

```bash
npm install          # also runs `wxt prepare`
npm run dev          # opens Chrome with the extension loaded and hot reload on
```

To load the extension in your normal Chrome profile:

```bash
npm run build
```

Then go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose `.output/chrome-mv3`.

To try it without joining a call, open the extension's popup, click **Open EngageLens**, then import [`samples/…Chat.sbv`](samples/).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run dev:edge` | Development build with hot reload |
| `npm run build` | Production build to `.output/chrome-mv3` |
| `npm run zip` | Packages the build as a zip, ready to upload to the Chrome Web Store |
| `npm test` | Unit tests (Vitest), including tests against the real sample chat |
| `npm run compile` | Type-check only |
| `npm run icons` | Regenerates `public/icon/*.png` (no dependencies needed) |

## How it works

```
meet.google.com tab                       Extension
┌──────────────────────┐   messages     ┌─────────────────────┐    chrome.storage.local
│ content script       │ ─────────────▶ │ background (MV3 SW) │ ─────────────────────┐
│ reads chat + roster  │   roster/end   │ merges & persists   │                      │
│ every 2 s            │                │ opens report on end │                      ▼
└──────────────────────┘                └─────────────────────┘          ┌──────────────────────┐
                                                                         │ dashboard.html       │
             .sbv file ─── drag & drop ─────────────────────────────────▶│ parse → analyse →    │
                                                                         │ report (React)       │
                                                                         └──────────────────────┘
```

Raw messages are stored, and the analysis is recalculated each time a report opens. That means improvements to the analysis also apply to meetings you saved earlier.

### Project layout

```
src/
  entrypoints/
    meet.content.ts      capture on meet.google.com
    background.ts        session lifecycle + storage writes
    popup/               toolbar popup (status, End & analyse, recent)
    dashboard/           library + report page
  lib/
    sbv.ts               .sbv parser (multi-line safe) + filename metadata
    sentiment.ts         on-device rule-based sentiment
    analyze.ts           participants, timeline, follow-ups, resources, mood
    insights.ts          plain-language takeaways
    meet-dom.ts          ALL Google Meet selectors live here
    export.ts            CSV (formula-injection safe) + text summary
    storage.ts           chrome.storage wrapper
  components/            React UI (report, timeline chart, sentiment bar…)
tests/                   Vitest suites; fixtures use samples/*.sbv
```

### Tech stack (all free)

| Layer | Choice |
|---|---|
| Extension framework | [WXT](https://wxt.dev) (Vite-based, Manifest V3) + TypeScript |
| UI | React 19 with plain CSS (light and dark themes), using hand-built SVG charts instead of a charting library |
| Sentiment | A VADER-style rule-based scorer written for this project (see below) |
| Storage | `chrome.storage.local` |
| Tests | Vitest, with happy-dom for the Meet page-structure tests |

### Sentiment method

Each message gets a score between −1 and +1:

- **Word list:** each word has a sentiment weight.
- **Negation:** "not good" counts as negative, and "not a problem" counts as positive.
- **Intensifiers:** words like "very" and "really" strengthen the score.
- **"But" rule:** the part after "but" counts more than the part before it.
- **Exclamation marks** add emphasis.
- **Meeting-chat rules:**
  - Emojis are scored.
  - Nigerian/West African English particles (*o, ooo, abeg, sha*) add emphasis but have no sentiment of their own.
  - Repeated 😭 with no negative words, or any laughing emoji, is treated as **humour** rather than distress.

Messages that contain only a link are left out of the mood score. These are estimates, so the report always shows the quotes they're based on.

### "Needs follow-up" logic

A question or request counts as having a reply when one of these happens:

- For a **request for a link or document:** someone else posts a link within 5 minutes.
- For a message that **@mentions** someone: that person posts within 10 minutes.
- For anything else: the host replies within 5 minutes, someone @mentions the person who asked, or the very next message comes from someone else within 2 minutes.

The host's own questions are skipped. Answers given out loud on the call can't be detected, and the report says so.

## When Google changes Meet

Google Meet's page structure is obfuscated and changes without notice. Every Meet-specific CSS selector is in **[`src/lib/meet-dom.ts`](src/lib/meet-dom.ts)** (`SELECTORS`), and each lookup tries several selectors, starting with the most stable.

If live capture stops working (for example, the popup shows 0 messages while people are chatting):

1. In a live call, open DevTools and inspect a chat message. Find its id attribute (currently `data-message-id`) and the elements holding the sender name and message text.
2. Update `SELECTORS` to match.
3. Update the HTML fixture in [`tests/meet-dom.test.ts`](tests/meet-dom.test.ts) to match, then run `npm test`.

Importing `.sbv` files doesn't depend on Meet's page structure, so it keeps working regardless.

## Privacy

- Chats and attendee names are processed and stored **only in your browser** (`chrome.storage.local`). EngageLens makes no network requests.
- Permissions: `storage`, plus host access to `https://meet.google.com/*` only.
- Removing the extension deletes all its data. You can also delete individual meetings from the EngageLens page.

See [PRIVACY.md](PRIVACY.md). The Chrome Web Store requires a public privacy policy; you can publish this file with GitHub Pages.

## Publishing to the Chrome Web Store

1. Register as a Chrome Web Store developer (a one-time US$5 fee).
2. Run `npm run zip` and upload `.output/engagelens-<version>-chrome.zip`.
3. Fill in the store listing:
   - Screenshots of a report.
   - Single purpose: *"Analyse Google Meet chat to show participation, follow-ups and sentiment to the meeting host."*
   - Permission justifications:
     - `storage`: saves meetings locally.
     - `meet.google.com`: reads the chat during calls.
   - Privacy policy URL: link to your published PRIVACY.md.
4. Data-usage disclosures: the extension handles *personal communications* and *personally identifiable information* (names). Declare that this data is not sold, not transferred and not used for anything unrelated to the extension's single purpose.

The store name must stay in the form "EngageLens: Chat Analytics **for** Google Meet". Don't use Google logos.

## Roadmap

- **v1.1:** an AI summary and action items using Chrome's built-in Gemini Nano, with a Transformers.js fallback. Topic clusters, a map of who replies to whom, and support for Meet reactions.
- **v1.2:** trends across a recurring meeting series, alerts for people who stop participating, and a follow-up email draft.
- **Education:** export attendance and participation to an LMS (Moodle/Canvas CSV), plus a "class mode" for participation grading.
- **Later:** transcript analysis, more languages for sentiment, and an optional team dashboard (Supabase free tier).

## Known limitations (MVP)

- Live capture has been tested against a reproduction of Meet's page structure. It has **not yet been tested in a live call**, so check it in a real meeting before publishing (see *When Google changes Meet*).
- Only messages sent after you join are captured. A message's time comes from Meet's clock label if it was already on screen when capture started, or from the moment it was captured otherwise.
- Meet shows a limited number of video tiles in large calls. Open the People panel at least once so everyone is added to the attendee list.
- Sentiment is rule-based and tuned for English. Sarcasm and some local expressions will sometimes be misread.

## License

To be decided by the project owner. Until then, all rights are reserved.
