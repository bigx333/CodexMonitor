// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderDisplaySection } from "./SettingsView.test.helpers";

describe("SettingsView Display", () => {
  it("updates the theme selection", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const select = screen.getByLabelText("Theme");
    fireEvent.change(select, { target: { value: "dark" } });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "dark" }),
      );
    });
  });

  it("toggles remaining limits display", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const row = screen
      .getByText("Show remaining Codex limits")
      .closest(".settings-toggle-row") as HTMLElement | null;
    if (!row) {
      throw new Error("Expected remaining limits row");
    }
    const toggle = row.querySelector(
      "button.settings-toggle",
    ) as HTMLButtonElement | null;
    if (!toggle) {
      throw new Error("Expected remaining limits toggle");
    }
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ usageShowRemaining: true }),
      );
    });
  });

  it("toggles file path visibility in messages", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const row = screen
      .getByText("Show file path in messages")
      .closest(".settings-toggle-row") as HTMLElement | null;
    if (!row) {
      throw new Error("Expected file path visibility row");
    }
    const toggle = row.querySelector(
      "button.settings-toggle",
    ) as HTMLButtonElement | null;
    if (!toggle) {
      throw new Error("Expected file path visibility toggle");
    }
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ showMessageFilePath: false }),
      );
    });
  });

  it("toggles split chat and diff center panes", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const row = screen
      .getByText("Split chat and diff center panes")
      .closest(".settings-toggle-row") as HTMLElement | null;
    if (!row) {
      throw new Error("Expected split center panes row");
    }
    const toggle = row.querySelector("button.settings-toggle") as HTMLButtonElement | null;
    if (!toggle) {
      throw new Error("Expected split center panes toggle");
    }
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ splitChatDiffView: true }),
      );
    });
  });

  it("toggles reduce transparency", async () => {
    const onToggleTransparency = vi.fn();
    renderDisplaySection({ onToggleTransparency, reduceTransparency: false });

    const row = screen
      .getByText("Reduce transparency")
      .closest(".settings-toggle-row") as HTMLElement | null;
    if (!row) {
      throw new Error("Expected reduce transparency row");
    }
    const toggle = row.querySelector(
      "button.settings-toggle",
    ) as HTMLButtonElement | null;
    if (!toggle) {
      throw new Error("Expected reduce transparency toggle");
    }
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(onToggleTransparency).toHaveBeenCalledWith(true);
    });
  });

  it("commits interface scale on blur and enter with clamping", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const scaleInput = screen.getByLabelText("Interface scale");

    fireEvent.change(scaleInput, { target: { value: "500%" } });
    fireEvent.blur(scaleInput);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ uiScale: 3 }),
      );
    });

    fireEvent.change(scaleInput, { target: { value: "3%" } });
    fireEvent.keyDown(scaleInput, { key: "Enter" });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ uiScale: 0.1 }),
      );
    });
  });

  it("commits font family changes on blur and enter", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const uiFontInput = screen.getByLabelText("UI font family");
    fireEvent.change(uiFontInput, { target: { value: "Avenir, sans-serif" } });
    fireEvent.blur(uiFontInput);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ uiFontFamily: "Avenir, sans-serif" }),
      );
    });

    const codeFontInput = screen.getByLabelText("Code font family");
    fireEvent.change(codeFontInput, {
      target: { value: "JetBrains Mono, monospace" },
    });
    fireEvent.keyDown(codeFontInput, { key: "Enter" });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ codeFontFamily: "JetBrains Mono, monospace" }),
      );
    });
  });

  it("resets font families to defaults", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const resetButtons = screen.getAllByRole("button", { name: "Reset" });
    fireEvent.click(resetButtons[1]);
    fireEvent.click(resetButtons[2]);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          uiFontFamily: expect.stringContaining("system-ui"),
        }),
      );
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          codeFontFamily: expect.stringContaining("ui-monospace"),
        }),
      );
    });
  });

  it("updates code font size from the slider", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const slider = screen.getByLabelText("Code font size");
    fireEvent.change(slider, { target: { value: "14" } });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ codeFontSize: 14 }),
      );
    });
  });

  it("toggles notification sounds", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({
      onUpdateAppSettings,
      appSettings: { notificationSoundsEnabled: false },
    });

    const row = screen
      .getByText("Notification sounds")
      .closest(".settings-toggle-row") as HTMLElement | null;
    if (!row) {
      throw new Error("Expected notification sounds row");
    }
    fireEvent.click(within(row).getByRole("button"));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ notificationSoundsEnabled: true }),
      );
    });
  });

  it("toggles sub-agent system notifications", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({
      onUpdateAppSettings,
      appSettings: { subagentSystemNotificationsEnabled: false },
    });

    const row = screen
      .getByText("Sub-agent notifications")
      .closest(".settings-toggle-row") as HTMLElement | null;
    if (!row) {
      throw new Error("Expected sub-agent notifications row");
    }
    fireEvent.click(within(row).getByRole("button"));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ subagentSystemNotificationsEnabled: true }),
      );
    });
  });
});

