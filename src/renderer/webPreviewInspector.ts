// Web preview element picker ("inspect element" mode).
//
// In the upstream Electron baseline this is implemented by injecting a script
// into an Electron <webview> via executeJavaScript and reading the result back
// over console-message. This project renders the preview in a plain <iframe>
// inside a Tauri WebView, so the same approach is not available: the browser
// same-origin policy blocks any DOM access to a cross-origin frame.
//
// The best-effort equivalent here attaches the picker directly to the iframe's
// own document when (and only when) that document is reachable, i.e. the
// previewed page shares the app origin. We do not eval injected script strings
// and we never render captured markup as HTML, so there is no script-injection
// or XSS surface: captured data is only ever surfaced as plain text in the chat
// composer. Cross-origin pages cannot be inspected and the panel reports that
// limitation instead of failing silently.

const MAX_SELECTOR_DEPTH = 5;
const MAX_TEXT_LENGTH = 200;
const MAX_HTML_LENGTH = 600;
const MAX_LABEL_LENGTH = 60;

// Attributes worth surfacing as context. Kept to an allowlist so we never leak
// noisy or sensitive inline data, and so the helper stays testable without a
// real NamedNodeMap.
const ATTRIBUTE_ALLOWLIST = [
  "id",
  "class",
  "name",
  "type",
  "role",
  "href",
  "src",
  "alt",
  "title",
  "placeholder",
  "value",
  "aria-label",
  "data-testid",
] as const;

export interface InspectAttribute {
  name: string;
  value: string;
}

export interface InspectPayload {
  tagName: string;
  id: string;
  className: string;
  selector: string;
  text: string;
  attributes: InspectAttribute[];
  outerHTML: string;
}

// Minimal structural view of a DOM element so the pure helpers can be unit
// tested in a Node environment with lightweight fakes.
export interface InspectableElement {
  tagName: string;
  id?: string;
  parentElement?: InspectableElement | null;
  getAttribute(name: string): string | null;
  textContent?: string | null;
  outerHTML?: string;
  children?: ArrayLike<InspectableElement>;
}

