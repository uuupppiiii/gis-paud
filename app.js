// ── Constants ─────────────────────────────────────────────
const BENTUK_COLOR = {KB:'#79c0ff',TK:'#d35656',SPS:'#bc8cff',PKBM:'#ffab40',TPA:'#56ff40',SKB:'#ffab40'};
const BENTUK_LABEL = {KB:'Kelompok Bermain',TK:'Taman Kanak-Kanak',SPS:'Satuan PAUD Sejenis',PKBM:'PKBM',TPA:'Taman Pend. Al-Quran',SKB:'SKB'};

// ── State ─────────────────────────────────────────────────
let SCHOOLS = [];
let GEOJSON = null;
let activeBentuk = '';
let activeKec = '';
let activeStatus = '';
let searchQ = '';
let sortBy = 'nama';
let choroOn = false;
let clusterOn = false;
let labelsOn = false;
let activeIdx = -1;
let map, geojsonLayer, markerLayer, clusterLayer;
let allMarkerData = [];
let labelMarkers = [];
let kecamatanList = [];
let kecTotal = {};
let kecMax = 0, kecMin = 0;
let tiles = {};
let curTile = 'osm';

// ── Load Data then Init ───────────────────────────────────
Promise.all([
  fetch('schools.json').then(r => r.json()),
  fetch('kecamatan.geojson').then(r => r.json())
]).then(([schools, geojson]) => {
  SCHOOLS = schools;
  GEOJSON = geojson;
  initApp();
});

// ── Map init ──────────────────────────────────────────────
function initApp() {
  map = L.map('map', {zoomControl: false, attributionControl: true}).setView([-7.313, 108.445], 10);
  L.control.zoom({position: 'bottomright'}).addTo(map);

  tiles = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap'}),
    sat: L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }),
  };
  tiles.osm.addTo(map);

  // ── Precompute ────────────────────────────────────────────
  kecamatanList = [...new Set(SCHOOLS.map(s => s.kecamatan))].sort();
  kecamatanList.forEach(k => { kecTotal[k] = SCHOOLS.filter(s => s.kecamatan === k).length; });
  kecMax = Math.max(...Object.values(kecTotal));
  kecMin = Math.min(...Object.values(kecTotal));

  // Populate kec select
  const kecSel = document.getElementById('kec-sel');
  kecamatanList.forEach(k => {
    const o = document.createElement('option');
    o.value = k; o.textContent = k + ' (' + kecTotal[k] + ')';
    kecSel.appendChild(o);
  });

  // ── GeoJSON layer ──────────────────────────────────────────
  geojsonLayer = L.geoJSON(GEOJSON, {style: kecStyle, onEachFeature: onEachKec}).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  applyFilters();
  setTimeout(() => map.fitBounds(geojsonLayer.getBounds().pad(.04)), 300);
}

// ── Choropleth ────────────────────────────────────────────
function choroColor(cnt) {
  if (!cnt) return 'rgba(255,190,245,0.35)';
  let t = (cnt - kecMin) / (kecMax - kecMin + 0.001);
  t = Math.pow(t, 0.85);
  const r = Math.round(255 - (t * 180));
  const g = Math.round(180 - (t * 160));
  const b = Math.round(245 - (t * 110));
  const opacity = 0.35 + (t * 0.5);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function kecStyle(f) {
  const k = f.properties.kecamatan, cnt = kecTotal[k] || 0;
  return {
    fillColor: choroOn ? choroColor(cnt) : 'rgba(79,195,247,.06)',
    color: '#bf00ff', weight: 1.2, opacity: .6, fillOpacity: 1
  };
}

function onEachKec(f, layer) {
  const kec = f.properties.kecamatan, cnt = kecTotal[kec] || 0;
  let tip;
  layer.on({
    mouseover(e) {
      e.target.setStyle({weight: 2, color: '#7dd3fc', fillOpacity: choroOn ? 1 : .18});
      tip = L.tooltip({permanent: false, direction: 'top', className: 'ktip'})
        .setContent(`<b>${kec}</b> &mdash; ${cnt} lembaga`)
        .setLatLng(e.latlng).addTo(map);
    },
    mousemove(e) { if (tip) tip.setLatLng(e.latlng); },
    mouseout(e) {
      geojsonLayer.resetStyle(e.target);
      if (tip) { map.removeLayer(tip); tip = null; }
    },
    click(e) {
      document.getElementById('kec-sel').value = kec;
      applyFilters();
      map.fitBounds(e.target.getBounds().pad(.15), {animate: true});
    }
  });
}

// ── Markers ───────────────────────────────────────────────
function makeIcon(bentuk) {
  const c = BENTUK_COLOR[bentuk] || '#94a3b8';
  const ltr = bentuk === 'PKBM' ? 'PK' : bentuk === 'SPS' ? 'SP' : bentuk[0];
  const fz = ltr.length > 1 ? 5.5 : 7;
  const svg = `
  <svg width="18" height="24" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20S24 21 24 12C24 5.37 18.63 0 12 0z" fill="${c}"/>
    <circle cx="12" cy="12" r="5" fill="rgba(0,0,0,.35)"/>
    <text x="12" y="15" text-anchor="middle" font-size="${fz}" font-weight="800" fill="white" font-family="Arial">${ltr}</text>
  </svg>`;
  return L.divIcon({html: svg, iconSize: [18, 24], iconAnchor: [9, 24], popupAnchor: [0, -24], className: ''});
}

function makeIconNoCoord(bentuk) {
  const c = BENTUK_COLOR[bentuk] || '#94a3b8';
  const svg = `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
    <circle cx="11" cy="11" r="10" fill="${c}" opacity=".4" stroke="${c}" stroke-width="1.5"/>
    <text x="11" y="15" text-anchor="middle" font-size="10" font-weight="800" fill="${c}" font-family="Arial">?</text>
  </svg>`;
  return L.divIcon({html: svg, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -14], className: ''});
}

