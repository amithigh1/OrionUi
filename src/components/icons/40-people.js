/* Communication, people & security icons */
const PERSON_L = '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/>';
const SHIELD = '<path d="M12 21.5c-4.5-1.8-8-5-8-10V5.5l8-3 8 3v6c0 5-3.5 8.2-8 10z"/>';
const BADGE = '<path d="M19.67 8.82a4 4 0 0 1 0 6.36 4 4 0 0 1-4.49 4.49 4 4 0 0 1-6.36 0 4 4 0 0 1-4.49-4.49 4 4 0 0 1 0-6.36 4 4 0 0 1 4.49-4.49 4 4 0 0 1 6.36 0 4 4 0 0 1 4.49 4.49z"/>';
const PHONE = 'M5 3h3.5l2 5L8 9.5a11 11 0 0 0 6.5 6.5l1.5-2.5 5 2V19a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z';

tag('Communication', ['bell', 'inbox', 'send']);
reg('Communication', {
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m3 7 9 6 9-6"/>',
  'mail-open': '<path d="M3 10v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9l-7.8-5.7a2 2 0 0 0-2.4 0z"/><path d="m3 10 9 6.5 9-6.5"/>',
  'message-circle': '<path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z"/>',
  'message-square': '<path d="M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6l-5 4v-4H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>',
  messages: '<path d="M10 11a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2v3l-3-3h-4a2 2 0 0 1-2-2z"/><path d="M16 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2v3l3-3h2"/>',
  phone: '<path d="' + PHONE + '"/>',
  'phone-call': '<path d="' + PHONE + '"/><path d="M14.5 2a7.5 7.5 0 0 1 7.5 7.5M14.5 6A3.5 3.5 0 0 1 18 9.5"/>',
  'phone-off': '<path d="M6.06 14.4A16 16 0 0 1 3 5a2 2 0 0 1 2-2h3.5l2 5L8 9.5a11 11 0 0 0 1.07 2.2M12.3 14.9a11 11 0 0 0 2.2 1.1l1.5-2.5 5 2V19a2 2 0 0 1-2 2A16 16 0 0 1 9.6 17.9M22 2 2 22"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3.5v11L16 14"/>',
  'video-off': '<path d="M4.5 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 1.4-.6M8 6h6a2 2 0 0 1 2 2v5M16 10l6-3.5v11L16 14M2 2l20 20"/>',
  voicemail: '<circle cx="6" cy="12" r="4"/><circle cx="18" cy="12" r="4"/><path d="M6 16h12"/>',
  rss: '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  megaphone: '<path d="M3 10.5v3A1.5 1.5 0 0 0 4.5 15H7l10 5V4L7 9H4.5A1.5 1.5 0 0 0 3 10.5z"/><path d="M7 15v4.5a1.5 1.5 0 0 0 3 0v-3M20 9.5a3 3 0 0 1 0 5"/>',
  'bell-off': '<path d="M15 17H3s3-2 3-8M7.5 4A6 6 0 0 1 18 8c0 7 3 9 3 9h-2M10.3 21a1.9 1.9 0 0 0 3.4 0M2 2l20 20"/>',
  'bell-ring': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0M19.5 2.5A8 8 0 0 1 22 8M4.5 2.5A8 8 0 0 0 2 8"/>',
  'at-sign': '<circle cx="12" cy="12" r="3.5"/><path d="M15.5 8.5V13a2.8 2.8 0 0 0 5.6 0v-1a9.1 9.1 0 1 0-3.6 7.3"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
});

tag('People', ['user']);
reg('People', {
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20v-.5A5.5 5.5 0 0 1 7.5 14h3a5.5 5.5 0 0 1 5.5 5.5v.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.3A5.5 5.5 0 0 1 22 19.5v.5"/>',
  'user-plus': PERSON_L + '<path d="M19 8v6M16 11h6"/>',
  'user-minus': PERSON_L + '<path d="M16 11h6"/>',
  'user-check': PERSON_L + '<path d="m16 11 2 2 4-4"/>',
  'user-x': PERSON_L + '<path d="m17 8.5 4 4M21 8.5l-4 4"/>',
  'user-circle': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.7a6.5 6.5 0 0 1 11 0"/>',
  contact: '<rect x="5" y="2" width="15" height="20" rx="2"/><path d="M3 7h4M3 12h4M3 17h4"/><circle cx="12.5" cy="10" r="2.5"/><path d="M9 17a3.5 3.5 0 0 1 7 0"/>',
  'id-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16a3 3 0 0 1 6 0M14 10h4M14 14h4"/>',
  'badge-check': BADGE + '<path d="m8.5 12 2.5 2.5 5-5"/>',
  'badge-alert': BADGE + '<path d="M12 8v4.5M12 16h.01"/>',
  crown: '<path d="M3 6.5 7.5 12 12 4.5l4.5 7.5L21 6.5 19 17H5z"/><path d="M5 20.5h14"/>',
  accessibility: '<circle cx="12" cy="4.5" r="2"/><path d="M4.5 9 12 10.5 19.5 9M12 10.5v4M12 14.5 8.5 21M12 14.5l3.5 6.5"/>',
});

tag('Security', ['lock', 'eye', 'eye-off']);
reg('Security', {
  shield: SHIELD,
  'shield-check': SHIELD + '<path d="m8.5 12 2.5 2.5 5-5"/>',
  'shield-alert': SHIELD + '<path d="M12 7.5v5M12 16h.01"/>',
  key: '<circle cx="7.5" cy="16.5" r="4.5"/><path d="M10.7 13.3 20.5 3.5M17.5 6.5l2.5 2.5M14.5 9.5l2 2"/>',
  'lock-open': '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.6-1.9"/>',
  fingerprint: '<path d="M4.2 16.5A9 9 0 1 1 20.5 15.1M6.5 18.5c-.3-1.3-.5-2.8-.5-4.5V12a6 6 0 0 1 12 0v2.5c0 2.2-.4 4.3-1.1 6.1M9.3 20.5c.5-1.6.7-3.2.7-5V12a2 2 0 0 1 4 0v3.5c0 2.3-.4 4.4-1.2 6.2"/>',
  'scan-face': '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M9 9.5v1M15 9.5v1M9 15a4 4 0 0 0 6 0"/>',
  'eye-closed': '<path d="M2 8.5c2.5 3.5 6 5.5 10 5.5s7.5-2 10-5.5M4.5 12 3 14M19.5 12l1.5 2M9 13.5l-.8 2.5M15 13.5l.8 2.5"/>',
});
