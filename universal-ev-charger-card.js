/**
 * Universal EV Charger Card for Home Assistant
 * A fully functional Lovelace custom card for EV chargers
 * Compatible with go-e, openWB, Tesla, Easee, Zaptec, MQTT, Modbus and any custom integration
 */

const CARD_VERSION = '1.0.0';

// Register card info for HA UI picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'universal-ev-charger-card',
  name: 'Universal EV Charger Card',
  description: 'A universal EV charger card for Home Assistant. Works with any charger integration.',
  preview: true,
  documentationURL: 'https://github.com/zuppl/universal-ev-charger-card',
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function stateOrDefault(hass, entityId, fallback = null) {
  if (!entityId || !hass) return fallback;
  const stateObj = hass.states[entityId];
  return stateObj ? stateObj.state : fallback;
}

function attributeOrDefault(hass, entityId, attribute, fallback = null) {
  if (!entityId || !hass) return fallback;
  const stateObj = hass.states[entityId];
  return stateObj && stateObj.attributes ? (stateObj.attributes[attribute] ?? fallback) : fallback;
}

function formatPower(watts) {
  if (watts === null || watts === undefined || isNaN(watts)) return '—';
  const w = parseFloat(watts);
  if (Math.abs(w) >= 1000) return (w / 1000).toFixed(2) + ' kW';
  return Math.round(w) + ' W';
}

function formatEnergy(kwh) {
  if (kwh === null || kwh === undefined || isNaN(kwh)) return '—';
  return parseFloat(kwh).toFixed(2) + ' kWh';
}

function isCharging(state) {
  return state === 'on' || state === 'true' || state === 'charging';
}

// ─── Config Schema (for Lovelace UI editor, optional) ────────────────────────

const SCHEMA = [
  { name: 'title', label: 'Title', selector: { text: {} } },
  {
    name: 'entities', label: 'Entities', type: 'grid', schema: [
      { name: 'charging',  label: 'Charging Switch',    selector: { entity: { domain: ['switch', 'input_boolean'] } } },
      { name: 'power',     label: 'Charging Power',     selector: { entity: { domain: 'sensor' } } },
      { name: 'energy',    label: 'Energy Today',       selector: { entity: { domain: 'sensor' } } },
      { name: 'soc',       label: 'Car SOC (%)',        selector: { entity: { domain: 'sensor' } } },
      { name: 'pv_power',  label: 'PV Surplus Power',  selector: { entity: { domain: 'sensor' } } },
      { name: 'grid_power',label: 'Grid Power',        selector: { entity: { domain: 'sensor' } } },
      { name: 'phases',    label: 'Active Phases',     selector: { entity: { domain: 'sensor' } } },
      { name: 'current',   label: 'Charge Current',    selector: { entity: { domain: ['number', 'input_number'] } } },
      { name: 'mode',      label: 'Charging Mode',     selector: { entity: { domain: ['select', 'input_select'] } } },
    ]
  },
];

// ─── Main Card Class ─────────────────────────────────────────────────────────