function buildMarkers(filtered) {
  markerLayer.clearLayers();
  if (clusterLayer) { map.removeLayer(clusterLayer); clusterLayer = null; }
  labelMarkers.forEach(m => map.removeLayer(m));
  labelMarkers = [];
  allMarkerData = [];

  const markers = [];
  filtered.forEach((s, i) => {
    if (!s.lat || !s.lng) return;
    const m = L.marker([s.lat, s.lng], {icon: makeIcon(s.bentuk)});
    m.bindPopup(makePopup(s), {maxWidth: 280, className: ''});
    m.on('click', () => selectItem(i));
    markers.push(m);
    allMarkerData.push({s, m, idx: i});
  });

  if (clusterOn) {
    clusterLayer = L.markerClusterGroup({
      maxClusterRadius: 50,
      iconCreateFunction(cluster) {
        const cnt = cluster.getChildCount();
        const sz = cnt < 10 ? 32 : cnt < 50 ? 38 : 44;
        return L.divIcon({
          html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:rgba(79,195,247,.85);border:2px solid #4fc3f7;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${sz < 38 ? 11 : 13}px;color:#060a0f;font-family:Space Grotesk,sans-serif;box-shadow:0 0 12px rgba(79,195,247,.4)">${cnt}</div>`,
          iconSize: [sz, sz], className: ''
        });
      }
    });
    markers.forEach(m => clusterLayer.addLayer(m));
    map.addLayer(clusterLayer);
  } else {
    markers.forEach(m => markerLayer.addLayer(m));
  }

  if (labelsOn) buildLabels(filtered);
}

function buildLabels(filtered) {
  labelMarkers.forEach(m => map.removeLayer(m));
  labelMarkers = [];
  if (!labelsOn || map.getZoom() < 12) return;
  filtered.forEach(s => {
    if (!s.lat || !s.lng) return;
    const c = BENTUK_COLOR[s.bentuk] || '#94a3b8';
    const l = L.marker([s.lat, s.lng], {
      icon: L.divIcon({
        html: `<div style="background:rgba(6,10,15,.88);border:1px solid ${c}33;border-radius:4px;padding:2px 5px;font-size:8.5px;color:${c};font-weight:600;white-space:nowrap;font-family:DM Sans,sans-serif;pointer-events:none;margin-top:1px;max-width:120px;overflow:hidden;text-overflow:ellipsis">${s.nama}</div>`,
        iconAnchor: [-4, 32], className: ''
      }), interactive: false
    });
    l.addTo(map);
    labelMarkers.push(l);
  });
}

map && map.on('zoomend', () => { if (labelsOn) buildLabels(getFiltered()); });

