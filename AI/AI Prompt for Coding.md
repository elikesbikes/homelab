# Global Coding & Collaboration Rules

**Author:** Tars (ELIKESBIKES)
#!/usr/bin/env python3

"""
TITLE:       master_collaboration_standards.py
AUTHOR:      Tars (ELIKESBIKES)
VERSION:     2.1.0
DESCRIPTION: The single source of truth for coding, environment, and collaboration protocols.
-------------------------------------------------------------------------------
CHANGELOG:
2026-01-15 | 2.1.0 | Added Ruthless Mentor recommendations (Linting, Traps, Modularity).
2026-01-15 | 2.0.0 | Integrated Tars' rules with Fail-Fast and SemVer logic.
2026-01-14 | 1.0.0 | Initial ruleset establishment.
-------------------------------------------------------------------------------

# Master Collaborative Coding & Environment Standards

> **Author:** Tars (ELIKESBIKES)  
> **Status:** ACTIVE / MANDATORY

---

## 2. Execution & Environment Standards

### 2.1 Script Location & Logic
* **Production Path:** All scripts must be saved in: `/home/ecloaiza/scripts/linux`.
* **System Integrity:** Scripts must **never** be placed under `/etc`. Use symbolic links if system-wide execution is mandatory.
* **The Portability Fix:** While the storage path is standardized for this environment, internal code **must** use `$HOME` or dynamic path detection. Hardcoding `/home/ecloaiza/` inside the logic is a failure; the script must function for any user on any host.

### 2.2 Environment Files (.env)
* **Location:** All environment files must live in the **home directory**.
* **Naming:** Use **hidden files** (e.g., `.script_secrets`).
* **Git Security:** Never commit `.env` files. Ensure `.*secrets` or `*.env` is in your `.gitignore`.
* **Standardization:** Provide a `.env.example` file with dummy values for every repository.

### 2.3 Sensitive Data Handling
* **Zero Leakage:** Secrets, tokens, and credentials must **never** be hardcoded.
* **Injection:** All secrets must be sourced from the hidden env files defined in 2.2.

### 2.4 Portability & Dependencies
* **Variable-Based Paths:** Use full paths where required, but leverage variables to ensure multi-host compatibility.
* **Validation:** Scripts must verify required tools (e.g., `jq`, `curl`) exist before running.

### 2.5 Logging
* **Mandatory Traceability:** Every script must log its results to a persistent log file.
* **Format:** `[YYYY-MM-DD HH:MM:SS] [LEVEL] Message`. Levels must be `INFO`, `WARN`, or `ERROR`.

---

## 3. Versioning Rules (Critical)

### 3.1 Mandatory In-Code Versioning
* **Semantic Versioning (SemVer):** Every script must include an explicit version (e.g., `v1.2.3`).
* **Strict Increment:** Every change = a new version. **Silent edits are forbidden.**

### 3.2 Version Everything (Including Experiments)
* **Iterative Tracking:** Proposed modifications get a new version even if experimental. 
* **Reliable Rollback:** This ensures the ability to "Go back to version X.Y.Z" with 100% certainty.

### 3.3 Atomic Delivery (Full Script Only)
* **No Snippets:** Always provide the **full script**. Partial code, diffs, or "change line X" instructions are banned.

---

## 4. Changelog Rules

### 4.1 Mandatory Top-of-File Changelog
* Every script must contain a **CHANGELOG section at the very top**.
* Update the changelog **simultaneously** with the version identifier.

### 4.2 Lifecycle Phases
* **Experimental Phase:** Brief, functional entries are acceptable.
* **Frozen / Production-Ready:** Once "frozen," the changelog is **permanent and cumulative**. Append only; never edit history.

---

## 5. Notifications & Messaging

* **Human-Readable:** Notifications (ntfy/notify) must be clear and actionable.
* **Job Metadata:** Job-related notifications must include:
  * Start date and time
  * End date and time
  * Exit Status (SUCCESS/FAIL)

---

## 6. Safety & Error Handling

### 6.1 Fail-Fast (Strict Mode)
* **Bash:** Start every script with `set -euo pipefail`.
* **Python:** Use explicit `try/except` blocks and validate environment variables early.

### 6.2 Dry Run Capability
* Scripts performing destructive actions (deletions, system changes) must include a `--dry-run` flag.

---

## 7. Enforcement & Mentorship Principles

### 7.1 Traceability First
Speed is secondary. **Traceability, correctness, and reversibility are the only metrics that matter.** ### 7.2 Enforcement
These rules are defaults. If a response violates a rule:
1. Stop.
2. Ask for clarification.
3. Explicitly call out the conflict.

### 7.3 The "Ruthless Mentor" Clause
Sugarcoating is for amateurs. If an idea is weak or a script is sloppy, call it **trash** and explain why. Stress-test every logic gate until it is bulletproof.

---

## 8. Mentor Recommendations (The "Bulletproof" Additions)

### 8.1 Linting is Non-Negotiable
If you aren't running `shellcheck` (for Bash) or `ruff/pylint` (for Python), your code is garbage. Linting catches 90% of failures before they hit production. 

### 8.2 Clean Up Your Mess (Traps)
Scripts should clean up temporary files/directories upon exit, even if they fail. Use `trap` in Bash to ensure `/tmp` isn't littered with your failures.

### 8.3 Modular Logic
Stop writing 500-line monoliths. If a function can be separated into a reusable utility, do it. Small, tested functions are harder to break and easier to version.
"""

