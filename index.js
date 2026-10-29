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
function sendError(response, code, message, status = 400) {
  sendJson(response, status, { ok: false, error: { code, message } });
}

// src/host/routes/asset.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
var CHUNK_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "chunks");
var ALLOWED_CHUNKS = /* @__PURE__ */ new Set(["editor-kernel.js", "terminal-kernel.js", "diff-kernel.js"]);
async function handleAsset(request, response) {
  const raw = (request.url ?? "").split("?")[0] ?? "";
  const requested = raw.slice(raw.lastIndexOf("/") + 1);
  const name = requested.endsWith(".js") ? requested : `${requested}.js`;
  if (!ALLOWED_CHUNKS.has(name)) {
    sendError(response, "ASSET_NOT_FOUND", `Unknown chunk: ${requested}`, 404);
    return;
  }
  try {
    const content = await readFile(path.join(CHUNK_DIR, name));
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
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

// src/host/services/home.ts
import { homedir } from "node:os";
import path2 from "node:path";
function dshHome() {
  const configured = process.env.DSH_HOME;
  return configured !== void 0 && configured !== "" ? configured : path2.join(homedir(), ".dsh");
}
function pluginDataDir() {
  return path2.join(dshHome(), "dsh-ide");
}

// src/host/services/fs-service.ts
import { constants } from "node:fs";
import { access, cp, mkdir, rename, readdir, readFile as readFile2, stat as stat2, rm, writeFile } from "node:fs/promises";
import path4 from "node:path";

// src/host/services/workspace.ts
import { realpath, stat } from "node:fs/promises";
import path3 from "node:path";
var knownRoots = /* @__PURE__ */ new Map();
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
  const relative = path3.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path3.isAbsolute(relative);
}
async function resolveRoot(root) {
  if (typeof root !== "string" || root === "") {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", "Workspace root is missing");
  }
  if (!path3.isAbsolute(root)) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `Workspace root is not an absolute path: ${root}`);
  }
  const cached = knownRoots.get(root);
  if (cached !== void 0) {
    const info2 = await stat(cached).catch(() => void 0);
    if (info2?.isDirectory() === true) return cached;
    knownRoots.delete(root);
  }
  const real = await realpath(root).catch(() => void 0);
  if (real === void 0) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `Workspace root does not exist: ${root}`);
  }
  const info = await stat(real).catch(() => void 0);
  if (info?.isDirectory() !== true) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `Workspace root is not a directory: ${root}`);
  }
  if (real === path3.parse(real).root || real === process.env.HOME) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `Workspace root is too broad: ${real}`);
  }
  knownRoots.set(root, real);
  return real;
}
async function resolveWithin(root, input) {
  const realRoot = await resolveRoot(root);
  if (typeof input !== "string" || input.includes("\0")) {
    throw new WorkspaceError("PATH_INVALID", "Invalid path");
  }
  const absolute = path3.isAbsolute(input) ? path3.normalize(input) : path3.resolve(realRoot, input);
  const direct = await realpath(absolute).catch(() => void 0);
  const resolved = direct ?? await nearestReal(absolute);
  if (!contains(realRoot, resolved)) {
    throw new WorkspaceError("PATH_OUTSIDE_WORKSPACE", `Path is outside the workspace: ${input}`);
  }
  return {
    root: realRoot,
    absolute: direct ?? absolute,
    relative: direct === void 0 ? "" : path3.relative(realRoot, direct).split(path3.sep).join("/"),
    existed: direct !== void 0
  };
}
async function nearestReal(absolute) {
  const segments = [];
  let current = absolute;
  for (; ; ) {
    const real = await realpath(current).catch(() => void 0);
    if (real !== void 0) return path3.join(real, ...segments.reverse());
    const parent = path3.dirname(current);
    if (parent === current) return absolute;
    segments.push(path3.basename(current));
    current = parent;
  }
}

