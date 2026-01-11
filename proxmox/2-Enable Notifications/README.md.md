

  

# This variable holds the complete markdown guide

markdown_content = """# Integrating Proxmox Notifications with Ntfy

  

In Proxmox VE 8.1 and later, the notification system was overhauled to support multiple targets. While Proxmox has a native **Gotify** plugin, it does not have a dedicated **ntfy** plugin yet. However, you can easily integrate **ntfy** using the **Webhook** target (introduced in Proxmox 8.3) or by using ntfy’s **Email-to-Push** feature.

  

Below is the guide for the modern **Webhook** method (recommended).

  

---

  

## Method 1: Using Webhooks (Proxmox 8.3+)

This is the cleanest method and doesn't require configuring local mail services.

  

### 1. Create your ntfy Topic

* Decide on a topic name (e.g., `my-pve-alerts`).

* If you are using a private server or need authentication, generate an **Access Token** in your ntfy settings.

  

### 2. Configure the Webhook Target in Proxmox

1. Log in to the Proxmox Web UI.

2. Navigate to **Datacenter** > **Notifications** > **Notification Targets**.

3. Click **Add** and select **Webhook**.

4. Fill in the following details:

* **Name:** `ntfy-alerts`

* **Method:** `POST`

* **URL:** `https://ntfy.sh/your-topic-name` (Replace with your instance/topic).

5. **Add Headers:** Click the **Add** button in the Headers section.

* **Header Name:** `Title` | **Value:** `{{ title }}`

* **Header Name:** `Tags` | **Value:** `proxmox,{{ severity }}`

* *(Optional)* If using a token: **Header Name:** `Authorization` | **Value:** `Bearer <your-token>`

6. **Body:** Set this to `{{ message }}`.

7. Click **OK**.

  

### 3. Configure the Notification Matcher

By default, Proxmox uses a `default-matcher`. You need to tell it to use your new ntfy target.

1. Go to **Datacenter** > **Notifications** > **Notification Matchers**.

2. Select `default-matcher` and click **Modify**.

3. In the **Targets to notify** field, check the box for your new `ntfy-alerts` target.

4. Click **OK**.

  

---

  

## Method 2: Using Email-to-Push (Proxmox 8.1+)

If you prefer not to use webhooks or are on an older version of 8.x, you can use ntfy’s ability to receive emails.

  

1. **Get your ntfy email address:** Every topic has an email address, usually `topicname@ntfy.sh`.

2. **Add SMTP Target:** In Proxmox, go to **Datacenter** > **Notifications** > **Notification Targets**.

3. Click **Add** > **SMTP**.

4. Set the **Recipient** to your ntfy email address (e.g., `my-pve-alerts@ntfy.sh`).

5. Configure your SMTP server (Gmail, SendGrid, or your own) to send the mail.

  

---

  

### Comparison of Notification Flow

  

| Feature | Webhook Method | Email Method |

| :--- | :--- | :--- |

| **Speed** | Near Instant | Slight Delay |

| **Complexity** | Simple (UI only) | Moderate (Requires SMTP Relay) |

| **Formatting** | High control via Headers | Standard Email format |

  

### Testing your Setup

After saving, select your **ntfy-alerts** target in the list and click the **Test** button. You should receive a notification on your phone or browser immediately.

"""

  

