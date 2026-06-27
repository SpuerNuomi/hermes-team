import type { CronJobInfo } from "../runtime/hermes-runtime";
import type { TranslateFn } from "./appTypes";

export type CronFrequency = "minutes" | "hourly" | "daily" | "weekly" | "custom";

export type CronJobForm = {
  name: string;
  prompt: string;
  deliverTargets: string[];
  repeatTimes: string;
  skills: string[];
  freq: CronFrequency;
  minuteInterval: number;
  hour: number;
  minute: number;
  weekdays: number[];
  customCron: string;
  noAgent: boolean;
  script: string;
};

export const emptyCronJobForm: CronJobForm = {
  name: "",
  prompt: "",
  deliverTargets: ["local"],
  repeatTimes: "",
  skills: [],
  freq: "daily",
  minuteInterval: 30,
  hour: 9,
  minute: 0,
  weekdays: [1, 2, 3, 4, 5],
  customCron: "*/30 * * * *",
  noAgent: false,
  script: "",
};

export const CRON_DELIVER_OPTIONS: { id: string; label: string }[] = [
  { id: "local", label: "local" },
  { id: "origin", label: "origin" },
  { id: "telegram", label: "telegram" },
  { id: "discord", label: "discord" },
  { id: "slack", label: "slack" },
  { id: "whatsapp", label: "whatsapp" },
  { id: "signal", label: "signal" },
  { id: "matrix", label: "matrix" },
  { id: "mattermost", label: "mattermost" },
  { id: "email", label: "email" },
  { id: "webhook", label: "webhook" },
  { id: "sms", label: "sms" },
  { id: "homeassistant", label: "homeassistant" },
  { id: "dingtalk", label: "dingtalk" },
  { id: "feishu", label: "feishu" },
  { id: "wecom", label: "wecom" },
];

export const CRON_FREQ_OPTIONS: { id: CronFrequency; labelKey: string }[] = [
  { id: "minutes", labelKey: "cron.freq.minutes" },
  { id: "hourly", labelKey: "cron.freq.hourly" },
  { id: "daily", labelKey: "cron.freq.daily" },
  { id: "weekly", labelKey: "cron.freq.weekly" },
  { id: "custom", labelKey: "cron.freq.custom" },
];

export const CRON_WEEKDAYS: { value: number }[] = [
  { value: 1 },
  { value: 2 },
  { value: 3 },
  { value: 4 },
  { value: 5 },
  { value: 6 },
  { value: 0 },
];

export function formatCronDate(value: string | null | undefined, t: TranslateFn): string {
  if (!value) return t("cron.unscheduled");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatCronRelative(value: string | null | undefined, t: TranslateFn): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = date.getTime() - Date.now();
  const past = diff < 0;
  const suffix = past ? t("cron.ago") : t("cron.later");
  const minutes = Math.round(Math.abs(diff) / 60000);
  if (minutes < 1) return past ? t("cron.justNow") : t("cron.soon");
  if (minutes < 60) return t("cron.minutesRel", { count: minutes, suffix });
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return `${hours}h${remMinutes ? ` ${remMinutes}m` : ""}${suffix}`;
  const days = Math.floor(hours / 24);
  return t("cron.daysRel", { count: days, suffix });
}

const CRON_STATE_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "schedule-state-active" },
  paused: { label: "Paused", cls: "schedule-state-paused" },
  completed: { label: "Completed", cls: "schedule-state-completed" },
};

export function cronStateMeta(state: string): { label: string; cls: string } {
  return CRON_STATE_META[state] ?? { label: state || "Unknown", cls: "schedule-state-paused" };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function parseCronField(field: string, min: number, max: number): Set<number> | null {
  const result = new Set<number>();
  for (const part of field.split(",")) {
    if (!part) return null;
    let step = 1;
    let range = part;
    const slash = part.split("/");
    if (slash.length === 2) {
      range = slash[0];
      step = Number(slash[1]);
      if (!Number.isInteger(step) || step < 1) return null;
    } else if (slash.length > 2) {
      return null;
    }
    let lo: number;
    let hi: number;
    if (range === "*") {
      lo = min;
      hi = max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-");
      lo = Number(a);
      hi = Number(b);
    } else {
      const value = Number(range);
      lo = value;
      hi = value;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      return null;
    }
    for (let i = lo; i <= hi; i += step) result.add(i);
  }
  return result.size ? result : null;
}

function validateCronExpression(expr: string, t: TranslateFn): string | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return t("cron.err5");
  const specs: [number, number][] = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ];
  for (let i = 0; i < 5; i += 1) {
    if (!parseCronField(fields[i], specs[i][0], specs[i][1])) {
      return t("cron.errField", { index: i + 1, field: fields[i] });
    }
  }
  return null;
}

