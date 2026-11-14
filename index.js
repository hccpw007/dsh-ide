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
function sendOk(response, value) {
  sendJson(response, 200, { ok: true, value });
}
function sendError(response, code, message, status = 400, details) {
  sendJson(response, status, { ok: false, error: { code, message, ...details } });
}

// src/host/routes/asset.ts
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
var CHUNK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "chunks");
var chunkCache = /* @__PURE__ */ new Map();
var ALLOWED_CHUNKS = /* @__PURE__ */ new Set([
  "editor-kernel.js",
  "terminal-kernel.js",
  "diff-kernel.js",
  "markdown-kernel.js"
]);
async function handleAsset(request, response) {
  const raw = (request.url ?? "").split("?")[0] ?? "";
  const requested = raw.slice(raw.lastIndexOf("/") + 1);
  const name = requested.endsWith(".js") ? requested : `${requested}.js`;
  if (!ALLOWED_CHUNKS.has(name)) {
    sendError(response, "ASSET_NOT_FOUND", `Unknown chunk: ${requested}`, 404);
    return;
  }
  try {
    const file = path.join(CHUNK_DIR, name);
    const info = await stat(file);
    const etag = `"${Math.round(info.mtimeMs).toString(36)}-${String(info.size)}"`;
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, { etag, "cache-control": "no-cache" });
      response.end();
      return;
    }
    const cached = chunkCache.get(name);
    const content = cached !== void 0 && cached.mtimeMs === info.mtimeMs && cached.content.byteLength === info.size ? cached.content : await readFile(file);
    if (cached === void 0 || cached.mtimeMs !== info.mtimeMs || cached.content.byteLength !== info.size) {
      chunkCache.set(name, { mtimeMs: info.mtimeMs, content });
    }
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
      etag,
      "content-length": content.byteLength
    });
    response.end(content);
  } catch (error) {
    console.error("[dsh-ide] \u8BFB\u53D6 chunk \u5931\u8D25:", name, error);
    sendError(response, "ASSET_MISSING", `Chunk has not been built: ${name}`, 404);
  }
}

// src/common/http-body.ts
var MAX_BODY_BYTES = 32 * 1024 * 1024;
var BodyError = class extends Error {
  /**
   * @param code 稳定错误码
   * @param message 诊断信息
   */
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "BodyError";
  }
};
async function readJsonBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    bytes += buffer.byteLength;
    if (bytes > MAX_BODY_BYTES) throw new BodyError("BODY_TOO_LARGE", "\u8BF7\u6C42\u4F53\u8D85\u8FC7\u4E0A\u9650");
    chunks.push(buffer);
  }
  if (bytes === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new BodyError("BODY_INVALID", "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
    }
    return parsed;
  } catch (error) {
    if (error instanceof BodyError) throw error;
    throw new BodyError("BODY_INVALID", `\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON: ${String(error)}`);
  }
}
function bodyString(body, key, fallback = "") {
  const value = body[key];
  return typeof value === "string" ? value : fallback;
}
function bodyNumber(body, key) {
  const value = body[key];
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function queryOf(request, key) {
  const raw = request.url ?? "/";
  const index = raw.indexOf("?");
  if (index < 0) return "";
  try {
    return new URLSearchParams(raw.slice(index + 1)).get(key) ?? "";
  } catch (error) {
    console.error("[dsh-ide] \u89E3\u6790\u67E5\u8BE2\u4E32\u5931\u8D25:", error);
    return "";
  }
}
function queryNumber(request, key) {
  const text = queryOf(request, key);
  if (text === "") return void 0;
  const value = Number(text);
  return Number.isFinite(value) ? value : void 0;
}

// src/common/safe-regex.ts
var MAX_PATTERN_LENGTH = 200;
var SafeRegexError = class extends Error {
  /** 失败类型，客户端按它区分提示文案。 */
  code;
  /**
   * @param code 失败类型
   * @param message 诊断信息
   */
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "SafeRegexError";
  }
};
function emptySet() {
  return { any: false, chars: /* @__PURE__ */ new Set() };
}
function anySet() {
  return { any: true, chars: /* @__PURE__ */ new Set() };
}
function addRange(set, from, to) {
  if (to - from > 512) {
    set.any = true;
    return;
  }
  for (let code = from; code <= to; code += 1) set.chars.add(String.fromCodePoint(code));
}
function intersects(left, right) {
  if (left.any || right.any) return true;
  for (const char of left.chars) {
    if (right.chars.has(char)) return true;
  }
  return false;
}
var BRACE_QUANTIFIER = /^\{(\d+)(?:,(\d*))?\}/u;
function parseRegex(source) {
  const parser = { source, index: 0 };
  const branches = parseAlternation(parser);
  if (parser.index < source.length) throw new Error(`Unexpected token at ${String(parser.index)}`);
  return branches;
}
function parseAlternation(parser) {
  const branches = [parseSequence(parser)];
  while (parser.source[parser.index] === "|") {
    parser.index += 1;
    branches.push(parseSequence(parser));
  }
  if (branches.length === 1) return branches[0] ?? [];
  return [{ type: "alt", branches }];
}
function parseSequence(parser) {
  const nodes = [];
  while (parser.index < parser.source.length) {
    const char = parser.source[parser.index];
    if (char === "|" || char === ")") break;
    const atom = parseAtom(parser);
    if (atom === null) continue;
    nodes.push(parseQuantifier(parser, atom));
  }
  return nodes;
}
function parseQuantifier(parser, atom) {
  const char = parser.source[parser.index];
  const readBrace = () => {
    const match = BRACE_QUANTIFIER.exec(parser.source.slice(parser.index));
    if (match === null) return null;
    const min2 = Number(match[1]);
    const max2 = match[2] === void 0 ? min2 : match[2] === "" ? Number.POSITIVE_INFINITY : Number(match[2]);
    return { min: min2, max: max2 };
  };
  let min;
  let max;
  if (char === "*") {
    min = 0;
    max = Number.POSITIVE_INFINITY;
    parser.index += 1;
  } else if (char === "+") {
    min = 1;
    max = Number.POSITIVE_INFINITY;
    parser.index += 1;
  } else if (char === "?") {
    min = 0;
    max = 1;
    parser.index += 1;
  } else if (char === "{") {
    const brace = readBrace();
    if (brace === null) return atom;
    min = brace.min;
    max = brace.max;
    parser.index += BRACE_QUANTIFIER.exec(parser.source.slice(parser.index))?.[0].length ?? 0;
  } else {
    return atom;
  }
  if (parser.source[parser.index] === "?") parser.index += 1;
  return { type: "repeat", body: atom, min, max };
}
function parseAtom(parser) {
  const char = parser.source[parser.index];
  if (char === void 0) return null;
  if (char === "^" || char === "$") {
    parser.index += 1;
    return { type: "assert" };
  }
  if (char === ".") {
    parser.index += 1;
    return { type: "set", set: anySet() };
  }
  if (char === "[") return { type: "set", set: parseClass(parser) };
  if (char === "(") return parseGroup(parser);
  if (char !== "\\") {
    parser.index += 1;
    const set = emptySet();
    set.chars.add(char);
    return { type: "set", set };
  }
  return parseEscape(parser, false);
}
function parseGroup(parser) {
  parser.index += 1;
  let lookaround = false;
  if (parser.source[parser.index] === "?") {
    const rest = parser.source.slice(parser.index);
    if (rest.startsWith("?:") || rest.startsWith("?<=") || rest.startsWith("?<!")) {
      lookaround = rest.startsWith("?<=");
      parser.index += rest.startsWith("?:") ? 2 : 3;
    } else if (rest.startsWith("?=") || rest.startsWith("?!")) {
      lookaround = true;
      parser.index += 2;
    } else if (rest.startsWith("?<")) {
      const end = parser.source.indexOf(">", parser.index);
      if (end === -1) throw new Error("Unterminated group name");
      parser.index = end + 1;
      lookaround = false;
    } else {
      parser.index += 1;
    }
  }
  const body = parseAlternation(parser);
  if (parser.source[parser.index] !== ")") throw new Error("Unterminated group");
  parser.index += 1;
  return { type: "group", body, lookaround };
}
function parseClass(parser) {
  parser.index += 1;
  let negated = false;
  if (parser.source[parser.index] === "^") {
    negated = true;
    parser.index += 1;
  }
  const set = emptySet();
  const absorb = (item) => {
    if (negated) {
      set.any = true;
      return;
    }
    if (item.any) {
      set.any = true;
      return;
    }
    for (const char of item.chars) set.chars.add(char);
  };
  while (parser.index < parser.source.length && parser.source[parser.index] !== "]") {
    const first = readClassChar(parser);
    if (first === null) continue;
    if (parser.source[parser.index] === "-" && parser.source[parser.index + 1] !== void 0 && parser.source[parser.index + 1] !== "]") {
      parser.index += 1;
      const second = readClassChar(parser);
      if (second !== null && !first.any && !second.any) {
        const from = first.chars.values().next().value;
        const to = second.chars.values().next().value;
        if (from !== void 0 && to !== void 0 && first.chars.size === 1 && second.chars.size === 1) {
          addRange(set, from.codePointAt(0) ?? 0, to.codePointAt(0) ?? 0);
          continue;
        }
      }
      absorb(first);
      set.chars.add("-");
      continue;
    }
    absorb(first);
  }
  if (parser.source[parser.index] !== "]") throw new Error("Unterminated character class");
  parser.index += 1;
  return set;
}
function readClassChar(parser) {
  const char = parser.source[parser.index];
  if (char === void 0) return null;
  if (char !== "\\") {
    parser.index += 1;
    const set = emptySet();
    set.chars.add(char);
    return set;
  }
  const escape = parseEscape(parser, true);
  return escape.type === "set" ? escape.set : null;
}
function parseEscape(parser, inClass) {
  parser.index += 1;
  const char = parser.source[parser.index] ?? "";
  parser.index += 1;
  const literal = (value) => {
    const set = emptySet();
    set.chars.add(value);
    return { type: "set", set };
  };
  if (char === "d") {
    const set = emptySet();
    addRange(set, 48, 57);
    return { type: "set", set };
  }
  if (char === "w") {
    const set = emptySet();
    addRange(set, 48, 57);
    addRange(set, 65, 90);
    addRange(set, 97, 122);
    set.chars.add("_");
    return { type: "set", set };
  }
  if (char === "s") {
    const set = emptySet();
    for (const space of [" ", "	", "\n", "\r", "\f", "\v", "\xA0", "\uFEFF"]) set.chars.add(space);
    return { type: "set", set };
  }
  if (char === "D" || char === "W" || char === "S" || char === "p" || char === "P") {
    if ((char === "p" || char === "P") && parser.source[parser.index] === "{") {
      const end = parser.source.indexOf("}", parser.index);
      if (end !== -1) parser.index = end + 1;
    }
    return { type: "set", set: anySet() };
  }
  if (char === "b" || char === "B" || char === "A" || char === "z" || char === "Z") {
    if (char === "b" && inClass) return literal("\b");
    return { type: "assert" };
  }
  if (char >= "1" && char <= "9" || char === "k") {
    if (char === "k" && parser.source[parser.index] === "<") {
      const end = parser.source.indexOf(">", parser.index);
      if (end !== -1) parser.index = end + 1;
    }
    return { type: "set", set: anySet() };
  }
  if (char === "n") return literal("\n");
  if (char === "r") return literal("\r");
  if (char === "t") return literal("	");
  if (char === "f") return literal("\f");
  if (char === "v") return literal("\v");
  if (char === "0") return literal("\0");
  if (char === "x") {
    parser.index += 2;
    return { type: "set", set: anySet() };
  }
  if (char === "u") {
    if (parser.source[parser.index] === "{") {
      const end = parser.source.indexOf("}", parser.index);
      if (end !== -1) parser.index = end + 1;
    } else {
      parser.index += 4;
    }
    return { type: "set", set: anySet() };
  }
  if (char === "c") {
    parser.index += 1;
    return { type: "set", set: anySet() };
  }
  return literal(char);
}
function firstOf(node) {
  if (node.type === "set") return node.set;
  if (node.type === "assert") return emptySet();
  if (node.type === "repeat") return firstOf(node.body);
  if (node.type === "group") {
    return node.lookaround ? emptySet() : firstOfSequence(node.body);
  }
  const merged = emptySet();
  for (const branch of node.branches) {
    const set = firstOfSequence(branch);
    if (set.any) merged.any = true;
    else for (const char of set.chars) merged.chars.add(char);
  }
  return merged;
}
function firstOfSequence(sequence2) {
  const merged = emptySet();
  for (const node of sequence2) {
    const set = firstOf(node);
    if (set.any) merged.any = true;
    else for (const char of set.chars) merged.chars.add(char);
    if (!couldBeEmpty(node)) break;
  }
  return merged;
}
function couldBeEmpty(node) {
  if (node.type === "assert") return true;
  if (node.type === "set") return false;
  if (node.type === "repeat") return node.min === 0 || couldBeEmpty(node.body);
  if (node.type === "group") return node.body.every(couldBeEmpty);
  return node.branches.some((branch) => branch.every(couldBeEmpty));
}
function literalHeadOf(sequence2) {
  let head = "";
  for (const node of sequence2) {
    if (node.type === "assert") continue;
    if (node.type === "set") {
      if (node.set.any || node.set.chars.size !== 1) return null;
      head += node.set.chars.values().next().value ?? "";
      continue;
    }
    if (node.type === "repeat") {
      if (node.max === 0) continue;
      if (node.min !== 1 || node.max !== 1) return head === "" ? null : head;
      const inner = literalHeadOf([node.body]);
      if (inner === null) return null;
      head += inner;
      continue;
    }
    if (node.type === "group") {
      if (node.lookaround) continue;
      const inner = literalHeadOf(node.body);
      if (inner === null) return null;
      head += inner;
      continue;
    }
    return null;
  }
  return head;
}
function branchesOverlap(left, right) {
  const leftHead = literalHeadOf(left);
  const rightHead = literalHeadOf(right);
  if (leftHead !== null && rightHead !== null) {
    if (leftHead === "" || rightHead === "") return intersects(firstOfSequence(left), firstOfSequence(right));
    return leftHead.startsWith(rightHead) || rightHead.startsWith(leftHead);
  }
  return intersects(firstOfSequence(left), firstOfSequence(right));
}
function hasUnboundedRepeat(node) {
  if (node.type === "repeat") {
    return node.max === Number.POSITIVE_INFINITY || hasUnboundedRepeat(node.body);
  }
  if (node.type === "group") return node.body.some(hasUnboundedRepeat);
  if (node.type === "alt") return node.branches.some((branch) => branch.some(hasUnboundedRepeat));
  return false;
}
function hasOverlappingAlternation(node) {
  if (node.type === "repeat") return hasOverlappingAlternation(node.body);
  if (node.type === "group") {
    return node.lookaround ? false : node.body.some(hasOverlappingAlternation);
  }
  if (node.type !== "alt") return false;
  for (let left = 0; left < node.branches.length; left += 1) {
    for (let right = left + 1; right < node.branches.length; right += 1) {
      if (branchesOverlap(node.branches[left] ?? [], node.branches[right] ?? [])) return true;
    }
  }
  return node.branches.some((branch) => branch.some(hasOverlappingAlternation));
}
function isRiskyNode(node) {
  if (node.type === "repeat") {
    if (node.max > 1) {
      const boundedOuter = node.max !== Number.POSITIVE_INFINITY && node.max < 8;
      if (!boundedOuter && hasUnboundedRepeat(node.body)) return true;
      if (hasOverlappingAlternation(node.body)) return true;
    }
    return isRiskyNode(node.body);
  }
  if (node.type === "group") return node.lookaround ? false : node.body.some(isRiskyNode);
  if (node.type === "alt") return node.branches.some((branch) => branch.some(isRiskyNode));
  return false;
}
function isRiskySource(source) {
  let nodes;
  try {
    nodes = parseRegex(source);
  } catch (error) {
    console.error("[dsh-ide] \u6B63\u5219\u7ED3\u6784\u89E3\u6790\u5931\u8D25\uFF0C\u8DF3\u8FC7\u5B89\u5168\u68C0\u67E5:", source, error);
    return false;
  }
  return nodes.some(isRiskyNode);
}
function compileSafeRegex(source, flags) {
  if (source.length > MAX_PATTERN_LENGTH) {
    throw new SafeRegexError(
      "REGEX_TOO_LONG",
      `Pattern is too long: ${source.length} characters, limit is ${MAX_PATTERN_LENGTH}`
    );
  }
  if (isRiskySource(source)) {
    throw new SafeRegexError(
      "REGEX_NESTED_QUANTIFIER",
      "Repeating a group that contains alternatives or quantifiers can backtrack exponentially and hang the process"
    );
  }
  try {
    return new RegExp(source, flags);
  } catch (error) {
    console.error("[dsh-ide] \u6B63\u5219\u8BED\u6CD5\u975E\u6CD5:", source, error);
    throw new SafeRegexError("REGEX_INVALID", `Invalid regular expression: ${String(error)}`);
  }
}

