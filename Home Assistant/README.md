"""
Zigbee Network Stabilization Guide
Author: Tars (ELIKESBIKES)
Date: January 11, 2026



# Zigbee Network Troubleshooting & Stabilization Guide

## Executive Summary
This document outlines the diagnostic steps and solutions applied to resolve severe instability in a Home Assistant ZHA Zigbee network. The primary symptoms were an inability to pair new devices, frequent `NWK_NO_ROUTE` errors, and high network congestion caused by "chatty" devices.

## 1. Diagnosis: The "Tuya Issue" & Network Storms
The initial analysis of the debug logs revealed a critical issue often referred to as a "broadcast storm" or excessive reporting, exacerbated by specific hardware.

### The Problem
* **Chatty Devices:** Several devices, specifically the Third Reality Smart Plugs (`0xD44E`, `0x7D99`, `0x88A8`) and Tuya-based sensors, were configured to report their status (Electrical Measurement, IAS Zone status) far too frequently (every few seconds).
* **Result:** This flooded the Zigbee network bandwidth. When the coordinator tried to send pairing commands or route discovery messages, they were drowned out by the noise, resulting in `MAC_NO_ACK` (No Acknowledgement) errors.
* **The Catalyst:** Unplugging a key router (`Tuya-garage-repeater`) caused the mesh routing table to fragment. Because the airwaves were so congested, the remaining routers could not successfully communicate to rebuild the map, leading to persistent `NWK_NO_ROUTE` errors.

## 2. Troubleshooting Steps Taken

### Phase 1: Noise Reduction (Traffic Control)
To allow the coordinator to "hear" again, we reduced the noise floor:
1.  **Identified High-Traffic Devices:** Logs highlighted devices sending `ZCL frame` updates every 1-5 seconds.
2.  **Temporary Removal:** Physically unplugged the "chatty" Third Reality plugs (`0xD44E`, `0x7D99`, `0x88A8`) to stop the electrical measurement spam.
3.  **Observation:** Verified in logs that the "Unknown Cluster" spam and excessive attribute reporting ceased.

### Phase 2: Healing the Mesh
With the noise reduced, the priority shifted to fixing the broken routing tables caused by the missing repeater.
1.  **Coordinator Power Cycle:** Performed a "hard" reset of the Zigbee Coordinator (Sonoff Dongle Plus) by unplugging it for 5+ minutes. This forces the clearing of volatile RAM and internal routing tables.
2.  **The "Nuclear" Option (When standard healing failed):**
    * Shutdown Home Assistant.
    * Powered down **ALL** Zigbee routers (plugs, bulbs, wired switches).
    * Waited 20 minutes to ensure all "panic" routing attempts ceased.
    * Brought the Coordinator back online first.
    * Powered on a single, known-good router (Sonoff S31 `0x1D67`) close to the coordinator.
    * Incrementally powered on remaining routers.

### Phase 3: The Root Cause (Firmware)
Despite noise reduction, `NWK_NO_ROUTE` persisted. Deep analysis of the coordinator metadata revealed:
* **Hardware:** Sonoff Zigbee 3.0 USB Dongle Plus (CC2652P)
* **Firmware Version:** `20210708` (Z-Stack)
* **The Defect:** This specific firmware version has a known bug regarding **Source Routing**. When a parent router leaves the network, the coordinator fails to update the route, permanently trying to send messages into a "black hole" regardless of network healing.
* **Solution:** The coordinator requires a firmware update (recommended: `20221226` or newer) to properly handle mesh topology changes.

## 3. Best Practices for Stability

### Pairing New Devices
* **Do not use "Add Device" globally:** This forces the Coordinator to try and handle the pairing directly, which fails if the device is far away.
* **Use "Add via this device":** Navigate to a specific Router device (like a hardwired plug or switch) closest to where the new device will live. Select "Add devices via this device." This forces the new device to use that specific parent immediately.

### Managing "Chatty" Tuya/Third Reality Devices
* **DCL (Data Command and Control):** If possible, use ZHA configuration to increase the **Reporting Interval** for clusters like `ElectricalMeasurement` (0x0b04) and `Metering` (0x0702).
* **Default:** Often set to `0` or `1` second.
* **Recommended:** Set `Min Report Interval` to `30` or `60` seconds to reduce congestion by 90%.

### Network Maintenance
* Avoid unplugging mains-powered Zigbee devices (routers) whenever possible. If you must move one, be prepared to power cycle your Coordinator afterwards to force a route refresh.
