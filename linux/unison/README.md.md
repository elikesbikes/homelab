

# Bi-Directional Markdown Sync Guide

## Overview

This setup creates a **real-time, bi-directional bridge** between your DevOps development folder and your Obsidian vault. It is designed to be "invisible"—syncing your notes automatically while keeping your development environment and your knowledge base clean of each other's "noise" (like `.git` or `.obsidian` metadata).

### How it Works:

1. **Strict Filtering:** Only files ending in `.md` are allowed to sync.
    
2. **Conflict Resolution:** If the same file is edited in both places, the version with the **most recent timestamp** wins.
    
3. **Deletion Mirroring:** If you delete a note in Obsidian, it is automatically removed from the DevOps folder (and vice versa).
    
4. **Folder Awareness:** The system preserves your entire subfolder hierarchy.

## 1. The Core Configuration

The "brain" of the sync is the Unison profile.

**File Location:** `~/.unison/obsidian_sync.prf`

```
# --- ROOTS ---
# The two folders to keep in sync
root = /home/ecloaiza/devops/github
root = /home/ecloaiza/Documents/Obsidian/Loaiza/IT/github

# --- FILTERING LOGIC ---
# 1. Ignore all hidden files/folders (.git, .obsidian, .DS_Store, etc.)
ignore = Name {.*}

# 2. Ignore any file that is NOT a directory and DOES NOT end in .md
ignore = Name {*.[^m]*,*.m[^d]*}

# 3. Exception: Allow all directory paths so Unison can scan subfolders
ignorenot = Path *

# --- SYNC BEHAVIOR ---
# Automatically accept non-conflicting changes
batch = true
auto = true

# Preserve modification times to track the newest version
times = true

# If a conflict occurs, the newer file wins
prefer = newer

# Prevent the sync from stopping to ask permission for deletions
confirmbigdel = false
```

## 2. Manual Commands

Use these commands in your terminal for maintenance:

```
|**Action**|**Command**|
|---|---|
|**Run Manual Sync**|`unison obsidian_sync`|
|**Check Filter Logic**|`unison obsidian_sync -testline "filename.md"`|
|**Hard Reset**|`rm ~/.unison/ar* && unison obsidian_sync`|
```

**Note:** Use the "Hard Reset" only if the sync seems "stuck" or if you have manually moved large amounts of files around and Unison is confused.

## 3. Automation (Background Service)

To make the sync happen automatically in the background, we use a `systemd` user service.

**1. Create the service file:** `nano ~/.config/systemd/user/unison-markdown.service`

**2. Paste this content:**

```
[Unit]
Description=Auto-sync Markdown files (DevOps <-> Obsidian)
After=network.target

[Service]
Type=simple
# '-repeat watch' makes Unison wait for file system changes
ExecStart=/usr/bin/unison obsidian_sync -repeat watch
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

3. Enable the service:

```
systemctl --user daemon-reload
systemctl --user enable unison-markdown
systemctl --user start unison-markdown
```

## 4. Monitoring & Troubleshooting

### View the Live Log

If you want to see files being moved in real-time or check for errors:

```
journalctl --user -u unison-markdown -f
```

### Check Service Status

To see if the background sync is currently active:

```
systemctl --user status unison-markdown
```

### Common Issues

- **Deletions not propagating:** This happens if the Unison archive was recently reset. Manually delete the file from both sides once to "re-sync" the state.
    
- **New file types:** If you decide you want to sync `.png` images too, you must update the `ignore` rules in the `.prf` file and restart the service.