// src/host/services/fs-service.ts
import { constants } from "node:fs";
import { access, cp, mkdir, open, opendir, rename, readdir, readFile as readFile2, stat as stat3, rm, writeFile } from "node:fs/promises";
import path3 from "node:path";

// src/host/services/workspace.ts
import { realpath, stat as stat2 } from "node:fs/promises";
import path2 from "node:path";
var knownRoots = /* @__PURE__ */ new Map();
var MAX_KNOWN_ROOTS = 32;
var WorkspaceError = class extends Error {
  /**
   * @param code 稳定错误码
   * @param message 诊断信息，仅进日志，不直接展示
   */
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "WorkspaceError";
  }
};
function contains(parent, child) {
  if (child === parent) return true;
  const relative = path2.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path2.isAbsolute(relative);
}
async function resolveRoot(root) {
  if (typeof root !== "string" || root === "") {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", "Workspace root is missing");
  }
  if (!path2.isAbsolute(root)) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `Workspace root is not an absolute path: ${root}`);
  }
  const cached = knownRoots.get(root);
  if (cached !== void 0) {
    const info2 = await stat2(cached).catch(() => void 0);
    if (info2?.isDirectory() === true) return cached;
    knownRoots.delete(root);
  }
  const real = await realpath(root).catch(() => void 0);
  if (real === void 0) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `Workspace root does not exist: ${root}`);
  }
  const info = await stat2(real).catch(() => void 0);
  if (info?.isDirectory() !== true) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `Workspace root is not a directory: ${root}`);
  }
  if (real === path2.parse(real).root || real === process.env.HOME) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `Workspace root is too broad: ${real}`);
  }
  if (knownRoots.size >= MAX_KNOWN_ROOTS) knownRoots.clear();
  knownRoots.set(root, real);
  return real;
}
async function resolveWithin(root, input) {
  const realRoot = await resolveRoot(root);
  if (typeof input !== "string" || input.includes("\0")) {
    throw new WorkspaceError("PATH_INVALID", "Invalid path");
  }
  const absolute = path2.isAbsolute(input) ? path2.normalize(input) : path2.resolve(realRoot, input);
  const direct = await realpath(absolute).catch(() => void 0);
  const resolved = direct ?? await nearestReal(absolute);
  if (!contains(realRoot, resolved)) {
    throw new WorkspaceError("PATH_OUTSIDE_WORKSPACE", `Path is outside the workspace: ${input}`);
  }
  return {
    root: realRoot,
    absolute: direct ?? absolute,
    relative: direct === void 0 ? "" : path2.relative(realRoot, direct).split(path2.sep).join("/"),
    existed: direct !== void 0
  };
}
async function nearestReal(absolute) {
  const segments = [];
  let current = absolute;
  for (; ; ) {
    const real = await realpath(current).catch(() => void 0);
    if (real !== void 0) return path2.join(real, ...segments.reverse());
    const parent = path2.dirname(current);
    if (parent === current) return absolute;
    segments.push(path2.basename(current));
    current = parent;
  }
}

// src/host/services/fs-service.ts
var MAX_ENTRIES = 2e3;
var MAX_CHILDREN_PROBE = 500;
var STAT_CONCURRENCY = 16;
var MAX_COPY_PROBES = 100;
var MAX_READ_BYTES = 8 * 1024 * 1024;
var FileTooLargeError = class extends Error {
  /**
   * @param bytes 实际字节数
   */
  constructor(bytes) {
    super(`File is too large to open: ${String(bytes)} bytes`);
    this.bytes = bytes;
    this.name = "FileTooLargeError";
  }
};
function versionOf(info) {
  return `${Math.round(info.mtimeMs)}:${info.size}`;
}
function toEntryInfo(entry) {
  const type = entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other";
  return { name: entry.name, type };
}
function compareEntries(left, right) {
  const leftDirectory = left.type === "directory";
  const rightDirectory = right.type === "directory";
  if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1;
  return nameCollator.compare(left.name, right.name);
}
var nameCollator = new Intl.Collator(void 0, { numeric: true, sensitivity: "base" });
async function directoryHasChildren(absolutePath) {
  try {
    const handle = await opendir(absolutePath);
    try {
      const first = await handle.read();
      return first !== null;
    } finally {
      await handle.close();
    }
  } catch (error) {
    console.error("[fs-service] \u63A2\u6D4B\u76EE\u5F55\u662F\u5426\u4E3A\u7A7A\u5931\u8D25:", error);
    return void 0;
  }
}
async function listDirectory(root, input) {
  const resolved = await resolveWithin(root, input);
  const dirents = await readdir(resolved.absolute, { withFileTypes: true });
  const sliced = dirents.slice(0, MAX_ENTRIES);
  const entries = [];
  const probeChildren = sliced.length <= MAX_CHILDREN_PROBE;
  for (let start = 0; start < sliced.length; start += STAT_CONCURRENCY) {
    const batch = sliced.slice(start, start + STAT_CONCURRENCY);
    const infos = await Promise.all(
      batch.map(async (dirent) => {
        const info = toEntryInfo(dirent);
        if (info.type === "file") {
          const fileStat = await stat3(path3.join(resolved.absolute, dirent.name)).catch((error) => {
            if (error.code !== "ENOENT") {
              console.error("[dsh-ide] \u8BFB\u53D6\u6587\u4EF6\u5927\u5C0F\u5931\u8D25:", dirent.name, error);
            }
            return void 0;
          });
          if (fileStat !== void 0) info.size = fileStat.size;
        } else if (info.type === "directory" && probeChildren) {
          const hasChildren = await directoryHasChildren(path3.join(resolved.absolute, dirent.name));
          if (hasChildren !== void 0) info.hasChildren = hasChildren;
        }
        return info;
      })
    );
    entries.push(...infos);
  }
  entries.sort(compareEntries);
  return { path: resolved.absolute, entries, truncated: dirents.length > sliced.length };
}
async function statFile(root, input) {
  const resolved = await resolveWithin(root, input);
  const info = await stat3(resolved.absolute).catch((error) => {
    if (error.code !== "ENOENT") {
      console.error("[dsh-ide] \u8BFB\u53D6\u6587\u4EF6\u5143\u4FE1\u606F\u5931\u8D25:", resolved.absolute, error);
    }
    return void 0;
  });
  if (info === void 0) return void 0;
  return {
    absolutePath: resolved.absolute,
    version: versionOf(info),
    bytes: info.size,
    type: info.isDirectory() ? "directory" : info.isFile() ? "file" : "other",
    mtimeMs: info.mtimeMs
  };
}
async function readTextFile(root, input, options = {}) {
  const resolved = await resolveWithin(root, input);
  const info = await stat3(resolved.absolute);
  const maxBytes = options.maxBytes !== void 0 && options.maxBytes > 0 ? Math.floor(options.maxBytes) : void 0;
  if (maxBytes !== void 0 && info.size > maxBytes) {
    const handle = await open(resolved.absolute, "r");
    try {
      const buffer = Buffer.allocUnsafe(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      let text2 = buffer.subarray(0, bytesRead).toString("utf8");
      if (options.maxLines !== void 0 && options.maxLines > 0) {
        const lines = text2.split("\n");
        if (lines.length > options.maxLines) text2 = lines.slice(0, options.maxLines).join("\n");
      }
      return {
        text: text2,
        version: versionOf(info),
        absolutePath: resolved.absolute,
        bytes: info.size,
        truncated: true
      };
    } finally {
      await handle.close();
    }
  }
  if (info.size > MAX_READ_BYTES) throw new FileTooLargeError(info.size);
  const text = await readFile2(resolved.absolute, "utf8");
  return {
    text,
    version: versionOf(info),
    absolutePath: resolved.absolute,
    bytes: info.size,
    truncated: false
  };
}
async function writeTextFile(root, input, text, expectedVersion) {
  const resolved = await resolveWithin(root, input);
  const current = await stat3(resolved.absolute).catch(() => void 0);
  if (expectedVersion !== "") {
    if (current === void 0) {
      throw new WorkspaceError("PATH_INVALID", `Target no longer exists: ${resolved.absolute}`);
    }
    if (versionOf(current) !== expectedVersion) {
      throw new StaleFileError(versionOf(current));
    }
  }
  await mkdir(path3.dirname(resolved.absolute), { recursive: true });
  const temporary = `${resolved.absolute}.dsh-ide-${process.pid}-${Date.now()}.tmp`;
  try {
    await writeFile(temporary, text, "utf8");
    await rename(temporary, resolved.absolute);
  } catch (error) {
    await rm(temporary, { force: true }).catch((cleanupError) => {
      console.error("[dsh-ide] \u6E05\u7406\u4E34\u65F6\u6587\u4EF6\u5931\u8D25:", temporary, cleanupError);
    });
    throw error;
  }
  const after = await stat3(resolved.absolute);
  return {
    version: versionOf(after),
    absolutePath: resolved.absolute,
    created: current === void 0
  };
}
var StaleFileError = class extends Error {
  /**
   * @param currentVersion 磁盘上的当前版本
   */
  constructor(currentVersion) {
    super("File has been modified externally");
    this.currentVersion = currentVersion;
    this.name = "StaleFileError";
  }
};
async function createEntry(root, input, kind, text) {
  const resolved = await resolveWithin(root, input);
  await mkdir(path3.dirname(resolved.absolute), { recursive: true });
  if (kind === "directory") {
    await mkdir(resolved.absolute);
  } else {
    await writeFile(resolved.absolute, text, { encoding: "utf8", flag: "wx" });
  }
  return { absolutePath: resolved.absolute };
}
async function renameEntry(root, from, to) {
  const source = await resolveWithin(root, from);
  const target = await resolveWithin(root, to);
  await access(source.absolute, constants.F_OK);
  await mkdir(path3.dirname(target.absolute), { recursive: true });
  await rename(source.absolute, target.absolute);
}
async function pathExists(absolute) {
  try {
    await stat3(absolute);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function unusedCopyPath(sourceAbsolute, targetAbsolute) {
  if (!await pathExists(targetAbsolute)) return targetAbsolute;
  const extension = (await stat3(sourceAbsolute)).isDirectory() ? "" : path3.extname(targetAbsolute);
  const base = path3.basename(targetAbsolute, extension);
  const parent = path3.dirname(targetAbsolute);
  let candidate = targetAbsolute;
  let index = 1;
  while (await pathExists(candidate)) {
    if (index > MAX_COPY_PROBES) throw new Error(`Too many copies of ${path3.basename(targetAbsolute)}`);
    const suffix = index === 1 ? "_copy" : `_copy${index}`;
    candidate = path3.join(parent, `${base}${suffix}${extension}`);
    index += 1;
  }
  return candidate;
}
async function copyEntry(root, from, to) {
  const source = await resolveWithin(root, from);
  const target = await resolveWithin(root, to);
  await mkdir(path3.dirname(target.absolute), { recursive: true });
  const destination = await unusedCopyPath(source.absolute, target.absolute);
  await cp(source.absolute, destination, { recursive: true, errorOnExist: true, force: false });
}
async function deleteEntry(root, input) {
  const resolved = await resolveWithin(root, input);
  if (resolved.absolute === resolved.root) {
    throw new WorkspaceError("PATH_INVALID", "The workspace root cannot be deleted");
  }
  await rm(resolved.absolute, { recursive: true });
  return { absolutePath: resolved.absolute };
}

// src/host/services/search-service.ts
import { readdir as readdir2, readFile as readFile3, stat as stat4 } from "node:fs/promises";
import path4 from "node:path";
var MAX_WALK_FILES = 2e4;
var MAX_WALK_DIRECTORIES = 5e3;
var MAX_SEARCH_FILE_BYTES = 1024 * 1024;
var MAX_SEARCH_MATCHES = 2e3;
var MAX_FILE_MATCHES = 200;
var SEARCH_CONCURRENCY = 32;
var MAX_EXCLUDE_LENGTH = 200;
var MAX_EXCLUDE_ITEMS = 32;
var MAX_REGEX_LINE_LENGTH = 1024;
var REGEX_TIME_BUDGET_MS = 200;
var TOTAL_TIME_BUDGET_MS = 15e3;
var SKIP_DIRECTORIES = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  ".svn",
  ".hg",
  "dist",
  ".build",
  ".next",
  ".cache",
  "Pods",
  "target",
  ".venv",
  "venv",
  "__pycache__",
  ".gradle",
  ".terraform",
  "coverage"
]);
function globSource(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += (char ?? "").replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return source;
}
function combineGlobs(patterns) {
  if (patterns.length === 0) return null;
  const body = patterns.map((pattern) => globSource(pattern)).filter((source) => source !== "").map((source) => `(?:${source})`).join("|");
  if (body === "") return null;
  try {
    return new RegExp(`^(?:${body})$`);
  } catch (error) {
    console.error("[dsh-ide] \u7F16\u8BD1\u6392\u9664\u89C4\u5219\u5931\u8D25:", error);
    return null;
  }
}
function compileExcludes(exclude) {
  const items = exclude.split(",").map((item) => item.trim()).filter((item) => item !== "");
  if (items.length > MAX_EXCLUDE_ITEMS) {
    console.error(
      "[dsh-ide] \u6392\u9664\u9879\u8FC7\u591A\uFF0C\u53EA\u53D6\u524D\u82E5\u5E72\u9879:",
      items.length,
      `(limit ${String(MAX_EXCLUDE_ITEMS)})`
    );
  }
  const sources = items.slice(0, MAX_EXCLUDE_ITEMS).filter((source) => {
    if (source.length <= MAX_EXCLUDE_LENGTH) return true;
    console.error("[dsh-ide] \u6392\u9664\u9879\u8FC7\u957F\uFF0C\u5DF2\u5FFD\u7565:", source.slice(0, 80), `(${String(source.length)} chars)`);
    return false;
  });
  const pathPattern = combineGlobs(sources);
  const namePattern = combineGlobs(sources);
  return {
    sources,
    test: (relative) => {
      if (pathPattern?.test(relative) === true) return true;
      const name = relative.slice(relative.lastIndexOf("/") + 1);
      return namePattern?.test(name) === true;
    }
  };
}
function isExcluded(relative, excludes) {
  return excludes.test(relative);
}
async function walkFiles(root, excludes, signal) {
  const files = [];
  const pending = [""];
  let visited = 0;
  while (pending.length > 0) {
    if (signal?.aborted === true) return { files, truncated: true };
    const relative = pending.pop() ?? "";
    const absolute = relative === "" ? root : path4.join(root, relative);
    visited += 1;
    if (visited > MAX_WALK_DIRECTORIES) return { files, truncated: true };
    const dirents = await readdir2(absolute, { withFileTypes: true }).catch((error) => {
      console.error("[dsh-ide] \u8BFB\u53D6\u76EE\u5F55\u5931\u8D25\uFF0C\u5DF2\u8DF3\u8FC7:", absolute, error);
      return [];
    });
    for (const dirent of dirents) {
      const child = relative === "" ? dirent.name : `${relative}/${dirent.name}`;
      if (dirent.isDirectory()) {
        if (SKIP_DIRECTORIES.has(dirent.name) || isExcluded(child, excludes)) continue;
        pending.push(child);
        continue;
      }
      if (!dirent.isFile() || isExcluded(child, excludes)) continue;
      files.push(child);
      if (files.length >= MAX_WALK_FILES) return { files, truncated: true };
    }
  }
  return { files, truncated: false };
}
function querySource(request) {
  return request.regex ? request.query : request.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function compileQuery(request) {
  const escaped = querySource(request);
  const worded = request.wholeWord ? `\\b(?:${escaped})\\b` : escaped;
  return compileSafeRegex(worded, request.caseSensitive ? "g" : "gi");
}
function compileFileNameQuery(request) {
  return compileSafeRegex(querySource(request), request.caseSensitive ? "" : "i");
}
async function searchWorkspace(request, signal) {
  const startedAt = Date.now();
  const hardDeadline = startedAt + TOTAL_TIME_BUDGET_MS;
  const resolved = await resolveWithin(request.root, ".");
  const excludes = compileExcludes(request.exclude);
  const pattern = compileQuery(request);
  const namePattern = compileFileNameQuery(request);
  const { files, truncated: walkedOut } = await walkFiles(resolved.absolute, excludes, signal);
  const fileHits = [];
  const matches = [];
  let truncated = walkedOut;
  let filesTruncated = false;
  let cursor = 0;
  let regexSpentMs = 0;
  const regexBudgetExhausted = () => request.regex && regexSpentMs >= REGEX_TIME_BUDGET_MS;
  for (let index = 0; index < files.length; index += 1) {
    if (index % 512 === 0 && (signal?.aborted === true || Date.now() > hardDeadline || regexBudgetExhausted())) {
      truncated = true;
      break;
    }
    const relative = files[index] ?? "";
    const name = relative.slice(relative.lastIndexOf("/") + 1);
    if (!namePattern.test(name)) continue;
    fileHits.push({ path: relative, name });
    if (fileHits.length >= MAX_FILE_MATCHES) {
      filesTruncated = true;
      break;
    }
  }
  if (request.onlyFilename) {
    return { files: fileHits, filesTruncated, matches, truncated, filesScanned: files.length };
  }
  const searchFile = async (relative, limit) => {
    const found = [];
    if (limit <= 0 || signal?.aborted === true) return found;
    const absolute = path4.join(resolved.absolute, relative);
    const info = await stat4(absolute).catch((error) => {
      if (error.code !== "ENOENT") {
        console.error("[dsh-ide] \u641C\u7D22\u65E0\u6CD5\u8BFB\u53D6\u6587\u4EF6\u4FE1\u606F:", absolute, error);
      }
      return void 0;
    });
    if (info === void 0 || info.size > MAX_SEARCH_FILE_BYTES) return found;
    const data = await readFile3(absolute).catch((error) => {
      console.error("[dsh-ide] \u641C\u7D22\u8DF3\u8FC7\u4E0D\u53EF\u8BFB\u6587\u4EF6:", absolute, error);
      return void 0;
    });
    if (data === void 0 || data.byteLength > MAX_SEARCH_FILE_BYTES) return found;
    const text = data.toString("utf8");
    if (text.includes("\0")) return found;
    const lines = text.split("\n");
    const matchStartedAt = Date.now();
    for (let index = 0; index < lines.length; index += 1) {
      if (regexBudgetExhausted() || request.regex && Date.now() - matchStartedAt > REGEX_TIME_BUDGET_MS) {
        truncated = true;
        break;
      }
      const line = lines[index] ?? "";
      const haystack = request.regex && line.length > MAX_REGEX_LINE_LENGTH ? line.slice(0, MAX_REGEX_LINE_LENGTH) : line;
      pattern.lastIndex = 0;
      const hit = pattern.exec(haystack);
      if (hit === null) continue;
      found.push({
        path: relative,
        absolutePath: absolute,
        line: index + 1,
        column: hit.index + 1,
        text: line.trim().slice(0, 400)
      });
      if (found.length >= limit) break;
    }
    if (request.regex) regexSpentMs += Date.now() - matchStartedAt;
    return found;
  };
  while (cursor < files.length) {
    const remaining = MAX_SEARCH_MATCHES - matches.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    if (signal?.aborted === true || Date.now() > hardDeadline || regexBudgetExhausted()) {
      truncated = true;
      break;
    }
    const batch = files.slice(cursor, cursor + SEARCH_CONCURRENCY);
    cursor += batch.length;
    const results = await Promise.all(batch.map((relative) => searchFile(relative, remaining)));
    for (const found of results) {
      for (const match of found) {
        if (matches.length >= MAX_SEARCH_MATCHES) break;
        matches.push(match);
      }
      if (matches.length >= MAX_SEARCH_MATCHES) {
        truncated = true;
        return { files: fileHits, filesTruncated, matches, truncated, filesScanned: files.length };
      }
    }
  }
  return { files: fileHits, filesTruncated, matches, truncated, filesScanned: files.length };
}

// src/host/services/reveal-service.ts
import { spawn } from "node:child_process";
import path5 from "node:path";
var REVEAL_TIMEOUT_MS = 5e3;
function commandFor(target) {
  if (process.platform === "darwin") return { command: "open", args: ["-R", target], ignoreExitCode: false };
  if (process.platform === "win32") return { command: "explorer", args: [`/select,${target}`], ignoreExitCode: true };
  return { command: "xdg-open", args: [path5.dirname(target)], ignoreExitCode: false };
}
async function revealInFileManager(root, input) {
  const resolved = await resolveWithin(root, input);
  const { command, args, ignoreExitCode } = commandFor(resolved.absolute);
  await new Promise((resolve2, reject) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch (error) {
        console.error("[dsh-ide] \u7ED3\u675F\u6587\u4EF6\u7BA1\u7406\u5668\u8FDB\u7A0B\u5931\u8D25:", error);
      }
      resolve2();
    }, REVEAL_TIMEOUT_MS);
    timer.unref?.();
    child.on("error", (error) => {
      clearTimeout(timer);
      console.error("[dsh-ide] \u6253\u5F00\u7CFB\u7EDF\u6587\u4EF6\u7BA1\u7406\u5668\u5931\u8D25:", command, resolved.absolute, error);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (ignoreExitCode || code === 0) {
        resolve2();
        return;
      }
      console.error("[dsh-ide] \u7CFB\u7EDF\u6587\u4EF6\u7BA1\u7406\u5668\u8FD4\u56DE\u975E\u96F6\u9000\u51FA\u7801:", command, code);
      reject(new Error(`${command} exited with code ${String(code)}`));
    });
    child.unref();
  });
}

