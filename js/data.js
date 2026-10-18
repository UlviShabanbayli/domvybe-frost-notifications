// DV58 FROST: the notifications (fictional apps and people) and their app icons (hand-drawn SVG, no real brands).

const sq = (id, body, a, b) => `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="ic-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="24" height="24" rx="6.2" fill="url(#ic-${id})"/>${body}</svg>`;

export const ICONS = {
  aura: sq('aura', '<path d="M12 5.2 6.4 18.4h2.7l1.1-2.8h3.6l1.1 2.8h2.7L12 5.2Zm0 4.9 1.2 3.4h-2.4L12 10.1Z" fill="#fff"/>', '#4FA3FF', '#1F5FE0'),
  calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6.2" fill="#fff"/><path d="M0 6.2A6.2 6.2 0 0 1 6.2 0h11.6A6.2 6.2 0 0 1 24 6.2V8H0Z" fill="#F0453A"/><g fill="#2B3446"><rect x="5.5" y="11" width="3" height="3" rx=".8"/><rect x="10.5" y="11" width="3" height="3" rx=".8"/><rect x="15.5" y="11" width="3" height="3" rx=".8"/><rect x="5.5" y="15.6" width="3" height="3" rx=".8"/><rect x="10.5" y="15.6" width="3" height="3" rx=".8" fill="#F0453A"/></g></svg>`,
  mail: sq('mail', '<rect x="5" y="7.2" width="14" height="9.8" rx="1.8" fill="#fff"/><path d="m5.6 8 6.4 4.9L18.4 8" fill="none" stroke="#2E7BF0" stroke-width="1.5" stroke-linejoin="round"/>', '#58B4FF', '#2068E8'),
  files: sq('files', '<path d="M5 8.2c0-.9.7-1.6 1.6-1.6h3.2l1.5 1.6h6.1c.9 0 1.6.7 1.6 1.6v6.6c0 .9-.7 1.6-1.6 1.6H6.6c-.9 0-1.6-.7-1.6-1.6Z" fill="#fff"/><path d="M5 10.4h14" stroke="#2BB6C9" stroke-width="1.2"/>', '#46D6E4', '#1593B8'),
  weather: sq('weather', '<g stroke="#fff" stroke-width="1.6" stroke-linecap="round"><path d="M12 5.5v13M6.4 8.75l11.2 6.5M6.4 15.25l11.2-6.5"/><path d="m10.3 6.6 1.7 1.3 1.7-1.3M10.3 17.4l1.7-1.3 1.7 1.3" fill="none"/></g>', '#6CC8FF', '#3A6FE8'),
  photos: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6.2" fill="#fff"/><g opacity=".92"><ellipse cx="12" cy="7.6" rx="2.4" ry="3.6" fill="#FFB020"/><ellipse cx="12" cy="16.4" rx="2.4" ry="3.6" fill="#3A8BFF"/><ellipse cx="7.6" cy="12" rx="3.6" ry="2.4" fill="#34C759"/><ellipse cx="16.4" cy="12" rx="3.6" ry="2.4" fill="#FF4D6D"/></g></svg>`,
  shield: sq('shield', '<path d="M12 5.4 6.8 7.3v4.3c0 3.3 2.2 5.8 5.2 7 3-1.2 5.2-3.7 5.2-7V7.3Z" fill="#fff"/><path d="m9.6 12.1 1.7 1.7 3.2-3.3" fill="none" stroke="#21A366" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>', '#3FD68A', '#14915A'),
  music: sq('music', '<path d="M15.8 5.6v8.9a2.3 2.3 0 1 1-1.4-2.1V8.3l-4.6 1.1v6.3a2.3 2.3 0 1 1-1.4-2.1V7.8Z" fill="#fff"/>', '#FF6B8B', '#E0245E'),
  pay: sq('pay', '<rect x="5.2" y="7.4" width="13.6" height="9.4" rx="1.8" fill="#fff"/><path d="M5.2 10h13.6" stroke="#6E56F0" stroke-width="1.6"/><rect x="7" y="13" width="4" height="1.4" rx=".7" fill="#6E56F0"/>', '#9C86FF', '#5B3FE6'),
};

const MIN = 60e3;
// newest first. `ago` is minutes before the page opened.
export const SEED = [
  { app: 'mail', name: 'Mail', title: 'You have new mail', who: 'Lena Ortiz', body: 'You have 3 new messages, including the signed brief for the winter launch.', ago: 1 },
  { app: 'mail', name: 'Mail', title: 'You have new mail', who: 'Theo Park', body: 'Re: Glacier campaign. Final renders are attached, ready for your notes.', ago: 6 },
  { app: 'calendar', name: 'Calendar', title: 'Meeting soon', who: 'Design review · 10:30, Room 3', body: 'Starts in 20 minutes with Mira, Jonah and four others.', ago: 14 },
  { app: 'aura', name: 'Aura', title: 'Message received', who: 'Sena Kaya', body: 'Landed in Oslo and it is snowing. See you at the studio?', ago: 27 },
  { app: 'files', name: 'Files', title: 'Upload complete', who: 'Winter lookbook.pdf', body: 'Shared with the brand team. 24 MB, 36 pages.', ago: 41 },
  { app: 'weather', name: 'Weather', title: 'Snow tonight', who: 'Heavy snow from 10 pm', body: '−6° and wind at 18 km/h. Leave a little early tomorrow.', ago: 58 },
  { app: 'photos', name: 'Photos', title: 'New memory', who: 'Frozen lake, one year ago', body: '24 photos and 2 videos from the north shore.', ago: 75 },
  { app: 'shield', name: 'Aura ID', title: 'New sign-in', who: 'Laptop · Oslo, Norway', body: 'If this was not you, secure your account now.', ago: 96 },
  { app: 'music', name: 'Music', title: 'New release', who: 'Polar Lights by North Arc', body: 'The new album is out now. Listen first in your library.', ago: 130 },
];

// what arrives next (the demo cycles through these)
export const POOL = [
  { app: 'aura', name: 'Aura', title: 'Message received', who: 'Jonah Reyes', body: 'Running five minutes late. Order me a flat white?' },
  { app: 'calendar', name: 'Calendar', title: 'Starting now', who: 'Winter launch sync · Room 1', body: 'Mira has joined. Tap to open the agenda.' },
  { app: 'pay', name: 'Wallet', title: 'Payment received', who: 'Studio Nord · $1,280.00', body: 'Invoice #2048 is paid. The receipt is in Files.' },
  { app: 'mail', name: 'Mail', title: 'You have new mail', who: 'Mira Sato', body: 'Loved the frost direction. Two small notes on the last frame.' },
  { app: 'weather', name: 'Weather', title: 'First frost', who: 'Clear and −9° at dawn', body: 'Ice on the roads before 8 am. Drive carefully.' },
  { app: 'files', name: 'Files', title: 'Shared with you', who: 'Aurora reel v4.mov', body: 'Jonah shared a 1.2 GB video in Winter launch.' },
];

export const minutesAgo = (m) => Date.now() - m * MIN;
