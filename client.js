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
    var import_react19 = __toESM(require("react"), 1);

    // .build/styles.css
    var styles_default = '*,:after,:before{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-pan-x: ;--tw-pan-y: ;--tw-pinch-zoom: ;--tw-scroll-snap-strictness:proximity;--tw-gradient-from-position: ;--tw-gradient-via-position: ;--tw-gradient-to-position: ;--tw-ordinal: ;--tw-slashed-zero: ;--tw-numeric-figure: ;--tw-numeric-spacing: ;--tw-numeric-fraction: ;--tw-ring-inset: ;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgba(59,130,246,.5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;--tw-blur: ;--tw-brightness: ;--tw-contrast: ;--tw-grayscale: ;--tw-hue-rotate: ;--tw-invert: ;--tw-saturate: ;--tw-sepia: ;--tw-drop-shadow: ;--tw-backdrop-blur: ;--tw-backdrop-brightness: ;--tw-backdrop-contrast: ;--tw-backdrop-grayscale: ;--tw-backdrop-hue-rotate: ;--tw-backdrop-invert: ;--tw-backdrop-opacity: ;--tw-backdrop-saturate: ;--tw-backdrop-sepia: ;--tw-contain-size: ;--tw-contain-layout: ;--tw-contain-paint: ;--tw-contain-style: }::backdrop{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-pan-x: ;--tw-pan-y: ;--tw-pinch-zoom: ;--tw-scroll-snap-strictness:proximity;--tw-gradient-from-position: ;--tw-gradient-via-position: ;--tw-gradient-to-position: ;--tw-ordinal: ;--tw-slashed-zero: ;--tw-numeric-figure: ;--tw-numeric-spacing: ;--tw-numeric-fraction: ;--tw-ring-inset: ;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgba(59,130,246,.5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000;--tw-blur: ;--tw-brightness: ;--tw-contrast: ;--tw-grayscale: ;--tw-hue-rotate: ;--tw-invert: ;--tw-saturate: ;--tw-sepia: ;--tw-drop-shadow: ;--tw-backdrop-blur: ;--tw-backdrop-brightness: ;--tw-backdrop-contrast: ;--tw-backdrop-grayscale: ;--tw-backdrop-hue-rotate: ;--tw-backdrop-invert: ;--tw-backdrop-opacity: ;--tw-backdrop-saturate: ;--tw-backdrop-sepia: ;--tw-contain-size: ;--tw-contain-layout: ;--tw-contain-paint: ;--tw-contain-style: }.\\!visible{visibility:visible!important}.visible{visibility:visible}.fixed{position:fixed}.sticky{position:sticky}.top-0{top:0}.z-10{z-index:10}.z-\\[9999\\]{z-index:9999}.my-1{margin-bottom:.25rem}.mt-1,.my-1{margin-top:.25rem}.mt-auto{margin-top:auto}.block{display:block}.flex{display:flex}.hidden{display:none}.h-1{height:.25rem}.h-4{height:1rem}.h-6{height:1.5rem}.h-8{height:2rem}.h-9{height:2.25rem}.h-px{height:1px}.min-h-0{min-height:0}.min-h-full{min-height:100%}.w-1{width:.25rem}.w-11{width:2.75rem}.w-2\\.5{width:.625rem}.w-4{width:1rem}.w-6{width:1.5rem}.w-9{width:2.25rem}.w-full{width:100%}.min-w-0{min-width:0}.min-w-\\[248px\\]{min-width:248px}.max-w-sm{max-width:24rem}.flex-1{flex:1 1 0%}.shrink-0{flex-shrink:0}.rotate-0{--tw-rotate:0deg}.rotate-0,.rotate-90{transform:translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))}.rotate-90{--tw-rotate:90deg}.cursor-col-resize{cursor:col-resize}.cursor-default{cursor:default}.cursor-pointer{cursor:pointer}.cursor-row-resize{cursor:row-resize}.resize{resize:both}.flex-col{flex-direction:column}.items-center{align-items:center}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.gap-0\\.5{gap:.125rem}.gap-1{gap:.25rem}.gap-1\\.5{gap:.375rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}.overflow-auto{overflow:auto}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rounded{border-radius:.25rem}.rounded-md{border-radius:.375rem}.border{border-width:1px}.border-b{border-bottom-width:1px}.border-r{border-right-width:1px}.border-t{border-top-width:1px}.border-line1{border-color:var(--dsw-alias-border-l1)}.border-line2{border-color:var(--dsw-alias-border-l2)}.border-line4{border-color:var(--dsw-alias-border-l4)}.border-transparent{border-color:transparent}.bg-base{background-color:var(--dsw-alias-bg-base)}.bg-layer1{background-color:var(--dsw-alias-bg-layer-1)}.bg-layer2{background-color:var(--dsw-alias-bg-layer-2)}.bg-line1{background-color:var(--dsw-alias-border-l1)}.bg-overlay{background-color:var(--dsw-alias-bg-overlay)}.bg-transparent{background-color:transparent}.p-3{padding:.75rem}.p-6{padding:1.5rem}.px-0{padding-left:0;padding-right:0}.px-1{padding-left:.25rem;padding-right:.25rem}.px-3{padding-left:.75rem;padding-right:.75rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}.py-\\[5px\\]{padding-top:5px;padding-bottom:5px}.pl-3{padding-left:.75rem}.pr-2{padding-right:.5rem}.text-left{text-align:left}.text-center{text-align:center}.font-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace}.text-\\[10px\\]{font-size:10px}.text-\\[9px\\]{font-size:9px}.text-sm{font-size:.875rem;line-height:1.25rem}.text-xs{font-size:.75rem;line-height:1rem}.font-medium{font-weight:500}.font-semibold{font-weight:600}.uppercase{text-transform:uppercase}.leading-none{line-height:1}.text-danger{color:var(--dsw-alias-state-error-primary)}.text-info{color:var(--dsw-alias-state-business-primary)}.text-primary{color:var(--dsw-alias-label-primary)}.text-secondary{color:var(--dsw-alias-label-secondary)}.text-success{color:var(--dsw-alias-state-success-primary)}.text-warn{color:var(--dsw-alias-state-warn-primary)}.opacity-60{opacity:.6}.shadow-lg{--tw-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1);--tw-shadow-colored:0 10px 15px -3px var(--tw-shadow-color),0 4px 6px -4px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)}.outline-none{outline:2px solid transparent;outline-offset:2px}.filter{filter:var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)}.transition-colors{transition-property:color,background-color,border-color,text-decoration-color,fill,stroke;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:.15s}.transition-transform{transition-property:transform;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:.15s}.dsh-ide-root{color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}:where(.dsh-ide-root) :where(*,:before,:after){box-sizing:border-box;border-style:solid;border-width:0}:where(.dsh-ide-root) :where(h1,h2,h3,h4,h5,h6,p,ul,ol){margin:0;padding:0}:where(.dsh-ide-root) :where(ul,ol){list-style:none}.dsh-ide-root{display:flex;flex-direction:column;flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base)}[data-conversation-scroll]:has(.dsh-ide-root[data-immersive="1"])>[data-composer-seat]:not(:has([data-approval-key],[data-question-key],[data-plan-review-key])){display:none}[data-conversation-scroll]:has(.dsh-ide-root[data-immersive="1"])~[data-width-handle]{display:none}.hover\\:bg-layer2:hover{background-color:var(--dsw-alias-bg-layer-2)}.hover\\:bg-line4:hover{background-color:var(--dsw-alias-border-l4)}.hover\\:text-primary:hover{color:var(--dsw-alias-label-primary)}.hover\\:underline:hover{text-decoration-line:underline}.focus-visible\\:bg-layer2:focus-visible{background-color:var(--dsw-alias-bg-layer-2)}.focus-visible\\:text-primary:focus-visible{color:var(--dsw-alias-label-primary)}.disabled\\:cursor-default:disabled{cursor:default}.disabled\\:opacity-40:disabled{opacity:.4}.disabled\\:hover\\:bg-transparent:hover:disabled{background-color:transparent}';

    // src/common/locale.ts
    function prefixFeatureLocales(featureId, locales6) {
      const result = {};
      for (const [locale, dictionary] of Object.entries(locales6)) {
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

    // src/common/workspace-files.ts
    var workspaceFilesRemote;
    var listeners = /* @__PURE__ */ new Set();
    function asWorkspaceFilesRemote(value) {
      if (typeof value !== "object" || value === null) return void 0;
      const candidate = value.workspaceFiles;
      if (typeof candidate !== "object" || candidate === null) return void 0;
      const list = candidate.list;
      return typeof list === "function" ? candidate : void 0;
    }
    function setWorkspaceFilesRemote(next) {
      workspaceFilesRemote = next;
      for (const listener of listeners) listener();
    }
    function getWorkspaceFilesRemote() {
      return workspaceFilesRemote;
    }
    function subscribeWorkspaceFiles(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    // src/client/features/git/index.tsx
    var import_react2 = __toESM(require("react"), 1);

    // src/client/features/git/icons.tsx
    var import_react = __toESM(require("react"), 1);
    function gitIcon() {
      return /* @__PURE__ */ import_react.default.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18", fill: "none", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "5.6", cy: "4.8", r: "1.9", stroke: "currentColor", strokeWidth: "1.3" }), /* @__PURE__ */ import_react.default.createElement("circle", { cx: "5.6", cy: "13.2", r: "1.9", stroke: "currentColor", strokeWidth: "1.3" }), /* @__PURE__ */ import_react.default.createElement("circle", { cx: "12.6", cy: "7.6", r: "1.9", stroke: "currentColor", strokeWidth: "1.3" }), /* @__PURE__ */ import_react.default.createElement(
        "path",
        {
          d: "M5.6 6.7v4.6M12.6 9.5c0 2-2 3.7-4.4 3.7H5.6",
          stroke: "currentColor",
          strokeWidth: "1.3",
          strokeLinecap: "round"
        }
      ));
    }

    // src/client/features/git/locales.ts
    var locales = {
      zh: {
        // 左侧列下方按钮与底部面板标题的名称
        title: "Git",
        // 版本控制面板尚未接入时的占位说明
        empty: "Git \u9762\u677F\u5C06\u5728 P5 \u9636\u6BB5\u63A5\u5165\uFF1A\u72B6\u6001\u3001\u63D0\u4EA4\u3001\u5206\u652F\u4E0E diff\u3002"
      },
      en: {
        title: "Git",
        empty: "Git arrives in P5: status, commits, branches and diffs."
      }
    };

    // src/client/features/git/index.tsx
    function GitView({ t }) {
      return /* @__PURE__ */ import_react2.default.createElement("div", { className: "p-3 text-xs text-secondary" }, t("empty"));
    }
    var gitFeature = {
      id: "git",
      slot: "bottomPanel",
      order: 40,
      icon: gitIcon,
      locales,
      view: GitView
    };
    var git_default = gitFeature;

    // src/client/features/output/index.tsx
    var import_react4 = __toESM(require("react"), 1);

    // src/client/features/output/icons.tsx
    var import_react3 = __toESM(require("react"), 1);
    function outputIcon() {
      return /* @__PURE__ */ import_react3.default.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18", fill: "none", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react3.default.createElement("rect", { x: "2.2", y: "3.2", width: "13.6", height: "11.6", rx: "1.8", stroke: "currentColor", strokeWidth: "1.3" }), /* @__PURE__ */ import_react3.default.createElement(
        "path",
        {
          d: "M4.9 6.8h8M4.9 9.2h8M4.9 11.6h4.6",
          stroke: "currentColor",
          strokeWidth: "1.2",
          strokeLinecap: "round"
        }
      ));
    }

    // src/client/features/output/locales.ts
    var locales2 = {
      zh: {
        // 左侧列下方按钮与底部面板标题的名称
        title: "\u8F93\u51FA",
        // 输出通道尚未接入时的占位说明
        empty: "\u8F93\u51FA\u5C06\u5728\u540E\u7EED\u9636\u6BB5\u63A5\u5165\uFF1A\u6784\u5EFA\u3001\u63D2\u4EF6\u4E0E\u8BCA\u65AD\u901A\u9053\u7684\u589E\u91CF\u65E5\u5FD7\u3002"
      },
      en: {
        title: "Output",
        empty: "Output arrives later: incremental logs from builds, plugins and diagnostics."
      }
    };

    // src/client/features/output/index.tsx
    function OutputView({ t }) {
      return /* @__PURE__ */ import_react4.default.createElement("div", { className: "p-3 text-xs text-secondary" }, t("empty"));
    }
    var outputFeature = {
      id: "output",
      slot: "bottomPanel",
      order: 30,
      icon: outputIcon,
      locales: locales2,
      view: OutputView
    };
    var output_default = outputFeature;

    // src/client/features/project-tree/icons.tsx
    var import_react5 = __toESM(require("react"), 1);

    // src/common/cn.ts
    function cn(...classes) {
      return classes.filter(Boolean).join(" ");
    }

    // src/client/features/project-tree/icons.tsx
    var EXTENSION_TONES = {
      ts: "text-info",
      tsx: "text-info",
      js: "text-info",
      jsx: "text-info",
      mjs: "text-info",
      cjs: "text-info",
      json: "text-success",
      yml: "text-success",
      yaml: "text-success",
      toml: "text-success",
      ini: "text-success",
      conf: "text-success",
      css: "text-info",
      scss: "text-info",
      sass: "text-info",
      less: "text-info",
      html: "text-danger",
      htm: "text-danger",
      vue: "text-danger",
      svelte: "text-danger",
      md: "text-secondary",
      mdx: "text-secondary",
      txt: "text-secondary",
      sh: "text-success",
      bash: "text-success",
      zsh: "text-success",
      py: "text-info",
      go: "text-info",
      rs: "text-danger",
      java: "text-danger",
      kt: "text-danger",
      c: "text-info",
      h: "text-info",
      cpp: "text-info",
      cs: "text-info",
      rb: "text-danger",
      php: "text-danger",
      png: "text-warn",
      jpg: "text-warn",
      jpeg: "text-warn",
      gif: "text-warn",
      webp: "text-warn",
      svg: "text-warn",
      ico: "text-warn",
      lock: "text-secondary"
    };
    function extensionOf(name) {
      const dot = name.lastIndexOf(".");
      if (dot <= 0 || dot === name.length - 1) return "";
      return name.slice(dot + 1).toLowerCase();
    }
    function projectTreeIcon() {
      return /* @__PURE__ */ import_react5.default.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18", fill: "none", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react5.default.createElement(
        "path",
        {
          d: "M2.5 4.6c0-.83.67-1.5 1.5-1.5h3.16l1.5 1.8H14c.83 0 1.5.67 1.5 1.5v7.2c0 .83-.67 1.5-1.5 1.5H4c-.83 0-1.5-.67-1.5-1.5V4.6Z",
          stroke: "currentColor",
          strokeWidth: "1.3",
          strokeLinejoin: "round"
        }
      ), /* @__PURE__ */ import_react5.default.createElement("path", { d: "M5.6 8.3h6.8M5.6 11.1h4.4", stroke: "currentColor", strokeWidth: "1.1", strokeLinecap: "round" }));
    }
    function chevronIcon(expanded) {
      return /* @__PURE__ */ import_react5.default.createElement(
        "svg",
        {
          width: "10",
          height: "10",
          viewBox: "0 0 12 12",
          fill: "none",
          "aria-hidden": "true",
          focusable: "false",
          className: cn("shrink-0 transition-transform", expanded ? "rotate-90" : "rotate-0")
        },
        /* @__PURE__ */ import_react5.default.createElement(
          "path",
          {
            d: "M4.25 2.5 7.75 6l-3.5 3.5",
            stroke: "currentColor",
            strokeWidth: "1.4",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        )
      );
    }
    function folderIcon(open) {
      return /* @__PURE__ */ import_react5.default.createElement(
        "svg",
        {
          width: "14",
          height: "14",
          viewBox: "0 0 16 16",
          fill: "none",
          "aria-hidden": "true",
          focusable: "false",
          className: "shrink-0"
        },
        open ? /* @__PURE__ */ import_react5.default.createElement(
          "path",
          {
            d: "M1.8 4.4c0-.66.54-1.2 1.2-1.2h2.9l1.3 1.55h5.8c.66 0 1.2.54 1.2 1.2v.55H3.1L1.8 11.4V4.4Z M1.8 11.4l1.5-4.05c.16-.43.57-.72 1.03-.72h9.1c.72 0 1.22.72.99 1.4l-1.4 4.1c-.16.47-.6.78-1.1.78H3.02c-.9 0-1.5-.9-1.22-1.51Z",
            stroke: "currentColor",
            strokeWidth: "1.05",
            strokeLinejoin: "round"
          }
        ) : /* @__PURE__ */ import_react5.default.createElement(
          "path",
          {
            d: "M1.8 4.4c0-.66.54-1.2 1.2-1.2h2.9l1.3 1.55h5.8c.66 0 1.2.54 1.2 1.2v6.3c0 .66-.54 1.2-1.2 1.2H3c-.66 0-1.2-.54-1.2-1.2V4.4Z",
            stroke: "currentColor",
            strokeWidth: "1.05",
            strokeLinejoin: "round"
          }
        )
      );
    }
    function fileBadge(name) {
      const extension = extensionOf(name);
      if (extension === "") {
        return /* @__PURE__ */ import_react5.default.createElement(
          "span",
          {
            className: "flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-secondary",
            "aria-hidden": "true"
          },
          "\xB7"
        );
      }
      return /* @__PURE__ */ import_react5.default.createElement(
        "span",
        {
          className: cn(
            "flex h-4 w-4 shrink-0 items-center justify-center font-mono text-[9px] font-semibold uppercase leading-none",
            EXTENSION_TONES[extension] ?? "text-secondary"
          ),
          "aria-hidden": "true"
        },
        extension.slice(0, 3)
      );
    }
    function refreshIcon() {
      return /* @__PURE__ */ import_react5.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react5.default.createElement(
        "path",
        {
          d: "M11.4 6.1A4.6 4.6 0 1 0 11 9.6",
          stroke: "currentColor",
          strokeWidth: "1.2",
          strokeLinecap: "round"
        }
      ), /* @__PURE__ */ import_react5.default.createElement("path", { d: "M11.7 2.9v3.4H8.3", stroke: "currentColor", strokeWidth: "1.2", strokeLinecap: "round", strokeLinejoin: "round" }));
    }
    function collapseAllIcon() {
      return /* @__PURE__ */ import_react5.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react5.default.createElement(
        "path",
        {
          d: "M4 5.4 7 2.4l3 3M4 8.6l3 3 3-3",
          stroke: "currentColor",
          strokeWidth: "1.2",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      ));
    }
    function hiddenIcon(visible) {
      return /* @__PURE__ */ import_react5.default.createElement("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react5.default.createElement(
        "path",
        {
          d: "M1.4 7S3.3 3.6 7 3.6 12.6 7 12.6 7 10.7 10.4 7 10.4 1.4 7 1.4 7Z",
          stroke: "currentColor",
          strokeWidth: "1.1",
          strokeLinejoin: "round"
        }
      ), /* @__PURE__ */ import_react5.default.createElement("circle", { cx: "7", cy: "7", r: "1.7", stroke: "currentColor", strokeWidth: "1.1" }), !visible && /* @__PURE__ */ import_react5.default.createElement("path", { d: "M2.2 2.2l9.6 9.6", stroke: "currentColor", strokeWidth: "1.2", strokeLinecap: "round" }));
    }

    // src/client/features/project-tree/locales.ts
    var locales3 = {
      zh: {
        // 左侧工具窗口与工具条按钮名称
        title: "\u9879\u76EE",
        // 目录正在请求子项时的占位文案
        loading: "\u52A0\u8F7D\u4E2D\u2026",
        // 空目录的提示
        empty: "\u7A7A\u76EE\u5F55",
        // 目录读取失败后的提示
        loadFailed: "\u76EE\u5F55\u8BFB\u53D6\u5931\u8D25",
        // 失败提示旁的按钮：重新请求当前目录
        retry: "\u91CD\u8BD5",
        // 工具栏按钮：重新加载整棵树
        refresh: "\u5237\u65B0",
        // 工具栏按钮：收起所有已展开目录
        collapseAll: "\u5168\u90E8\u6298\u53E0",
        // 工具栏按钮：切换隐藏文件（dotfiles）的显示
        toggleHidden: "\u663E\u793A\u9690\u85CF\u6587\u4EF6",
        // 目录子项超过宿主上限时的截断提示
        truncated: "\u4EC5\u663E\u793A\u524D 2000 \u9879",
        // 承载面没有绑定会话时的提示
        noSession: "\u672A\u7ED1\u5B9A\u4F1A\u8BDD",
        // 宿主未提供 workspaceFiles 服务时的降级提示
        unavailable: "\u6587\u4EF6\u6811\u4E0D\u53EF\u7528",
        // 右键菜单：把文件路径发送到 CC GUI 的扩展入口
        "menu.sendPath": "\u53D1\u9001\u6587\u4EF6\u8DEF\u5F84\u5230 CC GUI",
        // 右键菜单：新建文件或目录的子菜单
        "menu.new": "\u65B0\u5EFA",
        // 右键菜单：剪切
        "menu.cut": "\u526A\u5207",
        // 右键菜单：复制
        "menu.copy": "\u590D\u5236",
        // 右键菜单：复制相对路径或引用串（当前可用）
        "menu.copyPath": "\u590D\u5236\u8DEF\u5F84/\u5F15\u7528\u2026",
        // 右键菜单：粘贴
        "menu.paste": "\u7C98\u8D34",
        // 右键菜单：查找用法
        "menu.findUsages": "\u67E5\u627E\u7528\u6CD5",
        // 右键菜单：代码分析子菜单
        "menu.analyze": "\u5206\u6790",
        // 右键菜单：重命名
        "menu.rename": "\u91CD\u547D\u540D\u2026",
        // 右键菜单：重构子菜单
        "menu.refactor": "\u91CD\u6784",
        // 右键菜单：书签子菜单
        "menu.bookmarks": "\u4E66\u7B7E",
        // 右键菜单：重新格式化代码
        "menu.reformatCode": "\u91CD\u65B0\u683C\u5F0F\u5316\u4EE3\u7801",
        // 右键菜单：优化导入
        "menu.optimizeImports": "\u4F18\u5316\u5BFC\u5165",
        // 右键菜单：删除
        "menu.delete": "\u5220\u9664\u2026",
        // 右键菜单：覆盖文件类型关联
        "menu.overrideFileType": "\u8986\u76D6\u6587\u4EF6\u7C7B\u578B",
        // 右键菜单：在右侧分屏打开
        "menu.openInRightSplit": "\u5728\u53F3\u4FA7\u5206\u5C4F\u6253\u5F00",
        // 右键菜单：用其它程序打开子菜单
        "menu.openIn": "\u6253\u5F00\u4E8E",
        // 右键菜单：本地历史子菜单
        "menu.localHistory": "\u672C\u5730\u5386\u53F2",
        // 右键菜单：Git 操作子菜单
        "menu.git": "Git",
        // 右键菜单：重建该文件的 IDE 索引
        "menu.repairIde": "\u4FEE\u590D\u6B64\u6587\u4EF6\u7684 IDE \u7D22\u5F15",
        // 右键菜单：从磁盘重新加载（当前可用）
        "menu.reloadFromDisk": "\u4ECE\u78C1\u76D8\u91CD\u65B0\u52A0\u8F7D",
        // 右键菜单：与另一个文件比较
        "menu.compareWith": "\u4E0E\u2026\u6BD4\u8F83",
        // 右键菜单：标记文件类型子菜单
        "menu.markFileAs": "\u5C06\u6587\u4EF6\u6807\u8BB0\u4E3A",
        // 右键菜单：结构图子菜单
        "menu.diagrams": "\u56FE\u8868",
        // 右键菜单：加入 .gitignore 或取消忽略
        "menu.addToGitignore": "\u6DFB\u52A0\u5230 .gitignore\uFF08\u53D6\u6D88\u5FFD\u7565\uFF09",
        // 右键菜单：创建 Gist
        "menu.createGist": "\u521B\u5EFA Gist\u2026"
      },
      en: {
        title: "Project",
        loading: "Loading\u2026",
        empty: "Empty directory",
        loadFailed: "Failed to read directory",
        retry: "Retry",
        refresh: "Refresh",
        collapseAll: "Collapse all",
        toggleHidden: "Show hidden files",
        truncated: "Showing first 2000 entries",
        noSession: "No session bound",
        unavailable: "File tree unavailable",
        "menu.sendPath": "Send File Path to CC GUI",
        "menu.new": "New",
        "menu.cut": "Cut",
        "menu.copy": "Copy",
        "menu.copyPath": "Copy Path/Reference\u2026",
        "menu.paste": "Paste",
        "menu.findUsages": "Find Usages",
        "menu.analyze": "Analyze",
        "menu.rename": "Rename\u2026",
        "menu.refactor": "Refactor",
        "menu.bookmarks": "Bookmarks",
        "menu.reformatCode": "Reformat Code",
        "menu.optimizeImports": "Optimize Imports",
        "menu.delete": "Delete\u2026",
        "menu.overrideFileType": "Override File Type",
        "menu.openInRightSplit": "Open in Right Split",
        "menu.openIn": "Open In",
        "menu.localHistory": "Local History",
        "menu.git": "Git",
        "menu.repairIde": "Repair IDE on File",
        "menu.reloadFromDisk": "Reload from Disk",
        "menu.compareWith": "Compare With\u2026",
        "menu.markFileAs": "Mark File As",
        "menu.diagrams": "Diagrams",
        "menu.addToGitignore": "Add to .gitignore file (unignore)",
        "menu.createGist": "Create Gist\u2026"
      }
    };

    // src/client/features/project-tree/ProjectTree.tsx
    var import_react7 = __toESM(require("react"), 1);

    // src/client/features/project-tree/context-menu.tsx
    var import_react6 = __toESM(require("react"), 1);
    var ACTION_COPY_PATH = "copyPath";
    var ACTION_RELOAD = "reloadFromDisk";
    var MENU_ITEMS = [
      { id: "sendPath" },
      { id: "new", submenu: true, separated: true },
      { id: "cut", shortcut: "\u2318X", separated: true },
      { id: "copy", shortcut: "\u2318C" },
      { id: "copyPath" },
      { id: "paste", shortcut: "\u2318V" },
      { id: "findUsages", shortcut: "\u2325F7", separated: true },
      { id: "analyze", submenu: true },
      { id: "rename", shortcut: "\u21E7F6", separated: true },
      { id: "refactor", submenu: true },
      { id: "bookmarks", submenu: true },
      { id: "reformatCode", shortcut: "\u2325\u2318L", separated: true },
      { id: "optimizeImports", shortcut: "\u2325\u2318O" },
      { id: "delete", shortcut: "\u232B" },
      { id: "overrideFileType" },
      { id: "openInRightSplit", shortcut: "\u21E7\u21A9", separated: true },
      { id: "openIn", submenu: true },
      { id: "localHistory", submenu: true, separated: true },
      { id: "git", submenu: true },
      { id: "repairIde" },
      { id: "reloadFromDisk" },
      { id: "compareWith", shortcut: "\u2318D", separated: true },
      { id: "markFileAs", submenu: true, separated: true },
      { id: "diagrams", submenu: true },
      { id: "addToGitignore", separated: true },
      { id: "createGist" }
    ];
    function ProjectTreeContextMenu({
      t,
      position,
      path,
      onClose,
      onReload
    }) {
      const menuRef = (0, import_react6.useRef)(null);
      const [offset, setOffset] = (0, import_react6.useState)(position);
      (0, import_react6.useLayoutEffect)(() => {
        const element = menuRef.current;
        if (element === null) return;
        const rect = element.getBoundingClientRect();
        const margin = 8;
        setOffset({
          x: Math.max(margin, Math.min(position.x, window.innerWidth - rect.width - margin)),
          y: Math.max(margin, Math.min(position.y, window.innerHeight - rect.height - margin))
        });
      }, [position.x, position.y]);
      (0, import_react6.useEffect)(() => {
        const handlePointerDown = (event) => {
          if (menuRef.current?.contains(event.target) === true) return;
          onClose();
        };
        const handleKeyDown = (event) => {
          if (event.key === "Escape") onClose();
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        document.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("scroll", onClose, true);
        window.addEventListener("resize", onClose);
        return () => {
          document.removeEventListener("pointerdown", handlePointerDown, true);
          document.removeEventListener("keydown", handleKeyDown, true);
          window.removeEventListener("scroll", onClose, true);
          window.removeEventListener("resize", onClose);
        };
      }, [onClose]);
      const copyPath = (0, import_react6.useCallback)(async () => {
        try {
          await navigator.clipboard.writeText(path);
        } catch (error) {
          console.error("[dsh-ide] \u590D\u5236\u6587\u4EF6\u8DEF\u5F84\u5931\u8D25:", error);
        }
        onClose();
      }, [onClose, path]);
      function isEnabled(item) {
        if (item.id === ACTION_COPY_PATH) return true;
        return item.id === ACTION_RELOAD && onReload !== void 0;
      }
      function handleSelect(item) {
        if (item.id === ACTION_COPY_PATH) {
          void copyPath();
          return;
        }
        if (item.id === ACTION_RELOAD && onReload !== void 0) {
          onReload();
          onClose();
        }
      }
      return /* @__PURE__ */ import_react6.default.createElement(
        "div",
        {
          ref: menuRef,
          role: "menu",
          className: "fixed z-[9999] min-w-[248px] rounded-md border border-line2 bg-overlay py-1 shadow-lg",
          style: { left: offset.x, top: offset.y },
          onContextMenu: (event) => event.preventDefault()
        },
        MENU_ITEMS.map((item) => {
          const enabled = isEnabled(item);
          return /* @__PURE__ */ import_react6.default.createElement(import_react6.default.Fragment, { key: item.id }, item.separated === true && /* @__PURE__ */ import_react6.default.createElement("div", { className: "my-1 h-px bg-line1" }), /* @__PURE__ */ import_react6.default.createElement(
            "button",
            {
              type: "button",
              role: "menuitem",
              "aria-disabled": !enabled,
              disabled: !enabled,
              onClick: () => handleSelect(item),
              className: cn(
                "flex w-full items-center gap-4 px-3 py-[5px] text-left text-xs transition-colors",
                enabled ? "cursor-pointer bg-transparent text-primary hover:bg-layer2" : "cursor-default bg-transparent text-secondary opacity-60"
              )
            },
            /* @__PURE__ */ import_react6.default.createElement("span", { className: "flex-1 truncate" }, t(`menu.${item.id}`)),
            item.submenu === true && /* @__PURE__ */ import_react6.default.createElement("span", { className: "text-secondary" }, "\u203A"),
            item.shortcut !== void 0 && /* @__PURE__ */ import_react6.default.createElement("span", { className: "text-secondary" }, item.shortcut)
          ));
        })
      );
    }

    // src/client/features/project-tree/ProjectTree.tsx
    var ROOT_PATH = "";
    var ROOT_REQUEST_PATH = ".";
    var INDENT_WIDTH = 14;
    var BASE_INDENT = 8;
    var MAX_DEPTH = 64;
    function IconButton({ label, onClick, disabled = false, children }) {
      return /* @__PURE__ */ import_react7.default.createElement(
        "button",
        {
          type: "button",
          title: label,
          "aria-label": label,
          disabled,
          onClick,
          className: cn(
            "flex h-6 w-6 items-center justify-center rounded text-secondary transition-colors",
            "bg-transparent hover:bg-layer2 hover:text-primary focus-visible:bg-layer2 focus-visible:text-primary",
            "disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
          )
        },
        children
      );
    }
    function isSafeEntryName(name) {
      return name !== "" && name !== "." && name !== ".." && !name.includes("/") && !name.includes("\0");
    }
    function sanitizeEntries(value) {
      if (!Array.isArray(value)) return [];
      return value.filter((entry) => {
        if (typeof entry !== "object" || entry === null) return false;
        const candidate = entry;
        return typeof candidate.name === "string" && typeof candidate.type === "string";
      });
    }
    function entryPathOf(parent, name) {
      return parent === ROOT_PATH ? name : `${parent}/${name}`;
    }
    function compareEntries(a, b) {
      const aDirectory = a.type === "directory";
      const bDirectory = b.type === "directory";
      if (aDirectory !== bDirectory) return aDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, void 0, { numeric: true, sensitivity: "base" });
    }
    function buildRows(directories, expanded, showHidden, parent = ROOT_PATH, depth = 0) {
      const state = directories[parent];
      if (state === void 0 || state.status === "loading") {
        return [{ kind: "loading", key: `loading:${parent}`, depth }];
      }
      if (state.status === "error") {
        return [{ kind: "error", key: `error:${parent}`, depth, retryPath: parent }];
      }
      const entries = state.entries.filter((entry) => (showHidden || !entry.name.startsWith(".")) && isSafeEntryName(entry.name)).sort(compareEntries);
      if (entries.length === 0) {
        return [{ kind: "empty", key: `empty:${parent}`, depth }];
      }
      const rows = [];
      for (const entry of entries) {
        const path = entryPathOf(parent, entry.name);
        const directory = entry.type === "directory";
        rows.push({ kind: "entry", key: `entry:${path}`, path, name: entry.name, directory, depth });
        if (directory && expanded.has(path) && depth < MAX_DEPTH) {
          rows.push(...buildRows(directories, expanded, showHidden, path, depth + 1));
        }
      }
      if (state.truncated) {
        rows.push({ kind: "truncated", key: `truncated:${parent}`, depth });
      }
      return rows;
    }
    function isEntryRow(row) {
      return row.kind === "entry";
    }
    function ProjectTree({ t, sessionId }) {
      const remote = (0, import_react7.useSyncExternalStore)(subscribeWorkspaceFiles, getWorkspaceFilesRemote, getWorkspaceFilesRemote);
      const [directories, setDirectories] = (0, import_react7.useState)({});
      const [expanded, setExpanded] = (0, import_react7.useState)(() => /* @__PURE__ */ new Set());
      const [selectedPath, setSelectedPath] = (0, import_react7.useState)(null);
      const [focusedPath, setFocusedPath] = (0, import_react7.useState)(null);
      const [showHidden, setShowHidden] = (0, import_react7.useState)(false);
      const [reloadToken, setReloadToken] = (0, import_react7.useState)(0);
      const [menu, setMenu] = (0, import_react7.useState)(null);
      const controllers = (0, import_react7.useRef)(/* @__PURE__ */ new Map());
      const rowRefs = (0, import_react7.useRef)(/* @__PURE__ */ new Map());
      const loadDirectory = (0, import_react7.useCallback)(
        async (path) => {
          if (remote === void 0 || sessionId === "") return;
          controllers.current.get(path)?.abort();
          const controller = new AbortController();
          controllers.current.set(path, controller);
          setDirectories((previous) => ({
            ...previous,
            [path]: { status: "loading", entries: [], truncated: false }
          }));
          try {
            const result = await remote.list(
              sessionId,
              path === ROOT_PATH ? ROOT_REQUEST_PATH : path,
              controller.signal
            );
            if (controller.signal.aborted) return;
            if (result.ok !== true || result.value === void 0) {
              console.error("[dsh-ide] \u9879\u76EE\u6811\u8BFB\u53D6\u76EE\u5F55\u5931\u8D25:", path, result.error);
              setDirectories((previous) => ({
                ...previous,
                [path]: { status: "error", entries: [], truncated: false }
              }));
              return;
            }
            setDirectories((previous) => ({
              ...previous,
              [path]: {
                status: "ready",
                entries: sanitizeEntries(result.value?.entries),
                truncated: result.value?.truncated === true
              }
            }));
          } catch (error) {
            if (controller.signal.aborted) return;
            console.error("[dsh-ide] \u9879\u76EE\u6811\u8BFB\u53D6\u76EE\u5F55\u5931\u8D25:", path, error);
            setDirectories((previous) => ({
              ...previous,
              [path]: { status: "error", entries: [], truncated: false }
            }));
          } finally {
            if (controllers.current.get(path) === controller) controllers.current.delete(path);
          }
        },
        [remote, sessionId]
      );
      const toggleDirectory = (0, import_react7.useCallback)(
        (path) => {
          if (expanded.has(path)) {
            setExpanded((previous) => {
              const next = new Set(previous);
              next.delete(path);
              return next;
            });
            return;
          }
          setExpanded((previous) => new Set(previous).add(path));
          if (directories[path] === void 0) void loadDirectory(path);
        },
        [directories, expanded, loadDirectory]
      );
      (0, import_react7.useEffect)(() => {
        setDirectories({});
        setExpanded(/* @__PURE__ */ new Set());
        setSelectedPath(null);
        setFocusedPath(null);
        rowRefs.current.clear();
        if (remote === void 0 || sessionId === "") return void 0;
        void loadDirectory(ROOT_PATH);
        return () => {
          for (const controller of controllers.current.values()) controller.abort();
          controllers.current.clear();
        };
      }, [loadDirectory, remote, sessionId, reloadToken]);
      const rows = (0, import_react7.useMemo)(
        () => buildRows(directories, expanded, showHidden),
        [directories, expanded, showHidden]
      );
      const entryRows = (0, import_react7.useMemo)(() => rows.filter(isEntryRow), [rows]);
      (0, import_react7.useEffect)(() => {
        if (entryRows.length === 0) {
          if (focusedPath !== null) setFocusedPath(null);
          return;
        }
        if (focusedPath === null || !entryRows.some((row) => row.path === focusedPath)) {
          setFocusedPath(entryRows[0].path);
        }
      }, [entryRows, focusedPath]);
      const focusRow = (0, import_react7.useCallback)((path) => {
        setFocusedPath(path);
        const element = rowRefs.current.get(path);
        element?.focus();
        element?.scrollIntoView({ block: "nearest" });
      }, []);
      const handleKeyDown = (0, import_react7.useCallback)(
        (event) => {
          if (entryRows.length === 0) return;
          const index = entryRows.findIndex((row) => row.path === focusedPath);
          const current = index >= 0 ? entryRows[index] : void 0;
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
            event.preventDefault();
            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? entryRows.length - 1 : event.key === "ArrowDown" ? Math.min(index < 0 ? 0 : index + 1, entryRows.length - 1) : Math.max(index < 0 ? 0 : index - 1, 0);
            focusRow(entryRows[nextIndex].path);
            return;
          }
          if (current === void 0) return;
          if (event.key === "ArrowRight" && current.directory) {
            event.preventDefault();
            if (!expanded.has(current.path)) {
              toggleDirectory(current.path);
              return;
            }
            const child = entryRows[index + 1];
            if (child !== void 0 && child.depth === current.depth + 1) focusRow(child.path);
            return;
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            if (current.directory && expanded.has(current.path)) {
              toggleDirectory(current.path);
              return;
            }
            const parent = entryRows.slice(0, index).reverse().find((row) => row.depth === current.depth - 1);
            if (parent !== void 0) focusRow(parent.path);
          }
        },
        [entryRows, expanded, focusRow, focusedPath, toggleDirectory]
      );
      const handleEntryClick = (0, import_react7.useCallback)(
        (row) => {
          setSelectedPath(row.path);
          setFocusedPath(row.path);
          if (row.directory) toggleDirectory(row.path);
        },
        [toggleDirectory]
      );
      const actionsDisabled = remote === void 0 || sessionId === "";
      const reloadParentOf = (0, import_react7.useCallback)(
        (path) => {
          const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ROOT_PATH;
          void loadDirectory(parent);
        },
        [loadDirectory]
      );
      const closeMenu = (0, import_react7.useCallback)(() => setMenu(null), []);
      function renderRow(row) {
        if (row.kind !== "entry") {
          const paddingLeft = BASE_INDENT + row.depth * INDENT_WIDTH;
          if (row.kind === "error") {
            return /* @__PURE__ */ import_react7.default.createElement(
              "div",
              {
                key: row.key,
                className: "flex h-6 items-center gap-2 pr-2 text-xs text-danger",
                style: { paddingLeft }
              },
              /* @__PURE__ */ import_react7.default.createElement("span", { className: "truncate" }, t("loadFailed")),
              /* @__PURE__ */ import_react7.default.createElement(
                "button",
                {
                  type: "button",
                  onClick: () => void loadDirectory(row.retryPath),
                  className: "shrink-0 bg-transparent px-0 text-info hover:underline"
                },
                t("retry")
              )
            );
          }
          const tone = row.kind === "truncated" ? "text-warn" : "text-secondary";
          const text = row.kind === "truncated" ? t("truncated") : row.kind === "loading" ? t("loading") : t("empty");
          return /* @__PURE__ */ import_react7.default.createElement(
            "div",
            {
              key: row.key,
              className: cn("flex h-6 items-center pr-2 text-xs", tone),
              style: { paddingLeft }
            },
            text
          );
        }
        const isExpanded = expanded.has(row.path);
        const selected = selectedPath === row.path;
        const focused = focusedPath === row.path;
        return /* @__PURE__ */ import_react7.default.createElement(
          "button",
          {
            key: row.key,
            type: "button",
            role: "treeitem",
            "aria-level": row.depth + 1,
            "aria-expanded": row.directory ? isExpanded : void 0,
            "aria-selected": selected,
            tabIndex: focused ? 0 : -1,
            ref: (element) => {
              if (element === null) rowRefs.current.delete(row.path);
              else rowRefs.current.set(row.path, element);
            },
            title: row.path,
            onClick: () => handleEntryClick(row),
            onContextMenu: (event) => {
              event.preventDefault();
              setSelectedPath(row.path);
              setFocusedPath(row.path);
              setMenu({ position: { x: event.clientX, y: event.clientY }, row });
            },
            onFocus: () => setFocusedPath(row.path),
            className: cn(
              "flex h-6 w-full items-center gap-1.5 truncate pr-2 text-left text-xs leading-none outline-none",
              "hover:bg-layer2 focus-visible:bg-layer2",
              selected ? "bg-layer2 text-primary" : "bg-transparent text-primary"
            ),
            style: { paddingLeft: BASE_INDENT + row.depth * INDENT_WIDTH }
          },
          row.directory ? chevronIcon(isExpanded) : /* @__PURE__ */ import_react7.default.createElement("span", { className: "w-2.5 shrink-0", "aria-hidden": "true" }),
          row.directory ? folderIcon(isExpanded) : fileBadge(row.name),
          /* @__PURE__ */ import_react7.default.createElement("span", { className: "truncate" }, row.name)
        );
      }
      return /* @__PURE__ */ import_react7.default.createElement("div", { className: "flex min-h-full flex-col" }, /* @__PURE__ */ import_react7.default.createElement("div", { className: "sticky top-0 z-10 flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line1 bg-layer1 px-3" }, /* @__PURE__ */ import_react7.default.createElement("span", { className: "truncate text-xs font-medium text-primary" }, t("title")), /* @__PURE__ */ import_react7.default.createElement("div", { className: "flex items-center gap-0.5" }, /* @__PURE__ */ import_react7.default.createElement(
        IconButton,
        {
          label: t("toggleHidden"),
          disabled: actionsDisabled,
          onClick: () => setShowHidden((previous) => !previous)
        },
        hiddenIcon(showHidden)
      ), /* @__PURE__ */ import_react7.default.createElement(IconButton, { label: t("collapseAll"), disabled: actionsDisabled, onClick: () => setExpanded(/* @__PURE__ */ new Set()) }, collapseAllIcon()), /* @__PURE__ */ import_react7.default.createElement(
        IconButton,
        {
          label: t("refresh"),
          disabled: actionsDisabled,
          onClick: () => setReloadToken((previous) => previous + 1)
        },
        refreshIcon()
      ))), sessionId === "" && /* @__PURE__ */ import_react7.default.createElement("div", { className: "px-3 py-3 text-xs text-secondary" }, t("noSession")), sessionId !== "" && remote === void 0 && /* @__PURE__ */ import_react7.default.createElement("div", { className: "px-3 py-3 text-xs text-secondary" }, t("unavailable")), sessionId !== "" && remote !== void 0 && /* @__PURE__ */ import_react7.default.createElement("div", { role: "tree", "aria-label": t("title"), onKeyDown: handleKeyDown, className: "flex-1 py-1" }, rows.map(renderRow)), menu !== null && /* @__PURE__ */ import_react7.default.createElement(
        ProjectTreeContextMenu,
        {
          t,
          position: menu.position,
          path: menu.row.path,
          onClose: closeMenu,
          onReload: actionsDisabled ? void 0 : () => reloadParentOf(menu.row.path)
        }
      ));
    }

    // src/client/features/project-tree/index.ts
    var projectTreeFeature = {
      id: "projectTree",
      slot: "toolWindow",
      order: 10,
      icon: projectTreeIcon,
      locales: locales3,
      view: ProjectTree
    };
    var project_tree_default = projectTreeFeature;

    // src/client/features/run/index.tsx
    var import_react9 = __toESM(require("react"), 1);

    // src/client/features/run/icons.tsx
    var import_react8 = __toESM(require("react"), 1);
    function runIcon() {
      return /* @__PURE__ */ import_react8.default.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18", fill: "none", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react8.default.createElement(
        "path",
        {
          d: "M6.2 4.1l8 4.9-8 4.9V4.1Z",
          stroke: "currentColor",
          strokeWidth: "1.3",
          strokeLinejoin: "round"
        }
      ));
    }

    // src/client/features/run/locales.ts
    var locales4 = {
      zh: {
        // 左侧列下方按钮与底部面板标题的名称
        title: "\u542F\u52A8\u5668",
        // 运行配置尚未接入时的占位说明
        empty: "\u542F\u52A8\u5668\u5C06\u5728 P6 \u9636\u6BB5\u63A5\u5165\uFF1A\u8FD0\u884C\u914D\u7F6E\u3001\u542F\u52A8\u4E0E\u505C\u6B62\u3001\u8FDB\u7A0B\u8F93\u51FA\u3002"
      },
      en: {
        title: "Run",
        empty: "Run configurations arrive in P6: start, stop and stream process output."
      }
    };

    // src/client/features/run/index.tsx
    function RunView({ t }) {
      return /* @__PURE__ */ import_react9.default.createElement("div", { className: "p-3 text-xs text-secondary" }, t("empty"));
    }
    var runFeature = {
      id: "run",
      slot: "bottomPanel",
      order: 20,
      icon: runIcon,
      locales: locales4,
      view: RunView
    };
    var run_default = runFeature;

    // src/client/features/terminal/index.tsx
    var import_react11 = __toESM(require("react"), 1);

    // src/client/features/terminal/icons.tsx
    var import_react10 = __toESM(require("react"), 1);
    function terminalIcon() {
      return /* @__PURE__ */ import_react10.default.createElement("svg", { width: "18", height: "18", viewBox: "0 0 18 18", fill: "none", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ import_react10.default.createElement("rect", { x: "2.2", y: "3.2", width: "13.6", height: "11.6", rx: "1.8", stroke: "currentColor", strokeWidth: "1.3" }), /* @__PURE__ */ import_react10.default.createElement(
        "path",
        {
          d: "M5.2 7.1 7.6 9.2l-2.4 2.1M9.4 11.4h3.4",
          stroke: "currentColor",
          strokeWidth: "1.3",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      ));
    }

    // src/client/features/terminal/locales.ts
    var locales5 = {
      zh: {
        // 左侧列下方按钮与底部面板标题的名称
        title: "\u7EC8\u7AEF",
        // 终端尚未接入时的占位说明
        empty: "\u7EC8\u7AEF\u5C06\u5728 P4 \u9636\u6BB5\u63A5\u5165\uFF1A\u4F1A\u8BDD\u5DE5\u4F5C\u76EE\u5F55\u4E0B\u7684\u591A\u5B9E\u4F8B shell\u3002"
      },
      en: {
        title: "Terminal",
        empty: "Terminals arrive in P4: multiple shells in the session working directory."
      }
    };

    // src/client/features/terminal/index.tsx
    function TerminalView({ t }) {
      return /* @__PURE__ */ import_react11.default.createElement("div", { className: "p-3 text-xs text-secondary" }, t("empty"));
    }
    var terminalFeature = {
      id: "terminal",
      slot: "bottomPanel",
      order: 10,
      icon: terminalIcon,
      locales: locales5,
      view: TerminalView
    };
    var terminal_default = terminalFeature;

    // src/client/features/index.ts
    var featureList = [
      project_tree_default,
      terminal_default,
      run_default,
      output_default,
      git_default
    ];

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
    var import_react18 = __toESM(require("react"), 1);

    // src/client/shell/BottomPanel.tsx
    var import_react12 = __toESM(require("react"), 1);
    function BottomPanel({ feature, height, onClose, sessionId, t }) {
      const ActiveView = feature?.view;
      return /* @__PURE__ */ import_react12.default.createElement("div", { className: "flex min-h-0 flex-col border-t border-line1 bg-layer1", style: { height } }, /* @__PURE__ */ import_react12.default.createElement("div", { className: "flex h-8 shrink-0 items-center justify-between gap-2 border-b border-line1 pl-3 pr-2" }, /* @__PURE__ */ import_react12.default.createElement("span", { className: "truncate text-xs text-primary" }, feature !== null ? t(`${feature.id}.title`) : t("shell.bottomPanelTitle")), /* @__PURE__ */ import_react12.default.createElement(
        "button",
        {
          type: "button",
          title: t("shell.closeBottomPanel"),
          onClick: onClose,
          className: "rounded px-1 text-xs text-secondary transition-colors hover:bg-layer2 hover:text-primary"
        },
        "\xD7"
      )), /* @__PURE__ */ import_react12.default.createElement("div", { className: "min-h-0 flex-1 overflow-auto" }, ActiveView !== void 0 && feature !== null ? /* @__PURE__ */ import_react12.default.createElement(ActiveView, { t: boundTranslate(t, feature.id), sessionId }) : /* @__PURE__ */ import_react12.default.createElement("div", { className: "p-3 text-xs text-secondary" }, t("shell.emptyBottomPanel"))));
    }
    function boundTranslate(t, featureId) {
      return (key) => t(`${featureId}.${key}`);
    }

    // src/client/shell/EditorArea.tsx
    var import_react13 = __toESM(require("react"), 1);
    function EditorArea({ t }) {
      return /* @__PURE__ */ import_react13.default.createElement("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col bg-base" }, /* @__PURE__ */ import_react13.default.createElement("div", { className: "flex h-9 shrink-0 items-center border-b border-line1 px-3 text-xs text-secondary" }, t("shell.editorTitle")), /* @__PURE__ */ import_react13.default.createElement("div", { className: "flex flex-1 items-center justify-center p-6" }, /* @__PURE__ */ import_react13.default.createElement("div", { className: "max-w-sm text-center" }, /* @__PURE__ */ import_react13.default.createElement("div", { className: "text-sm text-primary" }, t("shell.emptyEditor")), /* @__PURE__ */ import_react13.default.createElement("div", { className: "mt-1 text-xs text-secondary" }, t("shell.emptyEditorHint")))));
    }

    // src/client/shell/SplitHandle.tsx
    var import_react14 = __toESM(require("react"), 1);
    function SplitHandle({ orientation, current, onResize }) {
      const dragging = (0, import_react14.useRef)(false);
      const origin = (0, import_react14.useRef)({ pointer: 0, size: 0 });
      const handlePointerDown = (0, import_react14.useCallback)(
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
      const handlePointerMove = (0, import_react14.useCallback)(
        (event) => {
          if (!dragging.current) return;
          const pointer = orientation === "vertical" ? event.clientX : event.clientY;
          const delta = pointer - origin.current.pointer;
          onResize(origin.current.size + (orientation === "vertical" ? delta : -delta));
        },
        [orientation, onResize]
      );
      const handlePointerUp = (0, import_react14.useCallback)((event) => {
        if (!dragging.current) return;
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }, []);
      return /* @__PURE__ */ import_react14.default.createElement(
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
    var import_react15 = __toESM(require("react"), 1);
    function StatusBar({ sessionId, surface, t }) {
      return /* @__PURE__ */ import_react15.default.createElement("div", { className: "flex h-6 shrink-0 items-center gap-3 border-t border-line1 bg-layer1 px-3 text-xs text-secondary" }, /* @__PURE__ */ import_react15.default.createElement("span", { className: "text-primary" }, t("shell.statusLabel")), /* @__PURE__ */ import_react15.default.createElement("span", null, surface === "main" ? t("shell.surfaceMain") : t("shell.surfaceSidebar")), /* @__PURE__ */ import_react15.default.createElement("span", { className: "flex-1" }), /* @__PURE__ */ import_react15.default.createElement("span", null, sessionId === "" ? t("shell.noSession") : sessionId.slice(0, 8)));
    }

    // src/client/shell/ToolWindowBar.tsx
    var import_react16 = __toESM(require("react"), 1);
    function ToolWindowBar({
      features,
      activeId,
      onToggle,
      bottomFeatures,
      bottomActiveId,
      onToggleBottom,
      t
    }) {
      return /* @__PURE__ */ import_react16.default.createElement("div", { className: "flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line1 bg-layer1 py-2" }, features.map((feature) => /* @__PURE__ */ import_react16.default.createElement(
        BarButton,
        {
          key: feature.id,
          label: t(`${feature.id}.title`),
          active: feature.id === activeId,
          onClick: () => onToggle(feature.id),
          icon: featureGlyph(feature)
        }
      )), bottomFeatures.length > 0 && // mt-auto 把底部面板入口压到列底，位置不随上方工具窗口数量浮动
      /* @__PURE__ */ import_react16.default.createElement("div", { className: "mt-auto flex flex-col items-center gap-1" }, bottomFeatures.map((feature) => /* @__PURE__ */ import_react16.default.createElement(
        BarButton,
        {
          key: feature.id,
          label: t(`${feature.id}.title`),
          active: feature.id === bottomActiveId,
          onClick: () => onToggleBottom(feature.id),
          icon: featureGlyph(feature)
        }
      ))));
    }
    function BarButton({ label, active, onClick, icon }) {
      return /* @__PURE__ */ import_react16.default.createElement(
        "button",
        {
          type: "button",
          title: label,
          "aria-pressed": active,
          onClick,
          className: cn(
            "flex h-9 w-9 items-center justify-center rounded-md border text-xs transition-colors",
            active ? "border-line4 bg-layer2 text-primary" : "border-transparent bg-transparent text-secondary hover:bg-layer2 hover:text-primary"
          )
        },
        icon
      );
    }
    function featureGlyph(feature) {
      return feature.icon?.() ?? feature.id.slice(0, 1).toUpperCase();
    }

    // src/client/shell/use-workbench-layout.ts
    var import_react17 = require("react");
    var MIN_TOOL_WINDOW_WIDTH = 180;
    var MAX_TOOL_WINDOW_WIDTH = 560;
    var MIN_BOTTOM_PANEL_HEIGHT = 120;
    var MAX_BOTTOM_PANEL_HEIGHT = 520;
    var DEFAULT_LAYOUT = {
      toolWindowWidth: 260,
      toolWindowActive: null,
      toolWindowInitialized: true,
      bottomPanelHeight: 200,
      // 默认收起底部面板：与 IDEA 一致，首次打开工作台先把空间留给编辑区，
      // 需要时点左侧列下方的图标展开
      bottomPanelOpen: false,
      bottomPanelActive: null
    };
    var STORAGE_PREFIX = "dsh-ide.layout.v1.";
    function defaultLayoutFor(defaultToolWindowId) {
      return { ...DEFAULT_LAYOUT, toolWindowActive: defaultToolWindowId };
    }
    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }
    function loadLayout(sessionId, defaultToolWindowId) {
      if (sessionId === "") return defaultLayoutFor(defaultToolWindowId);
      try {
        const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`);
        if (raw === null) return defaultLayoutFor(defaultToolWindowId);
        const parsed = JSON.parse(raw);
        const activeId = parsed.toolWindowActive;
        const bottomId = parsed.bottomPanelActive;
        const initialized = parsed.toolWindowInitialized === true;
        return {
          toolWindowWidth: clamp(
            typeof parsed.toolWindowWidth === "number" ? parsed.toolWindowWidth : DEFAULT_LAYOUT.toolWindowWidth,
            MIN_TOOL_WINDOW_WIDTH,
            MAX_TOOL_WINDOW_WIDTH
          ),
          toolWindowActive: initialized ? typeof activeId === "string" ? activeId : null : defaultToolWindowId,
          toolWindowInitialized: true,
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
        return defaultLayoutFor(defaultToolWindowId);
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
    function useWorkbenchLayout(sessionId, defaultToolWindowId) {
      const [layout, setLayout] = (0, import_react17.useState)(() => loadLayout(sessionId, defaultToolWindowId));
      (0, import_react17.useEffect)(() => {
        setLayout(loadLayout(sessionId, defaultToolWindowId));
      }, [sessionId, defaultToolWindowId]);
      (0, import_react17.useEffect)(() => {
        saveLayout(sessionId, layout);
      }, [sessionId, layout]);
      const update = (0, import_react17.useCallback)((patch) => {
        setLayout((previous) => ({ ...previous, ...patch }));
      }, []);
      return { layout, update };
    }

    // src/client/shell/Workbench.tsx
    function Workbench({ sessionId, t, surface = "main" }) {
      const defaultToolWindowId = toolWindowFeatures[0]?.id ?? null;
      const { layout, update } = useWorkbenchLayout(sessionId, defaultToolWindowId);
      const activeToolWindow = toolWindowFeatures.find((feature) => feature.id === layout.toolWindowActive);
      const ActiveToolView = activeToolWindow?.view;
      const bottomPanel = bottomPanelFeatures.find((feature) => feature.id === layout.bottomPanelActive) ?? bottomPanelFeatures[0];
      const showBottomPanel = layout.bottomPanelOpen && bottomPanel !== void 0;
      const toggleToolWindow = (0, import_react18.useCallback)(
        (id) => {
          update({ toolWindowActive: layout.toolWindowActive === id ? null : id });
        },
        [layout.toolWindowActive, update]
      );
      const toggleBottomPanel = (0, import_react18.useCallback)(
        (id) => {
          const expanded = layout.bottomPanelOpen && bottomPanel?.id === id;
          update(expanded ? { bottomPanelOpen: false } : { bottomPanelActive: id, bottomPanelOpen: true });
        },
        [bottomPanel?.id, layout.bottomPanelOpen, update]
      );
      const closeBottomPanel = (0, import_react18.useCallback)(() => update({ bottomPanelOpen: false }), [update]);
      return /* @__PURE__ */ import_react18.default.createElement(
        "div",
        {
          className: "dsh-ide-root",
          "data-conversation-composer-overlay": surface === "main" ? "" : void 0,
          "data-immersive": surface === "main" ? "1" : void 0
        },
        /* @__PURE__ */ import_react18.default.createElement("div", { className: "flex min-h-0 flex-1" }, /* @__PURE__ */ import_react18.default.createElement(
          ToolWindowBar,
          {
            features: toolWindowFeatures,
            activeId: layout.toolWindowActive,
            onToggle: toggleToolWindow,
            bottomFeatures: bottomPanelFeatures,
            bottomActiveId: layout.bottomPanelOpen ? bottomPanel?.id ?? null : null,
            onToggleBottom: toggleBottomPanel,
            t
          }
        ), /* @__PURE__ */ import_react18.default.createElement("div", { className: "flex min-h-0 min-w-0 flex-1 flex-col" }, /* @__PURE__ */ import_react18.default.createElement("div", { className: "flex min-h-0 flex-1" }, ActiveToolView !== void 0 && activeToolWindow !== void 0 && /* @__PURE__ */ import_react18.default.createElement(import_react18.default.Fragment, null, /* @__PURE__ */ import_react18.default.createElement(
          "div",
          {
            className: "flex min-h-0 shrink-0 flex-col border-r border-line1 bg-layer1",
            style: { width: layout.toolWindowWidth }
          },
          /* @__PURE__ */ import_react18.default.createElement("div", { className: "min-h-0 flex-1 overflow-auto" }, /* @__PURE__ */ import_react18.default.createElement(ActiveToolView, { t: bindFeatureTranslate(t, activeToolWindow.id), sessionId }))
        ), /* @__PURE__ */ import_react18.default.createElement(
          SplitHandle,
          {
            orientation: "vertical",
            current: () => layout.toolWindowWidth,
            onResize: (next) => update({ toolWindowWidth: clampLayoutSize("toolWindowWidth", next) })
          }
        )), /* @__PURE__ */ import_react18.default.createElement(EditorArea, { t })), showBottomPanel && /* @__PURE__ */ import_react18.default.createElement(import_react18.default.Fragment, null, /* @__PURE__ */ import_react18.default.createElement(
          SplitHandle,
          {
            orientation: "horizontal",
            current: () => layout.bottomPanelHeight,
            onResize: (next) => update({ bottomPanelHeight: clampLayoutSize("bottomPanelHeight", next) })
          }
        ), /* @__PURE__ */ import_react18.default.createElement(
          BottomPanel,
          {
            feature: bottomPanel ?? null,
            height: layout.bottomPanelHeight,
            onClose: closeBottomPanel,
            sessionId,
            t
          }
        )))),
        /* @__PURE__ */ import_react18.default.createElement(StatusBar, { sessionId, surface, t })
      );
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
        // 空态说明，提示后续阶段会接入什么
        "shell.emptyEditorHint": "\u6587\u4EF6\u6807\u7B7E\u9875\u4E0E\u7F16\u8F91\u5668\u5C06\u5728\u4E0B\u4E00\u4E2A\u9636\u6BB5\u63A5\u5165\u3002",
        // 底部面板没有可用面板时的标题
        "shell.bottomPanelTitle": "\u9762\u677F",
        // 底部面板内容区空态文案
        "shell.emptyBottomPanel": "\u8FD8\u6CA1\u6709\u53EF\u7528\u7684\u5E95\u90E8\u9762\u677F",
        // 底部面板关闭按钮的悬停提示
        "shell.closeBottomPanel": "\u5173\u95ED\u9762\u677F",
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
        "shell.emptyEditorHint": "File tabs and the editor arrive in the next phase.",
        "shell.bottomPanelTitle": "Panel",
        "shell.emptyBottomPanel": "No bottom panel is available yet",
        "shell.closeBottomPanel": "Close panel",
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
        ctx.inject(["remote", "remote.workspaceFiles"], (scoped) => {
          const workspaceFiles = asWorkspaceFilesRemote(scoped.get?.("remote"));
          if (workspaceFiles === void 0) {
            console.error("[dsh-ide] \u5BBF\u4E3B\u672A\u63D0\u4F9B remote.workspaceFiles\uFF0C\u9879\u76EE\u6811\u4E0D\u53EF\u7528");
            return;
          }
          scoped.effect(() => {
            setWorkspaceFilesRemote(workspaceFiles);
            return () => setWorkspaceFilesRemote(void 0);
          }, "dsh-ide: workspace files");
        });
        const MainView = (props) => /* @__PURE__ */ import_react19.default.createElement(Workbench, { t, sessionId: readSessionId(props), surface: "main" });
        const SidebarView = (props) => /* @__PURE__ */ import_react19.default.createElement(Workbench, { t, sessionId: readSessionId(props), surface: "sidebar" });
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
