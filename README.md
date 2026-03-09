# Universal EV Charger Card

A universal EV charger Lovelace card for Home Assistant.

Works with any charger integration using Home Assistant entities.

No evcc installation required.

## Features

- Charging start / stop
- Charge current slider
- Charging mode buttons
- SOC circle display
- PV surplus indicator
- Charging power display
- Phase display
- Energy today
- Charging animation
- Mini dashboard layout

## Works with

- go-e Charger
- openWB
- Tesla
- Easee
- Zaptec
- MQTT chargers
- Modbus chargers
- any custom integration

## Installation (HACS)

Add this repository as a custom repository.

Type:

Lovelace

Install the card.

Add resource:

/hacsfiles/universal-ev-charger-card/universal-ev-charger-card.js

Restart Home Assistant.

## Lovelace Example

```yaml
type: custom:universal-ev-charger-card

title: Wallbox

entities:

  charging: switch.wallbox

  power: sensor.wallbox_power
  energy: sensor.wallbox_energy_today

  soc: sensor.car_soc

  pv_power: sensor.pv_surplus
  grid_power: sensor.grid_power

  phases: sensor.wallbox_phases

  current: number.wallbox_current
  mode: select.wallbox_mode