// src/host/routes/fs.ts
async function handleFsList(request, response) {
  const root = queryOf(request, "root");
  const target = queryOf(request, "path");
  try {
    sendOk(response, await listDirectory(root, target));
  } catch (error) {
    respondFsError(response, error);
  }
}
async function handleFsStat(request, response) {
  const root = queryOf(request, "root");
  const target = queryOf(request, "path");
  try {
    const info = await statFile(root, target);
    if (info === void 0) {
      sendError(response, "NOT_FOUND", `Target does not exist: ${target}`, 404);
      return;
    }
    sendOk(response, info);
  } catch (error) {
    respondFsError(response, error);
  }
}
async function handleFsRead(request, response) {
  const root = queryOf(request, "root");
  const target = queryOf(request, "path");
  try {
    sendOk(
      response,
      await readTextFile(root, target, {
        maxBytes: queryNumber(request, "maxBytes") ?? void 0,
        maxLines: queryNumber(request, "maxLines") ?? void 0
      })
    );
  } catch (error) {
    respondFsError(response, error);
  }
}
async function handleFsWrite(request, response) {
  try {
    const body = await readJsonBody(request);
    const result = await writeTextFile(
      bodyString(body, "root"),
      bodyString(body, "path"),
      bodyString(body, "text"),
      bodyString(body, "expectedVersion")
    );
    sendOk(response, result);
  } catch (error) {
    respondFsError(response, error);
  }
}
async function handleFsCreate(request, response) {
  try {
    const body = await readJsonBody(request);
    sendOk(
      response,
      await createEntry(
        bodyString(body, "root"),
        bodyString(body, "path"),
        bodyString(body, "kind") === "directory" ? "directory" : "file",
        bodyString(body, "text")
      )
    );
  } catch (error) {
    respondFsError(response, error);
  }
}
async function handleFsRename(request, response) {
  try {
    const body = await readJsonBody(request);
    await renameEntry(bodyString(body, "root"), bodyString(body, "from"), bodyString(body, "to"));
    sendOk(response, null);
  } catch (error) {
    respondFsError(response, error);
  }
}
async function handleFsCopy(request, response) {
  try {
    const body = await readJsonBody(request);
    await copyEntry(bodyString(body, "root"), bodyString(body, "from"), bodyString(body, "to"));
    sendOk(response, null);
  } catch (error) {
    respondFsError(response, error);
  }
}
async function handleFsDelete(request, response) {
  try {
    const body = await readJsonBody(request);
    sendOk(response, await deleteEntry(bodyString(body, "root"), bodyString(body, "path")));
  } catch (error) {
    respondFsError(response, error);
  }
}
async function handleFsReveal(request, response) {
  try {
    const body = await readJsonBody(request);
    await revealInFileManager(bodyString(body, "root"), bodyString(body, "path"));
    sendOk(response, null);
  } catch (error) {
    respondFsError(response, error);
  }
}
async function handleFsSearch(request, response) {
  const query = queryOf(request, "q");
  if (query === "") {
    sendError(response, "QUERY_EMPTY", "Query string is empty");
    return;
  }
  const controller = new AbortController();
  const abort = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.once("close", abort);
  try {
    sendOk(
      response,
      await searchWorkspace(
        {
          root: queryOf(request, "root"),
          query,
          regex: queryOf(request, "regex") === "1",
          caseSensitive: queryOf(request, "caseSensitive") === "1",
          wholeWord: queryOf(request, "wholeWord") === "1",
          onlyFilename: queryOf(request, "onlyFilename") === "1",
          exclude: queryOf(request, "exclude")
        },
        controller.signal
      )
    );
  } catch (error) {
    if (error instanceof SafeRegexError) {
      sendError(response, error.code, error.message);
      return;
    }
    if (error instanceof SyntaxError) {
      sendError(response, "REGEX_INVALID", `Invalid regular expression: ${error.message}`);
      return;
    }
    respondFsError(response, error);
  } finally {
    response.off("close", abort);
  }
}
function respondFsError(response, error) {
  if (error instanceof StaleFileError) {
    sendError(response, "STALE_FILE", "File has been modified externally", 409);
    return;
  }
  if (error instanceof BodyError) {
    sendError(response, error.code, error.message, error.code === "BODY_TOO_LARGE" ? 413 : 400);
    return;
  }
  if (error instanceof FileTooLargeError) {
    sendError(response, "FILE_TOO_LARGE", error.message, 413);
    return;
  }
  if (error instanceof WorkspaceError) {
    const status = error.code === "PATH_OUTSIDE_WORKSPACE" ? 403 : 400;
    sendError(response, error.code, error.message, status);
    return;
  }
  const code = error.code;
  if (code === "ENOENT") {
    sendError(response, "NOT_FOUND", String(error), 404);
    return;
  }
  if (code === "EEXIST") {
    sendError(response, "ALREADY_EXISTS", "Target already exists");
    return;
  }
  if (code === "EACCES" || code === "EPERM") {
    sendError(response, "PERMISSION_DENIED", "Permission denied for this path", 403);
    return;
  }
  if (code === "EISDIR" || code === "ENOTDIR") {
    sendError(response, "NOT_A_FILE", String(error));
    return;
  }
  console.error("[dsh-ide] \u6587\u4EF6\u64CD\u4F5C\u5931\u8D25:", error);
  sendError(response, "IO_ERROR", String(error), 500);
}

