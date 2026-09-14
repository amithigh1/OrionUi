/* Status, objects & shapes */
const SQ = '<rect x="3" y="3" width="18" height="18" rx="2"/>';
const CIRCLE = '<circle cx="12" cy="12" r="10"/>';

tag('Status', ['info', 'alert-circle', 'alert-triangle', 'check-circle', 'x-circle', 'help-circle', 'loader', 'star', 'sparkles']);
reg('Status', {
  'check-square': SQ + '<path d="m8 12 3 3 5-6"/>',
  'x-square': SQ + '<path d="m15 9-6 6M9 9l6 6"/>',
  'plus-square': SQ + '<path d="M12 8v8M8 12h8"/>',
  'minus-square': SQ + '<path d="M8 12h8"/>',
  'info-square': SQ + '<path d="M12 16v-4M12 8h.01"/>',
  'plus-circle': CIRCLE + '<path d="M12 8v8M8 12h8"/>',
  'minus-circle': CIRCLE + '<path d="M8 12h8"/>',
  'alert-octagon': '<path d="M8.1 2.6h7.8l5.5 5.5v7.8l-5.5 5.5H8.1l-5.5-5.5V8.1z"/><path d="M12 8v4M12 16h.01"/>',
  ban: CIRCLE + '<path d="m4.9 4.9 14.2 14.2"/>',
  slash: '<path d="M19 5 5 19"/>',
  'loader-2': '<path d="M12 6.5v-4M15.89 8.11l2.83-2.83M17.5 12h4M15.89 15.89l2.83 2.83M12 17.5v4M8.11 15.89l-2.83 2.83M6.5 12h-4M8.11 8.11 5.28 5.28"/>',
  'star-half': '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z"/><path d="M12 2v15.6l-6.2 3.2L7 14.2 2 9.3l6.9-1z" fill="currentColor"/>',
  heart: '<path d="M12 20.5C8 17.5 3 14 3 9a4.5 4.5 0 0 1 9-1.5A4.5 4.5 0 0 1 21 9c0 5-5 8.5-9 11.5z"/>',
  'thumbs-up': '<rect x="2" y="10" width="4" height="11" rx="1"/><path d="m6 11 3.5-7.5a2.2 2.2 0 0 1 3 2.3L12 10h6.5a2 2 0 0 1 2 2.3l-1.2 7a2 2 0 0 1-2 1.7H6"/>',
  'thumbs-down': '<rect x="2" y="3" width="4" height="11" rx="1"/><path d="m6 13 3.5 7.5a2.2 2.2 0 0 0 3-2.3L12 14h6.5a2 2 0 0 0 2-2.3l-1.2-7a2 2 0 0 0-2-1.7H6"/>',
  frown: CIRCLE + '<path d="M8 16.5a5 5 0 0 1 8 0M9 9.5h.01M15 9.5h.01"/>',
  meh: CIRCLE + '<path d="M8.5 15h7M9 9.5h.01M15 9.5h.01"/>',
  'circle-dot': CIRCLE + '<circle cx="12" cy="12" r="2" fill="currentColor"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor"/>',
});

