import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { io } from "socket.io-client";

const UPTIME_KUMA_URL = process.env.UPTIME_KUMA_URL;
const UPTIME_KUMA_USERNAME = process.env.UPTIME_KUMA_USERNAME;
const UPTIME_KUMA_PASSWORD = process.env.UPTIME_KUMA_PASSWORD;

if (!UPTIME_KUMA_URL || !UPTIME_KUMA_USERNAME || !UPTIME_KUMA_PASSWORD) {
  process.stderr.write(
    "Error: UPTIME_KUMA_URL, UPTIME_KUMA_USERNAME, and UPTIME_KUMA_PASSWORD must be set\n"
  );
  process.exit(1);
}

// --- Socket.IO connection ---

const EMIT_TIMEOUT_MS = 15000;

let socket = null;
let isAuthenticated = false;

function resetSocket() {
  socket = null;
  isAuthenticated = false;
}

function getSocket() {
  return new Promise((resolve, reject) => {
    if (socket && isAuthenticated && socket.connected) {
      return resolve(socket);
    }

    // Clean up stale socket if disconnected
    if (socket && !socket.connected) resetSocket();

    const s = io(UPTIME_KUMA_URL, {
      transports: ["websocket"],
      reconnection: false,
    });

    // Login callback timeout — prevents hanging if UptimeKuma never acks login
    const loginTimer = setTimeout(() => {
      s.disconnect();
      reject(new Error("Login timed out after 15s — UptimeKuma did not respond"));
    }, EMIT_TIMEOUT_MS);

    s.on("connect", () => {
      s.emit("login", { username: UPTIME_KUMA_USERNAME, password: UPTIME_KUMA_PASSWORD }, (res) => {
        clearTimeout(loginTimer);
        if (res.ok) {
          socket = s;
          isAuthenticated = true;
          // Reset on disconnect so the next call reconnects cleanly
          s.on("disconnect", resetSocket);
          resolve(socket);
        } else {
          s.disconnect();
          reject(new Error(`Login failed: ${res.msg || "invalid credentials"}`));
        }
      });
    });

    s.on("connect_error", (err) => {
      clearTimeout(loginTimer);
      reject(new Error(`Cannot connect to UptimeKuma at ${UPTIME_KUMA_URL}: ${err.message}`));
    });
  });
}

function emit(event, ...args) {
  return new Promise(async (resolve, reject) => {
    let s;
    try {
      s = await getSocket();
    } catch (err) {
      return reject(err);
    }

    // Timeout starts after socket is ready — full EMIT_TIMEOUT_MS for the operation itself
    const timer = setTimeout(
      () => reject(new Error(`${event} timed out after ${EMIT_TIMEOUT_MS / 1000}s`)),
      EMIT_TIMEOUT_MS
    );

    s.emit(event, ...args, (res) => {
      clearTimeout(timer);
      if (res && res.ok === false) {
        reject(new Error(res.msg || `${event} failed`));
      } else {
        resolve(res);
      }
    });
  });
}

// getMonitorList uses a one-time event listener, not a callback
function getMonitorList() {
  return new Promise(async (resolve, reject) => {
    let s;
    try {
      s = await getSocket();
    } catch (err) {
      return reject(err);
    }

    const handler = (data) => {
      clearTimeout(timer);
      resolve(data);
    };

    // Timeout starts after socket is ready; cleans up listener to avoid stale resolution
    const timer = setTimeout(() => {
      s.off("monitorList", handler);
      reject(new Error("getMonitorList timed out after 10s"));
    }, 10000);

    s.once("monitorList", handler);
    s.emit("getMonitorList");
  });
}

// --- Tool helpers ---

function statusLabel(status) {
  const map = { 0: "DOWN", 1: "UP", 2: "PENDING", 3: "MAINTENANCE" };
  return map[status] ?? `UNKNOWN(${status})`;
}

function formatMonitor(m) {
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    url: m.url ?? m.hostname ?? null,
    status: statusLabel(m.status),
    active: m.active,
    interval: m.interval,
    parent: m.parent ?? null,
    tags: (m.tags ?? []).map((t) => t.name ?? t),
  };
}

// --- MCP Server ---

const server = new McpServer({ name: "uptime-kuma", version: "1.0.0" });