// src/host/services/git-service.ts
import { spawn as spawn2 } from "node:child_process";
import { readFile as readFile4, rename as rename2, rm as rm2, stat as stat5, writeFile as writeFile2 } from "node:fs/promises";
import { resolve, sep } from "node:path";
var MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
var MAX_STDERR_BYTES = 4 * 1024 * 1024;
var DEFAULT_TIMEOUT_MS = 3e4;
var NETWORK_TIMEOUT_MS = 18e4;
var GitError = class extends Error {
  /**
   * @param code 稳定错误码
   * @param message 诊断信息
   * @param stderr Git 的原始错误输出
   */
  constructor(code, message, stderr = "") {
    super(message);
    this.code = code;
    this.stderr = stderr;
    this.name = "GitError";
  }
  /**
   * 实际执行的命令行；控制台据此在失败时也回显真实命令。
   * 参数校验阶段就被拒绝的调用还没有命令行，此时为空。
   */
  command;
};
var queues = /* @__PURE__ */ new Map();
var repositoryCache = /* @__PURE__ */ new Map();
var REPOSITORY_CACHE_TTL_MS = 3e4;
var NON_REPOSITORY_CACHE_TTL_MS = 5e3;
var MAX_REPOSITORY_CACHE = 64;
function serialized(repo, task, lane = "local") {
  const key = `${lane}:${resolve(repo)}`;
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.catch(() => void 0);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return next;
}
function execGit(repo, argv, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fail = (code, message, stderr = "") => {
    const error = new GitError(code, message, stderr);
    error.command = displayCommand(argv);
    return error;
  };
  return new Promise((resolvePromise, reject) => {
    let child;
    try {
      child = spawn2("git", argv, {
        cwd: repo,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
        detached: process.platform !== "win32"
      });
    } catch (error) {
      reject(fail("GIT_NOT_INSTALLED", `Unable to start git: ${String(error)}`));
      return;
    }
    const out = [];
    const err = [];
    let bytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const killChild = (signal) => {
      if (process.platform !== "win32" && child.pid !== void 0) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch (error) {
          console.error("[dsh-ide] \u7EC8\u6B62 git \u8FDB\u7A0B\u7EC4\u5931\u8D25\uFF0C\u6539\u4E3A\u7EC8\u6B62\u4E3B\u8FDB\u7A0B:", error);
        }
      }
      try {
        child.kill(signal);
      } catch (error) {
        console.error("[dsh-ide] \u7EC8\u6B62 git \u8FDB\u7A0B\u5931\u8D25:", error);
      }
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killChild("SIGKILL");
      reject(fail("GIT_TIMEOUT", `git ${argv.join(" ")} timed out`));
    }, timeoutMs);
    timer.unref?.();
    child.stdout?.on("data", (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > MAX_OUTPUT_BYTES) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          killChild("SIGKILL");
          reject(fail("GIT_OUTPUT_TOO_LARGE", "git output exceeded the size limit"));
        }
        return;
      }
      out.push(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      if (stderrBytes >= MAX_STDERR_BYTES) return;
      stderrBytes += chunk.byteLength;
      err.push(chunk);
    });
    const failStream = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killChild("SIGKILL");
      reject(fail("GIT_FAILED", `git output stream failed: ${String(error)}`));
    };
    child.stdout?.on("error", failStream);
    child.stderr?.on("error", failStream);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(fail("GIT_NOT_INSTALLED", `git failed to start: ${String(error)}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code !== 0 && options.allowFailure !== true) {
        reject(fail("GIT_FAILED", stderr.trim() || `git ${argv[0] ?? ""} failed`, stderr));
        return;
      }
      resolvePromise({ stdout, stderr, code: code ?? 0 });
    });
  });
}
function displayCommand(argv) {
  const quoted = argv.map(
    (item) => /^[A-Za-z0-9_./:=@+^~-]+$/.test(item) ? item : `"${item.replace(/"/g, '\\"')}"`
  );
  return `git ${quoted.join(" ")}`;
}
async function resolveRepository(cwd) {
  const cached = repositoryCache.get(cwd);
  if (cached !== void 0) {
    const ttl = cached.root === void 0 ? NON_REPOSITORY_CACHE_TTL_MS : REPOSITORY_CACHE_TTL_MS;
    if (Date.now() - cached.at < ttl) return cached.root;
  }
  let root;
  try {
    const result = await execGit(cwd, ["rev-parse", "--show-toplevel"], { allowFailure: true });
    root = result.code === 0 ? result.stdout.trim() : void 0;
  } catch (error) {
    console.error("[dsh-ide] Failed to resolve repository:", cwd, error);
  }
  if (repositoryCache.size >= MAX_REPOSITORY_CACHE) repositoryCache.clear();
  repositoryCache.set(cwd, { root, at: Date.now() });
  return root;
}
function forgetRepository(cwd) {
  repositoryCache.delete(cwd);
}
var DEFAULT_GITIGNORE = `# macOS
.DS_Store

# Windows
Thumbs.db

# IDE
.idea/
.vscode/
*.iml

# \u65E5\u5FD7
*.log

# Node
node_modules/
dist/
build/

# Python
__pycache__/
*.py[cod]
.venv/
venv/

# Java / Kotlin / Rust \u6784\u5EFA\u8F93\u51FA
target/
*.class

# \u73AF\u5883\u53D8\u91CF
.env
.env.local
`;
async function writeDefaultGitignore(dir) {
  const target = resolve(dir, ".gitignore");
  try {
    await writeFile2(target, DEFAULT_GITIGNORE, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") {
      console.error("[dsh-ide] Failed to create default .gitignore:", target, error);
    }
    return false;
  }
}
async function initRepository(dir) {
  const result = await execGit(dir, ["init"]);
  repositoryCache.delete(dir);
  const ignoredCreated = await writeDefaultGitignore(dir);
  return {
    command: displayCommand(["init"]),
    stdout: result.stdout,
    stderr: result.stderr,
    ignoredCreated
  };
}
function assertRef(value, label) {
  if (value === "" || value.startsWith("-") || /[\0\n\r]/.test(value)) {
    throw new GitError("GIT_FAILED", `${label} is not a valid value`);
  }
  return value;
}
function resolveInside(repo, relative) {
  const target = resolve(repo, assertRef(relative, "Path"));
  if (target !== repo && !target.startsWith(repo + sep)) {
    throw new GitError("GIT_PATH_OUTSIDE_REPOSITORY", "Path is outside the repository");
  }
  return target;
}
async function readWorktreeText(repo, relative, maxBytes) {
  const target = resolveInside(repo, relative);
  try {
    const info = await stat5(target);
    if (!info.isFile()) return { text: "", bytes: 0 };
    if (info.size > maxBytes) return { text: "", bytes: info.size };
    const buffer = await readFile4(target);
    return { text: buffer.toString("utf8"), bytes: buffer.byteLength };
  } catch (error) {
    const code = error.code;
    if (code !== "ENOENT") console.error("[dsh-ide] Failed to read worktree file:", target, error);
    return { text: "", bytes: 0 };
  }
}
async function writeWorktreeText(repo, relative, text) {
  const target = resolveInside(repo, relative);
  const temporary = `${target}.dsh-ide-${String(process.pid)}.tmp`;
  try {
    await writeFile2(temporary, text, "utf8");
    await rename2(temporary, target);
  } catch (error) {
    await rm2(temporary, { force: true }).catch((cleanupError) => {
      console.error("[dsh-ide] Failed to remove temporary conflict file:", temporary, cleanupError);
    });
    console.error("[dsh-ide] Failed to write merge result:", target, error);
    throw new GitError("GIT_FAILED", `Unable to write ${relative}: ${String(error)}`);
  }
}
async function readBlobText(repo, ref, relative) {
  const object = ref === "" ? `:${assertRef(relative, "Path")}` : `${assertRef(ref, "Ref")}:${assertRef(relative, "Path")}`;
  const result = await execGit(repo, ["show", object], { allowFailure: true });
  return result.code === 0 ? result.stdout : "";
}
async function blobExists(repo, ref, relative) {
  const object = `${assertRef(ref, "Ref")}:${assertRef(relative, "Path")}`;
  const result = await execGit(repo, ["cat-file", "-e", object], { allowFailure: true });
  return result.code === 0;
}
var NETWORK_TIMEOUT = NETWORK_TIMEOUT_MS;

// src/host/routes/git-parse.ts
function readPaths(body) {
  const raw = body.paths;
  if (!Array.isArray(raw) || raw.length === 0) throw new GitError("GIT_FAILED", "No file paths were provided");
  return raw.map((item) => assertRef(String(item), "Path"));
}
function isConflict(indexStatus, worktreeStatus) {
  return indexStatus === "U" || worktreeStatus === "U" || indexStatus === "A" && worktreeStatus === "A" || indexStatus === "D" && worktreeStatus === "D";
}
function parseStatus(text) {
  const parts = text.split("\0");
  const result = { staged: [], unstaged: [], untracked: [], conflicted: [] };
  for (let index = 0; index < parts.length; index += 1) {
    const record = parts[index];
    if (record === void 0 || record.length < 4) continue;
    const indexStatus = record[0] ?? " ";
    const worktreeStatus = record[1] ?? " ";
    const path8 = record.slice(3);
    const item = { path: path8, indexStatus, worktreeStatus };
    if (indexStatus === "R" || indexStatus === "C") {
      const original = parts[index + 1];
      if (original !== void 0) item.originalPath = original;
      index += 1;
    }
    if (isConflict(indexStatus, worktreeStatus)) {
      result.conflicted.push(item);
      continue;
    }
    if (indexStatus === "?") {
      result.untracked.push(item);
      continue;
    }
    if (indexStatus !== " ") result.staged.push(item);
    if (worktreeStatus !== " ") result.unstaged.push(item);
  }
  return result;
}
function parseCommit(record) {
  const fields = record.split("");
  return {
    hash: fields[0] ?? "",
    shortHash: fields[1] ?? "",
    author: fields[2] ?? "",
    email: fields[3] ?? "",
    date: fields[4] ?? "",
    parents: (fields[5] ?? "").split(" ").filter((item) => item !== ""),
    refs: normalizeRefs(fields[6] ?? ""),
    subject: fields[7] ?? ""
  };
}
function normalizeRefs(raw) {
  const names = [];
  for (const item of raw.split(",")) {
    const name = item.trim();
    if (name === "") continue;
    if (name.startsWith("HEAD -> ")) {
      names.push("HEAD", name.slice("HEAD -> ".length));
      continue;
    }
    if (name === "HEAD") {
      names.push("HEAD");
      continue;
    }
    if (name.startsWith("tag: ")) {
      names.push(name.slice("tag: ".length));
      continue;
    }
    const arrow = name.indexOf(" -> ");
    if (arrow >= 0) {
      names.push(name.slice(arrow + " -> ".length));
      continue;
    }
    if (name.endsWith("/HEAD")) continue;
    names.push(name);
  }
  return [...new Set(names)];
}
function parseLog(text) {
  return text.split("").map((record) => record.trim()).filter((record) => record !== "").map((record) => parseCommit(record));
}
function parseNumstat(text) {
  return text.split("\n").map((line) => line.trim()).filter((line) => line !== "").map((line) => {
    const [added, removed, ...rest] = line.split("	");
    return {
      path: rest.join("	"),
      added: added === "-" ? 0 : Number(added) || 0,
      removed: removed === "-" ? 0 : Number(removed) || 0
    };
  });
}
function mergeFileStatus(files, statuses) {
  const byPath = new Map(statuses.map((entry) => [entry.path, entry.status]));
  return files.map((file) => ({ ...file, status: byPath.get(file.path) ?? "M" }));
}
function parseNameStatus(text) {
  return text.split("\n").map((line) => line.trim()).filter((line) => line !== "").map((line) => {
    const [status, ...rest] = line.split("	");
    const path8 = rest.length === 0 ? "" : rest[rest.length - 1] ?? "";
    return { path: path8, status: (status ?? "").slice(0, 1) };
  }).filter((entry) => entry.path !== "");
}
var TRACK_PATTERNS = {
  ahead: /ahead (\d+)/u,
  behind: /behind (\d+)/u
};
function readTrack(track, label) {
  if (track === void 0) return 0;
  const match = TRACK_PATTERNS[label].exec(track);
  return match === null ? 0 : Number(match[1]);
}
function parseLocalBranches(text) {
  return text.split("\n").map((line) => line.trim()).filter((line) => line !== "").map((line) => {
    const [name, head, upstream, track, hash, ...subject] = line.split("");
    return {
      name: name ?? "",
      isHead: head === "*",
      upstream: upstream ?? "",
      ahead: readTrack(track, "ahead"),
      behind: readTrack(track, "behind"),
      hash: hash ?? "",
      subject: subject.join(" ")
    };
  });
}
function parseRefList(text, remote = false) {
  return text.split("\n").map((line) => line.trim()).filter((line) => line !== "").map((line) => {
    const [name, hash, ...subject] = line.split("");
    return { name: name ?? "", hash: hash ?? "", subject: subject.join(" ") };
  }).filter((entry) => !remote || entry.name.includes("/") && !entry.name.endsWith("/HEAD"));
}
function parseStashes(text) {
  return text.split("\n").map((line) => line.trim()).filter((line) => line !== "").map((line) => {
    const [selector, subject, date, hash] = line.split("");
    return { selector: selector ?? "", subject: subject ?? "", date: date ?? "", hash: hash ?? "" };
  }).filter((entry) => entry.selector !== "");
}
function parseContainsBranches(text) {
  return text.split("\n").map((line) => line.trim().replace(/^\* /, "")).filter((line) => line !== "" && line !== "(HEAD detached at HEAD)");
}

