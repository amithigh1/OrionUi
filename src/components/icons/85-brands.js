/* Brand glyphs — simplified monochrome marks (currentColor). Trademarks belong to their owners. */
const FILL = ' fill="currentColor" stroke="none"';

reg('Brands', {
  'brand-google': '<path d="M18 6A8.5 8.5 0 1 0 20.5 12H12"/>',
  'brand-microsoft': '<path' + FILL + ' d="M3 3h8.5v8.5H3zM12.5 3H21v8.5h-8.5zM3 12.5h8.5V21H3zM12.5 12.5H21V21h-8.5z"/>',
  'brand-apple': '<path d="M8.5 7.2c-2.7 0-5 2.2-5 5.8 0 3.8 2.5 8.5 5 8.5 1.1 0 1.8-.6 3.5-.6s2.4.6 3.5.6c1.8 0 3.6-2.6 4.5-5.2-1.6-.7-2.6-2.2-2.6-4 0-1.5.8-2.9 2-3.6-.9-1.1-2.3-1.5-3.4-1.5-1.7 0-2.8.8-4 .8s-1.8-.8-3.5-.8z"/><path d="M12.3 5.8c0-2 1.6-3.6 3.7-3.6 0 2-1.6 3.6-3.7 3.6z"/>',
  'brand-github': '<path d="M8 21v-3.2c-2.9-.5-5-2.4-5-6.3 0-1.3.4-2.5 1.2-3.4-.2-1.1-.1-2.3.3-3.3 1.2 0 2.3.6 3.2 1.3a10 10 0 0 1 8.6 0c.9-.7 2-1.3 3.2-1.3.4 1 .5 2.2.3 3.3.8.9 1.2 2.1 1.2 3.4 0 3.9-2.1 5.8-5 6.3V21"/><path d="M8 19c-2.3.5-3.4-.4-4-1.6-.4-.7-.9-1.1-1.5-1.3"/>',
  'brand-gitlab': '<path d="M12 21.5 2.3 14.2a1 1 0 0 1-.4-1.1L5 3.6a.5.5 0 0 1 .95 0L8.3 10h7.4l2.35-6.4a.5.5 0 0 1 .95 0l3.1 9.5a1 1 0 0 1-.4 1.1z"/><path d="M8.3 10 12 21.5l3.7-11.5"/>',
  'brand-facebook': '<circle cx="12" cy="12" r="10"/><path d="M13 22v-9.5A3.5 3.5 0 0 1 16.5 9h.5M9.5 13h7"/>',
  'brand-x': '<path d="M4 4h4.3L20 20h-4.3z"/><path d="M4 20l6.8-6.8M13.2 10.8 20 4"/>',
  'brand-linkedin': '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 11v6M8 7.5v.01M12 17v-6M12 13.5a2.5 2.5 0 0 1 5 0V17"/>',
  'brand-whatsapp': '<path d="m3 21 1.6-4.7A9 9 0 1 1 7.7 19.5z"/><path' + FILL + ' d="M9 8.3c.1 4.1 3.3 7.4 7.4 7.5l.9-1.6-2.2-1.1-.9.9a4.4 4.4 0 0 1-2.9-3l.9-.9-1.1-2.2z"/>',
  'brand-telegram': '<path d="M21.5 3.5 2.5 11l6 2.3 8.5 6.5z"/><path d="m8.5 13.3 7-5.3M8.5 13.3 10 19l2.3-3.3"/>',
  'brand-reddit': '<ellipse cx="12" cy="14.5" rx="8" ry="5.5"/><circle cx="18.5" cy="4.5" r="1.5"/><path d="m12 9 1.2-5.5 3.8.8M9 14h.01M15 14h.01M9.5 17c1.5.9 3.5.9 5 0"/><circle cx="4.5" cy="10.5" r="1.5"/><circle cx="19.5" cy="10.5" r="1.5"/>',
  'brand-youtube': '<path' + FILL + ' fill-rule="evenodd" d="M6.5 5h11A4.5 4.5 0 0 1 22 9.5v5a4.5 4.5 0 0 1-4.5 4.5h-11A4.5 4.5 0 0 1 2 14.5v-5A4.5 4.5 0 0 1 6.5 5zM10 8.8v6.4l5.6-3.2z"/>',
  'brand-instagram': '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  'brand-slack': '<g' + FILL + '><rect x="8.4" y="2" width="3.2" height="9.6" rx="1.6"/><rect x="12.4" y="8.4" width="9.6" height="3.2" rx="1.6"/><rect x="12.4" y="12.4" width="3.2" height="9.6" rx="1.6"/><rect x="2" y="12.4" width="9.6" height="3.2" rx="1.6"/><circle cx="14" cy="3.6" r="1.6"/><circle cx="20.4" cy="14" r="1.6"/><circle cx="10" cy="20.4" r="1.6"/><circle cx="3.6" cy="10" r="1.6"/></g>',
  'brand-discord': '<path d="M6 6.5C7.5 5.6 9 5.1 10.5 5l.5 1h2l.5-1c1.5.1 3 .6 4.5 1.5 3 3 4 6.5 4 10.5-1.5 1.3-3.2 2.1-5 2.5l-1.2-2c-2.4.8-5.2.8-7.6 0L7 19.5C5.2 19.1 3.5 18.3 2 17c0-4 1-7.5 4-10.5z"/><circle cx="9" cy="12.5" r="1.3" fill="currentColor"/><circle cx="15" cy="12.5" r="1.3" fill="currentColor"/>',
});