export function nextCronRun(expr: string, from: Date = new Date()): Date | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const minute = parseCronField(fields[0], 0, 59);
  const hour = parseCronField(fields[1], 0, 23);
  const dom = parseCronField(fields[2], 1, 31);
  const month = parseCronField(fields[3], 1, 12);
  const dow = parseCronField(fields[4], 0, 7);
  if (!minute || !hour || !dom || !month || !dow) return null;
  if (dow.has(7)) dow.add(0);
  const domRestricted = fields[2] !== "*";
  const dowRestricted = fields[4] !== "*";
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  for (let i = 0; i < 535680; i += 1) {
    const matchDom = dom.has(cursor.getDate());
    const matchDow = dow.has(cursor.getDay());
    const dayOk =
      domRestricted && dowRestricted ? matchDom || matchDow : matchDom && matchDow;
    if (
      month.has(cursor.getMonth() + 1) &&
      dayOk &&
      hour.has(cursor.getHours()) &&
      minute.has(cursor.getMinutes())
    ) {
      return new Date(cursor.getTime());
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

export function serializeCronSchedule(form: CronJobForm, t: TranslateFn): { value: string; error: string | null } {
  switch (form.freq) {
    case "minutes": {
      const n = form.minuteInterval;
      if (!Number.isInteger(n) || n < 1 || n > 59) {
        return { value: "", error: t("cron.errMinInterval") };
      }
      return { value: `*/${n} * * * *`, error: null };
    }
    case "hourly": {
      const m = form.minute;
      if (!Number.isInteger(m) || m < 0 || m > 59) {
        return { value: "", error: t("cron.errMinute") };
      }
      return { value: `${m} * * * *`, error: null };
    }
    case "daily": {
      if (form.hour < 0 || form.hour > 23 || form.minute < 0 || form.minute > 59) {
        return { value: "", error: t("cron.errTime") };
      }
      return { value: `${form.minute} ${form.hour} * * *`, error: null };
    }
    case "weekly": {
      if (!form.weekdays.length) {
        return { value: "", error: t("cron.errPickDay") };
      }
      if (form.hour < 0 || form.hour > 23 || form.minute < 0 || form.minute > 59) {
        return { value: "", error: t("cron.errTime") };
      }
      const days = [...form.weekdays].sort((a, b) => a - b).join(",");
      return { value: `${form.minute} ${form.hour} * * ${days}`, error: null };
    }
    case "custom":
    default: {
      const expr = form.customCron.trim();
      if (!expr) return { value: "", error: t("cron.errExpr") };
      const error = validateCronExpression(expr, t);
      return { value: error ? "" : expr, error };
    }
  }
}

export function describeCronSchedule(form: CronJobForm, t: TranslateFn): string {
  switch (form.freq) {
    case "minutes":
      return t("cron.descMinutes", { n: form.minuteInterval });
    case "hourly":
      return t("cron.descHourly", { m: form.minute });
    case "daily":
      return t("cron.descDaily", { time: `${pad2(form.hour)}:${pad2(form.minute)}` });
    case "weekly": {
      const names = CRON_WEEKDAYS.filter((day) => form.weekdays.includes(day.value)).map((day) =>
        t(`cron.weekdayLong.${day.value}`),
      );
      return t("cron.descWeekly", {
        days: names.join(t("cron.weekdaySeparator")),
        time: `${pad2(form.hour)}:${pad2(form.minute)}`,
      });
    }
    case "custom":
    default:
      return t("cron.descCustom");
  }
}

function parseCronToForm(schedule: string): Partial<CronJobForm> {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length === 5) {
    const [mi, h, dom, mon, dow] = fields;
    if (dom === "*" && mon === "*") {
      const minuteMatch = /^\*\/(\d+)$/.exec(mi);
      if (minuteMatch && h === "*" && dow === "*") {
        return { freq: "minutes", minuteInterval: Number(minuteMatch[1]) };
      }
      if (/^\d+$/.test(mi) && h === "*" && dow === "*") {
        return { freq: "hourly", minute: Number(mi) };
      }
      if (/^\d+$/.test(mi) && /^\d+$/.test(h) && dow === "*") {
        return { freq: "daily", hour: Number(h), minute: Number(mi) };
      }
      if (/^\d+$/.test(mi) && /^\d+$/.test(h) && /^[0-7](,[0-7])*$/.test(dow)) {
        const weekdays = Array.from(
          new Set(dow.split(",").map((value) => (Number(value) === 7 ? 0 : Number(value)))),
        );
        return { freq: "weekly", hour: Number(h), minute: Number(mi), weekdays };
      }
    }
  }
  return { freq: "custom", customCron: schedule };
}

export function cronFormFromJob(job: CronJobInfo): CronJobForm {
  return {
    ...emptyCronJobForm,
    name: job.name && job.name !== "(unnamed)" ? job.name : "",
    prompt: job.prompt ?? "",
    deliverTargets: job.deliver.length ? job.deliver : ["local"],
    repeatTimes: job.repeat?.times != null ? String(job.repeat.times) : "",
    skills: job.skills ?? [],
    noAgent: job.noAgent,
    script: job.script ?? "",
    ...parseCronToForm(job.schedule),
  };
}

export function formatCronRunTime(value: string | null | undefined, t: TranslateFn): string {
  if (!value) return t("cron.unknownTime");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function cronRunStatusKind(status?: string | null): "ok" | "fail" | "info" {
  if (!status) return "info";
  const lower = status.toLowerCase();
  if (lower.includes("error") || lower.includes("fail") || lower.includes("non-zero")) {
    return "fail";
  }
  if (lower.includes("ok") || lower.includes("success") || lower.includes("silent")) {
    return "ok";
  }
  return "info";
}