server.registerTool("list_monitors", { description: "List all UptimeKuma monitors with their current status" }, async () => {
  const monitors = await getMonitorList();
  const list = Object.values(monitors).map(formatMonitor);
  return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
});

server.registerTool("list_monitor_groups", { description: "List monitor groups (useful for getting parent IDs when adding monitors)" }, async () => {
  const monitors = await getMonitorList();
  const groups = Object.values(monitors).filter((m) => m.type === "group").map(formatMonitor);
  return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
});

server.registerTool("get_monitor", {
  description: "Get details for a specific monitor by ID",
  inputSchema: { id: z.number().describe("Monitor ID") },
}, async ({ id }) => {
  const res = await emit("getMonitor", id);
  return { content: [{ type: "text", text: JSON.stringify(formatMonitor(res.monitor), null, 2) }] };
});

server.registerTool("pause_monitor", {
  description: "Pause a monitor (stop checking)",
  inputSchema: { id: z.number().describe("Monitor ID") },
}, async ({ id }) => {
  await emit("pauseMonitor", id);
  return { content: [{ type: "text", text: `Monitor ${id} paused successfully.` }] };
});

server.registerTool("resume_monitor", {
  description: "Resume a paused monitor",
  inputSchema: { id: z.number().describe("Monitor ID") },
}, async ({ id }) => {
  await emit("resumeMonitor", id);
  return { content: [{ type: "text", text: `Monitor ${id} resumed successfully.` }] };
});

server.registerTool("get_heartbeat_history", {
  description: "Get recent heartbeat/uptime history for a monitor",
  inputSchema: { id: z.number().describe("Monitor ID") },
}, async ({ id }) => {
  const res = await emit("getHeartbeats", id);
  const beats = (res.data ?? res ?? []).slice(-20).map((b) => ({
    time: b.time,
    status: statusLabel(b.status),
    ping: b.ping,
    msg: b.msg || null,
  }));
  return { content: [{ type: "text", text: JSON.stringify(beats, null, 2) }] };
});

server.registerTool("list_status_pages", { description: "List all UptimeKuma status pages" }, async () => {
  const res = await emit("getStatusPageList");
  const pages = Object.values(res ?? {}).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    published: p.published,
  }));
  return { content: [{ type: "text", text: JSON.stringify(pages, null, 2) }] };
});

server.registerTool("get_status_page", {
  description: "Get details for a status page by slug",
  inputSchema: { slug: z.string().describe("Status page slug") },
}, async ({ slug }) => {
  const res = await emit("getStatusPage", slug);
  return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
});

server.registerTool(
  "add_monitor",
  {
    description: "Add a new monitor. Common types: http, tcp, ping, dns, keyword. Use list_monitor_groups to find a parent_id for group assignment.",
    inputSchema: {
      name: z.string().describe("Monitor display name"),
      type: z.string().describe("Monitor type: http, tcp, ping, dns, keyword, push, steam"),
      url: z.string().optional().describe("URL to monitor (for http/keyword/dns)"),
      hostname: z.string().optional().describe("Hostname (for tcp/ping)"),
      port: z.number().optional().describe("Port (for tcp)"),
      interval: z.number().optional().describe("Check interval in seconds (default: 60)"),
      parent_id: z.number().optional().describe("Parent group monitor ID (use list_monitor_groups to find this)"),
    },
  },
  async ({ name, type, url, hostname, port, interval, parent_id }) => {
    const monitorData = {
      name,
      type,
      url: url ?? "",
      hostname: hostname ?? "",
      port: port ?? null,
      interval: interval ?? 60,
      retryInterval: interval ?? 60,
      resendInterval: 0,
      maxretries: 0,
      notificationIDList: {},
      ignoreTls: false,
      upsideDown: false,
      parent: parent_id ?? null,
      accepted_statuscodes: ["200-299"],
      method: "GET",
      conditions: [],
    };

    // Official event name is "add" per uptime-kuma-api docs; requires accepted_statuscodes + conditions
    const res = await emit("add", monitorData);
    return { content: [{ type: "text", text: `Monitor "${name}" created with ID ${res.monitorID}.` }] };
  }
);

// Graceful shutdown
process.on("SIGINT", () => {
  if (socket) socket.disconnect();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
