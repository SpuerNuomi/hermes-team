import { describe, expect, it } from "vitest";
import {
  buildCssSelector,
  buildInspectPayload,
  collectAttributes,
  describeElementLabel,
  formatInspectInjection,
  truncate,
  type InspectableElement,
} from "../src/renderer/webPreviewInspector";

// Lightweight DOM stand-in so the pure helpers can be exercised in Node.
interface FakeOptions {
  tagName: string;
  id?: string;
  attributes?: Record<string, string>;
  textContent?: string;
  outerHTML?: string;
  parent?: FakeElement | null;
}

class FakeElement implements InspectableElement {
  tagName: string;
  id: string;
  parentElement: FakeElement | null;
  children: FakeElement[] = [];
  textContent: string;
  outerHTML: string;
  private attrs: Record<string, string>;

  constructor(options: FakeOptions) {
    this.tagName = options.tagName;
    this.id = options.id ?? "";
    this.attrs = { ...(options.attributes ?? {}) };
    if (options.id) this.attrs.id = options.id;
    this.textContent = options.textContent ?? "";
    this.outerHTML = options.outerHTML ?? "";
    this.parentElement = options.parent ?? null;
    if (this.parentElement) this.parentElement.children.push(this);
  }

  getAttribute(name: string): string | null {
    return name in this.attrs ? this.attrs[name] : null;
  }
}

describe("truncate", () => {
  it("returns the value unchanged when within the limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("adds an ellipsis when over the limit", () => {
    expect(truncate("hello world", 5)).toBe("hell…");
  });
});

describe("buildCssSelector", () => {
  it("prefers an id selector", () => {
    const el = new FakeElement({ tagName: "BUTTON", id: "submit" });
    expect(buildCssSelector(el)).toBe("#submit");
  });

  it("builds a class-based path and stops at body", () => {
    const body = new FakeElement({ tagName: "BODY" });
    const section = new FakeElement({ tagName: "SECTION", attributes: { class: "panel" }, parent: body });
    const button = new FakeElement({ tagName: "BUTTON", attributes: { class: "btn primary" }, parent: section });
    expect(buildCssSelector(button)).toBe("section.panel > button.btn");
  });

  it("uses nth-of-type when siblings share a tag and have no class", () => {
    const list = new FakeElement({ tagName: "UL", attributes: { class: "list" } });
    new FakeElement({ tagName: "LI", parent: list });
    const second = new FakeElement({ tagName: "LI", parent: list });
    expect(buildCssSelector(second)).toBe("ul.list > li:nth-of-type(2)");
  });

  it("ignores internal inspector classes", () => {
    const el = new FakeElement({ tagName: "DIV", attributes: { class: "__hermes_inspector_overlay real" } });
    expect(buildCssSelector(el)).toBe("div.real");
  });
});

describe("collectAttributes", () => {
  it("returns only allowlisted, non-empty attributes", () => {
    const el = new FakeElement({
      tagName: "A",
      attributes: { href: "/x", class: "link", "data-secret": "nope", title: "" },
    });
    const attrs = collectAttributes(el);
    const names = attrs.map((a) => a.name);
    expect(names).toContain("href");
    expect(names).toContain("class");
    expect(names).not.toContain("data-secret");
    expect(names).not.toContain("title");
  });
});

describe("buildInspectPayload", () => {
  it("captures normalized, truncated element details", () => {
    const el = new FakeElement({
      tagName: "BUTTON",
      id: "save",
      attributes: { class: "btn", type: "submit" },
      textContent: "  Save\n  changes  ",
      outerHTML: "<button id=\"save\">Save</button>",
    });
    const payload = buildInspectPayload(el);
    expect(payload.tagName).toBe("button");
    expect(payload.id).toBe("save");
    expect(payload.selector).toBe("#save");
    expect(payload.text).toBe("Save changes");
    expect(payload.attributes.map((a) => a.name)).toEqual(["id", "class", "type"]);
    expect(payload.outerHTML).toBe('<button id="save">Save</button>');
  });
});

describe("describeElementLabel", () => {
  it("formats tag, id and classes", () => {
    const el = new FakeElement({ tagName: "DIV", id: "main", attributes: { class: "a b" } });
    expect(describeElementLabel(el)).toBe("div#main.a.b");
  });
});

describe("formatInspectInjection", () => {
  it("renders a compact text block with present fields only", () => {
    const block = formatInspectInjection({
      tagName: "button",
      id: "save",
      className: "btn",
      selector: "#save",
      text: "Save changes",
      attributes: [
        { name: "id", value: "save" },
        { name: "type", value: "submit" },
      ],
      outerHTML: '<button id="save">Save</button>',
    });
    expect(block).toBe(
      [
        "[Web preview element] <button>",
        "- selector: #save",
        "- text: Save changes",
        '- attributes: id="save" type="submit"',
        '- html: <button id="save">Save</button>',
      ].join("\n"),
    );
  });

  it("omits empty optional fields", () => {
    const block = formatInspectInjection({
      tagName: "div",
      id: "",
      className: "",
      selector: "div.box",
      text: "",
      attributes: [],
      outerHTML: "",
    });
    expect(block).toBe(["[Web preview element] <div>", "- selector: div.box"].join("\n"));
  });
});
