import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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

let socket = null;
let isAuthenticated = false;

function getSocket() {
  return new Promise((resolve, reject) => {
    if (socket && isAuthenticated) {
      return resolve(socket);
    }

    const s = io(UPTIME_KUMA_URL, {
      transports: ["websocket"],
      reconnection: false,
    });

    s.on("connect", () => {
      s.emit("login", { username: UPTIME_KUMA_USERNAME, password: UPTIME_KUMA_PASSWORD }, (res) => {
        if (res.ok) {
          socket = s;
          isAuthenticated = true;
          resolve(socket);
        } else {
          s.disconnect();
          reject(new Error(`Login failed: ${res.msg || "invalid credentials"}`));
        }
      });
    });

    s.on("connect_error", (err) => {
      reject(new Error(`Cannot connect to UptimeKuma at ${UPTIME_KUMA_URL}: ${err.message}`));
    });
  });
}

function emit(event, ...args) {
  return new Promise(async (resolve, reject) => {
    try {
      const s = await getSocket();
      s.emit(event, ...args, (res) => {
        if (res && res.ok === false) {
          reject(new Error(res.msg || `${event} failed`));
        } else {
          resolve(res);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

// getMonitorList uses a one-time event listener, not a callback
function getMonitorList() {
  return new Promise(async (resolve, reject) => {
    try {
      const s = await getSocket();
      s.once("monitorList", (data) => resolve(data));
      s.emit("getMonitorList");
      setTimeout(() => reject(new Error("getMonitorList timeout")), 10000);
    } catch (err) {
      reject(err);
    }
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

const server = new Server(
  { name: "uptime-kuma", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_monitors",
      description: "List all UptimeKuma monitors with their current status",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_monitor_groups",
      description: "List monitor groups (useful for getting parent IDs when adding monitors)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_monitor",
      description: "Get details for a specific monitor by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Monitor ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "pause_monitor",
      description: "Pause a monitor (stop checking)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Monitor ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "resume_monitor",
      description: "Resume a paused monitor",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Monitor ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_heartbeat_history",
      description: "Get recent heartbeat/uptime history for a monitor",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Monitor ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_status_pages",
      description: "List all UptimeKuma status pages",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_status_page",
      description: "Get details for a status page by slug",
      inputSchema: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Status page slug" },
        },
        required: ["slug"],
      },
    },
    {
      name: "add_monitor",
      description:
        "Add a new monitor. Common types: http, tcp, ping, dns, keyword. Use list_monitor_groups to find a parent_id for group assignment.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Monitor display name" },
          type: {
            type: "string",
            description: "Monitor type: http, tcp, ping, dns, keyword, push, steam",
          },
          url: {
            type: "string",
            description: "URL or hostname to monitor (for http/keyword/dns)",
          },
          hostname: {
            type: "string",
            description: "Hostname (for tcp/ping)",
          },
          port: { type: "number", description: "Port (for tcp)" },
          interval: {
            type: "number",
            description: "Check interval in seconds (default: 60)",
          },
          parent_id: {
            type: "number",
            description: "Parent group monitor ID (use list_monitor_groups to find this)",
          },
        },
        required: ["name", "type"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_monitors": {
        const monitors = await getMonitorList();
        const list = Object.values(monitors).map(formatMonitor);
        return {
          content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
        };
      }

      case "list_monitor_groups": {
        const monitors = await getMonitorList();
        const groups = Object.values(monitors)
          .filter((m) => m.type === "group")
          .map(formatMonitor);
        return {
          content: [{ type: "text", text: JSON.stringify(groups, null, 2) }],
        };
      }

      case "get_monitor": {
        const res = await emit("getMonitor", args.id);
        return {
          content: [
            { type: "text", text: JSON.stringify(formatMonitor(res.monitor), null, 2) },
          ],
        };
      }

      case "pause_monitor": {
        await emit("pauseMonitor", args.id);
        return {
          content: [{ type: "text", text: `Monitor ${args.id} paused successfully.` }],
        };
      }

      case "resume_monitor": {
        await emit("resumeMonitor", args.id);
        return {
          content: [{ type: "text", text: `Monitor ${args.id} resumed successfully.` }],
        };
      }

      case "get_heartbeat_history": {
        const res = await emit("getHeartbeats", args.id);
        const beats = (res.data ?? res ?? []).slice(-20).map((b) => ({
          time: b.time,
          status: statusLabel(b.status),
          ping: b.ping,
          msg: b.msg || null,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(beats, null, 2) }],
        };
      }

      case "list_status_pages": {
        const res = await emit("getStatusPageList");
        const pages = Object.values(res ?? {}).map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          description: p.description,
          published: p.published,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(pages, null, 2) }],
        };
      }

      case "get_status_page": {
        const res = await emit("getStatusPage", args.slug);
        return {
          content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
        };
      }

      case "add_monitor": {
        const monitorData = {
          name: args.name,
          type: args.type,
          url: args.url ?? "",
          hostname: args.hostname ?? "",
          port: args.port ?? null,
          interval: args.interval ?? 60,
          retryInterval: args.interval ?? 60,
          maxretries: 1,
          notificationIDList: {},
          ignoreTls: false,
          upsideDown: false,
          parent: args.parent_id ?? null,
        };
        const res = await emit("addMonitor", monitorData);
        return {
          content: [
            {
              type: "text",
              text: `Monitor "${args.name}" created with ID ${res.monitorID}.`,
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  if (socket) socket.disconnect();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