// src/host/services/fs-service.ts
var MAX_ENTRIES = 2e3;
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
  return left.name.localeCompare(right.name, void 0, { numeric: true, sensitivity: "base" });
}
async function listDirectory(root, input) {
  const resolved = await resolveWithin(root, input);
  const dirents = await readdir(resolved.absolute, { withFileTypes: true });
  const sliced = dirents.slice(0, MAX_ENTRIES);
  const entries = [];
  for (const dirent of sliced) {
    const info = toEntryInfo(dirent);
    if (info.type === "file") {
      const fileStat = await stat2(path4.join(resolved.absolute, dirent.name)).catch(() => void 0);
      if (fileStat !== void 0) info.size = fileStat.size;
    }
    entries.push(info);
  }
  entries.sort(compareEntries);
  return { path: resolved.absolute, entries, truncated: dirents.length > sliced.length };
}
async function statFile(root, input) {
  const resolved = await resolveWithin(root, input);
  const info = await stat2(resolved.absolute).catch(() => void 0);
  if (info === void 0) return void 0;
  return {
    absolutePath: resolved.absolute,
    version: versionOf(info),
    bytes: info.size,
    type: info.isDirectory() ? "directory" : info.isFile() ? "file" : "other",
    mtimeMs: info.mtimeMs
  };
}
async function readTextFile(root, input) {
  const resolved = await resolveWithin(root, input);
  const info = await stat2(resolved.absolute);
  const text = await readFile2(resolved.absolute, "utf8");
  return {
    text,
    version: versionOf(info),
    absolutePath: resolved.absolute,
    bytes: info.size
  };
}
async function writeTextFile(root, input, text, expectedVersion) {
  const resolved = await resolveWithin(root, input);
  const current = await stat2(resolved.absolute).catch(() => void 0);
  if (expectedVersion !== "") {
    if (current === void 0) {
      throw new WorkspaceError("PATH_INVALID", `Target no longer exists: ${resolved.absolute}`);
    }
    if (versionOf(current) !== expectedVersion) {
      throw new StaleFileError(versionOf(current));
    }
  }
  await mkdir(path4.dirname(resolved.absolute), { recursive: true });
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
  const after = await stat2(resolved.absolute);
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
  await mkdir(path4.dirname(resolved.absolute), { recursive: true });
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
  await mkdir(path4.dirname(target.absolute), { recursive: true });
  await rename(source.absolute, target.absolute);
}
async function copyEntry(root, from, to) {
  const source = await resolveWithin(root, from);
  const target = await resolveWithin(root, to);
  await mkdir(path4.dirname(target.absolute), { recursive: true });
  await cp(source.absolute, target.absolute, { recursive: true, errorOnExist: true, force: false });
}

// src/host/services/search-service.ts
import { readdir as readdir2, readFile as readFile3, stat as stat3 } from "node:fs/promises";
import path5 from "node:path";
var MAX_WALK_FILES = 2e4;
var MAX_SEARCH_FILE_BYTES = 1024 * 1024;
var MAX_SEARCH_MATCHES = 2e3;
var SEARCH_CONCURRENCY = 32;
var SKIP_DIRECTORIES = /* @__PURE__ */ new Set([".git", "node_modules", ".svn", ".hg", "dist", ".build", ".next", ".cache"]);
function compileGlob(pattern) {
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
    source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  let regex;
  try {
    regex = new RegExp(`^${source}$`);
  } catch (error) {
    console.error("[dsh-ide] \u7F16\u8BD1\u6392\u9664\u89C4\u5219\u5931\u8D25:", pattern, error);
    regex = /^$/u;
  }
  return (name) => regex.test(name);
}
function compileExcludes(exclude) {
  return exclude.split(",").map((item) => item.trim()).filter((item) => item !== "").map((source) => ({ source, test: compileGlob(source) }));
}
function isExcluded(relative, excludes) {
  const name = relative.slice(relative.lastIndexOf("/") + 1);
  return excludes.some((exclude) => exclude.test(relative) || exclude.test(name));
}
async function walkFiles(root, excludes) {
  const files = [];
  const pending = [""];
  while (pending.length > 0) {
    const relative = pending.pop() ?? "";
    const absolute = relative === "" ? root : path5.join(root, relative);
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
      files.push(path5.join(root, child));
      if (files.length >= MAX_WALK_FILES) return { files, truncated: true };
    }
  }
  return { files, truncated: false };
}
function compileQuery(request) {
  const escaped = request.regex ? request.query : request.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const worded = request.wholeWord ? `\\b(?:${escaped})\\b` : escaped;
  return new RegExp(worded, request.caseSensitive ? "g" : "gi");
}
async function searchWorkspace(request) {
  const resolved = await resolveWithin(request.root, ".");
  const excludes = compileExcludes(request.exclude);
  const pattern = compileQuery(request);
  const { files, truncated: walkedOut } = await walkFiles(resolved.absolute, excludes);
  const matches = [];
  let truncated = walkedOut;
  let cursor = 0;
  const searchFile = async (absolute) => {
    const found = [];
    const info = await stat3(absolute).catch(() => void 0);
    if (info === void 0 || info.size > MAX_SEARCH_FILE_BYTES) return found;
    const text = await readFile3(absolute, "utf8").catch((error) => {
      console.error("[dsh-ide] \u641C\u7D22\u8DF3\u8FC7\u4E0D\u53EF\u8BFB\u6587\u4EF6:", absolute, error);
      return void 0;
    });
    if (text === void 0 || text.includes("\0")) return found;
    const lines = text.split("\n");
    const relative = path5.relative(resolved.absolute, absolute).split(path5.sep).join("/");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      pattern.lastIndex = 0;
      const hit = pattern.exec(line);
      if (hit === null) continue;
      found.push({
        path: relative,
        absolutePath: absolute,
        line: index + 1,
        column: hit.index + 1,
        text: line.trim().slice(0, 400)
      });
    }
    return found;
  };
  while (cursor < files.length) {
    const batch = files.slice(cursor, cursor + SEARCH_CONCURRENCY);
    cursor += batch.length;
    const results = await Promise.all(batch.map((file) => searchFile(file)));
    for (const found of results) {
      matches.push(...found);
      if (matches.length >= MAX_SEARCH_MATCHES) {
        truncated = true;
        return { matches: matches.slice(0, MAX_SEARCH_MATCHES), truncated, filesScanned: files.length };
      }
    }
  }
  return { matches, truncated, filesScanned: files.length };
}

