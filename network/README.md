# Home Network Documentation

This repository documents the architecture, wireless configuration, security setup, and optimization practices for a UniFi-based home network. The network is built around performance, security, and logical segmentation.

---

## Table of Contents

1. [Overview](#overview)
2. [Physical Topology](#physical-topology)
3. [Hardware Inventory](#hardware-inventory)
4. [VLAN Segmentation](#vlan-segmentation)
5. [Wireless Configuration (SSIDs)](#wireless-configuration-ssids)
6. [WiFi Optimization](#wifi-optimization)
7. [Security](#security)
   - [TLS Certificates (Let's Encrypt + Cloudflare)](#tls-certificates-lets-encrypt--cloudflare)
8. [Inter-VLAN Firewall Policy](#inter-vlan-firewall-policy)

---

## Overview

The network is powered by **Ubiquiti UniFi** hardware, connected through a **Spectrum** ISP upstream. It is designed with:

- A **2.5 GbE backbone** for high-speed aggregation
- **VLAN segmentation** to isolate IoT, guest, and trusted devices
- **Dedicated SSIDs** mapped to specific VLANs
- **Let's Encrypt TLS certificates** on the UniFi Gateway via Cloudflare DNS

---

## Physical Topology

The ISP (Spectrum) feeds into the gateway/console (`router-prod-1b`), which connects to a core aggregation switch in the laundry room over a 2.5 GbE SFP+ link. From there, PoE switches distribute connectivity to the rest of the home and power the access points.

```
[Spectrum ISP]
      |
[router-prod-1b]  ← Gateway / UniFi Console
      |
[aggregate-laundry-1]  ← Core Aggregation Switch (2.5 GbE SFP+)
      |
[switch-laundry-1]  ← Main PoE Distribution Switch
      |
      ├── [switch-Office-1]    ← Office Switch (2.5 GbE)
      ├── [ap-livingroom-1]   ← AP: Main Floor Coverage
      └── [ap-patio-1]        ← AP: Outdoor Coverage
```

> Network topology diagram: [WLAN/2026-01-06_10-52.png](WLAN/2026-01-06_10-52.png)

---

## Hardware Inventory

| Device Name          | Role                   | Connectivity         |
|----------------------|------------------------|----------------------|
| `router-prod-1b`     | Gateway / Console      | Primary WAN          |
| `aggregate-laundry-1`| Core Aggregation       | 2.5 GbE SFP+         |
| `switch-laundry-1`   | Main PoE Switch        | GbE PoE Distribution |
| `switch-Office-1`    | Office Switch          | 2.5 GbE Performance  |
| `ap-livingroom-1`    | Access Point           | Main Floor Coverage  |
| `ap-patio-1`         | Access Point           | Outdoor Coverage     |

---

## VLAN Segmentation

The network uses VLANs to isolate traffic between infrastructure, trusted devices, and untrusted/IoT devices.

| VLAN | Name       | Subnet       | Purpose                                      |
|------|------------|--------------|----------------------------------------------|
| 1    | Management | X.X.X.X/24  | Infrastructure & Gateway management          |
| 2    | DMZ        | X.X.X.X/24  | Isolated services exposed externally         |
| 5    | Home       | X.X.X.X/24  | Trusted personal devices (SSID: EMILIKESBIKES) |
| 6    | IoT        | X.X.X.X/24  | Smart home & untrusted devices (SSID: E-IoT) |

> Internal IP schemes are redacted for repository privacy.

---

## Wireless Configuration (SSIDs)

Two SSIDs are broadcast, each mapped to a dedicated VLAN for security and performance isolation.

| SSID          | VLAN        | Bands          | Security | Notes                                 |
|---------------|-------------|----------------|----------|---------------------------------------|
| EMILIKESBIKES | Home (5)    | 2.4 GHz, 5 GHz | WPA2     | Trusted personal devices              |
| E-IoT         | IoT (6)     | 2.4 GHz        | WPA2     | Isolated smart home & IoT devices     |

**Radio Settings:**
- 5 GHz Roaming Assistant: Enabled at **-60 dBm** threshold for smooth AP handoffs
- Channel Width: **2.4 GHz @ 20 MHz** | **5 GHz @ 80 MHz**

---

## WiFi Optimization

Based on the [WunderTech UniFi optimization guide](WLAN/Optimization.md), the following best practices are applied or referenced.

### AP Placement

- APs are placed to ensure coverage overlap without excessive co-channel interference
- The **Ubiquiti Design Center** is used to simulate heatmaps against floor plan walls

### Key SSID Settings

| Setting           | Trusted SSID (Home) | IoT SSID         |
|-------------------|---------------------|------------------|
| Fast Roaming (802.11r) | Enabled        | Disabled         |
| Band Steering     | Prefer 5 GHz        | N/A (2.4 GHz only)|
| BSS Transition    | Enabled             | Enabled          |
| Security          | WPA2                | WPA2             |

### Channel Configuration

| Band    | Width   | Channel Strategy                                      |
|---------|---------|-------------------------------------------------------|
| 2.4 GHz | 20 MHz  | Manual or Nightly Optimization (neighbors dependent)  |
| 5 GHz   | 80 MHz  | Manual or Nightly Optimization (neighbors dependent)  |
| 6 GHz   | 160 MHz | High power; low interference due to short range        |

### Transmit Power Guidelines

| Band    | Power Setting | Reason                                               |
|---------|---------------|------------------------------------------------------|
| 2.4 GHz | Low           | Prevent signal from traveling too far; force roaming |
| 5 GHz   | Medium        | Balance between range and roaming                    |
| 6 GHz   | High          | Compensate for fast attenuation through walls        |

### Roaming

- **Minimum RSSI**: Not used — forcibly kicking clients in low-coverage areas leads to disconnects
- **Meshing**: Disabled on all wired APs to avoid airtime overhead
- **Validation tool**: Use the **Wi-Fi Man** app to walk the space and verify handoff behavior

---

## Security

### TLS Certificates (Let's Encrypt + Cloudflare)

The UniFi Gateway is served over HTTPS using a valid **Let's Encrypt RSA certificate** issued via **Cloudflare DNS-01 challenge**. This eliminates browser certificate warnings when accessing `router.home.elikesbikes.com` locally.

Full setup guide: [Security/Unifi Certs.md](Security/Unifi%20Certs.md)

**Architecture summary:**

```
[Certbot on Ubuntu client]
        |
        | DNS-01 Challenge via Cloudflare API
        ↓
[Let's Encrypt CA] → issues RSA cert
        |
        | SCP + SSH (dedicated key from ~/.secrets/ssh/)
        ↓
[UniFi Gateway] → cert installed to /data/unifi-core/config/
        |
        | systemctl restart unifi-core
        ↓
[HTTPS served at router.home.elikesbikes.com]
```

**Key details:**

- All secrets (keys, certs, configs) are stored under `~/.secrets/` with `700` permissions
- RSA key type is forced (`--key-type rsa`) — UniFi does not reliably accept ECDSA
- A deploy hook script (`deploy_to_unifi.sh`) automatically SCPs and installs new certs on renewal
- Auto-renewal runs daily at **3:30 AM** via user crontab
- Local DNS record in UniFi maps `router.home.elikesbikes.com` → gateway LAN IP

---

## Inter-VLAN Firewall Policy

Firewall rules enforce strict isolation between network segments:

- **IoT (VLAN 6) → Home (VLAN 5)**: Blocked. IoT devices cannot reach or scan trusted devices.
- **Management (VLAN 1)**: Accessible only from trusted infrastructure; not reachable from IoT or guest networks.
- **DMZ (VLAN 2)**: Isolated from internal VLANs; only inbound/outbound internet traffic allowed.