function makePopup(s) {
  const c = BENTUK_COLOR[s.bentuk] || '#94a3b8';
  const lbl = BENTUK_LABEL[s.bentuk] || s.bentuk;
  const ltr = s.bentuk === 'PKBM' ? 'PK' : s.bentuk === 'SPS' ? 'SP' : s.bentuk[0];
  const neg = s.status === 'Negeri';
  const gmapsUrl = `https://www.google.com/maps?q=${s.lat},${s.lng}`;
  const directionUrl = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;

  return `<div>
    <div class="pu-head">
      <div class="pu-icon" style="background:${c}22;color:${c}">${ltr}</div>
      <div>
        <div class="pu-title">${s.nama}</div>
        <div class="pu-type" style="color:${c}">${lbl} &bull; <span style="color:${neg ? '#ffd700' : '#94a3b8'}">${s.status}</span></div>
      </div>
    </div>
    <div class="pu-rows">
      <div class="pu-row"><span class="pu-lbl">NPSN</span><span class="pu-val">${s.npsn}</span></div>
      <div class="pu-row"><span class="pu-lbl">Desa</span><span class="pu-val">${s.desa}</span></div>
      <div class="pu-row"><span class="pu-lbl">Kecamatan</span><span class="pu-val">${s.kecamatan}</span></div>
      <div class="pu-row"><span class="pu-lbl">Alamat</span><span class="pu-val" style="font-size:11px">${s.alamat}</span></div>
      ${s.lat ? `<div class="pu-row"><span class="pu-lbl">Koordinat</span><span class="pu-val" style="font-size:10.5px;font-family:monospace">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</span></div>` : ''}
    </div>
    ${s.lat ? `
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
      <a href="${gmapsUrl}" target="_blank" style="background:#1e293b;color:#fff;padding:7px 10px;border-radius:8px;font-size:11px;text-decoration:none;font-weight:600;">📍 Google Maps</a>
      <a href="${directionUrl}" target="_blank" style="background:#7c3aed;color:white;padding:7px 10px;border-radius:8px;font-size:11px;text-decoration:none;font-weight:600;">🧭 Arah</a>
    </div>` : ''}
  </div>`;
}

// ── Filter & render ───────────────────────────────────────
function getFiltered() {
  let d = [...SCHOOLS];
  if (activeBentuk === 'nocoord') d = d.filter(s => !s.lat);
  else if (activeBentuk) d = d.filter(s => s.bentuk === activeBentuk);
  if (activeKec) d = d.filter(s => s.kecamatan === activeKec);
  if (activeStatus) d = d.filter(s => s.status === activeStatus);
  if (searchQ) {
    const q = searchQ.toLowerCase().trim();
    d = d.filter(s => {
      return (s.nama || '').toLowerCase().includes(q) ||
        (s.desa || '').toLowerCase().includes(q) ||
        (s.kecamatan || '').toLowerCase().includes(q) ||
        (s.alamat || '').toLowerCase().includes(q) ||
        String(s.npsn || '').toLowerCase().includes(q);
    });
  }
  if (sortBy === 'kec') d.sort((a, b) => a.kecamatan.localeCompare(b.kecamatan) || a.nama.localeCompare(b.nama));
  else if (sortBy === 'bentuk') d.sort((a, b) => a.bentuk.localeCompare(b.bentuk) || a.nama.localeCompare(b.nama));
  else d.sort((a, b) => a.nama.localeCompare(b.nama));
  return d;
}

function applyFilters() {
  activeKec = document.getElementById('kec-sel').value;
  activeStatus = document.getElementById('status-sel').value;
  sortBy = document.getElementById('sort-sel').value;
  const filtered = getFiltered();
  renderList(filtered);
  buildMarkers(filtered);
  updateStats(filtered);
  updateLegendCounts(filtered);
  activeIdx = -1;
}

function updateStats(filtered) {
  const byB = {};
  filtered.forEach(s => { byB[s.bentuk] = (byB[s.bentuk] || 0) + 1; });
  document.getElementById('n-all').textContent = filtered.length;
  document.getElementById('n-TK').textContent = byB.TK || 0;
  document.getElementById('n-KB').textContent = byB.KB || 0;
  document.getElementById('n-SPS').textContent = byB.SPS || 0;
  document.getElementById('n-TPA').textContent = byB.TPA || 0;
  document.getElementById('n-PKBM').textContent = byB.PKBM || 0;
  document.getElementById('n-SKB').textContent = byB.SKB || 0;
}

function updateLegendCounts(filtered) {
  ['TK', 'KB', 'SPS', 'PKBM', 'TPA', 'SKB'].forEach(b => {
    const el = document.getElementById('lc-' + b);
    if (el) el.textContent = filtered.filter(s => s.bentuk === b).length;
  });
}

