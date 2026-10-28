// src/host/features.ts
var featureHosts = [];

// src/common/http-route.ts
var LOOPBACK_ADDRESSES = /* @__PURE__ */ new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
function isLocalRequest(request) {
  const address = request.socket.remoteAddress ?? "";
  return LOOPBACK_ADDRESSES.has(address);
}
function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (origin === void 0) return true;
  const host = request.headers.host;
  if (host === void 0) return false;
  try {
    return new URL(origin).host === host;
  } catch (error) {
    console.error("[dsh-ide] \u89E3\u6790 Origin \u5931\u8D25:", error);
    return false;
  }
}
function isTrustedRequest(request) {
  if (!isLocalRequest(request)) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  return isSameOrigin(request);
}
function sendJson(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text)
  });
  response.end(text);
}

// src/host/routes/ping.ts
function handlePing(request, response) {
  if (!isTrustedRequest(request)) {
    sendJson(response, 403, { ok: false, error: { code: "FORBIDDEN", message: "\u8BF7\u6C42\u6765\u6E90\u4E0D\u53EF\u4FE1" } });
    return;
  }
  sendJson(response, 200, { ok: true, value: "pong" });
}

// src/host/routes/index.ts
var API_PREFIX = "/dsh-ide/api";
var ROUTES = {
  "GET /ping": handlePing
};
function routePathOf(request) {
  const raw = request.url ?? "/";
  const path = raw.split("?")[0] ?? "/";
  return path.slice(API_PREFIX.length) || "/";
}
function registerRoutes(webServer) {
  return webServer.register({
    kind: "prefix",
    path: API_PREFIX,
    handler: (request, response) => {
      if (!isTrustedRequest(request)) {
        sendJson(response, 403, { ok: false, error: { code: "FORBIDDEN", message: "\u8BF7\u6C42\u6765\u6E90\u4E0D\u53EF\u4FE1" } });
        return;
      }
      const key = `${request.method ?? "GET"} ${routePathOf(request)}`;
      const handler = ROUTES[key];
      if (handler === void 0) {
        sendJson(response, 404, { ok: false, error: { code: "NOT_FOUND", message: `\u672A\u77E5\u63A5\u53E3 ${key}` } });
        return;
      }
      try {
        const result = handler(request, response);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error("[dsh-ide] \u8DEF\u7531\u5904\u7406\u5931\u8D25:", key, error);
            if (!response.headersSent) {
              sendJson(response, 500, { ok: false, error: { code: "INTERNAL", message: "\u5185\u90E8\u9519\u8BEF" } });
            }
          });
        }
      } catch (error) {
        console.error("[dsh-ide] \u8DEF\u7531\u5904\u7406\u5931\u8D25:", key, error);
        if (!response.headersSent) {
          sendJson(response, 500, { ok: false, error: { code: "INTERNAL", message: "\u5185\u90E8\u9519\u8BEF" } });
        }
      }
    }
  });
}

// src/host/index.ts
var inject = Array.from(
  /* @__PURE__ */ new Set(["webServer", ...featureHosts.flatMap((feature) => feature.inject ?? [])])
);
function apply(ctx) {
  ctx.inject(["webServer"], (scoped) => {
    const webServer = scoped.webServer;
    if (webServer === void 0) {
      console.error("[dsh-ide] \u5BBF\u4E3B\u672A\u63D0\u4F9B webServer\uFF0C\u6587\u4EF6\u4E0E Git \u8DEF\u7531\u4E0D\u53EF\u7528");
      return;
    }
    ctx.effect(() => registerRoutes(webServer), "dsh-ide: routes");
  });
  for (const feature of featureHosts) {
    try {
      feature.apply(ctx);
    } catch (error) {
      console.error("[dsh-ide] feature \u5BBF\u4E3B\u6269\u5C55\u542F\u52A8\u5931\u8D25:", error);
    }
  }
}
export {
  apply,
  inject
};