// src/host/services/trash-service.ts
import { appendFile, mkdir as mkdir2, readdir as readdir3, rename as rename2, rm as rm2, stat as stat4 } from "node:fs/promises";
import path6 from "node:path";
var TRASH_RETENTION_DAYS = 7;
function trashRoot(home) {
  return path6.join(home, "dsh-ide", "trash");
}
async function trashEntry(root, home, input) {
  const resolved = await resolveWithin(root, input);
  if (resolved.absolute === resolved.root) {
    throw new WorkspaceError("PATH_INVALID", "The workspace root cannot be deleted");
  }
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const batch = path6.join(trashRoot(home), stamp);
  const storedAs = resolved.relative === "" ? path6.basename(resolved.absolute) : resolved.relative.split("/").join("__");
  await mkdir2(batch, { recursive: true });
  await rename2(resolved.absolute, path6.join(batch, storedAs));
  const entry = {
    originalPath: resolved.absolute,
    storedAs,
    deletedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await appendFile(path6.join(batch, "manifest.json"), `${JSON.stringify(entry)}
`, "utf8");
  return { batch, entry };
}
async function purgeTrash(home) {
  const root = trashRoot(home);
  const batches = await readdir3(root).catch(() => []);
  const deadline = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1e3;
  let removed = 0;
  for (const batch of batches) {
    const batchPath = path6.join(root, batch);
    const info = await stat4(batchPath).catch(() => void 0);
    if (info === void 0 || info.mtimeMs > deadline) continue;
    await rm2(batchPath, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
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
    sendOk(response, await readTextFile(root, target));
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
    sendOk(response, await trashEntry(bodyString(body, "root"), dshHome(), bodyString(body, "path")));
  } catch (error) {
    respondFsError(response, error);
  }
}
async function handleFsTrashPurge(_request, response) {
  try {
    const removed = await purgeTrash(dshHome());
    sendOk(response, { removed });
  } catch (error) {
    console.error("[dsh-ide] \u6E05\u7406\u56DE\u6536\u7AD9\u5931\u8D25:", error);
    sendError(response, "TRASH_PURGE_FAILED", String(error), 500);
  }
}
async function handleFsSearch(request, response) {
  const query = queryOf(request, "q");
  if (query === "") {
    sendError(response, "QUERY_EMPTY", "Query string is empty");
    return;
  }
  try {
    sendOk(
      response,
      await searchWorkspace({
        root: queryOf(request, "root"),
        query,
        regex: queryOf(request, "regex") === "1",
        caseSensitive: queryOf(request, "caseSensitive") === "1",
        wholeWord: queryOf(request, "wholeWord") === "1",
        exclude: queryOf(request, "exclude")
      })
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendError(response, "REGEX_INVALID", `Invalid regular expression: ${error.message}`);
      return;
    }
    respondFsError(response, error);
  }
}
function respondFsError(response, error) {
  if (error instanceof StaleFileError) {
    sendError(response, "STALE_FILE", "File has been modified externally", 409);
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
import { spawn } from "node:child_process";
import { readFile as readFile4, stat as stat5 } from "node:fs/promises";
import { resolve, sep } from "node:path";
var MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
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
};
var queues = /* @__PURE__ */ new Map();
function serialized(repo, task) {
  const previous = queues.get(repo) ?? Promise.resolve();
  const next = previous.then(task, task);
  queues.set(
    repo,
    next.catch(() => void 0)
  );
  return next;
}
function execGit(repo, argv, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolvePromise, reject) => {
    let child;
    try {
      child = spawn("git", argv, { cwd: repo, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
    } catch (error) {
      reject(new GitError("GIT_NOT_INSTALLED", `Unable to start git: ${String(error)}`));
      return;
    }
    const out = [];
    const err = [];
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new GitError("GIT_TIMEOUT", `git ${argv.join(" ")} timed out`));
    }, timeoutMs);
    timer.unref?.();
    child.stdout?.on("data", (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > MAX_OUTPUT_BYTES) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new GitError("GIT_OUTPUT_TOO_LARGE", "git output exceeded the size limit"));
        }
        return;
      }
      out.push(chunk);
    });
    child.stderr?.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new GitError("GIT_NOT_INSTALLED", `git failed to start: ${String(error)}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code !== 0 && options.allowFailure !== true) {
        reject(new GitError("GIT_FAILED", stderr.trim() || `git ${argv[0] ?? ""} failed`, stderr));
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
  try {
    const result = await execGit(cwd, ["rev-parse", "--show-toplevel"], { allowFailure: true });
    return result.code === 0 ? result.stdout.trim() : void 0;
  } catch (error) {
    console.error("[dsh-ide] Failed to resolve repository:", cwd, error);
    return void 0;
  }
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
async function readBlobText(repo, ref, relative) {
  const object = ref === "" ? `:${assertRef(relative, "Path")}` : `${assertRef(ref, "Ref")}:${assertRef(relative, "Path")}`;
  const result = await execGit(repo, ["show", object], { allowFailure: true });
  return result.code === 0 ? result.stdout : "";
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
  return raw.split(",").map((item) => item.trim()).filter((item) => item !== "" && !item.startsWith("HEAD ->") && item !== "HEAD").map((item) => item.startsWith("tag: ") ? item.slice(5) : item).filter((item) => !item.endsWith("/HEAD"));
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
function readTrack(track, label) {
  if (track === void 0) return 0;
  const match = new RegExp(`${label} (\\d+)`).exec(track);
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
function parseRefList(text, skipSymbolic = false) {
  return text.split("\n").map((line) => line.trim()).filter((line) => line !== "").map((line) => {
    const [name, hash, ...subject] = line.split("");
    return { name: name ?? "", hash: hash ?? "", subject: subject.join(" ") };
  }).filter((entry) => !skipSymbolic || !entry.name.endsWith("/HEAD"));
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
var READ_METHODS = {
  /** 工作区状态与当前分支。 */
  async status(repo) {
    const [statusResult, branchResult, headResult] = await Promise.all([
      execGit(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
      execGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--short=8", "HEAD"], { allowFailure: true })
    ]);
    const branch = branchResult.code === 0 ? branchResult.stdout.trim() : "";
    return {
      branch,
      headShort: headResult.code === 0 ? headResult.stdout.trim() : "",
      ...parseStatus(statusResult.stdout)
    };
  },
  /** 工作区文件差异：HEAD（或索引区）与工作区两侧的完整文本。 */
  async diffWorktree(repo, body) {
    const path8 = assertRef(bodyString(body, "path"), "Path");
    const staged = bodyString(body, "staged") === "true";
    const left = await readBlobText(repo, "HEAD", path8);
    const right = staged ? await readBlobText(repo, "", path8) : (await readWorktreeText(repo, path8, MAX_DIFF_BYTES)).text;
    const bytes = Math.max(new TextEncoder().encode(left).byteLength, new TextEncoder().encode(right).byteLength);
    if (left.includes("\0") || right.includes("\0")) return { binary: true, bytes, left: "", right: "" };
    return { binary: false, bytes, left, right };
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
  /** 提交历史。 */
  async log(repo, body) {
    const limit = Math.min(Math.max(bodyNumber(body, "limit") ?? 200, 1), 500);
    const skip = Math.max(bodyNumber(body, "skip") ?? 0, 0);
    const branch = bodyString(body, "branch");
    const path8 = bodyString(body, "path");
    const all = bodyString(body, "all") === "true";
    const args = [
      "log",
      `--max-count=${String(limit)}`,
      `--skip=${String(skip)}`,
      // 拓扑序把同一分支的提交排在一起。默认的日期序会让各分支的提交互相交错，
      // 分支图因此被拆成一堆互不相干的长线，与 IDEA 的观感差很远
      "--topo-order",
      "--date=iso-strict",
      "--abbrev=8",
      "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1f%s%x1e"
    ];
    if (all) args.push("--all");
    else if (branch !== "") args.push(assertRef(branch, "Branch"));
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
    const [bodyResult, filesResult, branchesResult, headResult] = await Promise.all([
      execGit(repo, ["show", "--no-patch", "--format=%B", hash], { allowFailure: true }),
      execGit(repo, ["show", "--numstat", "--format=", hash], { allowFailure: true }),
      execGit(repo, ["branch", "--all", "--contains", hash, "--format=%(refname:short)"], { allowFailure: true }),
      execGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true })
    ]);
    const current = headResult.code === 0 ? headResult.stdout.trim() : "";
    const branches = parseContainsBranches(branchesResult.stdout);
    const named = branches.includes(current) && current !== "" ? ["HEAD", ...branches] : branches;
    return {
      commit: { ...parseCommit(meta.stdout.trim()), body: bodyResult.stdout.trim() },
      files: parseNumstat(filesResult.stdout),
      branches: named
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

// src/host/routes/git-write.ts
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
  /** 删除分支。 */
  async deleteBranch(repo, body) {
    const name = assertRef(bodyString(body, "name"), "Branch name");
    const force = bodyString(body, "force") === "true";
    return run(repo, ["branch", force ? "-D" : "-d", name]);
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
  /** 合并到当前分支。 */
  async merge(repo, body) {
    return run(repo, ["merge", "--no-edit", assertRef(bodyString(body, "ref"), "Ref")]);
  },
  /** 把当前分支变基到指定 ref。 */
  async rebase(repo, body) {
    return run(repo, ["rebase", assertRef(bodyString(body, "ref"), "Ref")]);
  },
  /** cherry-pick 单个提交。 */
  async cherryPick(repo, body) {
    return run(repo, ["cherry-pick", assertRef(bodyString(body, "hash"), "Commit")]);
  },
  /** 反向应用一个提交。 */
  async revert(repo, body) {
    return run(repo, ["revert", "--no-edit", assertRef(bodyString(body, "hash"), "Commit")]);
  },
  /** 重置当前分支。 */
  async reset(repo, body) {
    const mode = bodyString(body, "mode", "mixed");
    if (mode !== "soft" && mode !== "mixed" && mode !== "hard") {
      throw new GitError("GIT_FAILED", `Unsupported reset mode: ${mode}`);
    }
    return run(repo, ["reset", `--${mode}`, assertRef(bodyString(body, "ref", "HEAD"), "Ref")]);
  },
  /** 获取远端引用。 */
  async fetch(repo) {
    return run(repo, ["fetch", "--all", "--prune"], NETWORK_TIMEOUT);
  },
  /** 拉取并合并。 */
  async pull(repo) {
    return run(repo, ["pull", "--no-edit"], NETWORK_TIMEOUT);
  },
  /** 推送当前分支。 */
  async push(repo, body) {
    const force = bodyString(body, "force") === "true";
    const setUpstream = bodyString(body, "setUpstream") === "true";
    const argv = ["push"];
    if (force) argv.push("--force-with-lease");
    if (setUpstream) argv.push("-u");
    argv.push("origin", "HEAD");
    return run(repo, argv, NETWORK_TIMEOUT);
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
function readStashSelector(body) {
  const selector = bodyString(body, "selector");
  if (!/^stash@\{\d+\}$/.test(selector)) {
    throw new GitError("GIT_FAILED", `Invalid stash selector: ${selector}`);
  }
  return selector;
}

// src/host/routes/git.ts
async function handleGitExec(request, response) {
  try {
    const body = await readJsonBody(request);
    const method = bodyString(body, "method");
    const cwd = bodyString(body, "cwd");
    if (cwd === "") {
      sendError(response, "CWD_REQUIRED", "A working directory is required");
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
    const value = write !== void 0 ? await serialized(repo, () => write(repo, body)) : await read(repo, body);
    sendOk(response, value);
  } catch (error) {
    if (error instanceof GitError) {
      sendError(response, error.code, error.stderr.trim() === "" ? error.message : error.stderr.trim(), 400);
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
import { spawn as spawn2 } from "node:child_process";
import { homedir as homedir2 } from "node:os";
var MAX_BUFFER_BYTES = 512 * 1024;
var KILL_GRACE_MS = 3e3;
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
function appendOutput(id, chunk) {
  const current = buffers.get(id) ?? { text: "", bytes: 0 };
  const merged = current.text + chunk;
  const text = merged.length > MAX_BUFFER_BYTES ? merged.slice(merged.length - MAX_BUFFER_BYTES) : merged;
  buffers.set(id, { text, bytes: current.bytes + Buffer.byteLength(chunk) });
  const record = processes.get(id);
  if (record !== void 0) record.bytes += Buffer.byteLength(chunk);
}
function readOutput(id, offset) {
  const buffer = buffers.get(id);
  if (buffer === void 0) return { text: "", bytes: 0, overflowed: false };
  const available = buffer.bytes - Math.max(0, offset);
  const overflowed = available > Buffer.byteLength(buffer.text);
  if (offset >= buffer.bytes) return { text: "", bytes: buffer.bytes, overflowed: false };
  const charOffset = overflowed ? 0 : Math.max(0, buffer.text.length - (buffer.bytes - offset));
  return { text: buffer.text.slice(charOffset), bytes: buffer.bytes, overflowed };
}
function listProcesses() {
  return [...processes.values()].sort((left, right) => right.startedAt - left.startedAt);
}
function startRun(config, settingsShell) {
  sequence += 1;
  const id = `run-${Date.now()}-${sequence}`;
  const record = {
    id,
    configId: config.id,
    name: config.name,
    command: config.command,
    cwd: config.cwd === "" ? homedir2() : config.cwd,
    state: "running",
    exitCode: null,
    startedAt: Date.now(),
    endedAt: null,
    bytes: 0
  };
  processes.set(id, record);
  buffers.set(id, { text: "", bytes: 0 });
  const child = spawn2(shellPath(settingsShell), ["-lc", config.command], {
    cwd: record.cwd,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  children.set(id, child);
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => appendOutput(id, chunk));
  child.stderr?.on("data", (chunk) => appendOutput(id, chunk));
  child.on("error", (error) => {
    appendOutput(id, `
[dsh-ide] Failed to start: ${error.message}
`);
    record.state = "failed";
    record.error = error.message;
    record.endedAt = Date.now();
    children.delete(id);
  });
  child.on("close", (code, signal) => {
    record.state = record.state === "failed" ? "failed" : "exited";
    record.exitCode = code;
    record.endedAt = Date.now();
    children.delete(id);
    const suffix = signal === null ? `exit code ${String(code)}` : `terminated by signal ${signal}`;
    appendOutput(id, `
[dsh-ide] Process exited (${suffix})
`);
  });
  return record;
}
function stopRun(id) {
  const child = children.get(id);
  if (child === void 0) return false;
  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    if (children.has(id)) child.kill("SIGKILL");
  }, KILL_GRACE_MS);
  timer.unref?.();
  return true;
}
function disposeRun(id) {
  const child = children.get(id);
  if (child !== void 0) child.kill("SIGKILL");
  children.delete(id);
  buffers.delete(id);
  return processes.delete(id);
}
function stopAllRuns() {
  for (const [id, child] of children) {
    child.kill("SIGKILL");
    console.log("[dsh-ide] \u63D2\u4EF6\u5378\u8F7D\uFF0C\u5DF2\u7EC8\u6B62\u8FD0\u884C\u5B9E\u4F8B:", id);
  }
  children.clear();
}

// src/host/services/settings-service.ts
import { mkdir as mkdir3, readFile as readFile5, writeFile as writeFile2 } from "node:fs/promises";
import path7 from "node:path";
var DEFAULT_SETTINGS = {
  fontSize: 13,
  tabSize: 2,
  autoSave: false,
  autoSaveDelayMs: 2e3,
  diffContext: 3,
  searchExclude: "",
  diagnoseCommand: "",
  terminalShell: "",
  recentFiles: [],
  theme: "system"
};
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
  const recent = Array.isArray(source.recentFiles) ? source.recentFiles.filter((item) => typeof item === "string").slice(0, 50) : [];
  return {
    fontSize: number("fontSize", DEFAULT_SETTINGS.fontSize, 9, 32),
    tabSize: number("tabSize", DEFAULT_SETTINGS.tabSize, 1, 8),
    autoSave: source.autoSave === true,
    autoSaveDelayMs: number("autoSaveDelayMs", DEFAULT_SETTINGS.autoSaveDelayMs, 500, 6e4),
    diffContext: number("diffContext", DEFAULT_SETTINGS.diffContext, 0, 20),
    searchExclude: text("searchExclude", DEFAULT_SETTINGS.searchExclude),
    diagnoseCommand: text("diagnoseCommand", DEFAULT_SETTINGS.diagnoseCommand),
    terminalShell: text("terminalShell", DEFAULT_SETTINGS.terminalShell),
    recentFiles: recent,
    theme: themeOf(source.theme)
  };
}
function themeOf(value) {
  return value === "light" || value === "dark" ? value : "system";
}
async function readSettings() {
  try {
    const text = await readFile5(settingsPath(), "utf8");
    return normalizeSettings(JSON.parse(text));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("[dsh-ide] \u8BFB\u53D6\u8BBE\u7F6E\u5931\u8D25\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C:", error);
    }
    return { ...DEFAULT_SETTINGS };
  }
}
async function writeSettings(value) {
  const settings = normalizeSettings(value);
  await mkdir3(pluginDataDir(), { recursive: true });
  await writeFile2(settingsPath(), `${JSON.stringify(settings, null, 2)}
`, "utf8");
  return settings;
}
async function readRunConfigs() {
  try {
    const text = await readFile5(runConfigsPath(), "utf8");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => {
      if (typeof item !== "object" || item === null) return false;
      const candidate = item;
      return typeof candidate.id === "string" && typeof candidate.name === "string" && typeof candidate.command === "string" && typeof candidate.cwd === "string";
    });
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("[dsh-ide] \u8BFB\u53D6\u8FD0\u884C\u914D\u7F6E\u5931\u8D25:", error);
    }
    return [];
  }
}
async function writeRunConfigs(configs) {
  await mkdir3(pluginDataDir(), { recursive: true });
  await writeFile2(runConfigsPath(), `${JSON.stringify(configs, null, 2)}
`, "utf8");
}

// src/host/routes/run.ts
function handleRunList(_request, response) {
  sendOk(response, { processes: listProcesses() });
}
async function handleRunStart(request, response) {
  try {
    const body = await readJsonBody(request);
    const configId = bodyString(body, "configId");
    const configs = await readRunConfigs();
    const config = configs.find((item) => item.id === configId);
    if (config === void 0) {
      sendError(response, "CONFIG_NOT_FOUND", `Run configuration not found: ${configId}`, 404);
      return;
    }
    const settings = await readSettings();
    sendOk(response, startRun(config, settings.terminalShell));
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
async function handleRunConfigs(_request, response) {
  try {
    sendOk(response, { configs: await readRunConfigs() });
  } catch (error) {
    console.error("[dsh-ide] \u8BFB\u53D6\u8FD0\u884C\u914D\u7F6E\u5931\u8D25:", error);
    sendError(response, "RUN_CONFIG_READ_FAILED", String(error), 500);
  }
}
async function handleRunConfigSave(request, response) {
  try {
    const body = await readJsonBody(request);
    const input = typeof body.config === "object" && body.config !== null ? body.config : {};
    const configs = await readRunConfigs();
    const id = bodyString(input, "id");
    const config = {
      id: id === "" ? `cfg-${Date.now().toString(36)}` : id,
      name: bodyString(input, "name").trim() || "Unnamed Configuration",
      command: bodyString(input, "command"),
      cwd: bodyString(input, "cwd"),
      lastExitCode: typeof input.lastExitCode === "number" ? input.lastExitCode : null
    };
    const next = configs.filter((item) => item.id !== config.id);
    next.push(config);
    await writeRunConfigs(next);
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
    const configs = await readRunConfigs();
    await writeRunConfigs(configs.filter((item) => item.id !== id));
    sendOk(response, null);
  } catch (error) {
    console.error("[dsh-ide] \u5220\u9664\u8FD0\u884C\u914D\u7F6E\u5931\u8D25:", error);
    sendError(response, "RUN_CONFIG_DELETE_FAILED", String(error), 500);
  }
}

// src/host/routes/settings.ts
import { execFile } from "node:child_process";
var DIAGNOSE_TIMEOUT_MS = 18e4;
function parseDiagnostics(text) {
  const results = [];
  const tscPattern = /^(.*?)\((\d+),(\d+)\):\s*(error|warning|info)\s+[^:]*:\s*(.*)$/u;
  const genericPattern = /^(.*?):(\d+):(\d+)\s*-\s*(error|warning|info)\s*:\s*(.*)$/u;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const tsc = tscPattern.exec(line);
    if (tsc !== null) {
      results.push({
        path: tsc[1],
        line: Number(tsc[2]),
        column: Number(tsc[3]),
        severity: tsc[4],
        message: tsc[5]
      });
      continue;
    }
    const generic = genericPattern.exec(line);
    if (generic !== null) {
      results.push({
        path: generic[1],
        line: Number(generic[2]),
        column: Number(generic[3]),
        severity: generic[4],
        message: generic[5]
      });
    }
  }
  return results;
}
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
async function handleDiagnose(request, response) {
  try {
    const body = await readJsonBody(request);
    const cwd = bodyString(body, "cwd");
    const settings = await readSettings();
    if (settings.diagnoseCommand.trim() === "") {
      sendError(response, "DIAGNOSE_NOT_CONFIGURED", "No diagnostic command is configured");
      return;
    }
    if (cwd === "") {
      sendError(response, "CWD_REQUIRED", "A working directory is required");
      return;
    }
    const shell = settings.terminalShell !== "" ? settings.terminalShell : process.env.SHELL ?? "/bin/sh";
    const output = await new Promise((resolve2, reject) => {
      execFile(
        shell,
        ["-lc", settings.diagnoseCommand],
        { cwd, timeout: DIAGNOSE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: "0" } },
        (error, stdout, stderr) => {
          const failure = error;
          if (failure !== null && (failure.code === "ENOENT" || failure.killed === true)) {
            reject(new Error(failure.message));
            return;
          }
          resolve2({ text: `${stdout}${stderr}`, code: typeof failure?.code === "number" ? failure.code : 0 });
        }
      );
    });
    sendOk(response, { diagnostics: parseDiagnostics(output.text), code: output.code, raw: output.text.slice(0, 2e4) });
  } catch (error) {
    console.error("[dsh-ide] \u8FD0\u884C\u8BCA\u65AD\u5931\u8D25:", error);
    sendError(response, "DIAGNOSE_FAILED", String(error), 500);
  }
}

// src/host/routes/index.ts
var API_PREFIX = "/dsh-ide/api";
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
  "POST /fs/delete": handleFsDelete,
  "POST /fs/trash-purge": handleFsTrashPurge,
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
  "POST /settings": handleSettingsSave,
  "POST /diagnose": handleDiagnose
};
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
      const handler = relative.startsWith("/asset/") ? handleAsset : ROUTES[`${request.method ?? "GET"} ${relative}`];
      const key = `${request.method ?? "GET"} ${relative}`;
      if (handler === void 0) {
        sendError(response, "NOT_FOUND", `Unknown endpoint ${key}`, 404);
        return;
      }
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
