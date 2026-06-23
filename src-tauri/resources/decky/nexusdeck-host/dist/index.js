const manifest = {"name":"NexusDeck Host"};
const API_VERSION = 2;
const internalAPIConnection = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
if (!internalAPIConnection) {
    throw new Error('[@decky/api]: Failed to connect to the loader as as the loader API was not initialized. This is likely a bug in Decky Loader.');
}
let api;
try {
    api = internalAPIConnection.connect(API_VERSION, manifest.name);
}
catch {
    api = internalAPIConnection.connect(1, manifest.name);
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version 1. Some features may not work.`);
}
if (api._version != API_VERSION) {
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version ${api._version}. Some features may not work.`);
}
const callable = api.callable;

var DefaultContext = {
  color: undefined,
  size: undefined,
  className: undefined,
  style: undefined,
  attr: undefined
};
var IconContext = SP_REACT.createContext && /*#__PURE__*/SP_REACT.createContext(DefaultContext);

var _excluded = ["attr", "size", "title"];
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], -1 === t.indexOf(o) && {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (-1 !== e.indexOf(n)) continue; t[n] = r[n]; } return t; }
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), true).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: true, configurable: true, writable: true }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function Tree2Element(tree) {
  return tree && tree.map((node, i) => /*#__PURE__*/SP_REACT.createElement(node.tag, _objectSpread({
    key: i
  }, node.attr), Tree2Element(node.child)));
}
function GenIcon(data) {
  return props => /*#__PURE__*/SP_REACT.createElement(IconBase, _extends({
    attr: _objectSpread({}, data.attr)
  }, props), Tree2Element(data.child));
}
function IconBase(props) {
  var elem = conf => {
    var {
        attr,
        size,
        title
      } = props,
      svgProps = _objectWithoutProperties(props, _excluded);
    var computedSize = size || conf.size || "1em";
    var className;
    if (conf.className) className = conf.className;
    if (props.className) className = (className ? className + " " : "") + props.className;
    return /*#__PURE__*/SP_REACT.createElement("svg", _extends({
      stroke: "currentColor",
      fill: "currentColor",
      strokeWidth: "0"
    }, conf.attr, attr, svgProps, {
      className: className,
      style: _objectSpread(_objectSpread({
        color: props.color || conf.color
      }, conf.style), props.style),
      height: computedSize,
      width: computedSize,
      xmlns: "http://www.w3.org/2000/svg"
    }), title && /*#__PURE__*/SP_REACT.createElement("title", null, title), props.children);
  };
  return IconContext !== undefined ? /*#__PURE__*/SP_REACT.createElement(IconContext.Consumer, null, conf => elem(conf)) : elem(DefaultContext);
}

// THIS FILE IS AUTO GENERATED
function FaWrench (props) {
  return GenIcon({"attr":{"viewBox":"0 0 512 512"},"child":[{"tag":"path","attr":{"d":"M507.73 109.1c-2.24-9.03-13.54-12.09-20.12-5.51l-74.36 74.36-67.88-11.31-11.31-67.88 74.36-74.36c6.62-6.62 3.43-17.9-5.66-20.16-47.38-11.74-99.55.91-136.58 37.93-39.64 39.64-50.55 97.1-34.05 147.2L18.74 402.76c-24.99 24.99-24.99 65.51 0 90.5 24.99 24.99 65.51 24.99 90.5 0l213.21-213.21c50.12 16.71 107.47 5.68 147.37-34.22 37.07-37.07 49.7-89.32 37.91-136.73zM64 472c-13.25 0-24-10.75-24-24 0-13.26 10.75-24 24-24s24 10.74 24 24c0 13.25-10.75 24-24 24z"},"child":[]}]})(props);
}

