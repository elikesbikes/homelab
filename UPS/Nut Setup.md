"""
# NUT (Network UPS Tools) – Ubuntu Master + Home Assistant Integration

This document captures the **exact steps taken** to get a CyberPower UPS
(CST135UC2) fully working as a **NUT master on Ubuntu**, with verification
via CLI and readiness for Home Assistant and network clients.

---

## 1. Environment

- UPS: **CyberPower CST135UC2** (USB HID)
- OS (NUT Master): **Ubuntu**
- NUT Version: **2.8.1**
- Driver: **usbhid-ups (CyberPower HID 0.8)**
- Topology: **NUT master (netserver)**

---

## 2. Install NUT

```bash
sudo apt update
sudo apt install nut -y
```

Verify:
```bash
nut-scanner -U
```

---

## 3. Configure NUT Mode

Edit:
```bash
sudo vim /etc/nut/nut.conf
```

```ini
MODE=netserver
```

---

## 4. Configure UPS Driver

Edit:
```bash
sudo vim /etc/nut/ups.conf
```

```ini
[CST135UC2]
    driver = usbhid-ups
    port = auto
    desc = "CyberPower CST135UC2"
```

Confirm USB visibility:
```bash
lsusb
```
Expected:
```
0764:0601 Cyber Power System, Inc.
```

---

## 5. Configure Users

Edit:
```bash
sudo vim /etc/nut/upsd.users
```

```ini
[monuser]
  password = STRONG_PASSWORD
  upsmon master
```

---

## 6. Configure upsd Listener

Edit:
```bash
sudo vim /etc/nut/upsd.conf
```

```ini
LISTEN 127.0.0.1 3493
LISTEN 0.0.0.0 3493
```

---

## 7. Permissions (Critical Step)

Add user to nut group:
```bash
sudo usermod -aG nut $USER
```

Reload udev:
```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

(Re-login required)

---

## 8. Start Services (Correct Order)

```bash
sudo systemctl stop nut-monitor nut-server
sudo systemctl start nut-server
sleep 2
sudo systemctl start nut-monitor
```

Enable on boot:
```bash
sudo systemctl enable nut-server nut-monitor
```

---

## 9. Verify Driver Connection

```bash
journalctl -u nut-server -n 20 --no-pager
```

Expected:
```
Connected to UPS [CST135UC2]: usbhid-ups-CST135UC2
```

---

## 10. Verify Local Query (SUCCESS STATE)

```bash
upsc CST135UC2@localhost
```

Confirmed working output included:
- battery.charge
- input.voltage
- ups.status: OL
- driver.name: usbhid-ups

This confirmed:
- Driver socket created
- upsd responding
- upsmon authenticated

---

## 11. Network Access Test

Confirm listening:
```bash
ss -lntp | grep 3493
```

Expected:
```
LISTEN 0.0.0.0:3493
```

From another machine:
```bash
upsc CST135UC2@<NUT_MASTER_IP>
```

---

## 12. Home Assistant Integration

In Home Assistant:

- Integration: **Network UPS Tools (NUT)**
- Host: `<NUT_MASTER_IP>`
- Port: `3493`
- UPS name: `CST135UC2`
- Username: `monuser`
- Password: as configured

Connection succeeds immediately once NUT is reachable on LAN.

---

## 13. Common Failures We Hit (and Fixes)

### ❌ `Connection refused`
- upsd listening only on 127.0.0.1
- Fixed by adding `LISTEN 0.0.0.0`

### ❌ `Driver not connected`
- nut-server and nut-monitor started simultaneously
- Fixed by starting **nut-server first**

### ❌ `No such file or directory (usbhid-ups)`
- USB permissions
- Fixed via `nut` group + udev reload

### ❌ `upsc not found`
- nut-client not installed on test machine

---

## 14. Final State (Authoritative)

- UPS responding locally and remotely
- Driver stable
- HA-compatible
- Safe to add additional NUT clients

---

## 15. Optional Next Steps

- Harden firewall rules
- Configure shutdown ordering
- Add HA automations & notifications
- Document client-only installs

---

**Status: PRODUCTION-READY**
"""

if __name__ == "__main__":
    print("This file contains embedded Markdown documentation. Open it in an editor or extract the docstring.")