// src/host/routes/git-read.ts
var MAX_DIFF_BYTES = 2 * 1024 * 1024;
var CONFLICT_LABEL_LENGTH = 8;
var READ_METHODS = {
  /** 工作区状态与当前分支。 */
  async status(repo) {
    const [branchResult, headResult, ignoredResult] = await Promise.all([
      execGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--short=8", "HEAD"], { allowFailure: true }),
      // --directory 让被忽略的目录只出现一行（如 node_modules/），不会把里面上万个文件铺开
      execGit(repo, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], {
        allowFailure: true
      })
    ]);
    const statusResult = await execGit(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).catch(
      async (error) => {
        if (error instanceof GitError && error.code === "GIT_OUTPUT_TOO_LARGE") {
          console.error("[dsh-ide] \u672A\u8DDF\u8E2A\u6587\u4EF6\u8FC7\u591A\uFF0C\u9000\u56DE\u6309\u76EE\u5F55\u6298\u53E0:", repo);
          return execGit(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"]);
        }
        throw error;
      }
    );
    const branch = branchResult.code === 0 ? branchResult.stdout.trim() : "";
    return {
      branch,
      headShort: headResult.code === 0 ? headResult.stdout.trim() : "",
      ...parseStatus(statusResult.stdout),
      // 目录条目以 / 结尾，客户端据此做前缀匹配
      ignored: ignoredResult.stdout.split("\0").filter((path8) => path8 !== "")
    };
  },
  /**
   * 工作区文件差异：HEAD（或索引区）与工作区两侧的完整文本。
   *
   * 新增文件在 HEAD 里没有旧版本，右侧一律取工作区内容：索引区可能还是空的 blob
   * （先 add 空文件再写内容），拿它当右侧会让整个文件看起来「没有改动」。
   */
  async diffWorktree(repo, body) {
    const path8 = assertRef(bodyString(body, "path"), "Path");
    const staged = bodyString(body, "staged") === "true";
    const isNew = !await blobExists(repo, "HEAD", path8);
    const left = isNew ? "" : await readBlobText(repo, "HEAD", path8);
    const right = isNew ? (await readWorktreeText(repo, path8, MAX_DIFF_BYTES)).text : staged ? await readBlobText(repo, "", path8) : (await readWorktreeText(repo, path8, MAX_DIFF_BYTES)).text;
    const bytes = Math.max(new TextEncoder().encode(left).byteLength, new TextEncoder().encode(right).byteLength);
    if (left.includes("\0") || right.includes("\0")) return { binary: true, bytes, left: "", right: "", isNew };
    return { binary: false, bytes, left, right, isNew };
  },
  /** 某个 ref 里某个文件的完整文本；编辑器差异标签使用。 */
  async showFileText(repo, body) {
    const hash = bodyString(body, "hash");
    const path8 = bodyString(body, "path");
    if (path8 === "") return { text: "" };
    return { text: await readBlobText(repo, hash === "" ? "HEAD" : hash, path8) };
  },
  /** 索引区里某个文件的完整文本（用于暂存差异的右侧）。 */
  async indexFileText(repo, body) {
    const path8 = assertRef(bodyString(body, "path"), "Path");
    return { text: await readBlobText(repo, "", path8) };
  },
  /**
   * 某个引用与工作区之间的差异文件列表。
   *
   * 只比较已跟踪路径：未跟踪文件不属于任何引用，git diff 本身也不会列出它们，
   * 与 IDEA 的 Show Diff with Working Tree 一致。
   */
  async compareWorktree(repo, body) {
    const ref = assertRef(bodyString(body, "ref"), "Ref");
    const result = await execGit(repo, ["diff", "--name-status", ref], { allowFailure: true });
    return { files: parseNameStatus(result.stdout) };
  },
  /** 两个引用之间的差异文件列表；用于分支右键的 Compare with。 */
  async compareRefs(repo, body) {
    const left = assertRef(bodyString(body, "left"), "Left ref");
    const right = assertRef(bodyString(body, "right"), "Right ref");
    const result = await execGit(repo, ["diff", "--name-status", left, right], { allowFailure: true });
    return { files: parseNameStatus(result.stdout) };
  },
  /**
   * 单个文件在某个引用与工作区之间的两侧文本。
   *
   * 与 diffWorktree 的区别只在于基准可以换成任意引用，分支比较弹窗需要它。
   */
  async diffRef(repo, body) {
    const ref = assertRef(bodyString(body, "ref"), "Ref");
    const path8 = assertRef(bodyString(body, "path"), "Path");
    const isNew = !await blobExists(repo, ref, path8);
    const left = isNew ? "" : await readBlobText(repo, ref, path8);
    const right = (await readWorktreeText(repo, path8, MAX_DIFF_BYTES)).text;
    const bytes = Math.max(new TextEncoder().encode(left).byteLength, new TextEncoder().encode(right).byteLength);
    if (left.includes("\0") || right.includes("\0")) return { binary: true, bytes, left: "", right: "", isNew };
    return { binary: false, bytes, left, right, isNew };
  },
  /**
   * 冲突上下文：双方名称、进行中的合并类操作与冲突文件清单。
   *
   * 「我方」永远是当前分支，「对方」是正在被合进来的提交：合并取 MERGE_HEAD，
   * 变基取 REBASE_HEAD，cherry-pick 取 CHERRY_PICK_HEAD。界面上要显示这两个名字
   * （`Yours (test)` / `Theirs (62da890e)`），用户才知道自己在和谁合并。
   */
  async conflictInfo(repo) {
    const [statusResult, branchResult, mergeResult, rebaseResult, pickResult, stagesResult] = await Promise.all([
      execGit(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=no"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--verify", "MERGE_HEAD"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--verify", "REBASE_HEAD"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--verify", "CHERRY_PICK_HEAD"], { allowFailure: true }),
      // 一次拿到所有未合并条目：逐个文件跑 cat-file 会让大冲突集打开窗口时卡住
      execGit(repo, ["ls-files", "-u", "-z"], { allowFailure: true })
    ]);
    const branch = branchResult.code === 0 ? branchResult.stdout.trim() : "";
    const mergeHead = mergeResult.code === 0 ? mergeResult.stdout.trim() : "";
    const rebaseHead = rebaseResult.code === 0 ? rebaseResult.stdout.trim() : "";
    const pickHead = pickResult.code === 0 ? pickResult.stdout.trim() : "";
    const operation = mergeHead !== "" ? "merge" : rebaseHead !== "" ? "rebase" : pickHead !== "" ? "cherry-pick" : "none";
    const theirsHash = mergeHead !== "" ? mergeHead : rebaseHead !== "" ? rebaseHead : pickHead;
    const stages = parseConflictStages(stagesResult.stdout);
    const files = parseStatus(statusResult.stdout).conflicted.map((item) => ({
      path: item.path,
      oursStatus: conflictSideStatus(stages.get(item.path), "2"),
      theirsStatus: conflictSideStatus(stages.get(item.path), "3")
    }));
    return {
      // 游离 HEAD 上没有分支名，按 git 自己的叫法显示 HEAD
      ours: branch === "" || branch === "HEAD" ? "HEAD" : branch,
      theirs: theirsHash === "" ? "" : theirsHash.slice(0, CONFLICT_LABEL_LENGTH),
      theirsHash,
      operation,
      files
    };
  },
  /**
   * 一个冲突文件的三方内容与工作区现状。
   *
   * 三栏合并窗口需要完整的「基线 / 我方 / 对方」文本：没有基线就无法判断哪几行是
   * 真正的冲突，只能把两侧整块并列。工作区文本保留 Git 写入的冲突标记，是未解决
   * 冲突块的原始结构来源。
   */
  async conflictVersions(repo, body) {
    const path8 = assertRef(bodyString(body, "path"), "Path");
    const [base, ours, theirs, worktree] = await Promise.all([
      readStageText(repo, "1", path8),
      readStageText(repo, "2", path8),
      readStageText(repo, "3", path8),
      readWorktreeText(repo, path8, MAX_DIFF_BYTES)
    ]);
    const binary = [base, ours, theirs, worktree.text].some((text) => text.includes("\0"));
    return { base, ours, theirs, worktree: worktree.text, binary, bytes: worktree.bytes };
  },
  /** 提交历史。 */
  async log(repo, body) {
    const limit = Math.min(Math.max(bodyNumber(body, "limit") ?? 200, 1), 500);
    const skip = Math.max(bodyNumber(body, "skip") ?? 0, 0);
    const branch = bodyString(body, "branch");
    const path8 = bodyString(body, "path");
    const author = bodyString(body, "author");
    const all = bodyString(body, "all") === "true";
    const args = [
      "log",
      `--max-count=${String(limit)}`,
      `--skip=${String(skip)}`,
      // 按作者日期倒序，与列表展示的时间列（%aI）同源；用提交日期排序时，
      // rebase 过的提交会在时间列上跳来跳去（19 minutes ago 之后又出现 18 minutes ago）
      "--author-date-order",
      "--date=iso-strict",
      "--abbrev=8",
      "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1f%s%x1e"
    ];
    if (all) args.push("--all");
    else if (branch !== "") args.push(assertRef(branch, "Branch"));
    if (author !== "") args.push(`--author=^${escapeAuthor(author)} <`);
    if (path8 !== "") args.push("--", assertRef(path8, "Path"));
    else args.push("--");
    const result = await execGit(repo, args, { allowFailure: true, timeoutMs: NETWORK_TIMEOUT });
    return { commits: parseLog(result.stdout) };
  },
  /** 单个提交的详情、逐文件统计与包含它的分支。 */
  async commitDetail(repo, body) {
    const hash = assertRef(bodyString(body, "hash"), "Commit");
    const meta = await execGit(repo, [
      "show",
      "--no-patch",
      "--date=iso-strict",
      "--abbrev=8",
      "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1f%s",
      hash
    ]);
    const [bodyResult, filesResult, statusesResult, branchesResult, headResult] = await Promise.all([
      execGit(repo, ["show", "--no-patch", "--format=%B", hash], { allowFailure: true }),
      // numstat 只给增删行数，状态要另跑一次 name-status，两者按路径合并
      execGit(repo, ["show", "--numstat", "--format=", hash], { allowFailure: true }),
      execGit(repo, ["show", "--name-status", "--format=", hash], { allowFailure: true }),
      execGit(repo, ["branch", "--all", "--contains", hash, "--format=%(refname:short)"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true })
    ]);
    const current = headResult.code === 0 ? headResult.stdout.trim() : "";
    const branches = parseContainsBranches(branchesResult.stdout);
    const named = branches.includes(current) && current !== "" ? ["HEAD", ...branches] : branches;
    return {
      commit: { ...parseCommit(meta.stdout.trim()), body: bodyResult.stdout.trim() },
      files: mergeFileStatus(parseNumstat(filesResult.stdout), parseNameStatus(statusesResult.stdout)),
      branches: named
    };
  },
  /**
   * 单个提交相对父提交的变更文件。
   *
   * 推送窗点中某个提交时用它换右侧文件树。不能用 `git show` 直接取：合并提交默认
   * 不输出差异，而推送区间里恰恰常见合并提交。改为与第一个父提交比较，合并提交也
   * 能列出它带进来的全部文件；根提交没有父提交，退回 `show` 把整棵树列成新增。
   */
  async commitFiles(repo, body) {
    const hash = assertRef(bodyString(body, "hash"), "Commit");
    const diff = await execGit(repo, ["diff", "--name-status", `${hash}^`, hash], { allowFailure: true });
    if (diff.code === 0) return { files: parseNameStatus(diff.stdout) };
    const root = await execGit(repo, ["show", "--name-status", "--format=", hash], { allowFailure: true });
    return { files: parseNameStatus(root.stdout) };
  },
  /**
   * 待推送内容：当前分支、推送目标、未推送提交与待推送文件。
   *
   * 推送目标依次回退：用户在弹窗里选定的远端 → 已跟踪上游 → 远端同名分支 → 远端
   * 还没有该分支。最后一种是首次推送，此时以整个分支历史为区间——否则界面上明明是
   * 第一次推送，却会因为「没有可比对的基准」显示成没有任何待推送内容。
   */
  async pushPreview(repo, body) {
    const [branchResult, upstreamResult, remoteListResult] = await Promise.all([
      execGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--abbrev-ref", "@{u}"], { allowFailure: true }),
      execGit(repo, ["remote"], { allowFailure: true })
    ]);
    const branch = branchResult.code === 0 ? branchResult.stdout.trim() : "";
    const upstream = upstreamResult.code === 0 ? upstreamResult.stdout.trim() : "";
    const remotes = remoteListResult.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
    const preferred = bodyString(body, "remote");
    if (branch === "") {
      return {
        branch,
        upstream,
        remote: "",
        target: "",
        isNewBranch: false,
        remotes,
        commits: [],
        files: []
      };
    }
    const target = await resolvePushTarget(
      repo,
      branch,
      upstream,
      remotes,
      remotes.includes(preferred) ? preferred : ""
    );
    const [logResult, filesResult] = await Promise.all([
      execGit(
        repo,
        [
          "log",
          target.exists ? `${target.ref}..HEAD` : "HEAD",
          // 领先上游几千个提交时，一次拉全量会把解析与 JSON 序列化成本放大到秒级
          "--max-count=200",
          "--author-date-order",
          "--date=iso-strict",
          "--abbrev=8",
          "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1f%s%x1e"
        ],
        { allowFailure: true }
      ),
      target.exists ? execGit(repo, ["diff", "--name-status", target.ref, "HEAD"], { allowFailure: true }) : execGit(repo, ["ls-tree", "-r", "--name-only", "HEAD"], { allowFailure: true })
    ]);
    return {
      branch,
      upstream,
      remote: target.remote,
      target: target.branch,
      isNewBranch: !target.exists,
      remotes,
      commits: parseLog(logResult.stdout),
      files: target.exists ? parseNameStatus(filesResult.stdout) : parseTreePaths(filesResult.stdout)
    };
  },
  /** 本地分支、远程分支与标签。 */
  async branches(repo) {
    const [local, remote, tags, head] = await Promise.all([
      execGit(repo, [
        "for-each-ref",
        "--format=%(refname:short)%1f%(HEAD)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(objectname:short=8)%1f%(subject)",
        "refs/heads"
      ]),
      execGit(repo, [
        "for-each-ref",
        "--format=%(refname:short)%1f%(objectname:short=8)%1f%(subject)",
        "refs/remotes"
      ]),
      execGit(repo, ["for-each-ref", "--format=%(refname:short)%1f%(objectname:short=8)%1f%(subject)", "refs/tags"]),
      execGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true })
    ]);
    return {
      head: head.code === 0 ? head.stdout.trim() : "",
      local: parseLocalBranches(local.stdout),
      remote: parseRefList(remote.stdout, true),
      tags: parseRefList(tags.stdout)
    };
  },
  /**
   * 仓库全部提交的作者，按提交数从多到少排列。
   *
   * User 过滤菜单的候选来源：提交列表是分页加载的，只从已加载的提交里取作者会
   * 漏掉近期没提交的人，搜不到就得一直往下滚动。
   */
  async authors(repo) {
    const result = await execGit(repo, ["log", "--all", "--format=%an", "--max-count=20000"], {
      allowFailure: true
    });
    if (result.code !== 0) return { authors: [] };
    const seen = /* @__PURE__ */ new Set();
    const authors = [];
    for (const line of result.stdout.split("\n")) {
      const name = line.trim();
      if (name === "" || seen.has(name)) continue;
      seen.add(name);
      authors.push(name);
    }
    return { authors };
  },
  /** 当前仓库的提交身份；User 过滤菜单的固定 me 项用它。 */
  async user(repo) {
    const result = await execGit(repo, ["config", "user.name"], { allowFailure: true });
    return { name: result.code === 0 ? result.stdout.trim() : "" };
  },
  /** 搁置列表；没有搁置时返回空数组。 */
  async stashes(repo) {
    const result = await execGit(
      repo,
      ["stash", "list", "--format=%gd%1f%gs%1f%cr%1f%H"],
      // 没有 stash 或不是仓库都不是故障，交给调用方按空列表处理
      { allowFailure: true }
    );
    return { stashes: parseStashes(result.stdout) };
  }
};
async function refExists(repo, ref) {
  const result = await execGit(repo, ["rev-parse", "--verify", "--quiet", ref], { allowFailure: true });
  return result.code === 0;
}
async function resolvePushTarget(repo, branch, upstream, remotes, preferred) {
  const slash = upstream.indexOf("/");
  const [remoteResult, mergeResult] = await Promise.all([
    execGit(repo, ["config", "--get", `branch.${branch}.remote`], { allowFailure: true }),
    execGit(repo, ["config", "--get", `branch.${branch}.merge`], { allowFailure: true })
  ]);
  const configuredRemote = remoteResult.code === 0 ? remoteResult.stdout.trim() : "";
  const configuredMerge = mergeResult.code === 0 ? mergeResult.stdout.trim() : "";
  const name = slash > 0 ? upstream.slice(slash + 1) : configuredMerge.startsWith("refs/heads/") ? configuredMerge.slice("refs/heads/".length) : branch;
  if (preferred !== "") {
    const ref2 = `refs/remotes/${preferred}/${name}`;
    return { remote: preferred, branch: name, ref: ref2, exists: await refExists(repo, ref2) };
  }
  if (slash > 0) {
    return {
      remote: upstream.slice(0, slash),
      branch: name,
      ref: `refs/remotes/${upstream}`,
      exists: true
    };
  }
  const remote = configuredRemote !== "" && configuredRemote !== "." ? configuredRemote : remotes[0] ?? "origin";
  const ref = `refs/remotes/${remote}/${name}`;
  return { remote, branch: name, ref, exists: await refExists(repo, ref) };
}
function parseTreePaths(text) {
  return text.split("\n").map((line) => line.trim()).filter((line) => line !== "").map((path8) => ({ path: path8, status: "A" }));
}
function parseConflictStages(text) {
  const stages = /* @__PURE__ */ new Map();
  for (const record of text.split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("	");
    if (tab < 0) continue;
    const stage = record.slice(0, tab).split(" ")[2];
    if (stage === void 0) continue;
    const path8 = record.slice(tab + 1);
    const existing = stages.get(path8) ?? /* @__PURE__ */ new Set();
    existing.add(stage);
    stages.set(path8, existing);
  }
  return stages;
}
function conflictSideStatus(present, stage) {
  if (present === void 0 || !present.has(stage)) return "deleted";
  return present.has("1") ? "modified" : "added";
}
async function readStageText(repo, stage, path8) {
  const result = await execGit(repo, ["show", `:${stage}:${path8}`], { allowFailure: true });
  return result.code === 0 ? result.stdout : "";
}
function escapeAuthor(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/host/routes/git-write.ts
import { isAbsolute, sep as sep2 } from "node:path";
async function run(repo, argv, timeoutMs) {
  const result = await execGit(repo, argv, timeoutMs === void 0 ? {} : { timeoutMs });
  return { command: displayCommand(argv), stdout: result.stdout, stderr: result.stderr };
}
var WRITE_METHODS = {
  /** 暂存文件。 */
  async stage(repo, body) {
    return run(repo, ["add", "--", ...readPaths(body)]);
  },
  /** 取消暂存。 */
  async unstage(repo, body) {
    return run(repo, ["reset", "HEAD", "--", ...readPaths(body)]);
  },
  /** 丢弃工作区改动；未跟踪文件走 clean。 */
  async discard(repo, body) {
    const paths = readPaths(body);
    const untracked = bodyString(body, "untracked") === "true";
    return untracked ? run(repo, ["clean", "-fd", "--", ...paths]) : run(repo, ["restore", "--", ...paths]);
  },
  /**
   * 把指定路径恢复为某个提交的内容。
   *
   * 提交详情栏的 Revert Selected Changes 用它把选中文件退回父提交版本：只动列出的
   * 路径，索引与工作区一起更新，同一提交里的其它文件不受影响。
   */
  async restoreFrom(repo, body) {
    const ref = assertRef(bodyString(body, "ref"), "Commit");
    return run(repo, ["checkout", ref, "--", ...readPaths(body)]);
  },
  /** 检出分支、标签或提交。 */
  async checkout(repo, body) {
    return run(repo, ["checkout", assertRef(bodyString(body, "ref"), "Ref")]);
  },
  /** 新建并切出分支。 */
  async createBranch(repo, body) {
    const name = assertRef(bodyString(body, "name"), "Branch name");
    const start = bodyString(body, "start");
    const argv = ["checkout", "-b", name];
    if (start !== "") argv.push(assertRef(start, "Start point"));
    return run(repo, argv);
  },
  /** 删除本地分支。 */
  async deleteBranch(repo, body) {
    const name = assertRef(bodyString(body, "name"), "Branch name");
    const force = bodyString(body, "force") === "true";
    return run(repo, ["branch", force ? "-D" : "-d", name]);
  },
  /** 删除远程分支：把删除请求推给远端。 */
  async deleteRemoteBranch(repo, body) {
    const remote = assertRef(bodyString(body, "remote"), "Remote name");
    const branch = assertRef(bodyString(body, "branch"), "Branch name");
    return run(repo, ["push", remote, "--delete", branch], NETWORK_TIMEOUT);
  },
  /** 重命名分支。 */
  async renameBranch(repo, body) {
    return run(repo, [
      "branch",
      "-m",
      assertRef(bodyString(body, "from"), "Old branch name"),
      assertRef(bodyString(body, "to"), "New branch name")
    ]);
  },
  /**
   * 新建附加工作树：把某个引用检出到另一个目录。
   *
   * 远程分支要落成本地分支（`-b`），否则工作树会停在游离 HEAD 上，用户在新目录里
   * 没法直接提交；本地分支与提交则原样检出。
   */
  async worktreeAdd(repo, body) {
    const target = readWorktreePath(body);
    const ref = assertRef(bodyString(body, "ref"), "Ref");
    const branch = bodyString(body, "branch").trim();
    return run(
      repo,
      branch === "" ? ["worktree", "add", target, ref] : ["worktree", "add", "-b", assertRef(branch, "Branch name"), target, ref]
    );
  },
  /**
   * 把某个本地分支快进到它的上游；Log 里非当前分支的 Update 用它。
   *
   * 不切出该分支也能更新：先抓远端，再用 `fetch .` 把上游写进同名的本地分支引用。
   * 非快进会被 git 拒绝，因此不会改写分支历史，和 IDEA 的 Update 一致。
   */
  async updateBranch(repo, body) {
    const branch = assertRef(bodyString(body, "branch"), "Branch name");
    const upstream = assertRef(bodyString(body, "upstream"), "Upstream branch");
    const fetched = await run(repo, ["fetch", "--all", "--prune"], NETWORK_TIMEOUT);
    const updated = await run(repo, ["fetch", ".", `${upstream}:${branch}`]);
    return {
      command: `${fetched.command}
${updated.command}`,
      stdout: joinOutput(fetched.stdout, updated.stdout),
      stderr: joinOutput(fetched.stderr, updated.stderr)
    };
  },
  /** 合并到当前分支。 */
  async merge(repo, body) {
    return run(repo, ["merge", "--no-edit", assertRef(bodyString(body, "ref"), "Ref")]);
  },
  /** 把当前分支变基到指定 ref。 */
  async rebase(repo, body) {
    return run(repo, ["rebase", assertRef(bodyString(body, "ref"), "Ref")]);
  },
  /**
   * 按侧接受一个冲突文件。
   *
   * 与 IDEA 的 Accept Yours / Accept Theirs 一致：整份取某一侧的索引版本写进工作区，
   * 随即 `add` 标成已解决。某一侧把文件删掉时 git 会把工作区文件一并删除，这同样
   * 是一次完整的解决。
   */
  async acceptConflict(repo, body) {
    const path8 = assertRef(bodyString(body, "path"), "Path");
    const side = bodyString(body, "side");
    if (side !== "ours" && side !== "theirs") throw new GitError("GIT_FAILED", `Unknown conflict side: ${side}`);
    const checked = await run(repo, ["checkout", `--${side}`, "--", path8]);
    const added = await run(repo, ["add", "--", path8]);
    return {
      command: `${checked.command}
${added.command}`,
      stdout: joinOutput(checked.stdout, added.stdout),
      stderr: joinOutput(checked.stderr, added.stderr)
    };
  },
  /**
   * 写回合并结果并标记已解决。
   *
   * 文本由三栏合并窗口给出，宿主只负责原子落盘与 `git add`：冲突标记是否清干净由
   * 客户端保证，宿主不再解析文件内容。
   */
  async resolveConflict(repo, body) {
    const path8 = assertRef(bodyString(body, "path"), "Path");
    await writeWorktreeText(repo, path8, bodyString(body, "text"));
    return run(repo, ["add", "--", path8]);
  },
  /**
   * 完成一次被冲突中断的合并类操作。
   *
   * 全部冲突都 `add` 之后仓库仍停在「合并中」：必须显式提交合并（或继续变基）才算
   * 结束。变基与 cherry-pick 用 `core.editor=true` 跳过编辑器，否则宿主的子进程会
   * 一直卡在等待输入上。
   */
  async continueOperation(repo) {
    const [mergeResult, rebaseResult, pickResult] = await Promise.all([
      execGit(repo, ["rev-parse", "--verify", "MERGE_HEAD"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--verify", "REBASE_HEAD"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--verify", "CHERRY_PICK_HEAD"], { allowFailure: true })
    ]);
    if (mergeResult.code === 0) return run(repo, ["commit", "--no-edit"]);
    if (rebaseResult.code === 0) return run(repo, ["-c", "core.editor=true", "rebase", "--continue"]);
    if (pickResult.code === 0) return run(repo, ["-c", "core.editor=true", "cherry-pick", "--continue"]);
    return { command: "", stdout: "", stderr: "" };
  },
  /**
   * 中止一次被冲突中断的合并类操作。
   *
   * 与 IDEA 合并状态条上的 Abort 一致：把工作区、索引与分支指针恢复到操作开始前，
   * 已做的冲突解决全部丢弃。改动只可能来自 index/worktree，因此不给 `--force`。
   */
  async abortOperation(repo) {
    const [mergeResult, rebaseResult, pickResult] = await Promise.all([
      execGit(repo, ["rev-parse", "--verify", "MERGE_HEAD"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--verify", "REBASE_HEAD"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--verify", "CHERRY_PICK_HEAD"], { allowFailure: true })
    ]);
    if (mergeResult.code === 0) return run(repo, ["merge", "--abort"]);
    if (rebaseResult.code === 0) return run(repo, ["rebase", "--abort"]);
    if (pickResult.code === 0) return run(repo, ["cherry-pick", "--abort"]);
    return { command: "", stdout: "", stderr: "" };
  },
  /** cherry-pick 单个提交。 */
  async cherryPick(repo, body) {
    return run(repo, ["cherry-pick", assertRef(bodyString(body, "hash"), "Commit")]);
  },
  /** 反向应用一个提交。 */
  async revert(repo, body) {
    return run(repo, ["revert", "--no-edit", assertRef(bodyString(body, "hash"), "Commit")]);
  },
  /** 重置当前分支；keep 模式重置文件但保留本地改动。 */
  async reset(repo, body) {
    const mode = bodyString(body, "mode", "mixed");
    if (mode !== "soft" && mode !== "mixed" && mode !== "hard" && mode !== "keep") {
      throw new GitError("GIT_FAILED", `Unsupported reset mode: ${mode}`);
    }
    return run(repo, ["reset", `--${mode}`, assertRef(bodyString(body, "ref", "HEAD"), "Ref")]);
  },
  /**
   * 在指定提交上新建标签。
   *
   * 标签名会被拼进命令行，因此同样走 assertRef 校验。
   */
  async tag(repo, body) {
    const name = assertRef(bodyString(body, "name"), "Tag name");
    return run(repo, ["tag", name, assertRef(bodyString(body, "ref"), "Commit")]);
  },
  /**
   * 丢弃一个提交。
   *
   * 只能丢弃当前分支上的提交：HEAD 直接退回父提交、内容留在工作区；更旧的提交改用
   * rebase --onto 把它之后的提交重放到它的父提交上。后者只在本提交属于当前分支时
   * 成立，所以先用 merge-base 判定祖先关系，避免误改别的分支历史。
   */
  async dropCommit(repo, body) {
    const hash = assertRef(bodyString(body, "hash"), "Commit");
    const parents = await execGit(repo, ["rev-list", "--parents", "-n", "1", hash]);
    const parent = parents.stdout.trim().split(/\s+/)[1];
    if (parent === void 0) throw new GitError("GIT_FAILED", "Cannot drop the root commit");
    const head = (await execGit(repo, ["rev-parse", "HEAD"])).stdout.trim();
    if (hash === head) return run(repo, ["reset", "--mixed", parent]);
    const ancestor = await execGit(repo, ["merge-base", "--is-ancestor", hash, "HEAD"], { allowFailure: true });
    if (ancestor.code !== 0) throw new GitError("GIT_FAILED", "Only commits of the current branch can be dropped");
    return run(repo, ["rebase", "--onto", parent, hash]);
  },
  /** 改写提交信息；只改写 HEAD，改写更旧的提交要重写整段历史。 */
  async amendMessage(repo, body) {
    const message = bodyString(body, "message").trim();
    if (message === "") throw new GitError("GIT_FAILED", "Commit message is empty");
    return run(repo, ["commit", "--amend", "-m", message]);
  },
  /**
   * 把指定提交及其之前的历史推到当前分支的远端。
   *
   * 不带 --force：远端已有更新的提交时由 git 拒绝，不会静默改写远端历史。
   */
  async pushUpToHere(repo, body) {
    const ref = assertRef(bodyString(body, "ref"), "Commit");
    const branch = (await execGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true })).stdout.trim();
    if (branch === "" || branch === "HEAD") throw new GitError("GIT_FAILED", "A local branch must be checked out");
    const remote = await trackingRemote(repo) || "origin";
    return run(repo, ["push", remote, `${ref}:refs/heads/${branch}`], NETWORK_TIMEOUT);
  },
  /** 生成单个提交的补丁文本；客户端把它写成 .patch 文件。 */
  async formatPatch(repo, body) {
    const ref = assertRef(bodyString(body, "ref"), "Commit");
    const result = await execGit(repo, ["format-patch", "-1", ref, "--stdout"], { timeoutMs: NETWORK_TIMEOUT });
    return { patch: result.stdout };
  },
  /** 提交勾选的文件。 */
  async commit(repo, body) {
    const message = bodyString(body, "message").trim();
    if (message === "") throw new GitError("GIT_FAILED", "Commit message is empty");
    const paths = readPaths(body);
    const staged = await run(repo, ["add", "-A", "--", ...paths]);
    const committed = await run(repo, ["commit", "-m", message, "--", ...paths]);
    return {
      command: `${staged.command}
${committed.command}`,
      stdout: joinOutput(staged.stdout, committed.stdout),
      stderr: joinOutput(staged.stderr, committed.stderr)
    };
  },
  /** 获取远端引用。 */
  async fetch(repo) {
    return run(repo, ["fetch", "--all", "--prune"], NETWORK_TIMEOUT);
  },
  /**
   * 抓取指定分支的远端更新：只更新远程跟踪引用，不动工作区。
   *
   * 没有可抓取的远端（本地分支没有上游）时退回抓取全部远端，避免按钮点了却毫无动作。
   */
  async fetchBranch(repo, body) {
    const remote = bodyString(body, "remote").trim();
    const branch = bodyString(body, "branch").trim();
    if (remote === "" || branch === "") return run(repo, ["fetch", "--all", "--prune"], NETWORK_TIMEOUT);
    return run(repo, ["fetch", assertRef(remote, "Remote name"), assertRef(branch, "Branch name")], NETWORK_TIMEOUT);
  },
  /** 拉取并合并。 */
  async pull(repo) {
    return run(repo, ["pull", "--no-edit"], NETWORK_TIMEOUT);
  },
  /** 推送当前分支；可按 Push 对话框的选择指定远端、附带标签与强制推送。 */
  async push(repo, body) {
    const force = bodyString(body, "force") === "true";
    const tags = bodyString(body, "tags");
    const setUpstream = bodyString(body, "setUpstream") === "true";
    const requested = bodyString(body, "remote").trim();
    const remote = requested === "" ? "origin" : assertRef(requested, "Remote");
    const argv = ["push"];
    if (force) argv.push("--force-with-lease");
    if (tags === "all") argv.push("--tags");
    else if (tags === "current") argv.push("--follow-tags");
    if (setUpstream || await trackingRemote(repo) !== remote) argv.push("-u");
    argv.push(remote, "HEAD");
    return run(repo, argv, NETWORK_TIMEOUT);
  },
  /** 定义远端：按名字新增或改写地址，可选保存后立即拉取。 */
  async defineRemote(repo, body) {
    const name = assertRef(bodyString(body, "name"), "Remote name");
    const url = bodyString(body, "url").trim();
    const fetch = bodyString(body, "fetch") === "true";
    if (url === "") throw new GitError("GIT_FAILED", "A remote URL is required");
    const existing = await execGit(repo, ["remote"], { allowFailure: true });
    const names = existing.stdout.split("\n").map((line) => line.trim());
    const defined = await run(
      repo,
      names.includes(name) ? ["remote", "set-url", "--", name, url] : ["remote", "add", "--", name, url]
    );
    if (!fetch) return defined;
    const fetched = await run(repo, ["fetch", name], NETWORK_TIMEOUT);
    return {
      command: `${defined.command}
${fetched.command}`,
      stdout: joinOutput(defined.stdout, fetched.stdout),
      stderr: joinOutput(defined.stderr, fetched.stderr)
    };
  },
  /** 搁置当前改动。 */
  async stash(repo, body) {
    const message = bodyString(body, "message").trim();
    const untracked = bodyString(body, "untracked") === "true";
    const argv = ["stash", "push"];
    if (untracked) argv.push("--include-untracked");
    if (message !== "") argv.push("-m", message);
    return run(repo, argv);
  },
  /** 应用一条搁置，保留记录。 */
  async stashApply(repo, body) {
    return run(repo, ["stash", "apply", readStashSelector(body)]);
  },
  /** 弹出栈顶搁置并在成功后删除记录。 */
  async stashPop(repo, body) {
    return run(repo, ["stash", "pop", readStashSelector(body)]);
  },
  /** 删除一条搁置记录，不动工作区。 */
  async stashDrop(repo, body) {
    return run(repo, ["stash", "drop", readStashSelector(body)]);
  }
};
function joinOutput(first, second) {
  if (first.trim() === "") return second;
  if (second.trim() === "") return first;
  return `${first.trimEnd()}
${second}`;
}
async function trackingRemote(repo) {
  const result = await execGit(repo, ["rev-parse", "--abbrev-ref", "@{u}"], { allowFailure: true });
  if (result.code !== 0) return "";
  const upstream = result.stdout.trim();
  const slash = upstream.indexOf("/");
  return slash > 0 ? upstream.slice(0, slash) : "";
}
function readWorktreePath(body) {
  const target = bodyString(body, "path").trim();
  if (!isAbsolute(target) || target.split(sep2).includes("..")) {
    throw new GitError("GIT_FAILED", 'A worktree path must be an absolute path without ".." segments');
  }
  return target;
}
function readStashSelector(body) {
  const selector = bodyString(body, "selector");
  if (!/^stash@\{\d+\}$/.test(selector)) {
    throw new GitError("GIT_FAILED", `Invalid stash selector: ${selector}`);
  }
  return selector;
}
var NETWORK_WRITE_METHODS = /* @__PURE__ */ new Set([
  "updateBranch",
  "pushUpToHere",
  "fetch",
  "fetchBranch",
  "pull",
  "push",
  "defineRemote"
]);