function renderList(data) {
  document.getElementById('rcnt').textContent = 'Menampilkan ' + data.length + ' dari ' + SCHOOLS.length + ' lembaga';
  updateFabBadge(data.length);
  const con = document.getElementById('list');
  if (!data.length) {
    con.innerHTML = '<div class="empty"><svg width="36" height="36" stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><br>Tidak ada hasil ditemukan</div>';
    return;
  }
  con.innerHTML = data.map((s, i) => {
    const c = BENTUK_COLOR[s.bentuk] || '#94a3b8';
    const noCoord = !s.lat;
    const neg = s.status === 'Negeri';
    return `<div class="card" id="card-${i}" style="--c:${c}" onclick="clickCard(${i})">
      <span class="cnpsn">${s.npsn}</span>
      <div class="cname">${s.nama}</div>
      <div class="cmeta">
        <span class="bx" style="background:${c}18;color:${c}">${s.bentuk}</span>
        <span class="bx bx-kec">${s.kecamatan}</span>
        <span class="bx ${neg ? 'bx-neg' : 'bx-sw'}">${s.status}</span>
        ${noCoord ? '<span class="bx bx-nc">📍 Tanpa Koor.</span>' : ''}
      </div>
      <div class="caddr">${s.desa} &bull; ${s.alamat.length > 60 ? s.alamat.substring(0, 60) + '…' : s.alamat}</div>
    </div>`;
  }).join('');
}

function clickCard(i) {
  document.querySelectorAll('.card').forEach((el, idx) => el.classList.toggle('sel', idx === i));
  activeIdx = i;
  const filtered = getFiltered();
  const s = filtered[i];
  if (!s.lat) {
    const c = BENTUK_COLOR[s.bentuk] || '#94a3b8';
    const div = document.createElement('div');
    div.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#111d2e;border:1px solid ${c};border-radius:10px;padding:10px 18px;font-size:12px;color:${c};z-index:9999;font-family:DM Sans,sans-serif;font-weight:600;animation:fadein .3s`;
    div.textContent = '📍 ' + s.nama + ' — belum memiliki koordinat GPS';
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2800);
    return;
  }
  const found = allMarkerData.find(m => m.s.npsn === s.npsn);
  if (found) {
    // Close sidebar on mobile to show map
    if (isMobile()) closeSidebarMobile();
    map.setView([s.lat, s.lng], 15, {animate: true});
    setTimeout(() => { found.m.openPopup(); }, isMobile() ? 500 : 450);
  }
}

function selectItem(i) {
  const cards = document.querySelectorAll('.card');
  cards.forEach((el, idx) => el.classList.toggle('sel', idx === i));
  const el = cards[i];
  if (el) el.scrollIntoView({behavior: 'smooth', block: 'nearest'});
}

// ── Filter controls ───────────────────────────────────────
function setBentuk(b) {
  activeBentuk = b;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.b === b));
  ['all', 'TK', 'KB', 'SPS', 'PKBM', 'SKB'].forEach(k => {
    const el = document.getElementById('st-' + k);
    if (el) el.classList.toggle('on', (k === 'all' && b === '') || (k === b));
  });
  applyFilters();
}

function chipClick(el) {
  setBentuk(el.dataset.b);
}

function onSearch() {
  searchQ = document.getElementById('search').value;
  document.getElementById('clr').classList.toggle('show', searchQ.length > 0);
  applyFilters();
}

function clearSearch() {
  document.getElementById('search').value = '';
  searchQ = '';
  document.getElementById('clr').classList.remove('show');
  applyFilters();
}

// ── Map controls ──────────────────────────────────────────
function switchTile(t) {
  if (curTile === t) return;
  map.removeLayer(tiles[curTile]);
  tiles[t].addTo(map);
  curTile = t;
  document.getElementById('btn-osm').classList.toggle('on', t === 'osm');
  document.getElementById('btn-sat').classList.toggle('on', t === 'sat');
}

function toggleChoro() {
  choroOn = !choroOn;
  document.getElementById('btn-choro').classList.toggle('on', choroOn);
  document.getElementById('cp').style.display = choroOn ? 'block' : 'none';
  geojsonLayer.setStyle(kecStyle);
  if (choroOn) buildChoro();
}

function buildChoro() {
  const seg = document.getElementById('cscale');
  seg.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const d = document.createElement('div');
    d.className = 'cs';
    d.style.background = choroColor(kecMin + t * (kecMax - kecMin)).replace(/[\d.]+\)$/, '.9)');
    seg.appendChild(d);
  }
  document.getElementById('cmin').textContent = kecMin + ' lembaga';
  document.getElementById('cmax').textContent = kecMax + ' lembaga';
}

function toggleCluster() {
  clusterOn = !clusterOn;
  document.getElementById('btn-cluster').classList.toggle('on', clusterOn);
  buildMarkers(getFiltered());
}

