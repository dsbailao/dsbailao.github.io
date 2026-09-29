// GPS do DriveTunes: mapa (Maps JavaScript API), busca de destino (Places API (New))
// e rota com navegação curva a curva (Routes API), com instruções por voz.
import { CONFIG } from './config.js';
import { store, loadScript } from './store.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let deps = { toast: () => {}, duck: () => {} };
let map = null;
let meMarker = null;
let routeLine = null;
let destMarker = null;
let traffic = null;
let watchId = null;
let pos = null; // { lat, lng, heading }
let follow = true;
let nav = null;
let pendingDest = null;

export const mapsKey = () => CONFIG.MAPS_API_KEY || store.get('mapsKey') || '';
export const isNavigating = () => !!nav;

// Visual escuro para uso noturno no carro.
const DARK = [
  { elementType: 'geometry', stylers: [{ color: '#1b1f2a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aa3b5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#11141b' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2b3142' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#333a4d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#424a61' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#c3c9d6' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1522' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
];

const ARROWS = {
  TURN_LEFT: '↰', TURN_RIGHT: '↱', TURN_SLIGHT_LEFT: '↖', TURN_SLIGHT_RIGHT: '↗',
  TURN_SHARP_LEFT: '↲', TURN_SHARP_RIGHT: '↳', UTURN_LEFT: '↶', UTURN_RIGHT: '↷',
  STRAIGHT: '↑', RAMP_LEFT: '↖', RAMP_RIGHT: '↗', FORK_LEFT: '↖', FORK_RIGHT: '↗',
  MERGE: '⤨', ROUNDABOUT_LEFT: '⟲', ROUNDABOUT_RIGHT: '⟳', DEPART: '↑', NAME_CHANGE: '↑',
  FERRY: '⛴', DESTINATION: '⚑',
};

/* ---------- utilidades ---------- */
function fmtDist(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',')} km`;
  if (m >= 100) return `${Math.round(m / 50) * 50} m`;
  return `${Math.max(10, Math.round(m / 10) * 10)} m`;
}
function fmtDur(s) {
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
const toLatLng = (p) => new google.maps.LatLng(p.lat, p.lng);
const meters = (a, b) => google.maps.geometry.spherical.computeDistanceBetween(a, b);

async function api(url, body, fieldMask) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': mapsKey(), 'X-Goog-FieldMask': fieldMask },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error?.message || `Erro ${res.status}`;
    if (res.status === 403) throw new Error(`Chave sem permissão para esta API. Ative "Places API (New)" e "Routes API" no Console. (${msg})`);
    throw new Error(msg);
  }
  return data;
}

/* ---------- inicialização ---------- */
export function initGps(d) {
  deps = { ...deps, ...d };

  $('#map-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#map-q').value.trim();
    $('#map-q').blur();
    if (q) searchPlaces(q);
  });
  $('#map-results').addEventListener('click', (e) => {
    const li = e.target.closest('[data-place]');
    if (li) startNavigation(JSON.parse(li.dataset.place));
  });
  $('#map-setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = $('#maps-key').value.trim();
    if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(key)) { deps.toast('Chave inválida. Ela começa com "AIza".'); return; }
    store.set('mapsKey', key);
    location.reload();
  });
  $('#map-origin-hint').textContent = `${location.origin}/*`;
}

export async function openGps() {
  if (!mapsKey()) {
    $('#map-setup').hidden = false;
    return;
  }
  $('#map-setup').hidden = true;
  try {
    await ensureMap();
    startWatch();
  } catch (e) {
    deps.toast(e.message || 'Não foi possível carregar o mapa.');
  }
}

// Ao fechar a tela dividida o GPS continua só se houver navegação ativa (a voz segue guiando).
export function closeGps() {
  if (!nav) stopWatch();
}

function loadMaps(key) {
  if (window.google?.maps?.Map) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.__dtMapsReady = () => resolve();
    window.gm_authFailure = () => deps.toast('A chave do Google Maps foi recusada. Confira as restrições da chave no Console.');
    loadScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry&language=pt-BR&region=BR&loading=async&callback=__dtMapsReady`)
      .catch(() => reject(new Error('Sem conexão com o Google Maps.')));
  });
}

async function ensureMap() {
  if (map) return;
  await loadMaps(mapsKey());
  const last = store.get('lastPos');
  map = new google.maps.Map($('#map'), {
    center: last || { lat: -15.78, lng: -47.93 },
    zoom: last ? 15 : 4,
    styles: DARK,
    disableDefaultUI: true,
    zoomControl: false,
    gestureHandling: 'greedy',
    clickableIcons: false,
    backgroundColor: '#1b1f2a',
  });
  map.addListener('dragstart', () => setFollow(false));
  bindFabs();
}

function bindFabs() {
  $('#fab-center').addEventListener('click', () => {
    setFollow(true);
    if (pos) { map.panTo(toLatLng(pos)); map.setZoom(nav ? 17 : 16); }
  });
  $('#fab-traffic').addEventListener('click', () => {
    traffic ||= new google.maps.TrafficLayer();
    const on = !traffic.getMap();
    traffic.setMap(on ? map : null);
    $('#fab-traffic').classList.toggle('on', on);
  });
  $('#fab-voice').addEventListener('click', () => {
    const on = !store.get('navVoice', true);
    store.set('navVoice', on);
    renderVoiceFab();
    deps.toast(on ? 'Instruções por voz ligadas' : 'Instruções por voz desligadas');
  });
  $('#nav-stop').addEventListener('click', () => endNavigation());
  renderVoiceFab();
}

function renderVoiceFab() {
  const on = store.get('navVoice', true);
  $('#fab-voice').classList.toggle('on', on);
  $('#fab-voice use').setAttribute('href', on ? '#i-volume' : '#i-volume-off');
}

function setFollow(on) {
  follow = on;
  $('#fab-center').classList.toggle('on', on);
}

/* ---------- posição ---------- */
function startWatch() {
  if (watchId !== null) return;
  if (!navigator.geolocation) { deps.toast('Este aparelho não informa a localização.'); return; }
  watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true, maximumAge: 2000, timeout: 20000,
  });
}

function stopWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

function onPositionError(err) {
  if (err.code === 1) deps.toast('Permita o acesso à localização para usar o GPS.');
  else if (err.code === 3) deps.toast('Procurando sinal de GPS…');
}

function onPosition(p) {
  const first = !pos;
  const { latitude: lat, longitude: lng, heading, speed } = p.coords;
  pos = { lat, lng, heading: speed > 1 && heading != null && !Number.isNaN(heading) ? heading : pos?.heading || 0 };
  store.set('lastPos', { lat, lng });
  if (!map) return;

  const ll = toLatLng(pos);
  const icon = {
    path: 'M 0,-11 L 8,9 L 0,4 L -8,9 Z',
    fillColor: '#4f8cff', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2.5,
    scale: 1.5, rotation: pos.heading, anchor: new google.maps.Point(0, 0),
  };
  if (!meMarker) meMarker = new google.maps.Marker({ map, position: ll, icon, zIndex: 10, clickable: false });
  else { meMarker.setPosition(ll); meMarker.setIcon(icon); }

  if (first) { map.setCenter(ll); map.setZoom(16); }
  else if (follow) map.panTo(ll);

  if (pendingDest) {
    const d = pendingDest;
    pendingDest = null;
    startNavigation(d);
  } else if (nav) {
    updateNavigation();
  }
}

/* ---------- busca de destino ---------- */
async function searchPlaces(q) {
  const box = $('#map-results');
  box.hidden = false;
  box.innerHTML = '<li class="map-res-msg">Buscando…</li>';
  try {
    const body = { textQuery: q, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 6 };
    if (pos) body.locationBias = { circle: { center: { latitude: pos.lat, longitude: pos.lng }, radius: 50000 } };
    const data = await api('https://places.googleapis.com/v1/places:searchText', body,
      'places.id,places.displayName,places.formattedAddress,places.location');
    const places = (data.places || []).map((p) => ({
      name: p.displayName?.text || q,
      address: p.formattedAddress || '',
      lat: p.location.latitude,
      lng: p.location.longitude,
    }));
    box.innerHTML = places.length
      ? places.map((p) => {
        const dist = pos && window.google ? ` · ${fmtDist(meters(toLatLng(pos), toLatLng(p)))}` : '';
        return `<li><button type="button" data-place="${esc(JSON.stringify(p))}">
          <strong>${esc(p.name)}</strong><span>${esc(p.address)}${dist}</span></button></li>`;
      }).join('')
      : '<li class="map-res-msg">Nenhum lugar encontrado.</li>';
  } catch (e) {
    box.innerHTML = `<li class="map-res-msg">${esc(e.message)}</li>`;
  }
}

export function searchDestination(q) {
  $('#map-q').value = q;
  searchPlaces(q);
}

/* ---------- rota ---------- */
async function computeRoute(from, dest) {
  const data = await api('https://routes.googleapis.com/directions/v2:computeRoutes', {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    languageCode: 'pt-BR',
    units: 'METRIC',
  }, [
    'routes.duration', 'routes.distanceMeters', 'routes.polyline.encodedPolyline',
    'routes.legs.steps.distanceMeters', 'routes.legs.steps.polyline.encodedPolyline',
    'routes.legs.steps.endLocation', 'routes.legs.steps.navigationInstruction',
  ].join(','));
  const r = data.routes?.[0];
  if (!r) throw new Error('Nenhuma rota encontrada para esse destino.');
  const decode = (enc) => google.maps.geometry.encoding.decodePath(enc || '');
  const steps = (r.legs?.[0]?.steps || []).map((s) => {
    const path = decode(s.polyline?.encodedPolyline);
    return {
      dist: s.distanceMeters || 0,
      end: new google.maps.LatLng(s.endLocation.latLng.latitude, s.endLocation.latLng.longitude),
      line: new google.maps.Polyline({ path }),
      man: s.navigationInstruction?.maneuver || 'STRAIGHT',
      text: s.navigationInstruction?.instructions || 'Siga em frente',
    };
  });
  return {
    dist: r.distanceMeters || 1,
    dur: parseInt(r.duration, 10) || 0,
    path: decode(r.polyline?.encodedPolyline),
    steps,
  };
}