// src/host/routes/git.ts
async function handleGitExec(request, response) {
  let cwd = "";
  try {
    const body = await readJsonBody(request);
    const method = bodyString(body, "method");
    cwd = bodyString(body, "cwd");
    if (cwd === "") {
      sendError(response, "CWD_REQUIRED", "A working directory is required");
      return;
    }
    if (method === "init") {
      sendOk(response, await serialized(cwd, () => initRepository(cwd)));
      return;
    }
    const read = READ_METHODS[method];
    const write = WRITE_METHODS[method];
    if (read === void 0 && write === void 0) {
      sendError(response, "METHOD_UNKNOWN", `Unknown git method: ${method}`);
      return;
    }
    const repo = await resolveRepository(cwd);
    if (repo === void 0) {
      sendError(response, "GIT_NOT_REPOSITORY", "The working directory is not a Git repository", 409);
      return;
    }
    const lane = write !== void 0 && NETWORK_WRITE_METHODS.has(method) ? "network" : "local";
    const value = write !== void 0 ? await serialized(repo, () => write(repo, body), lane) : await read(repo, body);
    sendOk(response, value);
  } catch (error) {
    if (error instanceof GitError) {
      const message = error.stderr.trim() === "" ? error.message : error.stderr.trim();
      if (/not a git repository/i.test(error.stderr)) {
        forgetRepository(cwd);
        sendError(response, "GIT_NOT_REPOSITORY", "The working directory is not a Git repository", 409);
        return;
      }
      const details = error.command === void 0 ? void 0 : { command: error.command };
      const status = error.code === "GIT_TIMEOUT" ? 504 : error.code === "GIT_OUTPUT_TOO_LARGE" ? 413 : 400;
      sendError(response, error.code, message, status, details);
      return;
    }
    console.error("[dsh-ide] Git request failed:", error);
    sendError(response, "GIT_FAILED", String(error), 500);
  }
}

