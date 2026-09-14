/* Commerce, finance & chart icons */
const AXES = '<path d="M3 3v16a2 2 0 0 0 2 2h16"/>';

reg('Commerce', {
  'shopping-cart': '<path d="M2 3h2.5l2.6 11.4a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 1.9-1.4L21 7H5.4"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>',
  'shopping-bag': '<path d="M4.5 8h15l-1.2 11.2a2 2 0 0 1-2 1.8H7.7a2 2 0 0 1-2-1.8z"/><path d="M8.5 11V7a3.5 3.5 0 0 1 7 0v4"/>',
  'credit-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  wallet: '<path d="M18 8V5.5A1.5 1.5 0 0 0 16.5 4H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6"/><path d="M21 11.5h-3.5a2 2 0 0 0 0 4H21"/>',
  'dollar-sign': '<path d="M12 2v3M12 19v3M17 6.5A4 4 0 0 0 13.5 5h-3a3.5 3.5 0 0 0 0 7h3a3.5 3.5 0 0 1 0 7h-3A4 4 0 0 1 7 17.5"/>',
  euro: '<path d="M17.5 6A7.5 7.5 0 1 0 17.5 18M4 10h9M4 14h9"/>',
  receipt: '<path d="M5 22V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v18l-2.33-1.5L14.33 22 12 20.5 9.67 22l-2.34-1.5z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
  tag: '<path d="M3 4.5v6.3a2 2 0 0 0 .6 1.4l8.5 8.5a2 2 0 0 0 2.8 0l6-6a2 2 0 0 0 0-2.8l-8.5-8.5A2 2 0 0 0 11 3H4.5A1.5 1.5 0 0 0 3 4.5z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  tags: '<path d="M2 7.5v5.1a2 2 0 0 0 .6 1.4l7 7a2 2 0 0 0 2.8 0l4.7-4.7a2 2 0 0 0 0-2.8l-7-7A2 2 0 0 0 8.7 6H3.5A1.5 1.5 0 0 0 2 7.5z"/><path d="M13 3h1.2a2 2 0 0 1 1.4.6l6 6a2 2 0 0 1 0 2.8L19 15"/><circle cx="6.5" cy="10.5" r="1.5"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13M12 8H7.5a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8zM12 8h4.5a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8z"/>',
  store: '<path d="M3 9 4.5 4h15L21 9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M10 21v-5h4v5"/>',
  truck: '<path d="M14 17.5V5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11.5a1 1 0 0 0 1 1h2M9 17.5h6M14 8h4.5l3.5 4.5v4a1 1 0 0 1-1 1h-1.5"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  'package-check': '<path d="M20.5 11V7L12 2.5 3.5 7v10l8.5 4.5"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10M7.75 4.75l8.5 4.5M15 18.5l2 2 4.5-4.5"/>',
  barcode: '<path d="M3 5v14M6.5 5v14M9 5v14M13 5v14M15.5 5v14M18 5v14M21 5v14"/>',
  'qr-code': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20.5 14v.01M14 20.5h.01M17 20.5h3.5V17"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15 9a6 6 0 1 1-6 6M9 6.5v5"/>',
  'piggy-bank': '<path d="M19.5 10.2C18.6 7.7 15.9 6 12.5 6H11C7.4 6 4.5 8.5 4.5 11.8c0 2 1 3.7 2.5 4.8V20h3v-2h4v2h3v-3.4c1.1-.7 2-1.6 2.5-2.6h1.5a1 1 0 0 0 1-1v-1.8a1 1 0 0 0-1-1z"/><path d="M14.5 6.2 16 3.5l1.8 3.1M10 9h3M16.5 9.8h.01M4.5 11.5c-1.4 0-2.5-.9-2.5-2"/>',
});

reg('Charts', {
  'trending-up': '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
  'trending-down': '<path d="m3 7 6 6 4-4 8 8M15 17h6v-6"/>',
  'chart-bar': AXES + '<path d="M8 17v-5M13 17V7M18 17v-8"/>',
  'chart-line': AXES + '<path d="m7 14 4-4 3 3 5-6"/>',
  'chart-area': AXES + '<path d="M7 17v-5l4-4 3 3 5-5v11z"/>',
  'chart-scatter': AXES + '<circle cx="8" cy="15.5" r="1"/><circle cx="11.5" cy="10.5" r="1"/><circle cx="15" cy="14" r="1"/><circle cx="18" cy="8" r="1"/>',
  'chart-pie': '<path d="M11 4a9 9 0 1 0 9 9h-9z"/><path d="M14 2a8 8 0 0 1 8 8h-8z"/>',
  gauge: '<path d="M4.1 18a9 9 0 1 1 15.8 0M12 14l3.5-4.5"/>',
  presentation: '<path d="M2 3h20M4 3v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3M12 16v3M8 21l4-2 4 2M8 11l3-3 2 2 3-3"/>',
});
