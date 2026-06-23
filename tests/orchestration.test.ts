import { describe, expect, it } from "vitest";
import { CollaborationBudget } from "../src/core/collaboration-budget";
import { classifyAssistantHandoff } from "../src/core/handoff";
import { parseMentions } from "../src/core/mention-parser";
import { ParallelBatchTracker } from "../src/core/parallel-batch-tracker";
import { SerialChainTracker } from "../src/core/serial-chain-tracker";
import { handleUserMessage, type OrchestrationState } from "../src/core/orchestrator";
import { seedAgents, seedBindings, seedMessages, seedWorkspace } from "../src/core/seed";

describe("mention parser", () => {
  it("parses known agent mentions and ignores inline text matches", () => {
    const mentions = parseMentions("请 @产品经理 先看，然后文字@架构师 不触发", [
      "产品经理",
      "架构师",
    ]);

    expect(mentions.map((mention) => mention.name)).toEqual(["产品经理"]);
  });

  it("ignores mentions inside code blocks", () => {
    const mentions = parseMentions("```md\n@工程师\n```\n@架构师", ["工程师", "架构师"]);
    expect(mentions.map((mention) => mention.name)).toEqual(["架构师"]);
  });
});

describe("assistant handoff classification", () => {
  const agentIdByName = new Map([
    ["产品经理", "pm"],
    ["架构师", "arch"],
    ["工程师", "eng"],
  ]);

  it("classifies a single target", () => {
    expect(
      classifyAssistantHandoff({
        mentionNames: ["架构师"],
        selfAgentId: "pm",
        agentIdByName,
      }),
    ).toEqual({ kind: "single", targetNames: ["架构师"] });
  });

  it("filters self mentions", () => {
    expect(
      classifyAssistantHandoff({
        mentionNames: ["产品经理"],
        selfAgentId: "pm",
        agentIdByName,
      }),
    ).toEqual({ kind: "none", targetNames: [] });
  });
});

describe("parallel batch tracker", () => {
  it("waits for all agents before joining", () => {
    const tracker = new ParallelBatchTracker();
    tracker.start("workspace", ["pm", "arch"]);

    expect(tracker.markComplete("workspace", "pm")).toBe("pending");
    expect(tracker.markComplete("workspace", "arch")).toBe("last");
  });

  it("silences join after user intervention", () => {
    const tracker = new ParallelBatchTracker();
    tracker.start("workspace", ["pm", "arch"]);
    tracker.markUserIntervention("workspace");

    expect(tracker.markComplete("workspace", "pm")).toBe("pending");
    expect(tracker.markComplete("workspace", "arch")).toBe("last_user_intervened");
  });
});

describe("serial chain tracker", () => {
  it("advances by task settlement", () => {
    const tracker = new SerialChainTracker();
    tracker.start({
      workspaceId: "workspace",
      triggerMessageId: "msg-1",
      firstTaskId: "task-1",
      assignments: [
        { agentId: "pm", instruction: "澄清需求" },
        { agentId: "arch", instruction: "设计架构" },
      ],
    });

    expect(tracker.advance("workspace", "pm", "task-1")).toEqual({
      kind: "next",
      agentId: "arch",
      instruction: "设计架构",
      triggerMessageId: "msg-1",
    });
    expect(tracker.bindTask("workspace", "arch", "task-2")).toBe(true);
    expect(tracker.advance("workspace", "arch", "task-2")).toEqual({ kind: "last" });
  });
});

describe("collaboration budget", () => {
  it("enforces hop limits", () => {
    const budget = new CollaborationBudget(1, 3);
    expect(budget.registerHandoff("workspace", "a", "b")).toBe("ok");
    expect(budget.registerHandoff("workspace", "b", "c")).toBe("hop_limit");
  });

  it("detects continuous pair cycles", () => {
    const budget = new CollaborationBudget(100, 1);
    expect(budget.registerHandoff("workspace", "a", "b")).toBe("ok");
    expect(budget.registerHandoff("workspace", "b", "a")).toBe("ok");
    expect(budget.registerHandoff("workspace", "a", "b")).toBe("cycle");
  });
});

describe("orchestration engine", () => {
  function createState(mode: "manual" | "smart" = "smart"): OrchestrationState {
    return {
      workspace: { ...seedWorkspace, mode },
      agents: seedAgents,
      bindings: seedBindings,
      messages: seedMessages,
      tasks: [],
      logs: [],
    };
  }

  function createMultiAgentState(mode: "manual" | "smart" = "smart"): OrchestrationState {
    return {
      workspace: { ...seedWorkspace, mode, defaultAgentId: undefined },
      agents: [
        {
          id: "agent-pm",
          workspaceId: seedWorkspace.id,
          name: "产品经理",
          role: "需求澄清",
          prompt: "负责问题定义。",
          enabled: true,
          color: "#4f46e5",
        },
        {
          id: "agent-architect",
          workspaceId: seedWorkspace.id,
          name: "架构师",
          role: "方案设计",
          prompt: "负责方案设计。",
          enabled: true,
          color: "#0f766e",
        },
      ],
      bindings: [],
      messages: [],
      tasks: [],
      logs: [],
    };
  }

  it("does not dispatch in manual mode without an explicit target", () => {
    const result = handleUserMessage(createState("manual"), "请帮我看看这个需求", 1000);
    expect(result.state.tasks).toHaveLength(0);
    expect(result.state.logs[0].decision.type).toBe("no_action");
  });

  it("dispatches natural language to Hermes in smart mode without mentions", () => {
    const result = handleUserMessage(createState("smart"), "请帮我看看这个需求", 1000);
    expect(result.state.tasks).toHaveLength(1);
    expect(result.state.tasks[0].agentId).toBe("agent-hermes");
    expect(result.state.logs[0].decision.type).toBe("dispatch");
  });

  it("creates parallel assignments for multiple explicit targets", () => {
    const result = handleUserMessage(
      createMultiAgentState("smart"),
      "@产品经理 @架构师 一起评估这个功能",
      1000,
    );
    expect(result.state.tasks).toHaveLength(2);
    expect(result.state.logs[0].decision).toMatchObject({
      type: "dispatch",
      mode: "parallel",
    });
  });

  it("creates only the first task for serial assignments", () => {
    const result = handleUserMessage(
      createMultiAgentState("smart"),
      "/serial @产品经理 @架构师 先澄清再设计",
      1000,
    );
    expect(result.state.tasks).toHaveLength(1);
    expect(result.state.tasks[0].agentId).toBe("agent-pm");
    expect(result.state.logs[0].decision).toMatchObject({
      type: "dispatch",
      mode: "serial",
    });
    if (result.state.logs[0].decision.type === "dispatch") {
      expect(result.state.logs[0].decision.assignments).toHaveLength(2);
    }
  });
});
