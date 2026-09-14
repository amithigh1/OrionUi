/* ============================================================================
 * <o-map> — markers, clustering, popups and the "list of markers" a11y view.
 * Extends OMap.prototype (defined in 20-map.js, same folder scope).
 * ========================================================================== */
Object.assign(OMap.prototype, {
  /* ── markers CRUD ─────────────────────────────────────────────────── */
  _normalizeMarker(m) {
    return {
      id: m.id != null ? String(m.id) : uid('mk'), lat: +m.lat, lng: +m.lng, title: m.title || '',
      icon: m.icon || '', html: m.html || '', color: m.color || '', draggable: !!m.draggable,
      popup: m.popup, tooltip: m.tooltip || '', data: m.data,
    };
  },
  setMarkers(list) {
    this._markersById.forEach((m, id) => { const e = this._clusterEls.get('m:' + id); if (e) { e.el.remove(); this._clusterEls.delete('m:' + id); } });
    this._markersById.clear();
    toArr(list).forEach(m => { const nm = this._normalizeMarker(m); this._markersById.set(nm.id, nm); });
    this._afterMarkersChanged();
    return this;
  },
  addMarker(m) {
    const nm = this._normalizeMarker(m);
    this._markersById.set(nm.id, nm);
    this._afterMarkersChanged();
    return nm.id;
  },
  updateMarker(id, patch) {
    const m = this._markersById.get(String(id)); if (!m) return this;
    Object.assign(m, patch);
    this._afterMarkersChanged();
    return this;
  },
  removeMarker(id) {
    id = String(id);
    if (!this._markersById.delete(id)) return this;
    const e = this._clusterEls.get('m:' + id); if (e) { e.el.remove(); this._clusterEls.delete('m:' + id); }
    this._afterMarkersChanged();
    return this;
  },
  _afterMarkersChanged() {
    this.listToggleBtn.hidden = !this._markersById.size;
    this._renderMarkerList();
    this._recluster();
    this._scheduleRender(true);
    // Only once _applyProvider() has created gEl (and therefore already called _initGoogle()
    // itself, which syncs markers on success) — otherwise the very first `markers`/'init' update
    // (every prop is in `changed` on first connect, so this runs even with zero markers) fires
    // before gEl exists, forcing a second, premature _initGoogle() call. See map/README.md.
    if (this.provider === 'google' && this.gEl) this._gSyncMarkers?.();
  },

  /* ── clustering (topology recomputed on move/zoom end, not per frame) ── */
  _recluster() {
    this._spiderfied = null;
    const list = [...this._markersById.values()];
    if (!this.cluster || list.length < 2 || !this._size.w) { this._clusters = list.map(marker => ({ single: true, marker })); return; }
    const radius = this.clusterRadius || 60;
    const pts = list.map(marker => ({ marker, p: this.project(marker) }));
    const used = new Array(pts.length).fill(false);
    const clusters = [];
    for (let i = 0; i < pts.length; i++) {
      if (used[i]) continue;
      const group = [pts[i]]; used[i] = true;
      for (let j = i + 1; j < pts.length; j++) {
        if (used[j]) continue;
        if (Math.hypot(pts[j].p.x - pts[i].p.x, pts[j].p.y - pts[i].p.y) <= radius) { group.push(pts[j]); used[j] = true; }
      }
      if (group.length === 1) clusters.push({ single: true, marker: group[0].marker });
      else clusters.push({
        single: false, markers: group.map(g => g.marker), id: 'c' + group.map(g => g.marker.id).sort().join('_'),
        lat: group.reduce((s, g) => s + g.marker.lat, 0) / group.length, lng: group.reduce((s, g) => s + g.marker.lng, 0) / group.length,
      });
    }
    this._clusters = clusters;
  },
  _onClusterClick(c) {
    if (Math.round(this._zoom) >= this.maxZoom) { this._spiderfied = this._spiderfied === c.id ? null : c.id; this._scheduleRender(); return; }
    this.fitBounds(geo.bounds(c.markers), { padding: 60 });
  },

  /* ── DOM: marker buttons & cluster bubbles, positioned every frame ──── */
  _paintMarkerEl(btn, m) {
    btn.dataset.id = m.id;
    btn.setAttribute('aria-label', m.title || 'Marker');
    if (m.tooltip) btn.title = m.tooltip; else btn.removeAttribute('title');
    btn.style.setProperty('--o-map-marker-color', m.color || '');
    const trusted = m.html || m.icon;
    btn.innerHTML = trusted ? String(raw(trusted)) : MARKER_PIN_SVG;
    btn.classList.toggle('o-map-marker-custom', !!trusted);
    btn.classList.toggle('is-draggable', !!m.draggable);
  },
  _buildMarkerEl(m) {
    const btn = h('button', { type: 'button', class: 'o-map-marker' });
    this._paintMarkerEl(btn, m);
    on(btn, 'click', e => { e.stopPropagation(); this._onMarkerClick(m); });
    if (m.draggable) this._makeMarkerDraggable(btn, m);
    return btn;
  },
  _onMarkerClick(m) { this.emit('marker-click', { marker: m }); if (m.popup) this._openMarkerPopup(m); },
  _makeMarkerDraggable(btn, m) {
    on(btn, 'pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch {}
      btn.classList.add('is-dragging');
      const move = e2 => { const g = this.unproject(this._pointFromEvent(e2)); m.lat = g.lat; m.lng = g.lng; this._scheduleRender(); };
      const up = e2 => {
        win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', up);
        btn.classList.remove('is-dragging');
        try { btn.releasePointerCapture(e2.pointerId); } catch {}
        this._recluster();
        this.emit('marker-drag-end', { id: m.id, lat: m.lat, lng: m.lng, marker: m });
      };
      win.addEventListener('pointermove', move); win.addEventListener('pointerup', up, { once: true });
    });
  },
  _buildClusterEl(c) {
    const btn = h('button', { type: 'button', class: 'o-map-cluster' }, h('span', { class: 'o-map-cluster-count' }));
    on(btn, 'click', e => { e.stopPropagation(); this._onClusterClick(c); });
    this._updateClusterEl(btn, c);
    return btn;
  },
  _updateClusterEl(btn, c) {
    btn.querySelector('.o-map-cluster-count').textContent = c.markers.length;
    btn.setAttribute('aria-label', this.t('map.cluster', { count: c.markers.length }));
    btn.style.setProperty('--o-map-cluster-size', clamp(30 + Math.sqrt(c.markers.length) * 7, 30, 64) + 'px');
  },
  _updateMarkers() {
    const seen = new Set();
    for (const c of this._clusters || []) {
      if (!c.single && this._spiderfied === c.id) {
        const center = this.project(c), n = c.markers.length, r = 26 + n * 3;
        c.markers.forEach((m, i) => {
          const key = 'm:' + m.id; seen.add(key);
          let entry = this._clusterEls.get(key);
          if (!entry) { entry = { el: this._buildMarkerEl(m) }; this.markersEl.appendChild(entry.el); this._clusterEls.set(key, entry); }
          else this._paintMarkerEl(entry.el, m);
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          entry.el.style.transform = `translate3d(${Math.round(center.x + Math.cos(a) * r)}px, ${Math.round(center.y + Math.sin(a) * r)}px, 0)`;
          entry.el.hidden = false;
        });
        continue;
      }
      const key = c.single ? 'm:' + c.marker.id : 'c:' + c.id;
      seen.add(key);
      let entry = this._clusterEls.get(key);
      if (!entry) {
        entry = { el: c.single ? this._buildMarkerEl(c.marker) : this._buildClusterEl(c) };
        this.markersEl.appendChild(entry.el); this._clusterEls.set(key, entry);
      } else if (c.single) this._paintMarkerEl(entry.el, c.marker);
      else this._updateClusterEl(entry.el, c);
      const pos = this.project(c.single ? c.marker : c);
      entry.el.style.transform = `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`;
      entry.el.hidden = false;
    }
    for (const [key, entry] of [...this._clusterEls]) if (!seen.has(key)) { entry.el.remove(); this._clusterEls.delete(key); }
    if (this._locateEl && this._locatePos && !this._locateEl.hidden) {
      const pos = this.project(this._locatePos);
      this._locateEl.style.transform = `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`;
      const acc = this._locateEl.querySelector('.o-map-locate-accuracy');
      if (acc && this._locatePos.accuracy) { const mpp = metersPerPixel(this._lat, this._zoom, this.tileSize); acc.style.width = acc.style.height = Math.round((this._locatePos.accuracy / mpp) * 2) + 'px'; }
    }
  },

  /* ── list-of-markers alternative view (accessibility) ────────────────── */
  _renderMarkerList() {
    this.listWrap.innerHTML = '';
    const items = [...this._markersById.values()];
    if (!items.length) return;
    const ul = h('ul', { class: 'o-map-list-items' });
    items.forEach(m => {
      const li = h('li');
      const btn = h('button', { type: 'button', class: 'o-map-list-item' }, m.title || m.id);
      on(btn, 'click', () => { this.listWrap.hidden = true; this.flyTo(m.lat, m.lng, Math.max(this._zoom, 14)); this._onMarkerClick(m); this.focus({ preventScroll: true }); });
      li.append(btn); ul.append(li);
    });
    this.listWrap.append(h('div', { class: 'o-map-list-title' }, this.t('map.markerList')), ul,
      h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', onClick: () => { this.listWrap.hidden = true; this.focus({ preventScroll: true }); } }, this.t('map.backToMap')));
  },

  /* ── popups (single at a time) ────────────────────────────────────── */
  _showPopup(anchor, content, opts = {}) {
    this._closePopup();
    const el = h('div', { class: 'o-map-popup o-floating', role: 'dialog', 'aria-label': opts.title || '' });
    const closeBtn = h('button', { type: 'button', class: 'o-map-popup-close', 'aria-label': this.t('map.close') }, icon('x'));
    const body = h('div', { class: 'o-map-popup-body' });
    if (content instanceof Node) body.appendChild(content);
    else if (content != null) body.innerHTML = String(raw(content));
    el.append(closeBtn, body);
    on(closeBtn, 'click', () => this._closePopup());
    on(el, 'pointerdown', e => e.stopPropagation());
    this.popupsEl.appendChild(el);
    this._popup = { anchor, el };
    this._scheduleRender();
    this._panPopupIntoView(anchor);
  },
  _openMarkerPopup(m) { this._showPopup({ lat: m.lat, lng: m.lng }, isFn(m.popup) ? m.popup(m) : m.popup, { title: m.title }); },
  _openLayerPopup(layer, latlng) { this._showPopup(latlng, isFn(layer.popup) ? layer.popup(layer) : layer.popup, {}); },
  _closePopup() { if (this._popup) { this._popup.el.remove(); this._popup = null; } },
  _updatePopups() {
    if (!this._popup) return;
    const pos = this.project(this._popup.anchor), el = this._popup.el, w = el.offsetWidth || 220;
    const left = clamp(pos.x - w / 2, 4, Math.max(4, this._size.w - w - 4));
    el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(pos.y - (el.offsetHeight || 0) - 16)}px, 0)`;
    el.style.setProperty('--o-map-popup-arrow-x', Math.round(pos.x - left) + 'px');
  },
  _panPopupIntoView(anchor) {
    const pos = this.project(anchor), margin = 70;
    let dx = 0, dy = 0;
    if (pos.y < margin) dy = pos.y - margin;
    if (pos.x < margin) dx = pos.x - margin;
    if (pos.x > this._size.w - margin) dx = pos.x - (this._size.w - margin);
    if (dx || dy) { const p = geoToPixel(this._lat, this._lng, this._zoom, this.tileSize); const g = pixelToGeo(p.x + dx, p.y + dy, this._zoom, this.tileSize); this.flyTo(g.lat, g.lng, this._zoom, { duration: 280 }); }
  },
});

/* An accessor cannot live in an Object.assign() source literal: Object.assign *invokes*
 * getters and copies the resulting value, so this would have run at load time with the
 * literal as `this` (throwing on this._markersById). Define it on the prototype. */
Object.defineProperty(OMap.prototype, "markersList", {
  configurable: true,
  get() { return [...this._markersById.values()]; },
});
