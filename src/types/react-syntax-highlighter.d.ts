declare module "react-syntax-highlighter" {
  import type { ComponentType, CSSProperties } from "react";

  export const Prism: ComponentType<{
    children: string;
    language?: string;
    PreTag?: string;
    style?: Record<string, CSSProperties>;
    customStyle?: CSSProperties;
  }>;
}

declare module "react-syntax-highlighter/dist/esm/prism-light" {
  import type { ComponentType, CSSProperties } from "react";

  const SyntaxHighlighter: ComponentType<{
    children: string;
    language?: string;
    PreTag?: string;
    style?: Record<string, CSSProperties>;
    customStyle?: CSSProperties;
  }> & {
    registerLanguage: (name: string, language: unknown) => void;
    alias?: (name: string, aliases: string | string[]) => void;
  };
  export default SyntaxHighlighter;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism/one-dark" {
  import type { CSSProperties } from "react";

  const style: Record<string, CSSProperties>;
  export default style;
}

declare module "react-syntax-highlighter/dist/esm/languages/prism/*" {
  const language: unknown;
  export default language;
}