function toggleLabels() {
  labelsOn = !labelsOn;
  document.getElementById('btn-lbl').classList.toggle('on', labelsOn);
  buildLabels(getFiltered());
}

function fitAll() {
  map.fitBounds(geojsonLayer.getBounds().pad(.04), {animate: true});
  document.getElementById('kec-sel').value = '';
  activeKec = '';
  applyFilters();
}

// ── Sidebar ───────────────────────────────────────────────
const isMobile = () => window.innerWidth <= 768;

function toggleSidebar() {
  if (isMobile()) return; // desktop only
  const sb = document.getElementById('sidebar');
  sb.classList.toggle('collapsed');
  const isCollapsed = sb.classList.contains('collapsed');
  document.getElementById('tog').textContent = isCollapsed ? '▶' : '◀';
  setTimeout(() => map.invalidateSize(), 380);
}

function openSidebarMobile() {
  if (!isMobile()) return;
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sb-overlay');
  sb.classList.add('mobile-open');
  sb.classList.remove('collapsed');
  ov.classList.add('show');
  document.getElementById('mob-fab').style.display = 'none';
  setTimeout(() => map.invalidateSize(), 400);
}

function closeSidebarMobile() {
  if (!isMobile()) return;
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sb-overlay');
  sb.classList.remove('mobile-open');
  ov.classList.remove('show');
  setTimeout(() => {
    document.getElementById('mob-fab').style.display = 'flex';
    map.invalidateSize();
  }, 380);
}

// ── Desktop Resize Handle ──────────────────────────────────
(function() {
  const handle = document.getElementById('sb-resize');
  if (!handle) return;
  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    if (isMobile()) return;
    dragging = true;
    startX = e.clientX;
    startW = document.getElementById('sidebar').offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const sb = document.getElementById('sidebar');
    const newW = Math.min(Math.max(startW + (e.clientX - startX), 260), 560);
    sb.style.width = newW + 'px';
    sb.style.minWidth = newW + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    map.invalidateSize();
  });
})();

// ── Mobile Touch Swipe-Down to Close ──────────────────────
(function() {
  const sb = document.getElementById('sidebar');
  const handle = document.getElementById('sb-drag-handle');
  let startY = 0, currentY = 0, isDragging = false;

  function onTouchStart(e) {
    if (!isMobile()) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    sb.style.transition = 'none';
  }

  function onTouchMove(e) {
    if (!isDragging || !isMobile()) return;
    currentY = e.touches[0].clientY;
    const dy = currentY - startY;
    if (dy > 0) {
      sb.style.transform = `translateY(${dy}px)`;
    }
  }

  function onTouchEnd() {
    if (!isDragging || !isMobile()) return;
    isDragging = false;
    sb.style.transition = '';
    const dy = currentY - startY;
    if (dy > 80) {
      sb.style.transform = '';
      closeSidebarMobile();
    } else {
      sb.style.transform = '';
    }
  }

  if (handle) {
    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove', onTouchMove, { passive: true });
    handle.addEventListener('touchend', onTouchEnd);
  }
  // Also allow swiping from header
  const hdr = document.getElementById('hdr');
  if (hdr) {
    hdr.addEventListener('touchstart', onTouchStart, { passive: true });
    hdr.addEventListener('touchmove', onTouchMove, { passive: true });
    hdr.addEventListener('touchend', onTouchEnd);
  }
})();

// ── Responsive on resize ───────────────────────────────────
window.addEventListener('resize', () => {
  const sb = document.getElementById('sidebar');
  const fab = document.getElementById('mob-fab');
  const ov = document.getElementById('sb-overlay');
  if (!isMobile()) {
    // switching to desktop: reset mobile state
    sb.classList.remove('mobile-open');
    sb.classList.remove('collapsed');
    sb.style.transform = '';
    ov.classList.remove('show');
    fab.style.display = 'none';
    document.getElementById('tog').textContent = '◀';
  } else {
    // switching to mobile: hide desktop toggle side effects
    sb.style.width = '';
    sb.style.minWidth = '';
    if (!sb.classList.contains('mobile-open')) {
      fab.style.display = 'flex';
    }
  }
  map.invalidateSize();
});

// ── Update FAB count badge ─────────────────────────────────
function updateFabBadge(count) {
  const lbl = document.getElementById('mob-fab-label');
  if (lbl) lbl.textContent = count + ' Lembaga';
}

