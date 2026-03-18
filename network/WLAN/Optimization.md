


# The detailed markdown content based on the WunderTech video "Increase Performance by Optimizing your UniFi Wi-Fi Network"


This guide provides a comprehensive step-by-step approach to increasing the performance of your Ubiquiti UniFi network, focusing on AP placement, interference management, and roaming configurations.

## 1. Access Point (AP) Placement & Visualization
Before configuring software settings, validate physical placement.
* **Ubiquiti Design Center**: Use this tool to upload your floor plan.
    * **Draw Walls**: Accurately draw exterior (brick/concrete) and interior (drywall) walls to simulate signal loss.
    * **Simulate Coverage**: Place specific AP models (e.g., U7 Pro Max, U7 Lite) to view 2.4GHz, 5GHz, and 6GHz heatmaps.
    * **Goal**: Ensure APs are not placed right next to each other to prevent excessive overlap, but close enough to avoid dead zones.

## 2. Wi-Fi SSID Configuration & Network Segmentation
Creating multiple SSIDs allows for granular control over settings that affect device performance and compatibility.

### Recommended Strategy
* **Create at least two SSIDs**:
    1.  **Trusted Network** (Laptops, Phones, Tablets - Newer devices)
    2.  **IoT Network** (Smart plugs, older cameras - Legacy devices)
* **VLANs**: Use VLANs to segment traffic (e.g., IoT devices on a separate VLAN from your main PC).

### Key Global Settings
* **Private Pre-Shared Keys (PPSK)**: *Only available on WPA2.* Allows you to use one SSID but assign devices to different VLANs based on the password used. Great for IoT/Cameras.
* **Band Steering**:
    * **Recommendation**: Enabled (Set to "Prefer 5GHz").
    * **Why**: Moves capable devices off the congested 2.4GHz band to the faster 5GHz band.
* **MLO (Multi-Link Operation)**:
    * *Wi-Fi 7 Feature.* Currently in Early Access. Allows bands to work together for throughput/latency. Leave enabled if you have Wi-Fi 7 APs (U7 Pro/Pro Max).
* **BSS Transition**: Enable to help clients make roaming decisions.
* **Fast Roaming (802.11r)**:
    * **Trusted SSID**: **Enable**. Significantly improves roaming speed for modern devices (iPhone, Android, Laptops).
    * **IoT SSID**: **Disable**. Older devices often do not support 802.11r and will fail to connect.
* **Security Protocol**:
    * **6GHz Band**: Requires **WPA3**. This forces you to use WPA3, which legacy devices may not support. This is another reason to separate SSIDs (IoT on WPA2, Trusted on WPA3).

## 3. Access Point Specific Settings (Radios)
These settings should often be configured per AP, but general rules apply.

### Channel Width
* **2.4 GHz Band**: **20 MHz** (Strict Rule).
    * *Never* increase to 40 MHz. It consumes 2 channels and causes massive interference in the crowded 2.4GHz spectrum.
* **5 GHz Band**: **40 MHz or 80 MHz**.
    * **80 MHz**: Provides higher speed but higher risk of interference. Preferred if your environment is relatively clear.
    * **40 MHz**: Better stability if you are in a dense apartment complex with many neighbors.
* **6 GHz Band**: **160 MHz or 320 MHz**.
    * Since 6GHz is new and has short range, interference is rare. 160 MHz is usually a safe default for maximum performance.

### Channel Selection
* **Manual vs. Auto**:
    * **Scenario A: Isolated Environment (No neighbors)**: Run an **RF Scan**. Manually select the clearest channels for each AP. Ensure APs are on different channels (e.g., 2.4GHz use channels 1, 6, 11). Turn *OFF* nightly optimization.
    * **Scenario B: Congested Environment (Many neighbors)**: Use **Auto Channel** + **Nightly Channel Optimization**.
        * *Reasoning*: Neighbors' routers often switch channels automatically. If you set a static manual channel, a neighbor might switch to it tomorrow, causing interference. UniFi's "Nightly Optimization" (set to run at ~3 AM) adapts to these changes daily.

### Transmit Power (Crucial for Roaming)
Leaving Transmit Power on "Auto" (High) often causes "sticky clients"—devices that refuse to switch to a closer AP because they are holding onto a weak signal from a distant AP.

* **Goal**: Create cell sizes where the signal drops off as you move toward the next AP.
* **General Tuning Guidelines**:
    * **2.4 GHz**: Set to **Low**. (Signal travels too far; needs dampening to force roaming).
    * **5 GHz**: Set to **Medium**. (Good balance of range and roaming).
    * **6 GHz**: Set to **High**. (Signal attenuates quickly through walls; usually needs full power).
* *Note*: Use the **Wi-Fi Man** app to walk around your house. If your phone clings to a distant AP while standing next to a closer one, **lower** the transmit power of the distant AP.

## 4. Roaming Tuning
* **Minimum RSSI**: **Avoid using this.**
    * This feature forcefully kicks a client if signal drops below a threshold (e.g., -75dBm).
    * *Risk*: If a user walks to a corner of the house with no other AP coverage, this setting will simply disconnect them entirely. It breaks connectivity rather than smoothing it.
* **Meshing**:
    * **Hardwired APs**: **Disable Meshing**. It consumes radio airtime looking for wireless uplinks.
    * **Wireless Uplinks**: Only enable if you physically cannot run an ethernet cable to an AP.

## 5. Summary Action Plan
1.  **Map it out**: Use Design Center to check AP placement.
2.  **Separate Networks**: Create a Trusted SSID (Fast Roaming On, WPA3) and IoT SSID (Fast Roaming Off, WPA2).
3.  **Set Widths**: 2.4GHz @ 20MHz, 5GHz @ 80MHz.
4.  **Manage Interference**: Use "Nightly Channel Optimization" if you have neighbors; Manual channels if you live in the woods.
5.  **Tune Power**: Set 2.4GHz power to Low/Medium to fix sticky clients.
6.  **Verify**: Use Wi-Fi Man app to test signal overlap and roaming speeds.