const getStatus = callable("get_status");
const runHealthCheck = callable("run_health_check");
const launchNexusdeck = callable("launch_nexusdeck");
const openStagingFolder = callable("open_staging_folder");
const exportSupportBundle = callable("export_support_bundle");
function lineColor(line) {
    if (line.startsWith("FAIL"))
        return "#f87171";
    if (line.startsWith("WARN"))
        return "#fbbf24";
    return "#a3e635";
}
function Content() {
    const [status, setStatus] = SP_REACT.useState(null);
    const [health, setHealth] = SP_REACT.useState([]);
    const [message, setMessage] = SP_REACT.useState(null);
    const [busy, setBusy] = SP_REACT.useState(false);
    const refresh = SP_REACT.useCallback(() => {
        getStatus()
            .then(setStatus)
            .catch((e) => setMessage(String(e)));
    }, []);
    SP_REACT.useEffect(() => {
        refresh();
    }, [refresh]);
    const runAction = async (action) => {
        setBusy(true);
        setMessage(null);
        try {
            const result = await action();
            if (typeof result === "string") {
                setMessage(result);
            }
            else if ("method" in result && result.method) {
                setMessage(`${result.message} (${result.method})`);
            }
            else {
                setMessage(result.message);
            }
        }
        catch (e) {
            setMessage(String(e));
        }
        finally {
            setBusy(false);
        }
    };
    const onHealth = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const result = await runHealthCheck();
            setHealth(result.lines);
            setMessage(result.ok
                ? "All critical checks passed."
                : "Some checks failed — review the report below.");
        }
        catch (e) {
            setMessage(String(e));
        }
        finally {
            setBusy(false);
        }
    };
    return (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsxs(DFL.PanelSection, { title: "NexusDeck Host", children: [SP_JSX.jsx(DFL.Field, { label: "Status", children: status?.message ?? "Loading…" }), status && (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsxs(DFL.Field, { label: "Plugin", children: ["v", status.plugin_version] }), SP_JSX.jsx(DFL.Field, { label: "NexusDeck", children: status.flatpak_registered || status.nexusdeck_installed
                                    ? "Installed"
                                    : "Not installed" }), SP_JSX.jsx(DFL.Field, { label: "Protontricks", children: status.protontricks_ok ? "Ready" : "Missing — see Settings guide" }), SP_JSX.jsx(DFL.Field, { label: "Steam shortcut", children: status.steam_shortcut_present
                                    ? "Found"
                                    : "Not found — add from NexusDeck Settings" })] })), message && (SP_JSX.jsx(DFL.Field, { label: "Last action", children: SP_JSX.jsx("div", { style: { whiteSpace: "pre-wrap", fontSize: 12 }, children: message }) }))] }), SP_JSX.jsxs(DFL.PanelSection, { title: "Launch & folders", children: [SP_JSX.jsx(DFL.DialogButton, { onClick: () => void runAction(launchNexusdeck), disabled: busy, children: "Open NexusDeck" }), SP_JSX.jsx(DFL.DialogButton, { onClick: () => void runAction(openStagingFolder), disabled: busy, children: "Open ~/NexusDeck staging" })] }), SP_JSX.jsxs(DFL.PanelSection, { title: "Diagnostics", children: [SP_JSX.jsx(DFL.DialogButton, { onClick: () => void onHealth(), disabled: busy, children: "Run health check" }), SP_JSX.jsx(DFL.DialogButton, { onClick: () => void runAction(exportSupportBundle), disabled: busy, children: "Export support bundle" }), SP_JSX.jsx(DFL.DialogButton, { onClick: () => refresh(), disabled: busy, children: "Refresh status" })] }), health.length > 0 && (SP_JSX.jsx(DFL.PanelSection, { title: "Health report", children: health.map((line) => (SP_JSX.jsx("div", { style: { fontSize: 12, marginBottom: 4, color: lineColor(line) }, children: line }, line))) }))] }));
}
var index = DFL.definePlugin(() => ({
    title: "NexusDeck",
    content: SP_JSX.jsx(Content, {}),
    icon: SP_JSX.jsx(FaWrench, {}),
}));

export { index as default };
//# sourceMappingURL=index.js.map
