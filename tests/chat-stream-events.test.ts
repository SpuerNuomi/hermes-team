import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "../src/renderer/appTypes";
import {
  appendRuntimeEvent,
  parseTokenUsageEvent,
  streamRuntimeEvent,
} from "../src/renderer/chatStreamEvents";

describe("chat stream events", () => {
  it("parses token usage and optional cache stats", () => {
    expect(
      parseTokenUsageEvent({
        taskId: "task-1",
        kind: "usage",
        content: "120",
        message: "180",
        delta: "40,10",
      }),
    ).toEqual({
      promptTokens: 120,
      totalTokens: 180,
      cacheReadTokens: 40,
      cacheWriteTokens: 10,
    });
  });

  it("ignores empty usage events", () => {
    expect(
      parseTokenUsageEvent({
        taskId: "task-1",
        kind: "usage",
        content: "",
        message: "",
        delta: "",
      }),
    ).toBeNull();
  });

  it("creates runtime activity events for stream lifecycle", () => {
    const labels = {
      started: "started",
      failed: "failed",
      completed: "completed",
    };

    expect(streamRuntimeEvent({ taskId: "t", kind: "start", content: "", delta: "", message: "" }, labels)).toMatchObject({
      label: "stream",
      detail: "started",
      level: "info",
    });
    expect(streamRuntimeEvent({ taskId: "t", kind: "error", content: "", delta: "", message: "boom" }, labels)).toMatchObject({
      label: "stream error",
      detail: "boom",
      level: "warning",
    });
    expect(streamRuntimeEvent({ taskId: "t", kind: "done", content: "", delta: "", message: "" }, labels)).toMatchObject({
      label: "stream done",
      detail: "completed",
      level: "ok",
    });
  });

  it("prepends runtime events and keeps the latest twenty", () => {
    const current: RuntimeEvent[] = Array.from({ length: 20 }, (_, index) => ({
      id: `old-${index}`,
      taskId: `task-${index}`,
      label: "old",
      detail: "old",
      createdAt: index,
      level: "info",
    }));

    const next = appendRuntimeEvent(
      current,
      { taskId: "new-task", label: "new", detail: "new", level: "ok" },
      { now: 100, random: "abc" },
    );

    expect(next).toHaveLength(20);
    expect(next[0]).toMatchObject({
      id: "event-100-abc",
      taskId: "new-task",
      label: "new",
    });
    expect(next.at(-1)?.id).toBe("old-18");
  });
});

