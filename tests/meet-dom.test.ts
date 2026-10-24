// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { clockToEpoch, extractMeetingTitle, extractMessages, extractRoster, getMeetingCode, isInCall } from '../src/lib/meet-dom';

// A trimmed-down snapshot of Meet's chat and tile markup. When Meet changes,
// update this fixture together with SELECTORS.
const FIXTURE = `
  <button jsname="CQylAd" aria-label="Leave call"></button>
  <div data-participant-id="p1"><span class="notranslate">Ada Obi</span></div>
  <div data-participant-id="p2"><span class="notranslate">You</span></div>
  <div role="list" aria-label="Participants"><div role="listitem" aria-label="Tunde Bello"></div></div>
  <div aria-live="polite">
    <div class="Ss4fHf" data-sender-id="s1">
      <div class="HNucUd"><div class="poVWob">Ada Obi</div><div class="MuzmKe">5:52 PM</div></div>
      <div class="beTDc">
        <div data-message-id="m1"><div jsname="dTKtvb"><div>Good evening all</div></div><button>Pin message</button></div>
        <div data-message-id="m2"><div jsname="dTKtvb"><div>Line one</div><div>Line two https://forms.gle/x</div></div></div>
      </div>
    </div>
    <div class="Ss4fHf" data-sender-id="s2">
      <div class="HNucUd"><div class="poVWob">You</div><div class="MuzmKe">5:53 PM</div></div>
      <div class="beTDc"><div data-message-id="m3"><div jsname="dTKtvb">👍</div></div></div>
    </div>
  </div>`;

describe('Meet DOM extraction', () => {
  beforeEach(() => {
    document.body.innerHTML = FIXTURE;
    document.title = 'Meet - abc-defg-hij';
  });

  it('reads messages with sender, clean text and clock', () => {
    expect(extractMessages(document)).toEqual([
      { id: 'm1', sender: 'Ada Obi', text: 'Good evening all', clock: '5:52 PM' },
      { id: 'm2', sender: 'Ada Obi', text: 'Line one\nLine two https://forms.gle/x', clock: '5:52 PM' },
      { id: 'm3', sender: 'You', text: '👍', clock: '5:53 PM' },
    ]);
  });

  it('collects the roster from tiles and the People panel, minus "You"', () => {
    expect(extractRoster(document).sort()).toEqual(['Ada Obi', 'Tunde Bello']);
  });

  it('detects being in a call', () => {
    expect(isInCall(document)).toBe(true);
    document.body.innerHTML = '<div>You left the meeting</div>';
    expect(isInCall(document)).toBe(false);
  });

  it('parses meeting codes and titles', () => {
    expect(getMeetingCode('/abc-defg-hij')).toBe('abc-defg-hij');
    expect(getMeetingCode('/landing')).toBeNull();
    expect(extractMeetingTitle(document, 'abc-defg-hij')).toBe('Google Meet abc-defg-hij');
    document.title = 'Meet - Weekly Supervision';
    expect(extractMeetingTitle(document, 'abc-defg-hij')).toBe('Weekly Supervision');
  });

  it('converts clock labels to the nearest matching time', () => {
    const ref = new Date(2026, 9, 23, 18, 0).getTime();
    expect(clockToEpoch('5:52 PM', ref)).toBe(new Date(2026, 9, 23, 17, 52).getTime());
    expect(clockToEpoch('17:52', ref)).toBe(new Date(2026, 9, 23, 17, 52).getTime());
    const nearMidnight = new Date(2026, 9, 24, 0, 5).getTime();
    expect(clockToEpoch('11:58 PM', nearMidnight)).toBe(new Date(2026, 9, 23, 23, 58).getTime());
  });
});
