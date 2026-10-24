/** Where a meeting's chat came from. */
export type MeetingSource = 'live' | 'sbv';

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  /** Seconds from the start of the meeting (or recording, for .sbv files). */
  t: number;
}

/** Someone seen in the call (tiles or People panel), whether or not they chatted. */
export interface RosterEntry {
  name: string;
  /** Seconds from meeting start. */
  firstSeen: number;
  lastSeen: number;
}

export interface Meeting {
  id: string;
  title: string;
  source: MeetingSource;
  status: 'recording' | 'ended';
  /** Epoch ms of t = 0, when known. */
  startedAt?: number;
  /**
   * True when `startedAt` encodes a wall-clock time with no known zone
   * (e.g. parsed from an .sbv filename). Format it in UTC so the clock reads
   * exactly as written, and show `timezoneLabel` beside it.
   */
  wallClock?: boolean;
  timezoneLabel?: string;
  /** Known for live captures; otherwise derived from the last message. */
  durationSec?: number;
  meetingCode?: string;
  /** The person viewing the report (usually the host). Used to flag requests aimed at them. */
  hostName?: string;
  fileName?: string;
  messages: ChatMessage[];
  roster: RosterEntry[];
  createdAt: number;
  updatedAt: number;
}

export type MeetingSummary = Pick<
  Meeting,
  'id' | 'title' | 'source' | 'status' | 'startedAt' | 'wallClock' | 'timezoneLabel' | 'createdAt' | 'updatedAt'
> & { messageCount: number; peopleCount: number };

export interface Settings {
  /** Your display name in Google Meet; Meet labels your own messages "You". */
  myName: string;
  /** Open the report in a new tab as soon as a call ends. */
  autoOpenReport: boolean;
}

export const DEFAULT_SETTINGS: Settings = { myName: '', autoOpenReport: true };