async function startNavigation(dest) {
  $('#map-results').hidden = true;
  if (!pos) {
    pendingDest = dest;
    deps.toast('Aguardando sinal do GPS para traçar a rota…');
    return;
  }
  try {
    deps.toast(`Traçando rota até ${dest.name}…`);
    const route = await computeRoute(pos, dest);
    nav = { ...route, dest, destLL: toLatLng(dest), idx: 0, spoken: new Set(), off: 0, rerouteAt: 0 };
    drawRoute();
    document.body.classList.add('navigating');
    $('#nav-banner').hidden = false;
    $('#nav-footer').hidden = false;
    $('#map-search').hidden = true;
    const bounds = new google.maps.LatLngBounds();
    route.path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 60);
    setFollow(false);
    setTimeout(() => { setFollow(true); if (pos) { map.panTo(toLatLng(pos)); map.setZoom(17); } }, 3500);
    speak(`Rota para ${dest.name}. ${fmtDur(route.dur)}.`);
    updateNavigation();
  } catch (e) {
    deps.toast(e.message);
  }
}

function drawRoute() {
  routeLine?.setMap(null);
  destMarker?.setMap(null);
  routeLine = new google.maps.Polyline({
    map, path: nav.path, strokeColor: '#4f8cff', strokeOpacity: 0.95, strokeWeight: 8, zIndex: 5,
  });
  destMarker = new google.maps.Marker({ map, position: nav.destLL, zIndex: 6 });
}

function endNavigation(msg) {
  if (msg) speak(msg);
  nav = null;
  routeLine?.setMap(null);
  destMarker?.setMap(null);
  document.body.classList.remove('navigating');
  $('#nav-banner').hidden = true;
  $('#nav-footer').hidden = true;
  $('#map-search').hidden = false;
  if (!document.body.classList.contains('split-on')) stopWatch();
}

async function reroute() {
  nav.rerouteAt = Date.now();
  deps.toast('Recalculando rota…');
  speak('Recalculando.');
  try {
    const route = await computeRoute(pos, nav.dest);
    Object.assign(nav, route, { idx: 0, spoken: new Set(), off: 0 });
    drawRoute();
  } catch (e) {
    deps.toast(e.message);
  }
}

function updateNavigation() {
  if (!nav || !pos) return;
  const here = toLatLng(pos);

  if (meters(here, nav.destLL) < 35) { endNavigation('Você chegou ao destino.'); return; }

  // Avança o passo atual: pelo fim do passo ou por já estar sobre um dos próximos trechos.
  const tol = 0.0003; // ~30 m em graus
  while (nav.idx < nav.steps.length - 1 && meters(here, nav.steps[nav.idx].end) < 25) nav.idx++;
  for (let k = nav.idx + 1; k <= Math.min(nav.idx + 3, nav.steps.length - 1); k++) {
    if (google.maps.geometry.poly.isLocationOnEdge(here, nav.steps[k].line, tol)) { nav.idx = k; break; }
  }

  // Fora da rota por algumas leituras seguidas → recalcula.
  const onRoute = google.maps.geometry.poly.isLocationOnEdge(here, routeLine, 0.0006);
  nav.off = onRoute ? 0 : nav.off + 1;
  if (nav.off >= 3 && Date.now() - nav.rerouteAt > 15000) { reroute(); return; }

  const step = nav.steps[nav.idx];
  const toTurn = meters(here, step.end);
  const next = nav.steps[nav.idx + 1] || { man: 'DESTINATION', text: `Chegada: ${nav.dest.name}` };

  $('#nav-arrow').textContent = ARROWS[next.man] || '↑';
  $('#nav-dist').textContent = fmtDist(toTurn);
  $('#nav-text').textContent = next.text;

  const remaining = toTurn + nav.steps.slice(nav.idx + 1).reduce((s, x) => s + x.dist, 0);
  const secs = nav.dur * (remaining / nav.dist);
  const arrival = new Date(Date.now() + secs * 1000);
  $('#nav-eta').textContent = arrival.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('#nav-left').textContent = `${fmtDur(secs)} · ${fmtDist(remaining)}`;

  // Avisos por voz em 800 m, 300 m e na hora da manobra.
  for (const t of [800, 300, 50]) {
    const key = `${nav.idx}:${t}`;
    if (toTurn <= t && !nav.spoken.has(key)) {
      [800, 300, 50].filter((x) => x >= t).forEach((x) => nav.spoken.add(`${nav.idx}:${x}`));
      if (t === 50) speak(next.text);
      else if (step.dist > t + 100) speak(`Em ${fmtDist(toTurn)}, ${next.text}`);
      break;
    }
  }
}

/* ---------- voz ---------- */
function speak(text) {
  if (!store.get('navVoice', true) || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR';
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'));
  if (voice) u.voice = voice;
  deps.duck(true);
  const done = () => deps.duck(false);
  u.onend = done;
  u.onerror = done;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
