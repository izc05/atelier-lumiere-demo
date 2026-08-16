const byId = (id) => document.getElementById(id);
let zones = [];
let providers = [];
let busyZone = null;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function readPayload(response) {
  return response.json().catch(() => ({}));
}

function redirectToAdmin() {
  window.location.replace('/admin/proveedores/');
}

async function requireOwner() {
  const response = await fetch('/internal/admin/session', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  });
  const payload = await readPayload(response);
  if (!response.ok || payload.authenticated !== true) {
    redirectToAdmin();
    throw new Error('La sesión administrativa ha caducado.');
  }
  if (payload.account?.role !== 'PLATFORM_OWNER') {
    redirectToAdmin();
    throw new Error('Este apartado está reservado al propietario de la plataforma.');
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  const payload = await readPayload(response);
  if (response.status === 401) {
    redirectToAdmin();
    throw new Error('La sesión administrativa ha caducado.');
  }
  if (response.status === 403) throw new Error('Tu rol no permite modificar el Pueblo Atelier.');
  if (!response.ok) throw new Error(payload.message || 'No se pudo completar la operación.');
  return payload;
}

function providerName(provider) {
  return provider?.displayName || provider?.name || provider?.slug || 'Taller sin nombre';
}

function zoneSummary(zone) {
  const values = [];
  if (zone.workshopType) values.push(zone.workshopType);
  if (zone.providerSlug) {
    const provider = providers.find((item) => item.slug === zone.providerSlug);
    values.push(provider ? providerName(provider) : zone.providerSlug);
  }
  if (!values.length) values.push('Sin oficio ni taller asignado');
  return values;
}

function setStatus(card, text, tone = '') {
  const target = card.querySelector('.village-zone-status');
  target.textContent = text;
  target.className = `village-zone-status${tone ? ` ${tone}` : ''}`;
}

function setBusy(card, value) {
  card.setAttribute('aria-busy', String(value));
  for (const control of card.querySelectorAll('button,input,select')) control.disabled = value;
}

function fieldLabel(text, control, { wide = false } = {}) {
  const label = node('label', wide ? 'wide' : '');
  label.append(document.createTextNode(text), control);
  return label;
}

function input(type, value, maximum, placeholder) {
  const control = document.createElement('input');
  control.type = type;
  control.value = value || '';
  if (maximum) control.maxLength = maximum;
  if (placeholder) control.placeholder = placeholder;
  return control;
}

function providerSelect(selected) {
  const select = document.createElement('select');
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Sin taller asociado';
  select.append(empty);
  for (const provider of providers) {
    const option = document.createElement('option');
    option.value = provider.slug || '';
    option.textContent = providerName(provider);
    option.selected = option.value === selected;
    select.append(option);
  }
  return select;
}

