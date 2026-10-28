/* 本文件由 build.ts 生成，请勿手工修改。 */
window.__ModuleLoader__.load({
  id: "dsh-ide",
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
    "use strict";
    var __create = Object.create;
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __getProtoOf = Object.getPrototypeOf;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
      // If the importer is in node compatibility mode or this is not an ESM
      // file that has been converted to a CommonJS file using a Babel-
      // compatible transform (i.e. "__esModule" has not been set), then set
      // "default" to the CommonJS "module.exports" for node compatibility.
      isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
      mod
    ));
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

    // src/client/index.tsx
    var index_exports = {};
    __export(index_exports, {
      default: () => index_default
    });
    module.exports = __toCommonJS(index_exports);
    var import_react8 = __toESM(require("react"), 1);

    // .build/styles.css
    var styles_default = "*,:after,:before{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-pan-x: ;--tw-pan-y: ;--tw-pinch-zoom: ;--tw-scroll-snap-strictness:proximity;--tw-gradient-from-position: ;--tw-gradient-via-position: ;--tw-gradient-to-position: ;--tw-ordinal: ;--tw-slashed-zero: ;--tw-numeric-figure: ;--tw-numeric-spacing: ;--tw-numeric-fraction: ;--tw-ring-inset: ;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgba(59,130,246,.5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;--tw-blur: ;--tw-brightness: ;--tw-contrast: ;--tw-grayscale: ;--tw-hue-rotate: ;--tw-invert: ;--tw-saturate: ;--tw-sepia: ;--tw-drop-shadow: ;--tw-backdrop-blur: ;--tw-backdrop-brightness: ;--tw-backdrop-contrast: ;--tw-backdrop-grayscale: ;--tw-backdrop-hue-rotate: ;--tw-backdrop-invert: ;--tw-backdrop-opacity: ;--tw-backdrop-saturate: ;--tw-backdrop-sepia: ;--tw-contain-size: ;--tw-contain-layout: ;--tw-contain-paint: ;--tw-contain-style: }::backdrop{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-pan-x: ;--tw-pan-y: ;--tw-pinch-zoom: ;--tw-scroll-snap-strictness:proximity;--tw-gradient-from-position: ;--tw-gradient-via-position: ;--tw-gradient-to-position: ;--tw-ordinal: ;--tw-slashed-zero: ;--tw-numeric-figure: ;--tw-numeric-spacing: ;--tw-numeric-fraction: ;--tw-ring-inset: ;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgba(59,130,246,.5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;--tw-blur: ;--tw-brightness: ;--tw-contrast: ;--tw-grayscale: ;--tw-hue-rotate: ;--tw-invert: ;--tw-saturate: ;--tw-sepia: ;--tw-drop-shadow: ;--tw-backdrop-blur: ;--tw-backdrop-brightness: ;--tw-backdrop-contrast: ;--tw-backdrop-grayscale: ;--tw-backdrop-hue-rotate: ;--tw-backdrop-invert: ;--tw-backdrop-opacity: ;--tw-backdrop-saturate: ;--tw-backdrop-sepia: ;--tw-contain-size: ;--tw-contain-layout: ;--tw-contain-paint: ;--tw-contain-style: }.mt-1{margin-top:.25rem}.flex{display:flex}.h-1{height:.25rem}.h-6{height:1.5rem}.h-8{height:2rem}.h-9{height:2.25rem}.min-h-0{min-height:0}.w-1{width:.25rem}.w-11{width:2.75rem}.w-9{width:2.25rem}.min-w-0{min-width:0}.max-w-sm{max-width:24rem}.flex-1{flex:1 1 0%}.shrink-0{flex-shrink:0}.cursor-col-resize{cursor:col-resize}.cursor-row-resize{cursor:row-resize}.flex-col{flex-direction:column}.items-center{align-items:center}.justify-center{justify-content:center}.gap-1{gap:.25rem}.gap-3{gap:.75rem}.overflow-auto{overflow:auto}.rounded{border-radius:.25rem}.rounded-md{border-radius:.375rem}.border{border-width:1px}.border-b{border-bottom-width:1px}.border-r{border-right-width:1px}.border-t{border-top-width:1px}.border-line1{border-color:var(--dsw-alias-border-l1)}.border-line4{border-color:var(--dsw-alias-border-l4)}.border-transparent{border-color:transparent}.bg-base{background-color:var(--dsw-alias-bg-base)}.bg-layer1{background-color:var(--dsw-alias-bg-layer-1)}.bg-layer2{background-color:var(--dsw-alias-bg-layer-2)}.bg-line1{background-color:var(--dsw-alias-border-l1)}.p-3{padding:.75rem}.p-6{padding:1.5rem}.px-2{padding-left:.5rem;padding-right:.5rem}.px-3{padding-left:.75rem;padding-right:.75rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.text-center{text-align:center}.text-sm{font-size:.875rem;line-height:1.25rem}.text-xs{font-size:.75rem;line-height:1rem}.text-primary{color:var(--dsw-alias-label-primary)}.text-secondary{color:var(--dsw-alias-label-secondary)}.filter{filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}.transition-colors{transition-property:color,background-color,border-color,text-decoration-color,fill,stroke;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:.15s}.dsh-ide-root{color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}:where(.dsh-ide-root) :where(*,:before,:after){box-sizing:border-box;border-style:solid;border-width:0}:where(.dsh-ide-root) :where(h1,h2,h3,h4,h5,h6,p,ul,ol){margin:0;padding:0}:where(.dsh-ide-root) :where(ul,ol){list-style:none}.dsh-ide-root{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base)}.hover\\:bg-layer2:hover{background-color:var(--dsw-alias-bg-layer-2)}.hover\\:bg-line4:hover{background-color:var(--dsw-alias-border-l4)}.hover\\:text-primary:hover{color:var(--dsw-alias-label-primary)}";

    // src/common/locale.ts
    function prefixFeatureLocales(featureId, locales) {
      const result = {};
      for (const [locale, dictionary] of Object.entries(locales)) {
        const prefixed = {};
        for (const [key, value] of Object.entries(dictionary)) {
          prefixed[`${featureId}.${key}`] = value;
        }
        result[locale] = prefixed;
      }
      return result;
    }
    function mergeDictionaries(...sources) {
      const result = {};
      for (const source of sources) {
        for (const [locale, dictionary] of Object.entries(source)) {
          result[locale] = { ...result[locale], ...dictionary };
        }
      }
      return result;
    }
    function collectFeatureLocales(features) {
      return mergeDictionaries(
        ...features.map((feature) => prefixFeatureLocales(feature.id, feature.locales))
      );
    }

    // src/client/features/index.ts
    var featureList = [];

    // src/client/shell/registry.ts
    var DEFAULT_ORDER = 100;
    var REQUIRED_FIELD = {
      toolWindow: "view",
      bottomPanel: "view",
      editorTab: "editor",
      statusBar: "status",
      service: "host"
    };
    var SLOTS = ["toolWindow", "bottomPanel", "editorTab", "statusBar", "service"];
    function isIdeFeature(value) {
      if (typeof value !== "object" || value === null) return false;
      const candidate = value;
      if (typeof candidate.id !== "string" || candidate.id === "") return false;
      if (typeof candidate.locales !== "object" || candidate.locales === null) return false;
      if (typeof candidate.slot !== "string") return false;
      if (!SLOTS.includes(candidate.slot)) return false;
      const slot = candidate.slot;
      const required = candidate[REQUIRED_FIELD[slot]];
      return typeof required === "object" || typeof required === "function";
    }
    function createIdeRegistry(list) {
      const seen = /* @__PURE__ */ new Set();
      const accepted = [];
      for (const item of list) {
        if (!isIdeFeature(item)) {
          console.error("[dsh-ide] feature \u5B9A\u4E49\u4E0D\u5408\u6CD5\uFF0C\u5DF2\u8DF3\u8FC7:", item);
          continue;
        }
        if (seen.has(item.id)) {
          console.error("[dsh-ide] feature id \u91CD\u590D\uFF0C\u53EA\u4FDD\u7559\u7B2C\u4E00\u4E2A:", item.id);
          continue;
        }
        seen.add(item.id);
        accepted.push(item);
      }
      accepted.sort((a, b) => (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER));
      const groups = {
        toolWindow: [],
        bottomPanel: [],
        editorTab: [],
        statusBar: [],
        service: []
      };
      for (const feature of accepted) groups[feature.slot].push(feature);
      return {
        list: accepted,
        bySlot(slot) {
          return groups[slot];
        }
      };
    }

    // src/client/features/registry.ts
    var registry = createIdeRegistry(featureList);
    var toolWindowFeatures = registry.bySlot("toolWindow");
    var bottomPanelFeatures = registry.bySlot("bottomPanel");

    // src/client/shell/Workbench.tsx
    var import_react7 = __toESM(require("react"), 1);

    // src/client/shell/BottomPanel.tsx
    var import_react = __toESM(require("react"), 1);

    // src/common/cn.ts
    function cn(...classes) {
      return classes.filter(Boolean).join(" ");
    }

    // src/client/shell/BottomPanel.tsx
    function BottomPanel({
      features,
      activeId,
      height,
      onSelect,
      sessionId,
      t
    }) {
      const active = features.find((feature) => feature.id === activeId) ?? features[0];
      const ActiveView = active?.view;
      return /* @__PURE__ */ import_react.default.createElement("div", { className: "flex min-h-0 flex-col border-t border-line1 bg-layer1", style: { height } }, /* @__PURE__ */ import_react.default.createElement("div", { className: "flex h-8 shrink-0 items-center gap-1 border-b border-line1 px-2" }, features.map((feature) => {
        const selected = feature.id === active?.id;
        return /* @__PURE__ */ import_react.default.createElement(
          "button",
          {
            key: feature.id,
            type: "button",
            "aria-pressed": selected,
            onClick: () => onSelect(feature.id),
            className: cn(
              "rounded px-2 py-1 text-xs transition-colors",
              selected ? "bg-layer2 text-primary" : "text-secondary hover:bg-layer2 hover:text-primary"
            )
          },
          t(`${feature.id}.title`)
        );
      }), features.length === 0 && /* @__PURE__ */ import_react.default.createElement("span", { className: "text-xs text-secondary" }, t("shell.bottomPanelTitle"))), /* @__PURE__ */ import_react.default.createElement("div", { className: "min-h-0 flex-1 overflow-auto" }, ActiveView !== void 0 && active !== void 0 ? /* @__PURE__ */ import_react.default.createElement(ActiveView, { t: boundTranslate(t, active.id), sessionId }) : /* @__PURE__ */ import_react.default.createElement("div", { className: "p-3 text-xs text-secondary" }, t("shell.emptyBottomPanel"))));
    }
    function boundTranslate(t, featureId) {
      return (key) => t(`${featureId}.${key}`);
    }

    // src/client/shell/EditorArea.tsx
    var import_react2 = __toESM(require("react"), 1);
    function EditorArea({ t }) {
      return /* @__PURE__ */ import_react2.default.createElement("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col bg-base" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "flex h-9 shrink-0 items-center border-b border-line1 px-3 text-xs text-secondary" }, t("shell.editorTitle")), /* @__PURE__ */ import_react2.default.createElement("div", { className: "flex flex-1 items-center justify-center p-6" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "max-w-sm text-center" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "text-sm text-primary" }, t("shell.emptyEditor")), /* @__PURE__ */ import_react2.default.createElement("div", { className: "mt-1 text-xs text-secondary" }, t("shell.emptyEditorHint")))));
    }

    // src/client/shell/SplitHandle.tsx
    var import_react3 = __toESM(require("react"), 1);
    function SplitHandle({ orientation, current, onResize }) {
      const dragging = (0, import_react3.useRef)(false);
      const origin = (0, import_react3.useRef)({ pointer: 0, size: 0 });
      const handlePointerDown = (0, import_react3.useCallback)(
        (event) => {
          event.preventDefault();
          dragging.current = true;
          origin.current = {
            pointer: orientation === "vertical" ? event.clientX : event.clientY,
            size: current()
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        },
        [orientation, current]
      );
      const handlePointerMove = (0, import_react3.useCallback)(
        (event) => {
          if (!dragging.current) return;
          const pointer = orientation === "vertical" ? event.clientX : event.clientY;
          const delta = pointer - origin.current.pointer;
          onResize(origin.current.size + (orientation === "vertical" ? delta : -delta));
        },
        [orientation, onResize]
      );
      const handlePointerUp = (0, import_react3.useCallback)((event) => {
        if (!dragging.current) return;
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }, []);
      return /* @__PURE__ */ import_react3.default.createElement(
        "div",
        {
          role: "separator",
          "aria-orientation": orientation,
          className: cn(
            "shrink-0 bg-line1 transition-colors hover:bg-line4",
            orientation === "vertical" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
          ),
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: handlePointerUp
        }
      );
    }

    // src/client/shell/StatusBar.tsx
    var import_react4 = __toESM(require("react"), 1);
    function StatusBar({ sessionId, surface, t }) {
      return /* @__PURE__ */ import_react4.default.createElement("div", { className: "flex h-6 shrink-0 items-center gap-3 border-t border-line1 bg-layer1 px-3 text-xs text-secondary" }, /* @__PURE__ */ import_react4.default.createElement("span", { className: "text-primary" }, t("shell.statusLabel")), /* @__PURE__ */ import_react4.default.createElement("span", null, surface === "main" ? t("shell.surfaceMain") : t("shell.surfaceSidebar")), /* @__PURE__ */ import_react4.default.createElement("span", { className: "flex-1" }), /* @__PURE__ */ import_react4.default.createElement("span", null, sessionId === "" ? t("shell.noSession") : sessionId.slice(0, 8)));
    }

    // src/client/shell/ToolWindowBar.tsx
    var import_react5 = __toESM(require("react"), 1);
    function ToolWindowBar({ features, activeId, onToggle, t }) {
      return /* @__PURE__ */ import_react5.default.createElement("div", { className: "flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line1 bg-layer1 py-2" }, features.map((feature) => {
        const active = feature.id === activeId;
        return /* @__PURE__ */ import_react5.default.createElement(
          "button",
          {
            key: feature.id,
            type: "button",
            title: t(`${feature.id}.title`),
            "aria-pressed": active,
            onClick: () => onToggle(feature.id),
            className: cn(
              "flex h-9 w-9 items-center justify-center rounded-md border text-xs transition-colors",
              active ? "border-line4 bg-layer2 text-primary" : "border-transparent text-secondary hover:bg-layer2 hover:text-primary"
            )
          },
          feature.icon?.() ?? feature.id.slice(0, 1).toUpperCase()
        );
      }));
    }

    // src/client/shell/use-workbench-layout.ts
    var import_react6 = require("react");
    var MIN_TOOL_WINDOW_WIDTH = 180;
    var MAX_TOOL_WINDOW_WIDTH = 560;
    var MIN_BOTTOM_PANEL_HEIGHT = 120;
    var MAX_BOTTOM_PANEL_HEIGHT = 520;
    var DEFAULT_LAYOUT = {
      toolWindowWidth: 260,
      toolWindowActive: null,
      bottomPanelHeight: 200,
      // 默认展开底部面板：首次打开工作台就能看到完整的四区结构，而不是一块空的中区
      bottomPanelOpen: true,
      bottomPanelActive: null
    };
    var STORAGE_PREFIX = "dsh-ide.layout.v1.";
    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }
    function loadLayout(sessionId) {
      if (sessionId === "") return DEFAULT_LAYOUT;
      try {
        const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`);
        if (raw === null) return DEFAULT_LAYOUT;
        const parsed = JSON.parse(raw);
        const activeId = parsed.toolWindowActive;
        const bottomId = parsed.bottomPanelActive;
        return {
          toolWindowWidth: clamp(
            typeof parsed.toolWindowWidth === "number" ? parsed.toolWindowWidth : DEFAULT_LAYOUT.toolWindowWidth,
            MIN_TOOL_WINDOW_WIDTH,
            MAX_TOOL_WINDOW_WIDTH
          ),
          toolWindowActive: typeof activeId === "string" ? activeId : null,
          bottomPanelHeight: clamp(
            typeof parsed.bottomPanelHeight === "number" ? parsed.bottomPanelHeight : DEFAULT_LAYOUT.bottomPanelHeight,
            MIN_BOTTOM_PANEL_HEIGHT,
            MAX_BOTTOM_PANEL_HEIGHT
          ),
          bottomPanelOpen: parsed.bottomPanelOpen === true,
          bottomPanelActive: typeof bottomId === "string" ? bottomId : null
        };
      } catch (error) {
        console.error("[dsh-ide] \u8BFB\u53D6\u5DE5\u4F5C\u53F0\u5E03\u5C40\u5931\u8D25\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u5E03\u5C40:", error);
        return DEFAULT_LAYOUT;
      }
    }
    function saveLayout(sessionId, layout) {
      if (sessionId === "") return;
      try {
        window.localStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(layout));
      } catch (error) {
        console.error("[dsh-ide] \u4FDD\u5B58\u5DE5\u4F5C\u53F0\u5E03\u5C40\u5931\u8D25:", error);
      }
    }
    function clampLayoutSize(field, value) {
      return field === "toolWindowWidth" ? clamp(value, MIN_TOOL_WINDOW_WIDTH, MAX_TOOL_WINDOW_WIDTH) : clamp(value, MIN_BOTTOM_PANEL_HEIGHT, MAX_BOTTOM_PANEL_HEIGHT);
    }
    function useWorkbenchLayout(sessionId) {
      const [layout, setLayout] = (0, import_react6.useState)(() => loadLayout(sessionId));
      (0, import_react6.useEffect)(() => {
        setLayout(loadLayout(sessionId));
      }, [sessionId]);
      (0, import_react6.useEffect)(() => {
        saveLayout(sessionId, layout);
      }, [sessionId, layout]);
      const update = (0, import_react6.useCallback)((patch) => {
        setLayout((previous) => ({ ...previous, ...patch }));
      }, []);
      return { layout, update };
    }

    // src/client/shell/Workbench.tsx
    function Workbench({ sessionId, t, surface = "main" }) {
      const { layout, update } = useWorkbenchLayout(sessionId);
      const activeToolWindow = toolWindowFeatures.find((feature) => feature.id === layout.toolWindowActive);
      const ActiveToolView = activeToolWindow?.view;
      const toggleToolWindow = (0, import_react7.useCallback)(
        (id) => {
          update({ toolWindowActive: layout.toolWindowActive === id ? null : id });
        },
        [layout.toolWindowActive, update]
      );
      const selectBottomPanel = (0, import_react7.useCallback)(
        (id) => {
          update({ bottomPanelActive: id, bottomPanelOpen: true });
        },
        [update]
      );
      return /* @__PURE__ */ import_react7.default.createElement("div", { className: "dsh-ide-root" }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "flex min-h-0 flex-1" }, /* @__PURE__ */ import_react7.default.createElement(
        ToolWindowBar,
        {
          features: toolWindowFeatures,
          activeId: layout.toolWindowActive,
          onToggle: toggleToolWindow,
          t
        }
      ), ActiveToolView !== void 0 && activeToolWindow !== void 0 && /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement(
        "div",
        {
          className: "flex min-h-0 shrink-0 flex-col border-r border-line1 bg-layer1",
          style: { width: layout.toolWindowWidth }
        },
        /* @__PURE__ */ import_react7.default.createElement("div", { className: "flex h-9 shrink-0 items-center border-b border-line1 px-3 text-xs text-primary" }, t(`${activeToolWindow.id}.title`)),
        /* @__PURE__ */ import_react7.default.createElement("div", { className: "min-h-0 flex-1 overflow-auto" }, /* @__PURE__ */ import_react7.default.createElement(ActiveToolView, { t: bindFeatureTranslate(t, activeToolWindow.id), sessionId }))
      ), /* @__PURE__ */ import_react7.default.createElement(
        SplitHandle,
        {
          orientation: "vertical",
          current: () => layout.toolWindowWidth,
          onResize: (next) => update({ toolWindowWidth: clampLayoutSize("toolWindowWidth", next) })
        }
      )), /* @__PURE__ */ import_react7.default.createElement("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col" }, /* @__PURE__ */ import_react7.default.createElement(EditorArea, { t }), layout.bottomPanelOpen && /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement(
        SplitHandle,
        {
          orientation: "horizontal",
          current: () => layout.bottomPanelHeight,
          onResize: (next) => update({ bottomPanelHeight: clampLayoutSize("bottomPanelHeight", next) })
        }
      ), /* @__PURE__ */ import_react7.default.createElement(
        BottomPanel,
        {
          features: bottomPanelFeatures,
          activeId: layout.bottomPanelActive,
          height: layout.bottomPanelHeight,
          onSelect: selectBottomPanel,
          sessionId,
          t
        }
      )))), /* @__PURE__ */ import_react7.default.createElement(StatusBar, { sessionId, surface, t }));
    }
    function bindFeatureTranslate(t, featureId) {
      return (key) => t(`${featureId}.${key}`);
    }

    // src/client/index.tsx
    var LOCALE_NAMESPACE = "dsh-ide";
    var VIEW_ID = "dsh-ide";
    var TAB_KIND = "ide";
    var GUIDE_ID = "ide";
    var SHELL_DICTIONARIES = {
      zh: {
        // 会话顶部 View 页签的名称
        "shell.viewTitle": "IDE",
        // 编辑器区顶部标签条的空态标题
        "shell.editorTitle": "\u7F16\u8F91\u5668",
        // 编辑器区没有任何打开文件时的主文案
        "shell.emptyEditor": "\u8FD8\u6CA1\u6709\u6253\u5F00\u6587\u4EF6",
        // 主文案下方的说明，指明后续阶段会接入什么
        "shell.emptyEditorHint": "\u9879\u76EE\u6811\u4E0E\u6587\u4EF6\u6807\u7B7E\u9875\u5C06\u5728\u4E0B\u4E00\u4E2A\u9636\u6BB5\u63A5\u5165\u3002",
        // 底部面板没有可用面板时的标题
        "shell.bottomPanelTitle": "\u9762\u677F",
        // 底部面板内容区空态文案
        "shell.emptyBottomPanel": "\u8FD8\u6CA1\u6709\u53EF\u7528\u7684\u5E95\u90E8\u9762\u677F",
        // 状态栏最左侧的工作台标识
        "shell.statusLabel": "IDE",
        // 状态栏：当前在主区视图里
        "shell.surfaceMain": "\u4E3B\u533A",
        // 状态栏：当前在右侧栏里
        "shell.surfaceSidebar": "\u53F3\u4FA7\u680F",
        // 状态栏：承载面没有绑定会话时的说明
        "shell.noSession": "\u672A\u7ED1\u5B9A\u4F1A\u8BDD",
        // 右侧栏引导页上的入口标题
        "shell.guideTitle": "IDE",
        // 右侧栏引导页上的入口说明
        "shell.guideDescription": "\u9879\u76EE\u6811\u3001\u7F16\u8F91\u5668\u3001\u5DEE\u5F02\u5BF9\u6BD4\u3001Git \u4E0E\u7EC8\u7AEF"
      },
      en: {
        "shell.viewTitle": "IDE",
        "shell.editorTitle": "Editor",
        "shell.emptyEditor": "No file is open",
        "shell.emptyEditorHint": "The project tree and file tabs arrive in the next phase.",
        "shell.bottomPanelTitle": "Panel",
        "shell.emptyBottomPanel": "No bottom panel is available yet",
        "shell.statusLabel": "IDE",
        "shell.surfaceMain": "Main",
        "shell.surfaceSidebar": "Sidebar",
        "shell.noSession": "No session",
        "shell.guideTitle": "IDE",
        "shell.guideDescription": "Project tree, editor, diff, Git and terminal"
      }
    };
    var LOCALE_DICTIONARIES = mergeDictionaries(SHELL_DICTIONARIES, collectFeatureLocales(registry.list));
    function readSessionId(props) {
      return typeof props.sessionId === "string" ? props.sessionId : "";
    }
    var plugin = {
      inject: ["slots", "locale"],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement("style");
          style.setAttribute("data-dsh-plugin", "dsh-ide");
          style.textContent = styles_default;
          document.head.appendChild(style);
          return () => style.remove();
        });
        ctx.effect(() => {
          const disposers = Object.entries(LOCALE_DICTIONARIES).map(
            ([locale, dictionary]) => ctx.locale.register(LOCALE_NAMESPACE, locale, dictionary)
          );
          return () => disposers.forEach((dispose) => dispose());
        });
        const t = ctx.locale.bind(LOCALE_NAMESPACE);
        const MainView = (props) => /* @__PURE__ */ import_react8.default.createElement(Workbench, { t, sessionId: readSessionId(props), surface: "main" });
        const SidebarView = (props) => /* @__PURE__ */ import_react8.default.createElement(Workbench, { t, sessionId: readSessionId(props), surface: "sidebar" });
        ctx.slots.inject(
          "conversation.view",
          () => ctx.slots.register(
            {
              name: "conversation.view",
              id: VIEW_ID,
              order: 30,
              locale: LOCALE_NAMESPACE,
              label: () => t("shell.viewTitle")
            },
            MainView
          )
        );
        ctx.inject(["sidebarRightTabs", "slots"], (scoped) => {
          const tabs = scoped.get?.("sidebarRightTabs");
          const slots = scoped.get?.("slots");
          if (tabs === void 0 || typeof tabs.register !== "function") {
            console.error("[dsh-ide] \u5BBF\u4E3B\u672A\u63D0\u4F9B sidebarRightTabs\uFF0C\u53F3\u4FA7\u680F\u5F62\u6001\u4E0D\u53EF\u7528");
            return;
          }
          if (slots === void 0 || typeof slots.inject !== "function") {
            console.error("[dsh-ide] \u5BBF\u4E3B\u672A\u63D0\u4F9B slots\uFF0C\u53F3\u4FA7\u680F\u5F62\u6001\u4E0D\u53EF\u7528");
            return;
          }
          scoped.effect(() => {
            const disposeType = tabs.register({
              id: VIEW_ID,
              kind: TAB_KIND,
              title: () => t("shell.viewTitle"),
              // 切走页签不卸载正文，保住已打开的文件与布局
              keepMounted: true,
              guide: [
                {
                  id: GUIDE_ID,
                  order: 20,
                  title: () => t("shell.guideTitle"),
                  description: () => t("shell.guideDescription")
                }
              ]
            });
            const disposeBody = slots.inject(
              "sidebar.right.pane.tab",
              () => slots.register({ name: "sidebar.right.pane.tab", key: VIEW_ID }, SidebarView)
            );
            return () => {
              if (typeof disposeBody === "function") disposeBody();
              disposeType();
            };
          });
        });
      }
    };
    var index_default = plugin;

    return module.exports.default || module.exports;
  },
});