// src/host/routes/ping.ts
function handlePing(request, response) {
  if (!isTrustedRequest(request)) {
    sendJson(response, 403, { ok: false, error: { code: "FORBIDDEN", message: "Untrusted request origin" } });
    return;
  }
  sendJson(response, 200, { ok: true, value: "pong" });
}

// src/host/services/run-service.ts
import { spawn as spawn3 } from "node:child_process";
import { homedir } from "node:os";
var MAX_BUFFER_BYTES = 512 * 1024;
var KILL_GRACE_MS = 3e3;
var MAX_FINISHED_INSTANCES = 20;
var processes = /* @__PURE__ */ new Map();
var buffers = /* @__PURE__ */ new Map();
var children = /* @__PURE__ */ new Map();
var sequence = 0;
function shellPath(configured) {
  if (configured !== "") return configured;
  const fromEnv = process.env.SHELL;
  if (fromEnv !== void 0 && fromEnv !== "") return fromEnv;
  return process.platform === "win32" ? "cmd.exe" : "/bin/sh";
}
function killTree(id, signal) {
  const child = children.get(id);
  if (child === void 0) return;
  if (process.platform !== "win32" && child.pid !== void 0) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      console.error("[dsh-ide] \u7EC8\u6B62\u8FDB\u7A0B\u7EC4\u5931\u8D25\uFF0C\u6539\u4E3A\u7EC8\u6B62 shell:", id, error);
    }
  }
  child.kill(signal);
}
function pruneFinished() {
  const finished = [...processes.values()].filter((record) => record.state !== "running").sort((left, right) => left.startedAt - right.startedAt);
  const surplus = finished.length - MAX_FINISHED_INSTANCES;
  for (const record of surplus > 0 ? finished.slice(0, surplus) : []) {
    processes.delete(record.id);
    buffers.delete(record.id);
  }
}
function appendOutput(id, chunk) {
  if (!processes.has(id)) return;
  const current = buffers.get(id) ?? { chunks: [], retainedBytes: 0, chars: 0, text: "" };
  const chunkBytes = Buffer.byteLength(chunk);
  current.chunks.push(chunk);
  current.retainedBytes += chunkBytes;
  current.chars += chunk.length;
  current.text = void 0;
  let dropped = 0;
  let droppedBytes = 0;
  while (current.retainedBytes - droppedBytes > MAX_BUFFER_BYTES && dropped < current.chunks.length - 1) {
    droppedBytes += Buffer.byteLength(current.chunks[dropped] ?? "");
    dropped += 1;
  }
  if (dropped > 0) {
    current.chunks.splice(0, dropped);
    current.retainedBytes -= droppedBytes;
  }
  buffers.set(id, current);
  const record = processes.get(id);
  if (record !== void 0) record.bytes += chunk.length;
}
function bufferTextOf(buffer) {
  if (buffer.text === void 0) buffer.text = buffer.chunks.join("");
  return buffer.text;
}
function readOutput(id, offset) {
  const buffer = buffers.get(id);
  if (buffer === void 0) return { text: "", bytes: 0, overflowed: false };
  if (offset >= buffer.chars) return { text: "", bytes: buffer.chars, overflowed: false };
  const text = bufferTextOf(buffer);
  const pending = buffer.chars - Math.max(0, offset);
  const overflowed = pending > text.length;
  const available = overflowed ? text.length : pending;
  return { text: text.slice(text.length - available), bytes: buffer.chars, overflowed };
}
function listProcesses(root) {
  const all = [...processes.values()];
  const scoped = root === void 0 ? all : all.filter((record) => record.root === root);
  return scoped.sort((left, right) => right.startedAt - left.startedAt);
}
function startRun(config, settingsShell, root) {
  pruneFinished();
  sequence += 1;
  const id = `run-${Date.now()}-${sequence}`;
  const record = {
    id,
    configId: config.id,
    name: config.name,
    command: config.command,
    cwd: config.cwd === "" ? homedir() : config.cwd,
    root,
    state: "running",
    exitCode: null,
    startedAt: Date.now(),
    endedAt: null,
    bytes: 0
  };
  processes.set(id, record);
  buffers.set(id, { chunks: [], retainedBytes: 0, chars: 0, text: "" });
  let child;
  try {
    child = spawn3(shellPath(settingsShell), ["-lc", config.command], {
      cwd: record.cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      // 独立进程组：停止时才能连同 shell fork 出的服务进程一起终止
      detached: process.platform !== "win32"
    });
  } catch (error) {
    console.error("[dsh-ide] \u542F\u52A8\u8FD0\u884C\u5B9E\u4F8B\u5931\u8D25:", id, error);
    processes.delete(id);
    buffers.delete(id);
    throw error;
  }
  children.set(id, child);
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => appendOutput(id, chunk));
  child.stderr?.on("data", (chunk) => appendOutput(id, chunk));
  const failStream = (error) => {
    console.error("[dsh-ide] \u8FD0\u884C\u5B9E\u4F8B\u8F93\u51FA\u6D41\u5F02\u5E38:", id, error);
    appendOutput(id, `
[dsh-ide] Output stream failed: ${error.message}
`);
    record.state = "failed";
    record.error = error.message;
    record.endedAt = Date.now();
    children.delete(id);
  };
  child.stdout?.on("error", failStream);
  child.stderr?.on("error", failStream);
  child.on("error", (error) => {
    appendOutput(id, `
[dsh-ide] Failed to start: ${error.message}
`);
    record.state = "failed";
    record.error = error.message;
    record.endedAt = Date.now();
    children.delete(id);
  });
  child.on("exit", (code, signal) => {
    const suffix = signal === null ? `exit code ${String(code)}` : `terminated by signal ${signal}`;
    appendOutput(id, `
[dsh-ide] Process exited (${suffix})
`);
    record.state = record.state === "failed" ? "failed" : "exited";
    record.exitCode = code;
    record.endedAt = Date.now();
    children.delete(id);
  });
  return record;
}
function stopRun(id) {
  if (!children.has(id)) return false;
  killTree(id, "SIGTERM");
  const timer = setTimeout(() => {
    if (children.has(id)) killTree(id, "SIGKILL");
  }, KILL_GRACE_MS);
  timer.unref?.();
  return true;
}
function disposeRun(id) {
  killTree(id, "SIGKILL");
  children.delete(id);
  buffers.delete(id);
  return processes.delete(id);
}
function stopAllRuns() {
  for (const id of children.keys()) {
    killTree(id, "SIGKILL");
    console.log("[dsh-ide] \u63D2\u4EF6\u5378\u8F7D\uFF0C\u5DF2\u7EC8\u6B62\u8FD0\u884C\u5B9E\u4F8B:", id);
  }
  children.clear();
  processes.clear();
  buffers.clear();
}

// src/host/services/settings-service.ts
import { randomUUID } from "node:crypto";
import { mkdir as mkdir2, readFile as readFile5, rename as rename3, rm as rm3, stat as stat6, writeFile as writeFile3 } from "node:fs/promises";
import path7 from "node:path";

// src/host/services/home.ts
import { homedir as homedir2 } from "node:os";
import path6 from "node:path";
function dshHome() {
  const configured = process.env.DSH_HOME;
  return configured !== void 0 && configured !== "" ? configured : path6.join(homedir2(), ".dsh");
}
function pluginDataDir() {
  return path6.join(dshHome(), "dsh-ide");
}

