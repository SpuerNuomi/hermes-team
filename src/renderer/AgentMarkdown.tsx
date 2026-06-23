import { memo, useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy } from "lucide-react";

type SyntaxHighlighterComponent = ComponentType<{
  children: string;
  language?: string;
  PreTag?: string;
  style?: Record<string, CSSProperties>;
  customStyle?: CSSProperties;
}> & {
  registerLanguage: (name: string, language: unknown) => void;
  alias?: (name: string, aliases: string | string[]) => void;
};

let SyntaxHighlighter: SyntaxHighlighterComponent | null = null;
let oneDarkStyle: Record<string, CSSProperties> | null = null;
let highlighterLoadingPromise: Promise<void> | null = null;

function loadHighlighter(): Promise<void> {
  if (SyntaxHighlighter && oneDarkStyle) return Promise.resolve();
  if (highlighterLoadingPromise) return highlighterLoadingPromise;
  highlighterLoadingPromise = Promise.all([
    import("react-syntax-highlighter/dist/esm/prism-light"),
    import("react-syntax-highlighter/dist/esm/styles/prism/one-dark"),
    import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
    import("react-syntax-highlighter/dist/esm/languages/prism/javascript"),
    import("react-syntax-highlighter/dist/esm/languages/prism/typescript"),
    import("react-syntax-highlighter/dist/esm/languages/prism/tsx"),
    import("react-syntax-highlighter/dist/esm/languages/prism/jsx"),
    import("react-syntax-highlighter/dist/esm/languages/prism/json"),
    import("react-syntax-highlighter/dist/esm/languages/prism/markdown"),
    import("react-syntax-highlighter/dist/esm/languages/prism/python"),
    import("react-syntax-highlighter/dist/esm/languages/prism/rust"),
    import("react-syntax-highlighter/dist/esm/languages/prism/go"),
    import("react-syntax-highlighter/dist/esm/languages/prism/java"),
    import("react-syntax-highlighter/dist/esm/languages/prism/yaml"),
    import("react-syntax-highlighter/dist/esm/languages/prism/sql"),
    import("react-syntax-highlighter/dist/esm/languages/prism/css"),
    import("react-syntax-highlighter/dist/esm/languages/prism/scss"),
    import("react-syntax-highlighter/dist/esm/languages/prism/docker"),
  ]).then(([module, style, bash, javascript, typescript, tsx, jsx, json, markdown, python, rust, go, java, yaml, sql, css, scss, docker]) => {
    SyntaxHighlighter = module.default;
    SyntaxHighlighter.registerLanguage("bash", bash.default);
    SyntaxHighlighter.registerLanguage("javascript", javascript.default);
    SyntaxHighlighter.registerLanguage("typescript", typescript.default);
    SyntaxHighlighter.registerLanguage("tsx", tsx.default);
    SyntaxHighlighter.registerLanguage("jsx", jsx.default);
    SyntaxHighlighter.registerLanguage("json", json.default);
    SyntaxHighlighter.registerLanguage("markdown", markdown.default);
    SyntaxHighlighter.registerLanguage("python", python.default);
    SyntaxHighlighter.registerLanguage("rust", rust.default);
    SyntaxHighlighter.registerLanguage("go", go.default);
    SyntaxHighlighter.registerLanguage("java", java.default);
    SyntaxHighlighter.registerLanguage("yaml", yaml.default);
    SyntaxHighlighter.registerLanguage("sql", sql.default);
    SyntaxHighlighter.registerLanguage("css", css.default);
    SyntaxHighlighter.registerLanguage("scss", scss.default);
    SyntaxHighlighter.registerLanguage("docker", docker.default);
    SyntaxHighlighter.alias?.("bash", ["sh", "shell", "zsh"]);
    SyntaxHighlighter.alias?.("docker", ["dockerfile"]);
    oneDarkStyle = style.default;
  });
  return highlighterLoadingPromise;
}

function copyText(value: string): void {
  void navigator.clipboard?.writeText(value);
}

