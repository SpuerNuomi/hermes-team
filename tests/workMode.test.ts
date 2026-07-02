import { describe, expect, it } from "vitest";
import {
  isDestructiveToolCall,
  isToolAllowedForWorkMode,
  isWriteOrExecTool,
  looksDestructiveInstruction,
  normalizeWorkMode,
} from "../src/core/workMode";

describe("workMode", () => {
  it("normalizes unknown values to ask", () => {
    expect(normalizeWorkMode("craft")).toBe("craft");
    expect(normalizeWorkMode("unknown")).toBe("ask");
  });

  it("blocks write/exec tools in ask and plan", () => {
    expect(isToolAllowedForWorkMode("ask", "read_file")).toBe(true);
    expect(isToolAllowedForWorkMode("ask", "search_files")).toBe(true);
    expect(isToolAllowedForWorkMode("plan", "skill_view")).toBe(true);
    expect(isToolAllowedForWorkMode("ask", "write_file")).toBe(false);
    expect(isToolAllowedForWorkMode("plan", "terminal")).toBe(false);
    expect(isToolAllowedForWorkMode("craft", "write_file")).toBe(true);
  });

  it("classifies write and exec helpers", () => {
    expect(isWriteOrExecTool("write_file")).toBe(true);
    expect(isWriteOrExecTool("read_file")).toBe(false);
  });

  it("detects destructive tool calls and instructions", () => {
    expect(isDestructiveToolCall("delete_file", '{"path":"src/old.ts"}')).toBe(true);
    expect(isDestructiveToolCall("read_file", '{"path":"src/index.ts"}')).toBe(false);
    expect(looksDestructiveInstruction("删掉 src/old.ts")).toBe(true);
    expect(looksDestructiveInstruction("解释一下这个项目")).toBe(false);
  });
});
