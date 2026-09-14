/* Places & travel, time, weather & nature icons */
const CAL = '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>';

tag('Places', ['home']);
reg('Places', {
  map: '<path d="M3 6v14l6-2.5 6 2.5 6-2.5V3.5L15 6 9 3.5z"/><path d="M9 3.5v14M15 6v14"/>',
  'map-pin': '<path d="M12 21.5c-3.5-3.5-7-7.2-7-11.5a7 7 0 0 1 14 0c0 4.3-3.5 8-7 11.5z"/><circle cx="12" cy="10" r="2.5"/>',
  navigation: '<path d="M12 2.5 19.5 21 12 17l-7.5 4z"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c2.7 2.7 4 6 4 10s-1.3 7.3-4 10c-2.7-2.7-4-6-4-10s1.3-7.3 4-10z"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8.5 6h1M14.5 6h1M8.5 10h1M14.5 10h1M8.5 14h1M14.5 14h1M10 22v-4h4v4"/>',
  'building-2': '<path d="M3 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M15 9h4a2 2 0 0 1 2 2v10M2 21h20M7 7h4M7 11h4M7 15h4M18 13v.01M18 17v.01"/>',
  landmark: '<path d="M3 9.5 12 4l9 5.5zM5 12.5v5M9.5 12.5v5M14.5 12.5v5M19 12.5v5M3 21h18"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 12.5h8M14 12.5h8"/><rect x="10" y="11" width="4" height="3.5" rx="1"/>',
  plane: '<path d="M12 2c.8 0 1.5 1 1.5 2.5V9l7.5 4.5V16l-7.5-2.5V18l2.5 2v1.5l-4-1-4 1V20l2.5-2v-4.5L3 16v-2.5L10.5 9V4.5C10.5 3 11.2 2 12 2z"/>',
  car: '<path d="M2.5 16v-4a1 1 0 0 1 .4-.8L5.5 9.5l2-4A1 1 0 0 1 8.4 5h7.2a1 1 0 0 1 .9.5l2 4 2.6 1.7a1 1 0 0 1 .4.8V16a1 1 0 0 1-1 1h-1.5M5 17H3.5a1 1 0 0 1-1-1M9 17h6M5.5 9.5h13"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  bike: '<circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16 9.5 9h6.5M9.5 9l3 7 3.5-7 2.5 7M5.5 16h7M14.5 5.5h2l-.5 3.5M8 7h3"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14M12 3v7M8.5 13.5h.01M15.5 13.5h.01M8 17l-2 4M16 17l2 4"/>',
  anchor: '<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V21M8 11h8M4 13a8 8 0 0 0 16 0M2 15l2-2 2 2M18 15l2-2 2 2"/>',
  rocket: '<path d="M12 2c3 2.5 4.5 6 4.5 10v5.5h-9V12c0-4 1.5-7.5 4.5-10z"/><path d="M7.5 13 4.5 16v3.5l3-2M16.5 13l3 3v3.5l-3-2M10.5 20.5 12 22l1.5-1.5"/><circle cx="12" cy="9.5" r="1.5"/>',
});

tag('Time', ['calendar', 'clock']);
reg('Time', {
  'calendar-check': CAL + '<path d="m9 16 2 2 4-4"/>',
  'calendar-plus': CAL + '<path d="M12 13v6M9 16h6"/>',
  'calendar-x': CAL + '<path d="m9.5 13.5 5 5M14.5 13.5l-5 5"/>',
  'calendar-range': CAL + '<path d="M7 14h10M7 18h6"/>',
  'alarm-clock': '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M4.5 3.5 2 6M19.5 3.5 22 6M6.5 19 5 21M17.5 19l1.5 2"/>',
  timer: '<circle cx="12" cy="14" r="8"/><path d="M10 2h4M12 2v4M12 14l3-3M20 6l-1.5 1.5"/>',
  hourglass: '<path d="M5 2h14M5 22h14M7 2v3c0 2.5 2 4.5 5 7-3 2.5-5 4.5-5 7v3M17 2v3c0 2.5-2 4.5-5 7 3 2.5 5 4.5 5 7v3"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3.5 2"/>',
});

tag('Weather', ['sun', 'moon']);
reg('Weather', {
  'sun-moon': '<circle cx="12" cy="12" r="4.5"/><path d="M12 7.5a4.5 4.5 0 0 1 0 9z" fill="currentColor"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M4.9 19.1l1.8-1.8M2 12h2.5M19.1 4.9l-1.8 1.8M19.1 19.1l-1.8-1.8M22 12h-2.5"/>',
  sunrise: '<path d="M2 18h20M7 18a5 5 0 0 1 10 0M4.9 10.9l1.4 1.4M19.1 10.9l-1.4 1.4M12 2v7M9 5l3-3 3 3M8 22h8"/>',
  'cloud-sun': '<path d="M12.77 10.35A4 4 0 1 0 10.45 12.73M9 2v1.5M2 9h1.5M4 4l1.1 1.1M14 4l-1.1 1.1M4 14l1.1-1.1M14.5 9H16"/><path d="M10.25 14.25A4.13 4.13 0 0 1 18.43 15 3 3 0 0 1 18.5 21h-7.88a3.38 3.38 0 0 1-.37-6.75z"/>',
  'cloud-rain': '<path d="M7.6 7.4A4.4 4.4 0 0 1 16.32 8.2 3.2 3.2 0 0 1 16.4 14.6H8A3.6 3.6 0 0 1 7.6 7.4z"/><path d="m8.5 17.5-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3"/>',
  snowflake: '<path d="M12 2v20M20.66 7 3.34 17M20.66 17 3.34 7M9.95 3.35 12 5.4l2.05-2.05M3.48 9.45l2.8-.75-.75-2.8M5.53 18.1l.75-2.8-2.8-.75M14.05 20.65 12 18.6l-2.05 2.05M20.52 14.55l-2.8.75.75 2.8M18.47 5.9l-.75 2.8 2.8.75"/>',
  thermometer: '<path d="M8.5 13.54V5a2 2 0 0 1 4 0v8.54A4 4 0 1 1 8.5 13.54z"/><path d="M10.5 11v6M15.5 5h2M15.5 8.5h2M15.5 12h2"/>',
  umbrella: '<path d="M2 12a10 10 0 0 1 20 0 3.33 3.33 0 0 0-6.67 0 3.33 3.33 0 0 0-6.66 0A3.33 3.33 0 0 0 2 12z"/><path d="M12 12v7.5a2 2 0 0 1-4 0"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-3.5-2-5.5-3.5-7.5-1-1.5-1.5-3.5-1.5-5-2.5 1.5-4.5 4-4.5 7.5-1-.5-1.8-1.5-2-3-1.5 1.5-2.5 4-2.5 8a7 7 0 0 0 7 7z"/><path d="M12 19a2.5 2.5 0 0 0 2.5-2.5c0-1.5-1-2.5-2.5-4-1.5 1.5-2.5 2.5-2.5 4A2.5 2.5 0 0 0 12 19z"/>',
  droplet: '<path d="M12 2.5c3.5 4.5 7 8 7 12a7 7 0 0 1-14 0c0-4 3.5-7.5 7-12z"/>',
  leaf: '<path d="M4.5 19.5C4 11 9.5 4.5 20 4c-.5 10.5-7 16-15.5 15.5z"/><path d="M3 21 13 11"/>',
  contrast: '<circle cx="12" cy="12" r="10"/><path d="M12 5.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/>',
});