reg('Objects', {
  lightbulb: '<path d="M9 17.5v-1.3c0-1.2-.6-2.2-1.3-3.2a6 6 0 1 1 8.6 0c-.7 1-1.3 2-1.3 3.2v1.3z"/><path d="M10 20.5h4"/>',
  target: CIRCLE + '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  crosshair: CIRCLE + '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 13.9 7 22l5-3 5 3-1.5-8.1"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0z"/><path d="M7 5H4.5a.5.5 0 0 0-.5.5V7a3 3 0 0 0 3 3M17 5h2.5a.5.5 0 0 1 .5.5V7a3 3 0 0 1-3 3M12 14v4M8 21v-1a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1z"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13v1.5M15 13v1.5M2 13v2M22 13v2"/><circle cx="12" cy="3" r="1"/>',
  brain: '<path d="M12 5.5A3 3 0 0 0 6.5 4.5 3 3 0 0 0 3.6 8.8 3.5 3.5 0 0 0 3.5 14a3.5 3.5 0 0 0 3 5 3.2 3.2 0 0 0 5.5.5zM12 5.5A3 3 0 0 1 17.5 4.5 3 3 0 0 1 20.4 8.8 3.5 3.5 0 0 1 20.5 14a3.5 3.5 0 0 1-3 5 3.2 3.2 0 0 1-5.5.5z"/><path d="M7.5 9.5a2.5 2.5 0 0 1 2.5 2M16.5 9.5a2.5 2.5 0 0 0-2.5 2M7 15a2.5 2.5 0 0 0 3-.5M17 15a2.5 2.5 0 0 1-3-.5"/>',
  puzzle: '<path d="M4.5 7h4.5a2.2 2.2 0 1 1 3 0h4.5a1 1 0 0 1 1 1v4.5a2.2 2.2 0 1 1 0 3V20a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/>',
  palette: '<path d="M12 2C6.5 2 2 6.2 2 11.5S6 21 11 21c1.4 0 2-1 1.5-2.2l-.4-.9c-.6-1.4.4-2.9 1.9-2.9H17c2.8 0 5-2.2 5-5C22 5.8 17.5 2 12 2z"/><circle cx="7.5" cy="11" r="1.5"/><circle cx="10.5" cy="6.5" r="1.5"/><circle cx="15.5" cy="7" r="1.5"/>',
  'paint-bucket': '<path d="M3.5 12.5 11 5l7.5 7.5-6 6a2 2 0 0 1-2.8 0l-4.7-4.7a1 1 0 0 1-.5-1.3z"/><path d="M11 5 8 2M3.5 12.5h15M20.5 15.5c.9 1.3 1.5 2.2 1.5 3a1.5 1.5 0 0 1-3 0c0-.8.6-1.7 1.5-3z"/>',
  pipette: '<path d="m12 7 5 5M13.5 8 17 4.5a2.1 2.1 0 0 1 3 3L16.5 11M15 11l-8.5 8.5h-2v-2L13 9M4.5 19.5 3 21"/>',
  ruler: '<rect x="2" y="7" width="20" height="10" rx="1.5"/><path d="M6 7v4M10 7v2.5M14 7v4M18 7v2.5"/>',
  scale: '<path d="M12 3v17M7.5 20.5h9M5 6.5h14M5 6.5l-3 7a3 3 0 0 0 6 0zM19 6.5l-3 7a3 3 0 0 0 6 0z"/>',
  gavel: '<path d="M9.5 7.5 14 3l7 7-4.5 4.5z"/><path d="M13 11 4 20M13 21h8"/>',
  stethoscope: '<path d="M5 3v5a5 5 0 0 0 10 0V3M3.5 3h3M13.5 3h3M10 13v2.5a4.5 4.5 0 0 0 9 0V13"/><circle cx="19" cy="10.5" r="2.5"/>',
  'graduation-cap': '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6"/>',
  book: '<path d="M5 19V5a2 2 0 0 1 2-2h12v14M5 19a2 2 0 0 0 2 2h12v-4H7a2 2 0 0 0-2 2z"/>',
  'book-open': '<path d="M2 4.5h6a4 4 0 0 1 4 4V21a3 3 0 0 0-3-3H2zM22 4.5h-6a4 4 0 0 0-4 4V21a3 3 0 0 1 3-3h7z"/>',
  library: '<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="9" y="6" width="4" height="14" rx="1"/><path d="m15.2 6.8 3.4-.9 3.4 13.5-3.4.9z"/>',
  notebook: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 2v20M12 7h4M12 11h4"/>',
  newspaper: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10M14 11h3M14 14h3M7 17.5h10"/><rect x="7" y="10.5" width="4" height="4" rx=".5"/>',
  'sticky-note': '<path d="M15.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10.5z"/><path d="M15.5 21v-4.5a1 1 0 0 1 1-1H21"/>',
  languages: '<path d="M4 5h8M8 3v2M5.5 5c.6 2.8 2.3 5 5 6.5M10.5 5C10 8 8 10.5 4.5 12M12.5 21l4-10 4 10M14 17.5h5"/>',
});

tag('Shapes', ['grip-vertical']);
reg('Shapes', {
  circle: CIRCLE,
  square: SQ,
  triangle: '<path d="M10.3 3.9 2.2 17.5a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  hexagon: '<path d="m12 2 8.66 5v10L12 22l-8.66-5V7z"/>',
  diamond: '<path d="M10.6 3.4a2 2 0 0 1 2.8 0l7.2 7.2a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1 0-2.8z"/>',
  shapes: '<path d="M7.5 3 12 10.5H3z"/><circle cx="17" cy="7" r="4"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/>',
  sparkle: '<path d="M12 3c.5 4.5 3.5 8 9 9-5.5 1-8.5 4.5-9 9-.5-4.5-3.5-8-9-9 5.5-1 8.5-4.5 9-9z"/>',
  'grip-horizontal': '<circle cx="5" cy="9" r="1"/><circle cx="12" cy="9" r="1"/><circle cx="19" cy="9" r="1"/><circle cx="5" cy="15" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="19" cy="15" r="1"/>',
  'drag-handle': '<path d="M5 9h14M5 15h14"/>',
  'more-grid': '<circle cx="5" cy="5" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="19" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="19" r="1"/>',
  command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  option: '<path d="M3 5h6l6 14h6M14 5h7"/>',
});