class UniversalEvChargerCard extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._boundHandlers = {};
  }

  // Called by HA to set the config
  setConfig(config) {
    if (!config) throw new Error('Invalid configuration');
    this._config = {
      title: config.title || 'EV Charger',
      entities: config.entities || {},
    };
    this._render();
  }

  // Called by HA when states change
  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  // Minimal card size hint
  getCardSize() { return 5; }

  // Static config for editor
  static getStubConfig() {
    return {
      title: 'Wallbox',
      entities: {
        charging: 'switch.wallbox',
        power: 'sensor.wallbox_power',
        energy: 'sensor.wallbox_energy_today',
        soc: 'sensor.car_soc',
        pv_power: 'sensor.pv_surplus',
        grid_power: 'sensor.grid_power',
        phases: 'sensor.wallbox_phases',
        current: 'number.wallbox_current',
        mode: 'select.wallbox_mode',
      }
    };
  }

  // ── Data gathering ──────────────────────────────────────────────────────────

  _getData() {
    const h = this._hass;
    const e = this._config.entities || {};

    const chargingState = stateOrDefault(h, e.charging, 'off');
    const charging = isCharging(chargingState);

    const power    = parseFloat(stateOrDefault(h, e.power, 0))     || 0;
    const energy   = stateOrDefault(h, e.energy, null);
    const soc      = parseFloat(stateOrDefault(h, e.soc, null));
    const pvPower  = parseFloat(stateOrDefault(h, e.pv_power, 0))  || 0;
    const gridPower= parseFloat(stateOrDefault(h, e.grid_power, 0))|| 0;
    const phases   = stateOrDefault(h, e.phases, null);

    // current slider
    let currentVal = null, currentMin = 6, currentMax = 32, currentStep = 1;
    if (e.current && h) {
      const cs = h.states[e.current];
      if (cs) {
        currentVal  = parseFloat(cs.state);
        currentMin  = parseFloat(cs.attributes.min  ?? 6);
        currentMax  = parseFloat(cs.attributes.max  ?? 32);
        currentStep = parseFloat(cs.attributes.step ?? 1);
      }
    }

    // mode select
    let modeVal = null, modeOptions = [];
    if (e.mode && h) {
      const ms = h.states[e.mode];
      if (ms) {
        modeVal     = ms.state;
        modeOptions = ms.attributes.options || [];
      }
    }

    return {
      charging, chargingState, power, energy, soc,
      pvPower, gridPower, phases,
      currentVal, currentMin, currentMax, currentStep,
      modeVal, modeOptions,
    };
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  _render() {
    if (!this._config) return;
    const d = this._getData();
    const shadow = this.shadowRoot;

    const socDefined = !isNaN(d.soc) && d.soc !== null;
    const socPct     = socDefined ? clamp(d.soc, 0, 100) : 0;
    // SVG circle math
    const R = 44, C = 2 * Math.PI * R;
    const socDash = (socPct / 100) * C;

    const pvPct = d.pvPower > 0 && d.power > 0
      ? clamp(Math.round((d.pvPower / d.power) * 100), 0, 100)
      : 0;

    const phasesNum = parseInt(d.phases) || null;

    shadow.innerHTML = `
      <style>
        ${this._styles(d.charging)}
      </style>

      <ha-card>
        <div class="card-root ${d.charging ? 'is-charging' : ''}">

          <!-- Header -->
          <div class="card-header">
            <div class="title-row">
              <span class="car-icon">⚡</span>
              <span class="title">${this._config.title}</span>
            </div>
            <div class="charging-toggle ${d.charging ? 'active' : ''}" id="toggle-btn" role="button" tabindex="0"
              aria-label="${d.charging ? 'Laden stoppen' : 'Laden starten'}">
              <span class="toggle-dot"></span>
            </div>
          </div>

          <!-- SOC + Power Row -->
          <div class="main-row">
            <!-- SOC Circle -->
            <div class="soc-wrapper">
              <svg class="soc-ring" viewBox="0 0 100 100">
                <circle class="soc-bg" cx="50" cy="50" r="${R}" />
                <circle class="soc-fill ${d.charging ? 'soc-animate' : ''}" cx="50" cy="50" r="${R}"
                  stroke-dasharray="${socDash} ${C}"
                  stroke-dashoffset="${C * 0.25}"
                />
              </svg>
              <div class="soc-label">
                ${socDefined
                  ? `<span class="soc-val">${Math.round(socPct)}</span><span class="soc-unit">%</span>`
                  : `<span class="soc-no">—</span>`}
                <span class="soc-sub">SOC</span>
              </div>
            </div>

            <!-- Stats column -->
            <div class="stats-col">
              <div class="stat-item power-item">
                <span class="stat-icon">🔌</span>
                <div class="stat-body">
                  <span class="stat-label">Leistung</span>
                  <span class="stat-value ${d.charging ? 'active-val' : ''}">${formatPower(d.power)}</span>
                </div>
              </div>

              ${d.energy !== null ? `
              <div class="stat-item">
                <span class="stat-icon">📊</span>
                <div class="stat-body">
                  <span class="stat-label">Heute</span>
                  <span class="stat-value">${formatEnergy(d.energy)}</span>
                </div>
              </div>` : ''}

              ${phasesNum ? `
              <div class="stat-item">
                <span class="stat-icon">〰️</span>
                <div class="stat-body">
                  <span class="stat-label">Phasen</span>
                  <span class="stat-value">${this._phaseDots(phasesNum)}</span>
                </div>
              </div>` : ''}
            </div>
          </div>

          <!-- PV Surplus Bar -->
          ${(d.pvPower > 0 || d.gridPower !== 0) ? `
          <div class="pv-section">
            <div class="pv-header">
              <span class="pv-label">☀️ PV-Überschuss</span>
              <span class="pv-val">${formatPower(d.pvPower)}</span>
            </div>
            <div class="pv-bar-bg">
              <div class="pv-bar-fill" style="width:${pvPct}%"></div>
              <span class="pv-pct">${pvPct}%</span>
            </div>
            ${d.gridPower !== 0 ? `
            <div class="grid-row">
              <span>${d.gridPower > 0 ? '🔋 Netzbezug' : '⬆️ Einspeisung'}</span>
              <span>${formatPower(Math.abs(d.gridPower))}</span>
            </div>` : ''}
          </div>` : ''}

          <!-- Current Slider -->
          ${d.currentVal !== null ? `
          <div class="control-section">
            <div class="control-header">
              <span>⚡ Ladestrom</span>
              <span class="current-val" id="current-display">${Math.round(d.currentVal)} A</span>
            </div>
            <input type="range" class="slider" id="current-slider"
              min="${d.currentMin}" max="${d.currentMax}" step="${d.currentStep}"
              value="${d.currentVal}"
            />
            <div class="slider-labels">
              <span>${d.currentMin} A</span><span>${d.currentMax} A</span>
            </div>
          </div>` : ''}

          <!-- Mode Selector -->
          ${d.modeOptions.length > 0 ? `
          <div class="mode-section">
            <span class="mode-label">Lademodus</span>
            <div class="mode-buttons">
              ${d.modeOptions.map(opt => `
                <button class="mode-btn ${opt === d.modeVal ? 'mode-active' : ''}"
                  data-mode="${opt}">${this._modeLabel(opt)}</button>
              `).join('')}
            </div>
          </div>` : ''}

          <!-- Charging animation bar -->
          ${d.charging ? `<div class="charge-anim"><div class="charge-flow"></div></div>` : ''}

        </div>
      </ha-card>
    `;

    this._attachListeners(d);
  }

  _phaseDots(n) {
    return '●'.repeat(n) + '○'.repeat(Math.max(0, 3 - n));
  }

  _modeLabel(mode) {
    const labels = {
      'fast': '⚡ Schnell',
      'eco': '🌿 Eco',
      'pv': '☀️ PV',
      'solar': '☀️ Solar',
      'min+pv': '⚡☀️ Min+PV',
      'stop': '⏹ Stop',
      'manual': '🔧 Manuell',
    };
    return labels[mode.toLowerCase()] || mode;
  }

  // ── Event listeners ─────────────────────────────────────────────────────────

  _attachListeners(d) {
    const root = this.shadowRoot;
    const h = this._hass;
    const e = this._config.entities || {};

    // Toggle charging
    const toggleBtn = root.getElementById('toggle-btn');
    if (toggleBtn && e.charging && h) {
      toggleBtn.addEventListener('click', () => {
        const domain = e.charging.split('.')[0] === 'input_boolean' ? 'input_boolean' : 'switch';
        h.callService(domain, d.charging ? 'turn_off' : 'turn_on', {
          entity_id: e.charging,
        });
      });
      toggleBtn.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') toggleBtn.click();
      });
    }

    // Current slider
    const slider = root.getElementById('current-slider');
    const display = root.getElementById('current-display');
    if (slider && e.current && h) {
      slider.addEventListener('input', () => {
        if (display) display.textContent = Math.round(slider.value) + ' A';
      });
      slider.addEventListener('change', () => {
        const domain = e.current.split('.')[0] === 'input_number' ? 'input_number' : 'number';
        h.callService(domain, 'set_value', {
          entity_id: e.current,
          value: parseFloat(slider.value),
        });
      });
    }

    // Mode buttons
    root.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!e.mode || !h) return;
        const domain = e.mode.split('.')[0] === 'input_select' ? 'input_select' : 'select';
        h.callService(domain, 'select_option', {
          entity_id: e.mode,
          option: btn.dataset.mode,
        });
      });
    });
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  _styles(charging) {
    return `
      :host {
        display: block;
        --ev-primary: #00c8ff;
        --ev-charging: #00e676;
        --ev-bg: #1a1f2e;
        --ev-surface: #242938;
        --ev-surface2: #2e3347;
        --ev-text: #e8ecf4;
        --ev-text-muted: #7a8399;
        --ev-pv: #ffd600;
        --ev-radius: 14px;
        --ev-radius-sm: 8px;
        font-family: 'Nunito', 'Segoe UI', sans-serif;
      }

      ha-card {
        background: var(--ev-bg);
        border-radius: var(--ev-radius);
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.06);
      }

      .card-root {
        padding: 16px;
        background: var(--ev-bg);
        color: var(--ev-text);
        position: relative;
      }

      .card-root.is-charging {
        background: linear-gradient(160deg, #1a1f2e 0%, #162030 60%, #1a2518 100%);
      }

      /* Header */
      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 18px;
      }
      .title-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .car-icon { font-size: 1.3em; }
      .title {
        font-size: 1.15em;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--ev-text);
      }

      /* Toggle */
      .charging-toggle {
        width: 52px;
        height: 28px;
        border-radius: 14px;
        background: var(--ev-surface2);
        border: 2px solid rgba(255,255,255,0.1);
        cursor: pointer;
        position: relative;
        transition: background 0.3s, border-color 0.3s;
        outline: none;
      }
      .charging-toggle:focus-visible {
        box-shadow: 0 0 0 3px rgba(0,200,255,0.4);
      }
      .charging-toggle.active {
        background: rgba(0,230,118,0.15);
        border-color: var(--ev-charging);
      }
      .toggle-dot {
        position: absolute;
        top: 3px;
        left: 4px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--ev-text-muted);
        transition: transform 0.3s cubic-bezier(.4,0,.2,1), background 0.3s;
      }
      .charging-toggle.active .toggle-dot {
        transform: translateX(24px);
        background: var(--ev-charging);
        box-shadow: 0 0 8px rgba(0,230,118,0.7);
      }

      /* Main row */
      .main-row {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
      }

      /* SOC Ring */
      .soc-wrapper {
        position: relative;
        width: 100px;
        height: 100px;
        flex-shrink: 0;
      }
      .soc-ring {
        width: 100%;
        height: 100%;
        transform: rotate(0deg);
      }
      .soc-bg {
        fill: none;
        stroke: var(--ev-surface2);
        stroke-width: 7;
      }
      .soc-fill {
        fill: none;
        stroke: var(--ev-primary);
        stroke-width: 7;
        stroke-linecap: round;
        transition: stroke-dasharray 0.8s ease;
      }
      .soc-fill.soc-animate {
        stroke: var(--ev-charging);
        animation: pulse-ring 2s ease-in-out infinite;
      }
      @keyframes pulse-ring {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      .soc-label {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      .soc-val {
        font-size: 1.6em;
        font-weight: 800;
        color: var(--ev-text);
        letter-spacing: -1px;
      }
      .soc-unit {
        font-size: 0.75em;
        color: var(--ev-text-muted);
        margin-top: 1px;
      }
      .soc-no {
        font-size: 1.4em;
        color: var(--ev-text-muted);
      }
      .soc-sub {
        font-size: 0.62em;
        color: var(--ev-text-muted);
        letter-spacing: 0.1em;
        text-transform: uppercase;
        margin-top: 3px;
      }

      /* Stats column */
      .stats-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .stat-item {
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--ev-surface);
        border-radius: var(--ev-radius-sm);
        padding: 8px 12px;
        border: 1px solid rgba(255,255,255,0.04);
      }
      .stat-icon { font-size: 1.1em; }
      .stat-body {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .stat-label {
        font-size: 0.68em;
        color: var(--ev-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .stat-value {
        font-size: 0.95em;
        font-weight: 700;
        color: var(--ev-text);
      }
      .stat-value.active-val {
        color: var(--ev-charging);
      }

      /* PV Section */
      .pv-section {
        background: var(--ev-surface);
        border-radius: var(--ev-radius-sm);
        padding: 12px;
        margin-bottom: 14px;
        border: 1px solid rgba(255,214,0,0.15);
      }
      .pv-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-size: 0.85em;
        font-weight: 600;
      }
      .pv-label { color: var(--ev-pv); }
      .pv-val { color: var(--ev-text); }
      .pv-bar-bg {
        height: 8px;
        background: var(--ev-surface2);
        border-radius: 4px;
        overflow: hidden;
        position: relative;
      }
      .pv-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--ev-pv), #ff9800);
        border-radius: 4px;
        transition: width 0.8s ease;
      }
      .pv-pct {
        position: absolute;
        right: 4px;
        top: -1px;
        font-size: 0.65em;
        color: var(--ev-text-muted);
        display: none;
      }
      .grid-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.75em;
        color: var(--ev-text-muted);
        margin-top: 6px;
      }

      /* Current Slider */
      .control-section {
        background: var(--ev-surface);
        border-radius: var(--ev-radius-sm);
        padding: 12px;
        margin-bottom: 14px;
        border: 1px solid rgba(255,255,255,0.04);
      }
      .control-header {
        display: flex;
        justify-content: space-between;
        font-size: 0.82em;
        font-weight: 600;
        margin-bottom: 10px;
        color: var(--ev-text);
      }
      .current-val {
        color: var(--ev-primary);
        font-weight: 800;
      }
      .slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        border-radius: 3px;
        background: var(--ev-surface2);
        outline: none;
        cursor: pointer;
      }
      .slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--ev-primary);
        cursor: pointer;
        border: 2px solid #fff;
        box-shadow: 0 0 6px rgba(0,200,255,0.5);
        transition: transform 0.15s;
      }
      .slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
      .slider::-moz-range-thumb {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--ev-primary);
        cursor: pointer;
        border: 2px solid #fff;
      }
      .slider-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.65em;
        color: var(--ev-text-muted);
        margin-top: 4px;
      }

      /* Mode Buttons */
      .mode-section {
        margin-bottom: 14px;
      }
      .mode-label {
        font-size: 0.7em;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--ev-text-muted);
        display: block;
        margin-bottom: 8px;
      }
      .mode-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .mode-btn {
        background: var(--ev-surface);
        border: 1px solid rgba(255,255,255,0.1);
        color: var(--ev-text-muted);
        border-radius: 20px;
        padding: 5px 14px;
        font-size: 0.78em;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
      }
      .mode-btn:hover {
        border-color: var(--ev-primary);
        color: var(--ev-text);
      }
      .mode-btn.mode-active {
        background: rgba(0,200,255,0.15);
        border-color: var(--ev-primary);
        color: var(--ev-primary);
      }

      /* Charging animation */
      .charge-anim {
        height: 3px;
        background: var(--ev-surface2);
        border-radius: 2px;
        overflow: hidden;
        margin-top: 4px;
      }
      .charge-flow {
        height: 100%;
        width: 40%;
        background: linear-gradient(90deg, transparent, var(--ev-charging), transparent);
        animation: flow 1.6s linear infinite;
        border-radius: 2px;
      }
      @keyframes flow {
        0%   { transform: translateX(-200%); }
        100% { transform: translateX(350%); }
      }
    `;
  }
}

// ─── Register the Custom Element ─────────────────────────────────────────────

if (!customElements.get('universal-ev-charger-card')) {
  customElements.define('universal-ev-charger-card', UniversalEvChargerCard);
  console.info(
    `%c UNIVERSAL-EV-CHARGER-CARD %c v${CARD_VERSION} `,
    'background:#00c8ff;color:#000;font-weight:700;padding:2px 6px;border-radius:4px 0 0 4px',
    'background:#242938;color:#00c8ff;font-weight:400;padding:2px 6px;border-radius:0 4px 4px 0',
  );
}
