/* Devices, connectivity & media icons */
const CONE = '<path d="M11 5v14l-5-4H3.5a.5.5 0 0 1-.5-.5v-5a.5.5 0 0 1 .5-.5H6z"/>';
const CAMERA = 'M22 18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z';

tag('Devices', ['monitor', 'wifi-off']);
reg('Devices', {
  printer: '<path d="M7 8V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="7" y="13" width="10" height="8" rx="1"/><path d="M17.5 11h.01"/>',
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  tablet: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M11 18h2"/>',
  laptop: '<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M4 15 2.3 18.6a1 1 0 0 0 .9 1.4h17.6a1 1 0 0 0 .9-1.4L20 15"/>',
  desktop: '<rect x="2" y="4" width="13" height="10" rx="1.5"/><path d="M8.5 14v4M5.5 18h6"/><rect x="17" y="4" width="5" height="16" rx="1"/><path d="M19.5 8h.01"/>',
  tv: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="m7 3 5 4 5-4"/>',
  watch: '<circle cx="12" cy="12" r="6"/><path d="M9 6.8 9.5 2h5l.5 4.8M9 17.2l.5 4.8h5l.5-4.8M12 10v2l1.5 1.5"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9.5 14h5"/>',
  mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
  'mouse-pointer': '<path d="M4.5 4.5 10 20l2.5-7.5L20 10z"/><path d="m12.5 12.5 6 6"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>',
  speaker: '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><path d="M12 6h.01"/>',
  cast: '<path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 12a8 8 0 0 1 8 8M2 16a4 4 0 0 1 4 4M2 20h.01"/>',
  bluetooth: '<path d="m7 7.5 10 9L12 21V3l5 4.5-10 9"/>',
  wifi: '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.9a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20h.01"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/>',
  'battery-charging': '<path d="M7 17H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2.5M14.5 7H17a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2.5M22 11v2M11.5 5l-3 7h5l-3 7"/>',
  signal: '<path d="M4 20v-2M9 20v-6M14 20V9M19 20V4"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>',
  plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
  zap: '<path d="M13.5 2 4.5 13.5H12L10.5 22l9-11.5H12z"/>',
});

tag('Media', ['play', 'pause', 'image', 'mic']);
reg('Media', {
  camera: '<path d="' + CAMERA + '"/><circle cx="12" cy="13" r="3.5"/>',
  'camera-off': '<path d="M5.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14M8 5.5 9 4h6l2 3h3a2 2 0 0 1 2 2v8M10.8 9.71a3.5 3.5 0 0 1 4.49 4.49M14.39 15.56a3.5 3.5 0 0 1-4.95-4.95M2 2l20 20"/>',
  'mic-off': '<path d="M9 7.5V5a3 3 0 0 1 6 0v6a3 3 0 0 1-.4 1.5M9 10.5v.5a3 3 0 0 0 3 3M19 10v1a7 7 0 0 1-1.27 4.01M14.85 17.39A7 7 0 0 1 5 11v-1M12 18v4M8 22h8M2 2l20 20"/>',
  volume: CONE + '<path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>',
  'volume-1': CONE + '<path d="M15 9a4 4 0 0 1 0 6"/>',
  'volume-x': CONE + '<path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h4M3 16.5h4M17 7.5h4M17 12h4M17 16.5h4"/>',
  music: '<path d="M9 17.5v-12L20 3v12M9 9.5 20 7"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="15" r="2.5"/>',
  images: '<rect x="6" y="7" width="16" height="14" rx="2"/><path d="M2 17V5a2 2 0 0 1 2-2h14M22 17l-3.5-3.5L10 21"/><circle cx="10.5" cy="11.5" r="1.5"/>',
  'play-circle': '<circle cx="12" cy="12" r="10"/><path d="M10 8.5v7l5.5-3.5z"/>',
  stop: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  'skip-back': '<path d="M19 19.5 9 12l10-7.5zM5 19V5"/>',
  'skip-forward': '<path d="M5 4.5 15 12 5 19.5zM19 5v14"/>',
  rewind: '<path d="M11 18.5 3 12l8-6.5zM21 18.5 13 12l8-6.5z"/>',
  'fast-forward': '<path d="M13 18.5 21 12l-8-6.5zM3 18.5 11 12 3 5.5z"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"/>',
  shuffle: '<path d="M2 18h2a5 5 0 0 0 4.2-2.3l5.6-7.4A5 5 0 0 1 18 6h3M2 6h2a5 5 0 0 1 4.2 2.3l1.2 1.6M12.6 14.1l1.2 1.6A5 5 0 0 0 18 18h3M18 3l3 3-3 3M18 15l3 3-3 3"/>',
});