// ── DATA MANAGEMENT ──────────────────────────────────────────
let _added = 0, _edited = 0, _deleted = 0;
let _editingNpsn = null;
let _deletingNpsn = null;
let _coordPickTarget = null;
let _coordPickMode = false;

// ── Open / Close Panel ────────────────────────────────────────
function openDataPanel() {
  document.getElementById('data-overlay').classList.add('show');
  const panel = document.getElementById('data-panel');
  panel.style.display = 'flex';
  setTimeout(() => panel.classList.add('show'), 10);
  populateKecSelect('t-kecamatan');
  populateKecSelect('u-kecamatan');
  updateExportStats();
}

function closeDataPanel() {
  const panel = document.getElementById('data-panel');
  panel.classList.remove('show');
  setTimeout(() => {
    panel.style.display = 'none';
    document.getElementById('data-overlay').classList.remove('show');
  }, 250);
  cancelCoordPick();
}

function closeDataPanelOutside(e) {
  if (e.target === document.getElementById('data-overlay')) closeDataPanel();
}

// ── Tabs ──────────────────────────────────────────────────────
function switchTab(btn, tab) {
  document.querySelectorAll('.dp-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.dp-body').forEach(b => b.classList.add('hidden'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  if (tab === 'export') updateExportStats();
}

// ── Kecamatan Select Population ───────────────────────────────
function populateKecSelect(id) {
  const sel = document.getElementById(id);
  const existing = Array.from(sel.options).map(o => o.value);
  if (existing.length > 1) return; // already populated
  const kecs = [...new Set(SCHOOLS.map(s => s.kecamatan))].sort();
  // Clear and re-add default for tambah
  if (id === 't-kecamatan') {
    while (sel.options.length > 1) sel.remove(1);
  } else {
    sel.innerHTML = '';
  }
  kecs.forEach(k => {
    const o = document.createElement('option');
    o.value = k; o.textContent = k;
    sel.appendChild(o);
  });
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 3000);
}

// ── TAMBAH DATA ───────────────────────────────────────────────
function tambahData() {
  const npsn = document.getElementById('t-npsn').value.trim();
  const nama = document.getElementById('t-nama').value.trim();
  const alamat = document.getElementById('t-alamat').value.trim();
  const desa = document.getElementById('t-desa').value.trim();
  const kecamatan = document.getElementById('t-kecamatan').value;
  const bentuk = document.getElementById('t-bentuk').value;
  const status = document.getElementById('t-status').value;
  const lat = parseFloat(document.getElementById('t-lat').value) || 0;
  const lng = parseFloat(document.getElementById('t-lng').value) || 0;

  if (!npsn || !nama || !desa || !kecamatan || !bentuk || !status) {
    showToast('⚠️ Isi semua field yang wajib diisi!', 'error'); return;
  }
  if (SCHOOLS.find(s => String(s.npsn) === String(npsn))) {
    showToast('❌ NPSN sudah ada dalam data!', 'error'); return;
  }

  const newSchool = { npsn, nama, alamat, desa, kecamatan, bentuk, status, lat, lng };
  SCHOOLS.push(newSchool);
  _added++;

  // refresh kec list
  if (!kecamatanList.includes(kecamatan)) {
    kecamatanList.push(kecamatan);
    kecamatanList.sort();
    kecTotal[kecamatan] = 1;
    const kecSel = document.getElementById('kec-sel');
    const o = document.createElement('option');
    o.value = kecamatan; o.textContent = kecamatan + ' (1)';
    kecSel.appendChild(o);
  } else {
    kecTotal[kecamatan] = (kecTotal[kecamatan] || 0) + 1;
  }
  kecMax = Math.max(...Object.values(kecTotal));
  kecMin = Math.min(...Object.values(kecTotal));

  applyFilters();
  resetForm('tambah');
  updateExportStats();
  showToast('✅ Data ' + nama + ' berhasil ditambahkan!', 'success');
}

function resetForm(type) {
  ['npsn','nama','alamat','desa','lat','lng'].forEach(f => {
    const el = document.getElementById(type[0] + '-' + f);
    if (el) el.value = '';
  });
  ['kecamatan','bentuk','status'].forEach(f => {
    const el = document.getElementById(type[0] + '-' + f);
    if (el) el.value = '';
  });
}

// ── SEARCH FOR EDIT ───────────────────────────────────────────
function searchForEdit() {
  const q = document.getElementById('u-search').value.trim().toLowerCase();
  const results = document.getElementById('u-results');
  cancelEdit();
  if (!q || q.length < 2) { results.innerHTML = ''; return; }

  const found = SCHOOLS.filter(s =>
    String(s.npsn).toLowerCase().includes(q) ||
    (s.nama || '').toLowerCase().includes(q)
  ).slice(0, 8);

  if (!found.length) {
    results.innerHTML = '<div class="no-result">Tidak ada hasil untuk "<b>' + q + '</b>"</div>'; return;
  }

  results.innerHTML = found.map(s => {
    const c = BENTUK_COLOR[s.bentuk] || '#94a3b8';
    return `<div class="result-item">
      <div class="result-item-dot" style="background:${c}"></div>
      <div class="result-item-info">
        <div class="result-item-name">${s.nama}</div>
        <div class="result-item-meta">${s.npsn} &bull; ${s.kecamatan} &bull; ${s.bentuk}</div>
      </div>
      <span class="result-item-badge" style="background:${c}22;color:${c}">${s.bentuk}</span>
      <button class="ri-edit-btn" onclick="loadEdit('${s.npsn}')">Edit</button>
    </div>`;
  }).join('');
}

function loadEdit(npsn) {
  const s = SCHOOLS.find(x => String(x.npsn) === String(npsn));
  if (!s) return;
  _editingNpsn = npsn;
  document.getElementById('u-npsn').value = s.npsn;
  document.getElementById('u-nama').value = s.nama || '';
  document.getElementById('u-alamat').value = s.alamat || '';
  document.getElementById('u-desa').value = s.desa || '';
  document.getElementById('u-kecamatan').value = s.kecamatan || '';
  document.getElementById('u-bentuk').value = s.bentuk || '';
  document.getElementById('u-status').value = s.status || '';
  document.getElementById('u-lat').value = s.lat || '';
  document.getElementById('u-lng').value = s.lng || '';
  document.getElementById('u-edit-area').classList.remove('hidden');
  document.getElementById('u-edit-area').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cancelEdit() {
  _editingNpsn = null;
  document.getElementById('u-edit-area').classList.add('hidden');
}

function simpanEdit() {
  if (!_editingNpsn) return;
  const idx = SCHOOLS.findIndex(s => String(s.npsn) === String(_editingNpsn));
  if (idx === -1) { showToast('❌ Data tidak ditemukan!', 'error'); return; }

  const nama = document.getElementById('u-nama').value.trim();
  const desa = document.getElementById('u-desa').value.trim();
  const kecamatan = document.getElementById('u-kecamatan').value;
  const bentuk = document.getElementById('u-bentuk').value;
  const status = document.getElementById('u-status').value;

  if (!nama || !desa || !kecamatan || !bentuk || !status) {
    showToast('⚠️ Isi semua field yang wajib diisi!', 'error'); return;
  }

  const oldKec = SCHOOLS[idx].kecamatan;
  SCHOOLS[idx] = {
    ...SCHOOLS[idx],
    nama,
    alamat: document.getElementById('u-alamat').value.trim(),
    desa,
    kecamatan,
    bentuk,
    status,
    lat: parseFloat(document.getElementById('u-lat').value) || 0,
    lng: parseFloat(document.getElementById('u-lng').value) || 0,
  };
  _edited++;

  // recalc kecTotal if kec changed
  if (oldKec !== kecamatan) {
    kecTotal[oldKec] = Math.max(0, (kecTotal[oldKec] || 1) - 1);
    kecTotal[kecamatan] = (kecTotal[kecamatan] || 0) + 1;
    kecMax = Math.max(...Object.values(kecTotal));
    kecMin = Math.min(...Object.values(kecTotal));
  }

  applyFilters();
  cancelEdit();
  document.getElementById('u-search').value = '';
  document.getElementById('u-results').innerHTML = '';
  updateExportStats();
  showToast('✅ Data ' + nama + ' berhasil diperbarui!', 'success');
}

// ── SEARCH FOR DELETE ─────────────────────────────────────────
function searchForDelete() {
  const q = document.getElementById('h-search').value.trim().toLowerCase();
  const results = document.getElementById('h-results');
  cancelDelete();
  if (!q || q.length < 2) { results.innerHTML = ''; return; }

  const found = SCHOOLS.filter(s =>
    String(s.npsn).toLowerCase().includes(q) ||
    (s.nama || '').toLowerCase().includes(q)
  ).slice(0, 8);

  if (!found.length) {
    results.innerHTML = '<div class="no-result">Tidak ada hasil untuk "<b>' + q + '</b>"</div>'; return;
  }

  results.innerHTML = found.map(s => {
    const c = BENTUK_COLOR[s.bentuk] || '#94a3b8';
    return `<div class="result-item">
      <div class="result-item-dot" style="background:${c}"></div>
      <div class="result-item-info">
        <div class="result-item-name">${s.nama}</div>
        <div class="result-item-meta">${s.npsn} &bull; ${s.kecamatan} &bull; ${s.bentuk}</div>
      </div>
      <span class="result-item-badge" style="background:${c}22;color:${c}">${s.bentuk}</span>
      <button class="ri-del-btn" onclick="selectForDelete('${s.npsn}')">Hapus</button>
    </div>`;
  }).join('');
}

function selectForDelete(npsn) {
  const s = SCHOOLS.find(x => String(x.npsn) === String(npsn));
  if (!s) return;
  _deletingNpsn = npsn;
  document.getElementById('h-confirm-text').innerHTML =
    `Anda akan menghapus data <b>${s.nama}</b> (NPSN: ${s.npsn}) — ${s.kecamatan}. Tindakan ini tidak bisa dibatalkan dalam sesi ini.`;
  document.getElementById('h-confirm').classList.remove('hidden');
  document.getElementById('h-confirm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cancelDelete() {
  _deletingNpsn = null;
  document.getElementById('h-confirm').classList.add('hidden');
}

function konfirmasiHapus() {
  if (!_deletingNpsn) return;
  const idx = SCHOOLS.findIndex(s => String(s.npsn) === String(_deletingNpsn));
  if (idx === -1) { showToast('❌ Data tidak ditemukan!', 'error'); return; }
  const nama = SCHOOLS[idx].nama;
  const kec = SCHOOLS[idx].kecamatan;
  kecTotal[kec] = Math.max(0, (kecTotal[kec] || 1) - 1);
  SCHOOLS.splice(idx, 1);
  _deleted++;
  kecMax = Object.values(kecTotal).length ? Math.max(...Object.values(kecTotal)) : 0;
  kecMin = Object.values(kecTotal).length ? Math.min(...Object.values(kecTotal)) : 0;
  applyFilters();
  cancelDelete();
  document.getElementById('h-search').value = '';
  document.getElementById('h-results').innerHTML = '';
  updateExportStats();
  showToast('🗑️ Data ' + nama + ' berhasil dihapus!', 'success');
}

// ── EXPORT ────────────────────────────────────────────────────
function updateExportStats() {
  document.getElementById('exp-total').textContent = SCHOOLS.length;
  document.getElementById('exp-added').textContent = _added;
  document.getElementById('exp-edited').textContent = _edited;
  document.getElementById('exp-deleted').textContent = _deleted;
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(SCHOOLS, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'schools.json';
  a.click();
  showToast('📥 File schools.json berhasil diunduh!', 'success');
}

function exportCSV() {
  const headers = ['npsn','nama','alamat','desa','kecamatan','bentuk','status','lat','lng'];
  const rows = SCHOOLS.map(s => headers.map(h => {
    const v = s[h] === null || s[h] === undefined ? '' : String(s[h]);
    return v.includes(',') ? '"' + v + '"' : v;
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'schools.csv';
  a.click();
  showToast('📋 File CSV berhasil diunduh!', 'success');
}

// ── COORD PICKER ──────────────────────────────────────────────
function pickCoordFromMap(target) {
  _coordPickTarget = target;
  _coordPickMode = true;
  document.getElementById('coord-picker-bar').classList.remove('hidden');
  closeDataPanel();
  map.getContainer().style.cursor = 'crosshair';

  map.once('click', function(e) {
    if (!_coordPickMode) return;
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    const prefix = _coordPickTarget === 'tambah' ? 't' : 'u';
    document.getElementById(prefix + '-lat').value = lat;
    document.getElementById(prefix + '-lng').value = lng;
    cancelCoordPick();
    openDataPanel();
    // Switch to correct tab
    const tabName = _coordPickTarget || 'tambah';
    const tabBtn = document.querySelector(`.dp-tab[data-tab="${tabName}"]`);
    if (tabBtn) switchTab(tabBtn, tabName);
    showToast('📍 Koordinat dipilih: ' + lat + ', ' + lng, 'success');
  });
}

function cancelCoordPick() {
  _coordPickMode = false;
  _coordPickTarget = null;
  document.getElementById('coord-picker-bar').classList.add('hidden');
  if (map) map.getContainer().style.cursor = '';
  map && map.off('click');
}

// Re-bind map zoomend after init
setTimeout(() => {
  if (map) {
    map.on('zoomend', () => { if (labelsOn) buildLabels(getFiltered()); });
  }
}, 500);