function statusSelect(selected) {
  const select = document.createElement('select');
  for (const [value, label] of [
    ['ACTIVE', 'Activa'],
    ['RESERVED', 'Reservada'],
    ['HIDDEN', 'Oculta']
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === selected;
    select.append(option);
  }
  return select;
}

async function saveZone(card, zone) {
  if (busyZone) return;
  busyZone = zone.zoneKey;
  setBusy(card, true);
  setStatus(card, 'Guardando configuración…');
  try {
    await requestJson(`/internal/admin/village-zones/${encodeURIComponent(zone.zoneKey)}`, {
      method: 'PATCH',
      body: {
        workshopType: card.querySelector('[data-field="type"]').value.trim(),
        displayLabel: card.querySelector('[data-field="label"]').value.trim(),
        providerSlug: card.querySelector('[data-field="provider"]').value || null,
        status: card.querySelector('[data-field="status"]').value
      }
    });
    await loadData({ silent: true });
  } catch (error) {
    setBusy(card, false);
    setStatus(card, error.message, 'error');
  } finally {
    busyZone = null;
  }
}

async function resetZone(card, zone) {
  if (busyZone) return;
  if (!window.confirm(`¿Restablecer ${zone.label}? Volverá a quedar disponible para asignación automática.`)) return;
  busyZone = zone.zoneKey;
  setBusy(card, true);
  setStatus(card, 'Restableciendo zona…');
  try {
    await requestJson(`/internal/admin/village-zones/${encodeURIComponent(zone.zoneKey)}`, { method: 'DELETE' });
    await loadData({ silent: true });
  } catch (error) {
    setBusy(card, false);
    setStatus(card, error.message, 'error');
  } finally {
    busyZone = null;
  }
}

function zoneCard(zone) {
  const card = node('article', 'village-zone-card');
  card.dataset.zoneKey = zone.zoneKey;
  card.dataset.status = zone.status || 'RESERVED';

  const head = node('header', 'village-zone-head');
  const copy = node('div');
  copy.append(node('p', '', zone.zoneKey), node('h2', '', zone.label || zone.zoneKey));
  head.append(copy, node('span', 'village-zone-family', zone.family === 'SIGNATURE' ? 'Edificio singular' : 'Casa / taller'));

  const type = input('text', zone.workshopType, 80, 'Cerámica, bordado, joyería…');
  type.dataset.field = 'type';
  const label = input('text', zone.displayLabel, 120, 'Nombre visible opcional');
  label.dataset.field = 'label';
  const provider = providerSelect(zone.providerSlug);
  provider.dataset.field = 'provider';
  const status = statusSelect(zone.status || 'RESERVED');
  status.dataset.field = 'status';

  const fields = node('div', 'village-zone-fields');
  fields.append(
    fieldLabel('Tipo de taller', type),
    fieldLabel('Estado de la zona', status),
    fieldLabel('Nombre visible', label),
    fieldLabel('Taller asociado', provider)
  );

  const summary = node('div', 'village-zone-summary');
  summary.append(...zoneSummary(zone).map((value) => node('span', '', value)));

  const actions = node('div', 'village-zone-actions');
  const save = node('button', 'button primary', 'Guardar zona');
  save.type = 'button';
  const reset = node('button', 'button ghost', 'Restablecer');
  reset.type = 'button';
  const message = node('p', 'village-zone-status', zone.configured ? 'Configuración guardada.' : 'Disponible para asignación automática.');
  actions.append(save, reset, message);

  save.addEventListener('click', () => void saveZone(card, zone));
  reset.addEventListener('click', () => void resetZone(card, zone));
  status.addEventListener('change', () => { card.dataset.status = status.value; });

  card.append(head, fields, summary, actions);
  return card;
}

function render() {
  const target = byId('zones-grid');
  target.replaceChildren(...zones.map(zoneCard));
  target.hidden = false;
}

async function loadData({ silent = false } = {}) {
  if (!silent) {
    byId('loading-view').hidden = false;
    byId('zones-grid').hidden = true;
  }
  byId('error-view').hidden = true;
  try {
    const [zonesPayload, providersResponse] = await Promise.all([
      requestJson('/internal/admin/village-zones'),
      fetch('/internal/catalog/providers', { headers: { Accept: 'application/json' } })
    ]);
    const providersPayload = providersResponse.ok ? await readPayload(providersResponse) : {};
    zones = Array.isArray(zonesPayload.zones) ? zonesPayload.zones : [];
    providers = Array.isArray(providersPayload.providers) ? providersPayload.providers : [];
    render();
  } catch (error) {
    byId('error-message').textContent = error.message;
    byId('error-view').hidden = false;
  } finally {
    byId('loading-view').hidden = true;
  }
}

async function start() {
  try {
    await requireOwner();
    await loadData();
  } catch (error) {
    byId('loading-view').hidden = true;
    byId('error-message').textContent = error.message;
    byId('error-view').hidden = false;
  }
}

byId('refresh-button').addEventListener('click', () => void loadData());
byId('retry-button').addEventListener('click', () => void loadData());
void start();
