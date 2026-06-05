import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { DevSettings } from "@prbar/shared-types";
import { DevPanel } from "./DevPanel";

describe("DevPanel", () => {
  it("reflects the current token storage selection", () => {
    const settings: DevSettings = { tokenStorage: "keychain" };
    render(<DevPanel settings={settings} onChangeSettings={vi.fn()} />);
    expect(
      (screen.getByLabelText(/OS keychain/) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/Encrypted database/) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("switches to the database backend", () => {
    const onChangeSettings = vi.fn();
    const settings: DevSettings = { tokenStorage: "keychain" };
    render(
      <DevPanel settings={settings} onChangeSettings={onChangeSettings} />,
    );
    fireEvent.click(screen.getByLabelText(/Encrypted database/));
    expect(onChangeSettings).toHaveBeenCalledWith({ tokenStorage: "database" });
  });

  it("switches back to the keychain backend", () => {
    const onChangeSettings = vi.fn();
    const settings: DevSettings = { tokenStorage: "database" };
    render(
      <DevPanel settings={settings} onChangeSettings={onChangeSettings} />,
    );
    fireEvent.click(screen.getByLabelText(/OS keychain/));
    expect(onChangeSettings).toHaveBeenCalledWith({ tokenStorage: "keychain" });
  });
});
