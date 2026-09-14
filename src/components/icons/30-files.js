/* Files, storage, development & diagram icons */
const FILE = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>';
const CLOUD_OPEN = '<path d="M8 19H7A4.5 4.5 0 0 1 6.5 10 5.5 5.5 0 0 1 17.4 11 4 4 0 0 1 17.5 19H16"/>';
const FOLDER = 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';

tag('Files', ['file', 'image', 'inbox']);
reg('Files', {
  'file-text': FILE + '<path d="M8 13h8M8 17h8M8 9h2"/>',
  'file-plus': FILE + '<path d="M12 11v6M9 14h6"/>',
  'file-minus': FILE + '<path d="M9 14h6"/>',
  'file-check': FILE + '<path d="m9 15 2 2 4-4"/>',
  'file-x': FILE + '<path d="m9.5 12.5 5 5M14.5 12.5l-5 5"/>',
  'file-code': FILE + '<path d="m10 12-2 2.5 2 2.5M14 12l2 2.5-2 2.5"/>',
  'file-image': FILE + '<circle cx="9" cy="12" r="1.5"/><path d="m20 17-3-3-7 8"/>',
  'file-pdf': FILE + '<path d="M8.5 18.5c1.8-.6 3.6-4.4 3.6-6.3 0-1.1-1.1-1.1-1.1 0 0 2.2 2.7 5.1 4.6 5.6.8.2 1-.9 0-1.1-2.1-.4-5 .7-7.1 1.8z"/>',
  'file-spreadsheet': FILE + '<path d="M8 12h8v6H8zM8 15h8M12 12v6"/>',
  'file-zip': FILE + '<path d="M10 4h1M11 6h1M10 8h1M11 10h1"/><rect x="9.5" y="13" width="3.5" height="5" rx="1"/>',
  'file-audio': FILE + '<circle cx="10" cy="17" r="2"/><path d="M12 17v-6l3 1.5"/>',
  'file-video': FILE + '<path d="M10 12v6l5-3z"/>',
  files: '<path d="M16 6h-6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10z"/><path d="M16 6v4h4M4 16V4a2 2 0 0 1 2-2h8"/>',
  folder: '<path d="' + FOLDER + '"/>',
  'folder-open': '<path d="M5 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v3"/><path d="M5 20h13.2a1.5 1.5 0 0 0 1.4-1l2.3-6.5a1 1 0 0 0-.9-1.5H9a1.5 1.5 0 0 0-1.4 1z"/>',
  'folder-plus': '<path d="' + FOLDER + '"/><path d="M12 10v6M9 13h6"/>',
  'folder-minus': '<path d="' + FOLDER + '"/><path d="M9 13h6"/>',
  cloud: '<path d="M6.5 10A5.5 5.5 0 0 1 17.4 11 4 4 0 0 1 17.5 19H7A4.5 4.5 0 0 1 6.5 10z"/>',
  'cloud-upload': CLOUD_OPEN + '<path d="M12 20v-7M8.5 16.5 12 13l3.5 3.5"/>',
  'cloud-download': CLOUD_OPEN + '<path d="M12 12v8M8.5 16.5 12 20l3.5-3.5"/>',
  'cloud-off': '<path d="M16.5 19H7A4.5 4.5 0 0 1 6.5 10a5.5 5.5 0 0 1 .2-1.4M8.1 6.1A5.5 5.5 0 0 1 17.4 11a4 4 0 0 1 2.5 7.2M2 2l20 20"/>',
  'hard-drive': '<rect x="2" y="13" width="20" height="7" rx="2"/><path d="m4 13 2.4-7.2A2 2 0 0 1 8.3 4.5h7.4a2 2 0 0 1 1.9 1.3L20 13M6 16.5h.01M9.5 16.5h.01"/>',
  package: '<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10M7.75 4.75l8.5 4.5"/>',
  box: '<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/>',
  layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
});

reg('Development', {
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  server: '<rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01M14 7h3M14 17h3"/>',
  terminal: '<path d="m4 17 5-5-5-5M12 19h8"/>',
  'git-branch': '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M6 3v12.5M18 8.5c0 5-4.5 8-9.7 8.4"/>',
  'git-commit': '<circle cx="12" cy="12" r="3.5"/><path d="M3 12h5.5M15.5 12H21"/>',
  'git-merge': '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5V21M6 8.5c0 5 4 9.5 9.5 9.5"/>',
  'git-pull-request': '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-4M13.5 3.5 11 6l2.5 2.5"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  'memory-stick': '<path d="M2 16V7a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v9z"/><path d="M6 16v3M9.5 16v3M14.5 16v3M18 16v3M7 9.5v3M12 9.5v3M17 9.5v3"/>',
  bug: '<path d="M9 7.5V7a3 3 0 0 1 6 0v.5"/><rect x="7" y="8" width="10" height="13" rx="5"/><path d="M12 12v9M7 13H3M17 13h4M7.5 17.5 4 20M16.5 17.5 20 20M7.5 9.5 4 7M16.5 9.5 20 7"/>',
  activity: '<path d="M2 13h4l3-8 5 14 3-6h5"/>',
  pulse: '<path d="M2 12h5l1.5-2.5L10 12l2-8 2.5 16 2-8H22"/>',
});

reg('Diagrams', {
  workflow: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/>',
  network: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M10.8 7.2 6.2 16.8M13.2 7.2l4.6 9.6M7.5 19h9"/>',
  sitemap: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="5" height="5" rx="1"/><rect x="9.5" y="16" width="5" height="5" rx="1"/><rect x="17" y="16" width="5" height="5" rx="1"/><path d="M12 8v8M4.5 16v-3h15v3"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5"/>',
  split: '<path d="M12 21v-9L5 5M12 12l7-7M5 10V5h5M19 10V5h-5"/>',
  merge: '<path d="m5 20 7-7 7 7M12 13V4M8 8l4-4 4 4"/>',
  infinity: '<path d="M12 12c-2-2.7-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.3 6-4 2-2.7 4-4 6-4a4 4 0 1 1 0 8c-2 0-4-1.3-6-4z"/>',
});
