"""
# Home Assistant UPS Power Alert – Setup & Troubleshooting Guide

This file embeds a raw Markdown document as a Python string so it can live
alongside scripts, be version-controlled, or exported later.

---

## Goal
Trigger notifications when **UPS output power exceeds a threshold (e.g., 400–500 W)**
using **Home Assistant GUI-created automations**, with escalation to **mobile**,
**persistent notification**, and **ntfy**.

---

## Environment
- Installation method: **Home Assistant OS**
- Core: **2025.12.3**
- Supervisor: **2025.12.3**
- OS: **16.3**
- Frontend: **20251203.2**
- UPS integration exposing sensors:
  - `sensor.ups_output_power` (W)
  - `sensor.cst135uc2_load` (%)
  - `sensor.cst135uc2_battery_runtime` (s)
  - `sensor.cst135uc2_status`
- ntfy integration configured with a device/topic (e.g., `ha_alerts`)

---

## Key Lesson (Critical)

> **numeric_state triggers ONLY fire when the value crosses the threshold**.
>
> They **do NOT** fire if the value is already above the threshold when:
> - The automation is created
> - Home Assistant restarts
> - Automations are reloaded

This is why the automation did not trigger when the load was already ~478 W.

---

## Correct Trigger Pattern (Best Practice)

To ensure alerts fire reliably (including after restarts), combine:
- A **numeric_state trigger** (for crossings)
- A **state trigger** (for any change)
- A **numeric_state condition** (to enforce the threshold)

This guarantees evaluation even when already above the limit.

---

## Final Working Automation (YAML)

```yaml
alias: sensor-homelab-NOTIFY_ABOVE400WATTS
description: ""

trigger:
  - platform: numeric_state
    entity_id: sensor.ups_output_power
    above: 400

  - platform: state
    entity_id: sensor.ups_output_power

condition:
  - condition: numeric_state
    entity_id: sensor.ups_output_power
    above: 400

actions:
  - action: notify.mobile_app_elikesbikes_iphone17
    data:
      message: >-
        ⚠️ UPS load high after 6 PM
        Power: {{ states('sensor.ups_output_power') }} W
        Load: {{ states('sensor.cst135uc2_load') }}%
        Runtime: {{ states('sensor.cst135uc2_battery_runtime') }} s
        Status: {{ states('sensor.cst135uc2_status') }}

  - action: persistent_notification.create
    data:
      title: UPS Alert
      message: >-
        ⚠️ UPS load high after 6 PM
        Output Power: {{ states('sensor.ups_output_power') }} W
        Load: {{ states('sensor.cst135uc2_load') }} %
        Battery runtime: {{ states('sensor.cst135uc2_battery_runtime') }} s
        UPS status: {{ states('sensor.cst135uc2_status') }}
        Time: {{ now().strftime('%Y-%m-%d %H:%M:%S') }}

  - action: ntfy.publish
    target:
      device_id: cc162c8c17fe41a65b93e3fa3671e7e1
    data:
      title: UPS Power Alert
      message: |
        🚨 HA ALERT: UPS load high after 6 PM

        Output Power: {{ states('sensor.ups_output_power') }} W
        Load: {{ states('sensor.cst135uc2_load') }} %
        Battery runtime: {{ states('sensor.cst135uc2_battery_runtime') }} s
        UPS status: {{ states('sensor.cst135uc2_status') }}
        Time: {{ now().strftime('%Y-%m-%d %H:%M:%S') }}

mode: single
```

---

## GUI Configuration Notes

### Triggers
- Use **Numeric state** (above threshold)
- Add **State** trigger for the same entity

### Conditions
- Add **Numeric state condition** to enforce threshold

### ntfy Action (Important)
- **Topic is NOT entered manually**
- The topic is bound to the **ntfy device/entity** selected under **Target**
- Error `must contain at least one of entity_id, device_id...` occurs when no target is selected

---

## Troubleshooting Checklist

- [ ] Confirm `sensor.ups_output_power` has **unit = W** and a numeric state
- [ ] Verify sensor updates when load changes
- [ ] Ensure automation has **both triggers** + **condition**
- [ ] Test by forcing a change (e.g., 399 → 401 W)
- [ ] Confirm ntfy device is selected as **target**

---

## Enhancements (Optional)

- Add **time condition** (after 18:00)
- Add **battery-only condition**
- Add **cooldown / rate limit**
- Add **recovery alert** when power drops below threshold

---

## Why This Pattern Matters

This design avoids false negatives and ensures alerts are **state-aware**, not
just **event-dependent**. It is the correct approach for power, temperature,
and load-based monitoring in Home Assistant.

---


