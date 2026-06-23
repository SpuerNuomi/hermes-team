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

declare module "react-syntax-highlighter/dist/esm/styles/prism/one-dark" {
  import type { CSSProperties } from "react";

  const style: Record<string, CSSProperties>;
  export default style;
}