// Collapse runs of whitespace and strip control characters so multi-line markup
// becomes a single readable line before truncation.
function normalizeWhitespace(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

export function truncate(value: string, max: number): string {
  const normalized = value;
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

// CSS.escape is available in browsers; fall back to a conservative escape so the
// helper also works under Node-based unit tests.
function escapeIdentifier(value: string): string {
  const globalCss = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS;
  if (globalCss && typeof globalCss.escape === "function") {
    return globalCss.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function classListOf(el: InspectableElement): string[] {
  const raw = el.getAttribute("class");
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((cls) => cls.trim())
    .filter((cls) => cls.length > 0 && !cls.startsWith("__hermes"));
}

function nthOfTypeIndex(el: InspectableElement): number | null {
  const parent = el.parentElement;
  if (!parent || !parent.children) return null;
  const tag = el.tagName?.toLowerCase();
  let index = 0;
  let position = -1;
  for (let i = 0; i < parent.children.length; i += 1) {
    const sibling = parent.children[i];
    if (sibling.tagName?.toLowerCase() === tag) {
      index += 1;
      if (sibling === el) position = index;
    }
  }
  return index > 1 && position > 0 ? position : null;
}

// Build a reasonably specific CSS selector. Prefers an id when present, then a
// short ancestor path using tag + first class + :nth-of-type disambiguation.
export function buildCssSelector(el: InspectableElement): string {
  if (el.id) {
    return `#${escapeIdentifier(el.id)}`;
  }

  const parts: string[] = [];
  let current: InspectableElement | null | undefined = el;
  let depth = 0;

  while (current && depth < MAX_SELECTOR_DEPTH) {
    const tag = (current.tagName || "").toLowerCase();
    if (!tag || tag === "html" || tag === "body") break;

    if (current.id) {
      parts.unshift(`#${escapeIdentifier(current.id)}`);
      break;
    }

    let part = tag;
    const classes = classListOf(current);
    if (classes.length > 0) {
      part += `.${escapeIdentifier(classes[0])}`;
    } else {
      const nth = nthOfTypeIndex(current);
      if (nth) part += `:nth-of-type(${nth})`;
    }

    parts.unshift(part);
    current = current.parentElement;
    depth += 1;
  }

  return parts.join(" > ") || (el.tagName || "").toLowerCase() || "*";
}

export function collectAttributes(el: InspectableElement): InspectAttribute[] {
  const attributes: InspectAttribute[] = [];
  for (const name of ATTRIBUTE_ALLOWLIST) {
    const value = el.getAttribute(name);
    if (value != null && value !== "") {
      attributes.push({ name, value: truncate(normalizeWhitespace(value), 160) });
    }
  }
  return attributes;
}

export function buildInspectPayload(el: InspectableElement): InspectPayload {
  const tagName = (el.tagName || "").toLowerCase();
  const id = el.id || "";
  const className = el.getAttribute("class") || "";
  const text = truncate(normalizeWhitespace(el.textContent || ""), MAX_TEXT_LENGTH);
  const outerHTML = truncate(normalizeWhitespace(el.outerHTML || ""), MAX_HTML_LENGTH);

  return {
    tagName,
    id,
    className,
    selector: buildCssSelector(el),
    text,
    attributes: collectAttributes(el),
    outerHTML,
  };
}

// Short human-readable label used by the hover overlay (tag#id.class).
export function describeElementLabel(el: InspectableElement): string {
  let label = (el.tagName || "").toLowerCase() || "node";
  if (el.id) label += `#${el.id}`;
  const classes = classListOf(el);
  if (classes.length > 0) label += `.${classes.join(".")}`;
  return truncate(label, MAX_LABEL_LENGTH);
}

// Render the picked element as a compact, copy-friendly text block for the chat
// composer. Returned as plain text only — never injected as HTML.
export function formatInspectInjection(payload: InspectPayload): string {
  const lines: string[] = [];
  lines.push(`[Web preview element] <${payload.tagName || "node"}>`);
  lines.push(`- selector: ${payload.selector}`);
  if (payload.text) lines.push(`- text: ${payload.text}`);
  if (payload.attributes.length > 0) {
    const attrs = payload.attributes
      .map((attr) => `${attr.name}="${attr.value}"`)
      .join(" ");
    lines.push(`- attributes: ${attrs}`);
  }
  if (payload.outerHTML) lines.push(`- html: ${payload.outerHTML}`);
  return lines.join("\n");
}

export interface InspectorHandlers {
  onPick: (payload: InspectPayload) => void;
  onCancel: () => void;
}

export interface InspectorController {
  destroy: () => void;
}

const OVERLAY_ID = "__hermes_inspector_overlay";
const LABEL_ID = "__hermes_inspector_label";

// Attach the picker to a same-origin iframe document. Highlights the hovered
// element, picks on click, and cancels on Escape. Returns a controller whose
// destroy() fully removes the overlay and listeners.
export function createInspectorController(
  doc: Document,
  win: Window,
  handlers: InspectorHandlers,
): InspectorController {
  const overlay = doc.createElement("div");
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483646",
    backgroundColor: "rgba(59, 130, 246, 0.3)",
    border: "2px solid rgba(59, 130, 246, 0.85)",
    borderRadius: "4px",
    boxSizing: "border-box",
    transition: "all 0.05s ease-out",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  const label = doc.createElement("div");
  label.id = LABEL_ID;
  Object.assign(label.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483647",
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    color: "#ffffff",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontFamily: "monospace",
    whiteSpace: "nowrap",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.25)",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  doc.body.appendChild(overlay);
  doc.body.appendChild(label);

  let hovered: Element | null = null;
  let destroyed = false;

  const isOwnElement = (el: Element | null): boolean =>
    !!el && (el === overlay || el === label);

  const onMouseMove = (event: MouseEvent): void => {
    const el = doc.elementFromPoint(event.clientX, event.clientY);
    if (!el || isOwnElement(el) || el === doc.body || el === doc.documentElement) {
      overlay.style.display = "none";
      label.style.display = "none";
      hovered = null;
      return;
    }
    if (hovered === el) return;
    hovered = el;

    const rect = el.getBoundingClientRect();
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.display = "block";

    label.textContent = describeElementLabel(el as unknown as InspectableElement);
    label.style.display = "block";

    const labelRect = label.getBoundingClientRect();
    let labelTop = rect.top - labelRect.height - 4;
    if (labelTop < 0) labelTop = rect.bottom + 4;
    let labelLeft = rect.left;
    const viewportWidth = win.innerWidth || doc.documentElement.clientWidth;
    if (labelLeft + labelRect.width > viewportWidth) {
      labelLeft = viewportWidth - labelRect.width - 8;
    }
    label.style.top = `${labelTop}px`;
    label.style.left = `${Math.max(8, labelLeft)}px`;
  };

  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (hovered) {
      const payload = buildInspectPayload(hovered as unknown as InspectableElement);
      destroy();
      handlers.onPick(payload);
    } else {
      destroy();
      handlers.onCancel();
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      destroy();
      handlers.onCancel();
    }
  };

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    doc.removeEventListener("mousemove", onMouseMove, true);
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
    label.remove();
    hovered = null;
  }

  doc.addEventListener("mousemove", onMouseMove, true);
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("keydown", onKeyDown, true);

  return { destroy };
}