function DiffView({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <div className="chat-diff-content">
      {lines.map((line, index) => {
        let className = "chat-diff-line";
        if (line.startsWith("+")) className += " chat-diff-add";
        else if (line.startsWith("-")) className += " chat-diff-remove";
        else if (line.startsWith("@@")) className += " chat-diff-hunk";
        return (
          <div className={className} key={`${index}-${line}`}>
            {line || "\u00A0"}
          </div>
        );
      })}
    </div>
  );
}

const expandedCodeBlocks = new Set<string>();

function CodeBlock({
  className,
  children,
  blockId,
}: {
  className?: string;
  children?: ReactNode;
  blockId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() =>
    blockId ? !expandedCodeBlocks.has(blockId) : true,
  );
  const [highlighterReady, setHighlighterReady] = useState(
    () => SyntaxHighlighter !== null && oneDarkStyle !== null,
  );
  const code = String(children).replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const isDiff = language === "diff";
  const linesCount = code.split("\n").length;
  const isLong = linesCount > 15 || code.length > 800;

  useEffect(() => {
    if (!highlighterReady) {
      loadHighlighter().then(() => setHighlighterReady(true));
    }
  }, [highlighterReady]);

  const fallbackPre = (
    <pre
      style={{
        margin: 0,
        borderRadius: 0,
        fontSize: "13px",
        padding: "12px",
        background: "transparent",
        color: "#abb2bf",
        overflow: "auto",
      }}
    >
      {code}
    </pre>
  );

  const codeContent = isDiff ? (
    <DiffView code={code} />
  ) : highlighterReady && SyntaxHighlighter && oneDarkStyle ? (
    <SyntaxHighlighter
      style={oneDarkStyle}
      language={language || "text"}
      PreTag="div"
      customStyle={{
        margin: 0,
        borderRadius: 0,
        fontSize: "13px",
        padding: "12px",
        background: "transparent",
      }}
    >
      {code}
    </SyntaxHighlighter>
  ) : (
    fallbackPre
  );

  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span className="chat-code-lang">{isDiff ? "diff" : language || "code"}</span>
        <button
          className="chat-code-copy"
          type="button"
          onClick={() => {
            copyText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : <Copy size={13} />}
        </button>
      </div>
      <div className={isLong && isCollapsed ? "chat-code-collapsed" : ""}>{codeContent}</div>
      {isLong && (
        <button
          className="chat-code-expand-btn"
          type="button"
          onClick={() =>
            setIsCollapsed((previous) => {
              const next = !previous;
              if (blockId) {
                if (next) expandedCodeBlocks.delete(blockId);
                else expandedCodeBlocks.add(blockId);
              }
              return next;
            })
          }
        >
          {isCollapsed ? "Show more" : "Show less"}
        </button>
      )}
    </div>
  );
}

export const AgentMarkdown = memo(function AgentMarkdown({
  children,
}: {
  children: string;
}) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children: linkChildren }) => (
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault();
              if (!href) return;
              try {
                const url = new URL(href, "https://placeholder.invalid");
                if (!["http:", "https:", "mailto:"].includes(url.protocol)) return;
              } catch {
                return;
              }
              window.open(href, "_blank", "noopener,noreferrer");
            }}
          >
            {linkChildren}
          </a>
        ),
        code: ({ className, children: codeChildren, node, ...props }) => {
          const isInline =
            !className &&
            typeof codeChildren === "string" &&
            !codeChildren.includes("\n");
          if (isInline) {
            return (
              <code className={className} {...props}>
                {codeChildren}
              </code>
            );
          }
          const start = node?.position?.start;
          const blockId =
            start != null ? `${start.offset ?? start.line}:${className ?? ""}` : undefined;
          return (
            <CodeBlock className={className} blockId={blockId}>
              {codeChildren}
            </CodeBlock>
          );
        },
      }}
    >
      {children}
    </Markdown>
  );
});

export default AgentMarkdown;
