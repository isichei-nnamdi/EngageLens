/**
 * Everything that depends on Google Meet's page structure lives here.
 *
 * Meet's markup is obfuscated and changes without notice. Each lookup tries
 * several candidates, most stable first (data-* and ARIA attributes before
 * generated class names). When capture stops working, this is the only file
 * that should need updating. See README › "When Google changes Meet".
 */
export const SELECTORS = {
  /** Any element present only while you are in the call (not the lobby). */
  inCall: ['[jsname="CQylAd"]', 'button[aria-label*="Leave call" i]', 'button[aria-label*="leave call" i]', '[data-participant-id]'],
  /** One chat message bubble. */
  message: ['[data-message-id]'],
  /** The block grouping consecutive messages from one sender. */
  messageGroup: ['[data-sender-id]', '.Ss4fHf'],
  senderName: ['[data-sender-name]', '.poVWob', '.YTbUzc'],
  messageText: ['[jsname="dTKtvb"]', '.oIy2qc'],
  /** Video tiles and People-panel rows, for the attendance roster. */
  participantTile: ['[data-participant-id]', '[data-requested-participant-id]'],
  participantName: ['[data-self-name]', '.notranslate', '.zWGUib', '.XEazBc'],
  peoplePanelItem: ['[role="list"] [role="listitem"][aria-label]'],
  meetingTitle: ['[data-meeting-title]'],
} as const;

const MEETING_CODE_RE = /^\/([a-z]{3,4}-[a-z]{4}-[a-z]{3,4})(?:$|[/?#])/i;
const CLOCK_RE = /\b(\d{1,2}):(\d{2})\s*([AP]\.?M\.?)?\b/i;

/** The words Meet uses for your own messages / tile across common UI languages. */
export const SELF_LABELS = new Set(['you', 'vous', 'tú', 'tu', 'du', 'jij', 'você', 'voi', 'sie', 'ty']);

export function getMeetingCode(pathname: string): string | null {
  return MEETING_CODE_RE.exec(pathname)?.[1]?.toLowerCase() ?? null;
}

const queryAny = (root: ParentNode, selectors: readonly string[]): Element | null => {
  for (const s of selectors) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
};
const queryAll = (root: ParentNode, selectors: readonly string[]): Element[] => {
  const seen = new Set<Element>();
  for (const s of selectors) root.querySelectorAll(s).forEach((el) => seen.add(el));
  return [...seen];
};
const closestAny = (el: Element, selectors: readonly string[]): Element | null => {
  for (const s of selectors) {
    const hit = el.closest(s);
    if (hit) return hit;
  }
  return null;
};

/** Visible text, without the hover-menu buttons Meet nests inside bubbles. */
function cleanText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('button, [role="button"], [aria-hidden="true"], svg, i').forEach((n) => n.remove());
  // Keep line breaks between block children so multi-line messages survive.
  clone.querySelectorAll('div, p, br').forEach((n) => n.after('\n'));
  return (clone.textContent ?? '').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Text nodes joined with spaces: "Ada Obi" + "5:52 PM" must not become "Ada Obi5:52 PM". */
function spacedText(el: Element): string {
  const parts: string[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent?.trim();
    if (t) parts.push(t);
  }
  return parts.join(' ');
}

export const isInCall =(doc: Document) => !!queryAny(doc, SELECTORS.inCall);

export interface ScrapedMessage {
  id: string;
  sender: string;
  text: string;
  /** Clock text shown on the message group, e.g. "5:52 PM", if found. */
  clock?: string;
}

export function extractMessages(root: ParentNode): ScrapedMessage[] {
  const out: ScrapedMessage[] = [];
  for (const el of queryAll(root, SELECTORS.message)) {
    const id = el.getAttribute('data-message-id');
    if (!id) continue;
    const textEl = queryAny(el, SELECTORS.messageText) ?? el;
    const text = cleanText(textEl);
    if (!text) continue;

    const group = closestAny(el, SELECTORS.messageGroup) ?? el.parentElement?.parentElement ?? null;
    let sender = group?.getAttribute('data-sender-name') ?? '';
    if (!sender && group) {
      const nameEl = queryAny(group, SELECTORS.senderName);
      sender = nameEl ? cleanText(nameEl) : '';
    }
    let clock: string | undefined;
    if (group) {
      // The header is the group's text before the first message bubble.
      const header = group.firstElementChild && !group.firstElementChild.contains(el) ? spacedText(group.firstElementChild) : '';
      clock = CLOCK_RE.exec(header)?.[0];
      if (!sender && header) sender = header.replace(CLOCK_RE, '').trim();
    }
    out.push({ id, sender: sender || 'Unknown', text, clock });
  }
  return out;
}

/** Everyone currently visible as a tile or in the People panel. */
export function extractRoster(root: ParentNode): string[] {
  const names = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const n = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (n && n.length <= 80 && !SELF_LABELS.has(n.toLowerCase()) && !/^\(?(you|presentation|presenting)\)?$/i.test(n)) names.add(n);
  };
  for (const tile of queryAll(root, SELECTORS.participantTile)) {
    const self = tile.querySelector('[data-self-name]')?.getAttribute('data-self-name');
    if (self) add(self);
    const nameEl = queryAny(tile, SELECTORS.participantName);
    add(nameEl?.textContent);
  }
  for (const item of queryAll(root, SELECTORS.peoplePanelItem)) add(item.getAttribute('aria-label'));
  return [...names];
}

export function extractMeetingTitle(doc: Document, code: string): string {
  const el = queryAny(doc, SELECTORS.meetingTitle);
  const attr = el?.getAttribute('data-meeting-title')?.trim();
  if (attr && attr.toLowerCase() !== code) return attr;
  const fromTitle = doc.title.replace(/^Meet\s*[-–:]\s*/i, '').trim();
  return fromTitle && fromTitle.toLowerCase() !== code && !/^google meet$/i.test(fromTitle) ? fromTitle : `Google Meet ${code}`;
}

/**
 * Convert a clock label ("5:52 PM" / "17:52") to epoch ms on the same day as
 * `ref`, choosing the day that puts it closest to `ref`.
 */
export function clockToEpoch(clock: string, ref: number): number | undefined {
  const m = CLOCK_RE.exec(clock);
  if (!m) return undefined;
  let h = +m[1];
  const min = +m[2];
  const ampm = m[3]?.replace(/\./g, '').toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return undefined;
  const d = new Date(ref);
  d.setHours(h, min, 0, 0);
  const day = 86_400_000;
  const candidates = [d.getTime() - day, d.getTime(), d.getTime() + day];
  return candidates.reduce((best, c) => (Math.abs(c - ref) < Math.abs(best - ref) ? c : best));
}
