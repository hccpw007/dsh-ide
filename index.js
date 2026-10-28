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
    sendError(response, "ASSET_NOT_FOUND", `\u672A\u77E5 chunk: ${requested}`, 404);
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
    sendError(response, "ASSET_MISSING", `chunk \u5C1A\u672A\u6784\u5EFA: ${name}`, 404);
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
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", "\u7F3A\u5C11\u5DE5\u4F5C\u533A\u6839");
  }
  if (!path3.isAbsolute(root)) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `\u5DE5\u4F5C\u533A\u6839\u4E0D\u662F\u7EDD\u5BF9\u8DEF\u5F84: ${root}`);
  }
  const cached = knownRoots.get(root);
  if (cached !== void 0) {
    const info2 = await stat(cached).catch(() => void 0);
    if (info2?.isDirectory() === true) return cached;
    knownRoots.delete(root);
  }
  const real = await realpath(root).catch(() => void 0);
  if (real === void 0) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `\u5DE5\u4F5C\u533A\u6839\u4E0D\u5B58\u5728: ${root}`);
  }
  const info = await stat(real).catch(() => void 0);
  if (info?.isDirectory() !== true) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `\u5DE5\u4F5C\u533A\u6839\u4E0D\u662F\u76EE\u5F55: ${root}`);
  }
  if (real === path3.parse(real).root || real === process.env.HOME) {
    throw new WorkspaceError("WORKSPACE_ROOT_INVALID", `\u5DE5\u4F5C\u533A\u6839\u8FC7\u4E8E\u5BBD\u6CDB: ${real}`);
  }
  knownRoots.set(root, real);
  return real;
}
async function resolveWithin(root, input) {
  const realRoot = await resolveRoot(root);
  if (typeof input !== "string" || input.includes("\0")) {
    throw new WorkspaceError("PATH_INVALID", "\u8DEF\u5F84\u4E0D\u5408\u6CD5");
  }
  const absolute = path3.isAbsolute(input) ? path3.normalize(input) : path3.resolve(realRoot, input);
  const direct = await realpath(absolute).catch(() => void 0);
  const resolved = direct ?? await nearestReal(absolute);
  if (!contains(realRoot, resolved)) {
    throw new WorkspaceError("PATH_OUTSIDE_WORKSPACE", `\u8DEF\u5F84\u8D8A\u51FA\u5DE5\u4F5C\u533A: ${input}`);
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
      throw new WorkspaceError("PATH_INVALID", `\u76EE\u6807\u5DF2\u4E0D\u5B58\u5728: ${resolved.absolute}`);
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
    super("\u6587\u4EF6\u5DF2\u88AB\u5916\u90E8\u4FEE\u6539");
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
    throw new WorkspaceError("PATH_INVALID", "\u4E0D\u80FD\u5220\u9664\u5DE5\u4F5C\u533A\u6839\u76EE\u5F55");
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
      sendError(response, "NOT_FOUND", `\u76EE\u6807\u4E0D\u5B58\u5728: ${target}`, 404);
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
    sendError(response, "QUERY_EMPTY", "\u67E5\u8BE2\u4E32\u4E3A\u7A7A");
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
      sendError(response, "REGEX_INVALID", `\u6B63\u5219\u8868\u8FBE\u5F0F\u4E0D\u5408\u6CD5: ${error.message}`);
      return;
    }
    respondFsError(response, error);
  }
}
function respondFsError(response, error) {
  if (error instanceof StaleFileError) {
    sendError(response, "STALE_FILE", "\u6587\u4EF6\u5DF2\u88AB\u5916\u90E8\u4FEE\u6539", 409);
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
    sendError(response, "ALREADY_EXISTS", "\u76EE\u6807\u5DF2\u5B58\u5728");
    return;
  }
  if (code === "EACCES" || code === "EPERM") {
    sendError(response, "PERMISSION_DENIED", "\u6CA1\u6709\u6743\u9650\u8BBF\u95EE\u8BE5\u8DEF\u5F84", 403);
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
var MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
var DEFAULT_TIMEOUT_MS = 3e4;
var GitError = class extends Error {
  /**
   * @param code 稳定错误码
   * @param message 诊断信息
   * @param stderr git 的原始错误输出
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
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn("git", argv, { cwd: repo, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
    } catch (error) {
      reject(new GitError("GIT_NOT_INSTALLED", `\u65E0\u6CD5\u542F\u52A8 git: ${String(error)}`));
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
      reject(new GitError("GIT_TIMEOUT", `git \u547D\u4EE4\u8D85\u65F6: git ${argv.join(" ")}`));
    }, timeoutMs);
    timer.unref?.();
    child.stdout.on("data", (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > MAX_OUTPUT_BYTES) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new GitError("GIT_OUTPUT_TOO_LARGE", "git \u8F93\u51FA\u8D85\u8FC7\u4E0A\u9650"));
        }
        return;
      }
      out.push(chunk);
    });
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new GitError("GIT_NOT_INSTALLED", `git \u542F\u52A8\u5931\u8D25: ${String(error)}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (code !== 0 && options.allowFailure !== true) {
        reject(new GitError("GIT_FAILED", stderr.trim() || `git ${argv[0]} \u5931\u8D25`, stderr));
        return;
      }
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}
async function resolveRepository(cwd) {
  try {
    const result = await execGit(cwd, ["rev-parse", "--show-toplevel"], { allowFailure: true });
    return result.code === 0 ? result.stdout.trim() : void 0;
  } catch (error) {
    console.error("[dsh-ide] \u63A2\u6D4B\u4ED3\u5E93\u5931\u8D25:", cwd, error);
    return void 0;
  }
}
function assertRef(value, label) {
  if (value === "" || value.startsWith("-") || /[\0\n\r]/.test(value)) {
    throw new GitError("GIT_FAILED", `${label} \u4E0D\u5408\u6CD5`);
  }
  return value;
}
async function detectOperationState(repo) {
  const gitDir = (await execGit(repo, ["rev-parse", "--absolute-git-dir"])).stdout.trim();
  const exists = async (relative) => {
    const info = await import("node:fs/promises").then((module) => module.stat(`${gitDir}/${relative}`).catch(() => void 0));
    return info !== void 0;
  };
  const [merging, rebasing, cherryPicking, reverting, conflicts] = await Promise.all([
    exists("MERGE_HEAD"),
    exists("rebase-merge").then(async (value) => value || exists("rebase-apply")),
    exists("CHERRY_PICK_HEAD"),
    exists("REVERT_HEAD"),
    execGit(repo, ["diff", "--name-only", "--diff-filter=U"], { allowFailure: true }).then(
      (result) => result.stdout.trim() !== ""
    )
  ]);
  return { merging, rebasing, cherryPicking, reverting, conflicts };
}

// src/host/routes/git-parse.ts
function readPaths(body) {
  const raw = body.paths;
  if (!Array.isArray(raw) || raw.length === 0) throw new GitError("GIT_FAILED", "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84");
  return raw.map((item) => assertRef(String(item), "\u8DEF\u5F84"));
}
function parseLog(text) {
  return text.split("").map((record) => record.trim()).filter((record) => record !== "").map((record) => parseCommit(record));
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
    refs: (fields[6] ?? "").split(",").map((item) => item.trim()).filter((item) => item !== ""),
    subject: fields[7] ?? "",
    body: fields[8] ?? ""
  };
}
function readTrack(track, label) {
  if (track === void 0) return 0;
  const match = new RegExp(`${label} (\\d+)`).exec(track);
  return match === null ? 0 : Number(match[1]);
}

// src/host/routes/git-read.ts
var READ_METHODS = {
  /** 解析工作区所属仓库；不是仓库时返回 isRepo: false。 */
  async repos(repo, body) {
    const cwd = bodyString(body, "cwd", repo);
    const root = await resolveRepository(cwd);
    return root === void 0 ? { isRepo: false, cwd } : { isRepo: true, cwd: root };
  },
  /** 工作区状态：`--porcelain=v1 -z` 解析成四组。 */
  async status(repo) {
    const result = await execGit(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    const parts = result.stdout.split("\0");
    const staged = [];
    const unstaged = [];
    const untracked = [];
    const conflicted = [];
    for (let index = 0; index < parts.length; index += 1) {
      const record = parts[index];
      if (record === void 0 || record.length < 4) continue;
      const indexStatus = record[0];
      const worktreeStatus = record[1];
      const filePath = record.slice(3);
      if (indexStatus === "R" || indexStatus === "C") index += 1;
      if (indexStatus === "U" || worktreeStatus === "U" || indexStatus === "A" && worktreeStatus === "A" || indexStatus === "D" && worktreeStatus === "D") {
        conflicted.push({ path: filePath, indexStatus, worktreeStatus });
      } else {
        if (indexStatus !== " " && indexStatus !== "?") staged.push({ path: filePath, indexStatus, worktreeStatus });
        if (worktreeStatus !== " " && worktreeStatus !== "?") unstaged.push({ path: filePath, indexStatus, worktreeStatus });
      }
      if (indexStatus === "?") untracked.push({ path: filePath, indexStatus, worktreeStatus });
    }
    const branch = await execGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"], { allowFailure: true });
    return {
      branch: branch.code === 0 ? branch.stdout.trim() : "",
      staged,
      unstaged,
      untracked,
      conflicted
    };
  },
  /** 工作区文件与 HEAD 的差异补丁。 */
  async diff(repo, body) {
    const target = assertRef(bodyString(body, "path"), "\u8DEF\u5F84");
    const staged = bodyString(body, "staged") === "true";
    const args = ["diff", "--no-color", "-U", String(Math.max(0, Number(body.context ?? 3) || 3))];
    if (staged) args.push("--cached");
    args.push("--", target);
    return { patch: (await execGit(repo, args, { allowFailure: true })).stdout };
  },
  /** 两个 ref 之间的差异补丁（可限定文件）。 */
  async diffRefs(repo, body) {
    const from = assertRef(bodyString(body, "from"), "\u8D77\u59CB ref");
    const to = assertRef(bodyString(body, "to"), "\u76EE\u6807 ref");
    const target = bodyString(body, "path");
    const args = ["diff", "--no-color", "-U", String(Math.max(0, Number(body.context ?? 3) || 3)), from, to];
    if (target !== "") args.push("--", assertRef(target, "\u8DEF\u5F84"));
    return { patch: (await execGit(repo, args, { allowFailure: true })).stdout };
  },
  /** 两个工作区文件的直接对比。 */
  async diffFiles(repo, body) {
    const left = assertRef(bodyString(body, "left"), "\u5DE6\u4FA7\u8DEF\u5F84");
    const right = assertRef(bodyString(body, "right"), "\u53F3\u4FA7\u8DEF\u5F84");
    const result = await execGit(repo, ["diff", "--no-color", "--no-index", "-U", "3", "--", left, right], { allowFailure: true });
    return { patch: result.stdout };
  },
  /** 提交历史分页。 */
  async log(repo, body) {
    const limit = Math.min(Math.max(Number(body.limit ?? 120) || 120, 1), 500);
    const skip = Math.max(Number(body.skip ?? 0) || 0, 0);
    const branch = bodyString(body, "branch");
    const args = [
      "log",
      `--max-count=${String(limit)}`,
      `--skip=${String(skip)}`,
      "--date=iso-strict",
      "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%P%x1f%D%x1f%s%x1e"
    ];
    if (branch !== "") args.push(assertRef(branch, "\u5206\u652F"));
    const result = await execGit(repo, [...args, "--"], { allowFailure: true });
    return { commits: parseLog(result.stdout) };
  },
  /** 单个提交的详情与逐文件统计。 */
  async show(repo, body) {
    const hash = assertRef(bodyString(body, "hash"), "\u63D0\u4EA4");
    const meta = await execGit(repo, [
      "show",
      "--no-patch",
      "--date=iso-strict",
      "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%P%x1f%D%x1f%s%x1f%b",
      hash
    ]);
    const files = await execGit(repo, ["show", "--numstat", "--format=", hash]);
    return {
      commit: parseCommit(meta.stdout),
      files: files.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "").map((line) => {
        const [added, removed, ...rest] = line.split("	");
        return { added, removed, path: rest.join("	") };
      })
    };
  },
  /** 某个提交对某个文件的补丁。 */
  async showFile(repo, body) {
    const hash = assertRef(bodyString(body, "hash"), "\u63D0\u4EA4");
    const target = assertRef(bodyString(body, "path"), "\u8DEF\u5F84");
    const result = await execGit(repo, ["show", "--no-color", "-U", "3", `${hash}`, "--", target], { allowFailure: true });
    return { patch: result.stdout };
  },
  /** 某个 ref 里某个文件的完整文本；文件不存在时返回空串。 */
  async showFileText(repo, body) {
    const hash = assertRef(bodyString(body, "hash"), "\u63D0\u4EA4");
    const target = bodyString(body, "path");
    if (target === "") return { text: "" };
    const result = await execGit(repo, ["show", `${hash}:${assertRef(target, "\u8DEF\u5F84")}`], { allowFailure: true });
    return { text: result.code === 0 ? result.stdout : "" };
  },
  /** 索引区里某个文件的完整文本（用于暂存差异的右侧）。 */
  async indexFileText(repo, body) {
    const target = assertRef(bodyString(body, "path"), "\u8DEF\u5F84");
    const result = await execGit(repo, ["show", `:${target}`], { allowFailure: true });
    return { text: result.code === 0 ? result.stdout : "" };
  },
  /** 分支列表（含 ahead/behind）。 */
  async branches(repo) {
    const local = await execGit(repo, [
      "for-each-ref",
      "--format=%(refname:short)%1f%(HEAD)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(objectname:short)%1f%(subject)",
      "refs/heads"
    ]);
    const remote = await execGit(repo, [
      "for-each-ref",
      "--format=%(refname:short)%1f%(objectname:short)%1f%(subject)",
      "refs/remotes"
    ]);
    const tags = await execGit(repo, ["for-each-ref", "--format=%(refname:short)%1f%(objectname:short)", "refs/tags"]);
    return {
      local: local.stdout.split("\n").filter((line) => line.trim() !== "").map((line) => {
        const [name, head, upstream, track, hash, ...subject] = line.split("");
        return {
          name,
          isHead: head === "*",
          upstream,
          ahead: readTrack(track, "ahead"),
          behind: readTrack(track, "behind"),
          hash,
          subject: subject.join(" ")
        };
      }),
      remote: remote.stdout.split("\n").filter((line) => line.trim() !== "").map((line) => {
        const [name, hash, ...subject] = line.split("");
        return { name, hash, subject: subject.join(" ") };
      }),
      tags: tags.stdout.split("\n").filter((line) => line.trim() !== "").map((line) => {
        const [name, hash] = line.split("");
        return { name, hash };
      })
    };
  },
  /** 仓库当前的多步操作状态，供客户端置灰相关动作。 */
  async state(repo) {
    return detectOperationState(repo);
  }
};

// src/host/routes/git-write.ts
var WRITE_METHODS = {
  /** 暂存文件。 */
  async stage(repo, body) {
    const paths = readPaths(body);
    await execGit(repo, ["add", "--", ...paths]);
    return null;
  },
  /** 取消暂存；未跟踪文件走 rm --cached。 */
  async unstage(repo, body) {
    const paths = readPaths(body);
    await execGit(repo, ["reset", "HEAD", "--", ...paths], { allowFailure: true });
    return null;
  },
  /** 丢弃工作区改动（不可逆，客户端必须先确认）。 */
  async discard(repo, body) {
    const paths = readPaths(body);
    const untracked = bodyString(body, "untracked") === "true";
    if (untracked) {
      await execGit(repo, ["clean", "-fd", "--", ...paths]);
    } else {
      await execGit(repo, ["restore", "--", ...paths]);
    }
    return null;
  },
  /** 提交暂存区。 */
  async commit(repo, body) {
    const message = bodyString(body, "message");
    const amend = bodyString(body, "amend") === "true";
    if (message.trim() === "") throw new GitError("GIT_FAILED", "\u63D0\u4EA4\u4FE1\u606F\u4E0D\u80FD\u4E3A\u7A7A");
    const args = ["commit", "-m", message];
    if (amend) args.push("--amend");
    const result = await execGit(repo, args);
    return { output: result.stdout };
  },
  /** 检出分支或提交。 */
  async checkout(repo, body) {
    const target = assertRef(bodyString(body, "ref"), "\u76EE\u6807 ref");
    await execGit(repo, ["checkout", target]);
    return null;
  },
  /** 新建并切出分支。 */
  async createBranch(repo, body) {
    const name = assertRef(bodyString(body, "name"), "\u5206\u652F\u540D");
    const start = bodyString(body, "start");
    const args = ["checkout", "-b", name];
    if (start !== "") args.push(assertRef(start, "\u8D77\u70B9"));
    await execGit(repo, args);
    return null;
  },
  /** 删除分支。 */
  async deleteBranch(repo, body) {
    const name = assertRef(bodyString(body, "name"), "\u5206\u652F\u540D");
    const force = bodyString(body, "force") === "true";
    await execGit(repo, ["branch", force ? "-D" : "-d", name]);
    return null;
  },
  /** 重命名分支。 */
  async renameBranch(repo, body) {
    await execGit(repo, ["branch", "-m", assertRef(bodyString(body, "from"), "\u65E7\u5206\u652F\u540D"), assertRef(bodyString(body, "to"), "\u65B0\u5206\u652F\u540D")]);
    return null;
  },
  /** 合并分支到当前分支。 */
  async merge(repo, body) {
    await execGit(repo, ["merge", "--no-edit", assertRef(bodyString(body, "ref"), "\u76EE\u6807 ref")]);
    return null;
  },
  /** 变基到指定 ref。 */
  async rebase(repo, body) {
    await execGit(repo, ["rebase", assertRef(bodyString(body, "ref"), "\u76EE\u6807 ref")]);
    return null;
  },
  /** cherry-pick 单个提交。 */
  async cherryPick(repo, body) {
    await execGit(repo, ["cherry-pick", assertRef(bodyString(body, "hash"), "\u63D0\u4EA4")]);
    return null;
  },
  /** 重置到指定 ref。 */
  async reset(repo, body) {
    const mode = bodyString(body, "mode", "mixed");
    if (mode !== "soft" && mode !== "mixed" && mode !== "hard") {
      throw new GitError("GIT_FAILED", `\u4E0D\u652F\u6301\u7684 reset \u6A21\u5F0F: ${mode}`);
    }
    await execGit(repo, ["reset", `--${mode}`, assertRef(bodyString(body, "ref", "HEAD"), "\u76EE\u6807 ref")]);
    return null;
  },
  /** 打标签。 */
  async createTag(repo, body) {
    const name = assertRef(bodyString(body, "name"), "\u6807\u7B7E\u540D");
    const ref = bodyString(body, "ref");
    await execGit(repo, ref === "" ? ["tag", name] : ["tag", name, assertRef(ref, "\u76EE\u6807 ref")]);
    return null;
  },
  /** 删除标签。 */
  async deleteTag(repo, body) {
    await execGit(repo, ["tag", "-d", assertRef(bodyString(body, "name"), "\u6807\u7B7E\u540D")]);
    return null;
  },
  /** 暂存当前改动。 */
  async stash(repo, body) {
    const message = bodyString(body, "message");
    const args = ["stash", "push"];
    if (message !== "") args.push("-m", message);
    await execGit(repo, args);
    return null;
  },
  /** 暂存列表。 */
  async stashList(repo) {
    const result = await execGit(repo, ["stash", "list", "--format=%gd%1f%s"]);
    return {
      entries: result.stdout.split("\n").filter((line) => line.trim() !== "").map((line) => {
        const [ref, ...subject] = line.split("");
        return { ref, subject: subject.join(" ") };
      })
    };
  },
  /** 应用 / 弹出 / 删除 stash。 */
  async stashApply(repo, body) {
    const action = bodyString(body, "action", "apply");
    const ref = assertRef(bodyString(body, "ref"), "stash \u5F15\u7528");
    const verb = action === "pop" ? "pop" : action === "drop" ? "drop" : "apply";
    await execGit(repo, ["stash", verb, ref]);
    return null;
  },
  /** 拉取。 */
  async fetch(repo) {
    const result = await execGit(repo, ["fetch", "--all", "--prune"], { timeoutMs: 18e4 });
    return { output: result.stderr };
  },
  /** 拉取并合并。 */
  async pull(repo) {
    const result = await execGit(repo, ["pull", "--no-edit"], { timeoutMs: 18e4 });
    return { output: result.stdout + result.stderr };
  },
  /** 推送。 */
  async push(repo, body) {
    const force = bodyString(body, "force") === "true";
    const setUpstream = bodyString(body, "setUpstream") === "true";
    const args = ["push"];
    if (force) args.push("--force-with-lease");
    if (setUpstream) args.push("-u");
    args.push("origin", "HEAD");
    const result = await execGit(repo, args, { timeoutMs: 18e4 });
    return { output: result.stderr };
  },
  /** 合并冲突时的三选一保留（我方 / 对方 / 双方）。 */
  async resolveConflict(repo, body) {
    const target = assertRef(bodyString(body, "path"), "\u8DEF\u5F84");
    const side = bodyString(body, "side", "ours");
    const flag = side === "theirs" ? "--theirs" : "--ours";
    await execGit(repo, ["checkout", flag, "--", target]);
    await execGit(repo, ["add", "--", target]);
    return null;
  }
};

// src/host/routes/git.ts
var METHODS = {
  ...READ_METHODS,
  ...WRITE_METHODS
};
async function handleGitExec(request, response) {
  try {
    const body = await readJsonBody(request);
    const method = bodyString(body, "method");
    const cwd = bodyString(body, "cwd");
    if (cwd === "") {
      sendError(response, "CWD_REQUIRED", "\u7F3A\u5C11\u5DE5\u4F5C\u76EE\u5F55");
      return;
    }
    const run = METHODS[method];
    if (run === void 0) {
      sendError(response, "METHOD_UNKNOWN", `\u672A\u77E5\u7684 git \u65B9\u6CD5: ${method}`);
      return;
    }
    const repo = await resolveRepository(cwd);
    if (repo === void 0) {
      sendError(response, "GIT_NOT_REPOSITORY", "\u5DE5\u4F5C\u76EE\u5F55\u4E0D\u662F git \u4ED3\u5E93", 409);
      return;
    }
    sendOk(response, await serialized(repo, () => run(repo, body)));
  } catch (error) {
    if (error instanceof GitError) {
      const status = error.code === "GIT_NOT_REPOSITORY" ? 409 : 400;
      sendError(response, error.code, error.stderr.trim() === "" ? error.message : error.stderr.trim(), status);
      return;
    }
    console.error("[dsh-ide] git \u8C03\u7528\u5931\u8D25:", error);
    sendError(response, "GIT_FAILED", String(error), 500);
  }
}

// src/host/routes/ping.ts
function handlePing(request, response) {
  if (!isTrustedRequest(request)) {
    sendJson(response, 403, { ok: false, error: { code: "FORBIDDEN", message: "\u8BF7\u6C42\u6765\u6E90\u4E0D\u53EF\u4FE1" } });
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
[dsh-ide] \u542F\u52A8\u5931\u8D25: ${error.message}
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
    const suffix = signal === null ? `\u9000\u51FA\u7801 ${String(code)}` : `\u88AB\u4FE1\u53F7 ${signal} \u7EC8\u6B62`;
    appendOutput(id, `
[dsh-ide] \u8FDB\u7A0B\u7ED3\u675F\uFF08${suffix}\uFF09
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
import { mkdir as mkdir3, readFile as readFile4, writeFile as writeFile2 } from "node:fs/promises";
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
  recentFiles: []
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
    recentFiles: recent
  };
}
async function readSettings() {
  try {
    const text = await readFile4(settingsPath(), "utf8");
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
    const text = await readFile4(runConfigsPath(), "utf8");
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
      sendError(response, "CONFIG_NOT_FOUND", `\u627E\u4E0D\u5230\u8FD0\u884C\u914D\u7F6E: ${configId}`, 404);
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
      name: bodyString(input, "name").trim() || "\u672A\u547D\u540D\u914D\u7F6E",
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
      sendError(response, "DIAGNOSE_NOT_CONFIGURED", "\u5C1A\u672A\u914D\u7F6E\u8BCA\u65AD\u547D\u4EE4");
      return;
    }
    if (cwd === "") {
      sendError(response, "CWD_REQUIRED", "\u7F3A\u5C11\u5DE5\u4F5C\u76EE\u5F55");
      return;
    }
    const shell = settings.terminalShell !== "" ? settings.terminalShell : process.env.SHELL ?? "/bin/sh";
    const output = await new Promise((resolve, reject) => {
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
          resolve({ text: `${stdout}${stderr}`, code: typeof failure?.code === "number" ? failure.code : 0 });
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
        sendJson(response, 403, { ok: false, error: { code: "FORBIDDEN", message: "\u8BF7\u6C42\u6765\u6E90\u4E0D\u53EF\u4FE1" } });
        return;
      }
      const relative = routePathOf(request);
      const handler = relative.startsWith("/asset/") ? handleAsset : ROUTES[`${request.method ?? "GET"} ${relative}`];
      const key = `${request.method ?? "GET"} ${relative}`;
      if (handler === void 0) {
        sendError(response, "NOT_FOUND", `\u672A\u77E5\u63A5\u53E3 ${key}`, 404);
        return;
      }
      try {
        const result = handler(request, response);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error("[dsh-ide] \u8DEF\u7531\u5904\u7406\u5931\u8D25:", key, error);
            if (!response.headersSent) sendError(response, "INTERNAL", "\u5185\u90E8\u9519\u8BEF", 500);
          });
        }
      } catch (error) {
        console.error("[dsh-ide] \u8DEF\u7531\u5904\u7406\u5931\u8D25:", key, error);
        if (!response.headersSent) sendError(response, "INTERNAL", "\u5185\u90E8\u9519\u8BEF", 500);
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
