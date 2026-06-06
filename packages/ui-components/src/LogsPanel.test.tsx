import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { LogEntry, LogSettings } from "@prbar/shared-types";
import { LogsPanel } from "./LogsPanel";

const settings: LogSettings = { level: "info", retentionDays: 3 };

const logs: LogEntry[] = [
  {
    id: 2,
    timestamp: "2026-01-02 10:00:00",
    level: "error",
    message: "search failed",
  },
  {
    id: 1,
    timestamp: "2026-01-01 09:00:00",
    level: "info",
    message: "PRBar started",
  },
];

describe("LogsPanel", () => {
  it("renders log rows with their level and message", () => {
    render(
      <LogsPanel
        logs={logs}
        settings={settings}
        onChangeSettings={vi.fn()}
        onRefresh={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("search failed")).toBeInTheDocument();
    expect(screen.getByText("PRBar started")).toBeInTheDocument();
    expect(screen.getByText("2026-01-02 10:00:00")).toBeInTheDocument();
  });

  it("shows an empty state when there are no logs", () => {
    render(
      <LogsPanel
        logs={[]}
        settings={settings}
        onChangeSettings={vi.fn()}
        onRefresh={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("No logs recorded.")).toBeInTheDocument();
  });

  it("changes the minimum level", () => {
    const onChangeSettings = vi.fn();
    render(
      <LogsPanel
        logs={logs}
        settings={settings}
        onChangeSettings={onChangeSettings}
        onRefresh={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Minimum level"), {
      target: { value: "debug" },
    });
    expect(onChangeSettings).toHaveBeenCalledWith({
      level: "debug",
      retentionDays: 3,
    });
  });

  it("clamps the retention days to the allowed range", () => {
    const onChangeSettings = vi.fn();
    render(
      <LogsPanel
        logs={logs}
        settings={settings}
        onChangeSettings={onChangeSettings}
        onRefresh={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Days to keep"), {
      target: { value: "999" },
    });
    expect(onChangeSettings).toHaveBeenCalledWith({
      level: "info",
      retentionDays: 90,
    });
  });

  it("invokes refresh and clear callbacks", () => {
    const onRefresh = vi.fn();
    const onClear = vi.fn();
    render(
      <LogsPanel
        logs={logs}
        settings={settings}
        onChangeSettings={vi.fn()}
        onRefresh={onRefresh}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByText("Refresh"));
    fireEvent.click(screen.getByText("Clear"));
    expect(onRefresh).toHaveBeenCalled();
    expect(onClear).toHaveBeenCalled();
  });
});