// src/host/services/settings-service.ts
var DEFAULT_SETTINGS = {
  fontSize: 12,
  // 行距 1.2 与 IDEA 默认一致：比默认的 1.6 紧凑，单屏能看到更多代码行
  lineHeight: 1.2,
  tabSize: 2,
  autoSave: true,
  autoSaveDelayMs: 500,
  // 60 秒：同事推送的新提交能在一分钟内被发现，又不至于把 git 进程开得太频繁
  autoFetchSeconds: 60,
  searchExclude: "",
  terminalShell: "",
  theme: "system",
  // 默认与 IDEA 一致：合并进当前分支，并且每次都询问
  updateProjectMode: "merge",
  updateProjectSkipDialog: false,
  dialogSizes: {}
};
var DIALOG_SIZE_LIMITS = { min: 200, max: 4e3 };
var DIALOG_SIZE_KEY_PATTERN = /^[a-z0-9-]{1,64}$/u;
async function writeAtomic(file, text) {
  const temporary = `${file}.${String(process.pid)}.${randomUUID()}.tmp`;
  try {
    await writeFile3(temporary, text, "utf8");
    await rename3(temporary, file);
  } catch (error) {
    await rm3(temporary, { force: true }).catch((cleanupError) => {
      console.error("[dsh-ide] \u6E05\u7406\u8BBE\u7F6E\u4E34\u65F6\u6587\u4EF6\u5931\u8D25:", temporary, cleanupError);
    });
    throw error;
  }
}
var settingsCache = null;
var settingsQueue = Promise.resolve();
function cloneSettings(settings) {
  return { ...settings, dialogSizes: { ...settings.dialogSizes } };
}
var runConfigQueue = Promise.resolve();
function settingsPath() {
  return path7.join(pluginDataDir(), "settings.json");
}
function runConfigsPath() {
  return path7.join(pluginDataDir(), "run-configs.json");
}
function normalizeSettings(value) {
  const source = typeof value === "object" && value !== null ? value : {};
  const number = (key, fallback, min, max) => {
    const raw = source[key];
    return typeof raw === "number" && Number.isFinite(raw) ? Math.min(Math.max(raw, min), max) : fallback;
  };
  const text = (key, fallback) => {
    const raw = source[key];
    return typeof raw === "string" ? raw : fallback;
  };
  return {
    fontSize: number("fontSize", DEFAULT_SETTINGS.fontSize, 9, 32),
    lineHeight: number("lineHeight", DEFAULT_SETTINGS.lineHeight, 1, 2.5),
    tabSize: number("tabSize", DEFAULT_SETTINGS.tabSize, 1, 8),
    autoSave: source.autoSave === true,
    autoSaveDelayMs: number("autoSaveDelayMs", DEFAULT_SETTINGS.autoSaveDelayMs, 500, 6e4),
    autoFetchSeconds: Math.round(number("autoFetchSeconds", DEFAULT_SETTINGS.autoFetchSeconds, 0, 3600)),
    searchExclude: text("searchExclude", DEFAULT_SETTINGS.searchExclude),
    terminalShell: text("terminalShell", DEFAULT_SETTINGS.terminalShell),
    theme: themeOf(source.theme),
    updateProjectMode: source.updateProjectMode === "rebase" ? "rebase" : "merge",
    updateProjectSkipDialog: source.updateProjectSkipDialog === true,
    dialogSizes: dialogSizesOf(source.dialogSizes)
  };
}
function dialogOffsetOf(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return void 0;
  return Math.round(Math.min(Math.max(value, 0), DIALOG_SIZE_LIMITS.max));
}
function dialogSizesOf(value) {
  if (typeof value !== "object" || value === null) return {};
  const frames = {};
  const clamp = (raw) => Math.round(Math.min(Math.max(raw, DIALOG_SIZE_LIMITS.min), DIALOG_SIZE_LIMITS.max));
  for (const [key, raw] of Object.entries(value)) {
    if (!DIALOG_SIZE_KEY_PATTERN.test(key)) continue;
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw;
    if (typeof item.width !== "number" || typeof item.height !== "number") continue;
    if (!Number.isFinite(item.width) || !Number.isFinite(item.height)) continue;
    const frame = { width: clamp(item.width), height: clamp(item.height) };
    const x = dialogOffsetOf(item.x);
    const y = dialogOffsetOf(item.y);
    if (x !== void 0 && y !== void 0) {
      frame.x = x;
      frame.y = y;
    }
    frames[key] = frame;
  }
  return frames;
}
function themeOf(value) {
  return value === "light" || value === "dark" ? value : "system";
}
async function readSettings() {
  try {
    const info = await stat6(settingsPath());
    if (settingsCache !== null && settingsCache.mtimeMs === info.mtimeMs && settingsCache.size === info.size) {
      return cloneSettings(settingsCache.settings);
    }
    const text = await readFile5(settingsPath(), "utf8");
    const settings = normalizeSettings(JSON.parse(text));
    settingsCache = { mtimeMs: info.mtimeMs, size: info.size, settings };
    return cloneSettings(settings);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("[dsh-ide] \u8BFB\u53D6\u8BBE\u7F6E\u5931\u8D25\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C:", error);
    }
    settingsCache = null;
    return cloneSettings(DEFAULT_SETTINGS);
  }
}
async function writeSettings(value) {
  const settings = normalizeSettings(value);
  const task = async () => {
    await mkdir2(pluginDataDir(), { recursive: true });
    await writeAtomic(settingsPath(), `${JSON.stringify(settings, null, 2)}
`);
    settingsCache = null;
    return settings;
  };
  const next = settingsQueue.then(task, task);
  settingsQueue = next.catch(() => void 0);
  return next;
}
function parseConfig(item) {
  if (typeof item !== "object" || item === null) return null;
  const candidate = item;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || typeof candidate.command !== "string" || typeof candidate.cwd !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    command: candidate.command,
    cwd: candidate.cwd,
    lastExitCode: typeof candidate.lastExitCode === "number" ? candidate.lastExitCode : null
  };
}
async function readStore(migrateTo) {
  try {
    const text = await readFile5(runConfigsPath(), "utf8");
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const migrated = parsed.map(parseConfig).filter((item) => item !== null);
      const store2 = migrated.length === 0 ? {} : { [migrateTo]: migrated };
      await persistStore(store2);
      return store2;
    }
    if (typeof parsed !== "object" || parsed === null) return {};
    const store = {};
    for (const [root, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      store[root] = value.map(parseConfig).filter((item) => item !== null);
    }
    return store;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("[dsh-ide] \u8BFB\u53D6\u8FD0\u884C\u914D\u7F6E\u5931\u8D25:", error);
    }
    return {};
  }
}
async function readRunConfigs(root) {
  const store = await readStore(root);
  return store[root] ?? [];
}
async function persistStore(store) {
  await mkdir2(pluginDataDir(), { recursive: true });
  await writeAtomic(runConfigsPath(), `${JSON.stringify(store, null, 2)}
`);
}
async function mutateRunConfigs(root, mutate) {
  let next = [];
  const task = async () => {
    const store = await readStore(root);
    next = mutate(store[root] ?? []);
    store[root] = next;
    await persistStore(store);
  };
  const queued = runConfigQueue.then(task, task);
  runConfigQueue = queued.catch(() => void 0);
  await queued;
  return next;
}
function createRunConfigId(existing) {
  const ids = new Set(existing.map((item) => item.id));
  let candidate = `cfg-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  while (ids.has(candidate)) candidate = `cfg-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  return candidate;
}

// src/host/routes/run.ts
function handleRunList(request, response) {
  const root = queryOf(request, "root");
  sendOk(response, { processes: listProcesses(root === "" ? void 0 : root) });
}
async function handleRunStart(request, response) {
  try {
    const body = await readJsonBody(request);
    const configId = bodyString(body, "configId");
    const root = bodyString(body, "root");
    const configs = await readRunConfigs(root);
    const config = configs.find((item) => item.id === configId);
    if (config === void 0) {
      sendError(response, "CONFIG_NOT_FOUND", `Run configuration not found: ${configId}`, 404);
      return;
    }
    const settings = await readSettings();
    sendOk(response, startRun(config, settings.terminalShell, root));
  } catch (error) {
    console.error("[dsh-ide] \u542F\u52A8\u8FD0\u884C\u914D\u7F6E\u5931\u8D25:", error);
    sendError(response, "RUN_START_FAILED", String(error), 500);
  }
}
async function handleRunStop(request, response) {
  try {
    const body = await readJsonBody(request);
    sendOk(response, { stopped: stopRun(bodyString(body, "id")) });
  } catch (error) {
    console.error("[dsh-ide] \u505C\u6B62\u8FD0\u884C\u5B9E\u4F8B\u5931\u8D25:", error);
    sendError(response, "RUN_STOP_FAILED", String(error), 500);
  }
}
async function handleRunDispose(request, response) {
  try {
    const body = await readJsonBody(request);
    sendOk(response, { disposed: disposeRun(bodyString(body, "id")) });
  } catch (error) {
    console.error("[dsh-ide] \u79FB\u9664\u8FD0\u884C\u5B9E\u4F8B\u5931\u8D25:", error);
    sendError(response, "RUN_DISPOSE_FAILED", String(error), 500);
  }
}
function handleRunOutput(request, response) {
  const id = queryOf(request, "id");
  sendOk(response, readOutput(id, queryNumber(request, "offset") ?? 0));
}
async function handleRunConfigs(request, response) {
  try {
    sendOk(response, { configs: await readRunConfigs(queryOf(request, "root")) });
  } catch (error) {
    console.error("[dsh-ide] \u8BFB\u53D6\u8FD0\u884C\u914D\u7F6E\u5931\u8D25:", error);
    sendError(response, "RUN_CONFIG_READ_FAILED", String(error), 500);
  }
}
async function handleRunConfigSave(request, response) {
  try {
    const body = await readJsonBody(request);
    const input = typeof body.config === "object" && body.config !== null ? body.config : {};
    const root = bodyString(body, "root");
    const id = bodyString(input, "id");
    const name = bodyString(input, "name").trim() || "Unnamed Configuration";
    const command = bodyString(input, "command");
    const cwd = bodyString(input, "cwd");
    const lastExitCode = typeof input.lastExitCode === "number" ? input.lastExitCode : null;
    let config = { id, name, command, cwd, lastExitCode };
    await mutateRunConfigs(root, (configs) => {
      config = {
        id: id === "" ? createRunConfigId(configs) : id,
        name,
        command,
        cwd,
        lastExitCode
      };
      return [...configs.filter((item) => item.id !== config.id), config];
    });
    sendOk(response, { config });
  } catch (error) {
    console.error("[dsh-ide] \u4FDD\u5B58\u8FD0\u884C\u914D\u7F6E\u5931\u8D25:", error);
    sendError(response, "RUN_CONFIG_SAVE_FAILED", String(error), 500);
  }
}
async function handleRunConfigDelete(request, response) {
  try {
    const body = await readJsonBody(request);
    const id = bodyString(body, "id");
    const root = bodyString(body, "root");
    await mutateRunConfigs(root, (configs) => configs.filter((item) => item.id !== id));
    sendOk(response, null);
  } catch (error) {
    console.error("[dsh-ide] \u5220\u9664\u8FD0\u884C\u914D\u7F6E\u5931\u8D25:", error);
    sendError(response, "RUN_CONFIG_DELETE_FAILED", String(error), 500);
  }
}

// src/host/routes/settings.ts
async function handleSettingsGet(_request, response) {
  try {
    sendOk(response, await readSettings());
  } catch (error) {
    console.error("[dsh-ide] \u8BFB\u53D6\u8BBE\u7F6E\u5931\u8D25:", error);
    sendError(response, "SETTINGS_READ_FAILED", String(error), 500);
  }
}
async function handleSettingsSave(request, response) {
  try {
    const body = await readJsonBody(request);
    sendOk(response, await writeSettings(body));
  } catch (error) {
    console.error("[dsh-ide] \u4FDD\u5B58\u8BBE\u7F6E\u5931\u8D25:", error);
    sendError(response, "SETTINGS_WRITE_FAILED", String(error), 500);
  }
}

// src/host/routes/index.ts
var API_PREFIX = "/dsh-ide/api";
var SLOW_REQUEST_MS = 1e3;
var ROUTES = {
  "GET /ping": handlePing,
  "GET /fs/list": handleFsList,
  "GET /fs/stat": handleFsStat,
  "GET /fs/read": handleFsRead,
  "GET /fs/search": handleFsSearch,
  "POST /fs/write": handleFsWrite,
  "POST /fs/create": handleFsCreate,
  "POST /fs/rename": handleFsRename,
  "POST /fs/copy": handleFsCopy,
  "POST /fs/reveal": handleFsReveal,
  "POST /fs/delete": handleFsDelete,
  "POST /git/exec": handleGitExec,
  "GET /run/list": handleRunList,
  "GET /run/output": handleRunOutput,
  "GET /run/configs": handleRunConfigs,
  "POST /run/start": handleRunStart,
  "POST /run/stop": handleRunStop,
  "POST /run/dispose": handleRunDispose,
  "POST /run/config-save": handleRunConfigSave,
  "POST /run/config-delete": handleRunConfigDelete,
  "GET /settings": handleSettingsGet,
  "POST /settings": handleSettingsSave
};
var METHODS_BY_PATH = /* @__PURE__ */ new Map();
for (const key of Object.keys(ROUTES)) {
  const [method, route] = key.split(" ");
  if (method === void 0 || route === void 0) continue;
  const methods = METHODS_BY_PATH.get(route) ?? [];
  methods.push(method);
  METHODS_BY_PATH.set(route, methods);
}
function routePathOf(request) {
  const raw = request.url ?? "/";
  const path8 = raw.split("?")[0] ?? "/";
  return path8.slice(API_PREFIX.length) || "/";
}
function registerRoutes(webServer) {
  return webServer.register({
    kind: "prefix",
    path: API_PREFIX,
    handler: (request, response) => {
      if (!isTrustedRequest(request)) {
        sendJson(response, 403, { ok: false, error: { code: "FORBIDDEN", message: "Untrusted request origin" } });
        return;
      }
      const relative = routePathOf(request);
      const method = request.method ?? "GET";
      const handler = relative.startsWith("/asset/") ? handleAsset : ROUTES[`${method} ${relative}`];
      const key = `${method} ${relative}`;
      if (handler === void 0) {
        const allowed = METHODS_BY_PATH.get(relative);
        if (allowed !== void 0 && allowed.length > 0) {
          response.setHeader("allow", allowed.join(", "));
          sendError(response, "METHOD_NOT_ALLOWED", `Method ${method} is not allowed for ${relative}`, 405);
          return;
        }
        sendError(response, "NOT_FOUND", `Unknown endpoint ${key}`, 404);
        return;
      }
      const startedAt = Date.now();
      response.once("finish", () => {
        const elapsed = Date.now() - startedAt;
        if (elapsed >= SLOW_REQUEST_MS) {
          console.warn(`[dsh-ide] \u6162\u8BF7\u6C42 ${key} ${String(elapsed)}ms -> ${String(response.statusCode)}`);
        }
      });
      try {
        const result = handler(request, response);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error("[dsh-ide] \u8DEF\u7531\u5904\u7406\u5931\u8D25:", key, error);
            if (!response.headersSent) sendError(response, "INTERNAL", "Internal error", 500);
          });
        }
      } catch (error) {
        console.error("[dsh-ide] \u8DEF\u7531\u5904\u7406\u5931\u8D25:", key, error);
        if (!response.headersSent) sendError(response, "INTERNAL", "Internal error", 500);
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
  ctx.effect(() => () => stopAllRuns(), "dsh-ide: run processes");
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
