# AI-Ollama

Self-hosted LLM stack running Ollama with GPU acceleration and OpenWebUI as the chat interface.

## Table of Contents

1. [Architecture](#1-architecture)
2. [Stack](#2-stack)
3. [Prerequisites](#3-prerequisites)
4. [Setup](#4-setup)
5. [Usage](#5-usage)
6. [Pulling Models](#6-pulling-models)
7. [Ports](#7-ports)
8. [Logs](#8-logs)

---

## 1. Architecture

```
Browser → OpenWebUI :3000 → Ollama :11434 (GPU)
```

Both containers sit on the `FRONTEND` Docker network. Logs ship to Graylog via syslog. Nginx Proxy Manager handles external TLS routing — no proxy inside containers.

---

## 2. Stack

| Component | Image | Purpose |
|---|---|---|
| Ollama | `ollama/ollama:latest` | Model runner with NVIDIA GPU support |
| OpenWebUI | `ghcr.io/open-webui/open-webui:latest` | Chat UI and model management |

---

## 3. Prerequisites

- Docker + Docker Compose
- NVIDIA GPU with drivers installed
- `nvidia-container-toolkit` installed on the host
- `FRONTEND` Docker network already created
- Graylog syslog input listening on `192.168.5.30:514`

---

## 4. Setup

```bash
# 1. Clone / copy project files
cd /home/ecloaiza/devops/docker/AI-Ollama

# 2. Configure environment
cp .env.example .env
# Edit .env if needed (defaults should work for this homelab)

# 3. Start services
docker compose up -d
```

The `ollama/` and `openwebui_data/` directories are bind-mounted automatically — no manual `mkdir` needed.

---

## 5. Usage

- **OpenWebUI**: `http://<host>:3000`
- **Ollama API**: `http://<host>:11434`

On first run, create an admin account in OpenWebUI. Ollama models persist in `./ollama/` across restarts.

---

## 6. Pulling Models

```bash
# Pull a model
docker exec ai-ollama-prod-1 ollama pull llava:7b

# List installed models
docker exec ai-ollama-prod-1 ollama list

# Test a model
docker exec ai-ollama-prod-1 ollama run llava:7b "describe this image"
```

Recommended models for this hardware (Quadro P4000, 8GB VRAM):

| Model | Size | Use Case |
|---|---|---|
| `llava:7b` | 4.7 GB | Vision + text, fits comfortably |
| `llama3.2` | 2.0 GB | Text only, fast |
| `llama3.2-vision` | 7.9 GB | Better vision, tight on VRAM |

---

## 7. Ports

| Port | Service |
|---|---|
| `3000` | OpenWebUI |
| `11434` | Ollama API |

---

## 8. Logs

```bash
# Ollama logs
docker logs ai-ollama-prod-1 --tail=50

# OpenWebUI logs
docker logs ai-openwebui-prod-1 --tail=50
```

Structured logs are also available in Graylog under tags `ai-ollama` and `ai-openwebui`.

TARS