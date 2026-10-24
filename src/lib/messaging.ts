import type { ChatMessage } from './types';

/** Content script → background. */
export type ToBackground =
  | { type: 'session:start'; meetingCode: string; title: string; startedAt: number }
  | { type: 'session:messages'; meetingId: string; messages: ChatMessage[]; selfName?: string }
  | { type: 'session:roster'; meetingId: string; names: string[]; t: number }
  | { type: 'session:end'; meetingId: string; endedAt: number }
  | { type: 'open-report'; meetingId: string };

/** Popup → content script. */
export type ToContent = { type: 'status' } | { type: 'end-now' };

export interface CaptureStatus {
  inMeeting: boolean;
  recording: boolean;
  meetingId?: string;
  meetingCode?: string;
  title?: string;
  messages: number;
  people: number;
}
