// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  renderComposerSection,
  renderFeaturesSection,
} from "./SettingsView.test.helpers";

describe("SettingsView Features", () => {
  it("updates personality selection", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderFeaturesSection({ onUpdateAppSettings });

    fireEvent.change(screen.getByLabelText("Personality"), {
      target: { value: "pragmatic" },
    });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ personality: "pragmatic" }),
      );
    });
  });

  it("hides steer mode dynamic feature row", async () => {
    renderFeaturesSection({
      appSettings: { steerEnabled: true },
    });

    await screen.findByText("Background terminal");
    expect(screen.queryByText("Steer mode")).toBeNull();
  });

  it("hides steer mode when returned as an experimental feature", async () => {
    renderFeaturesSection({
      appSettings: { steerEnabled: true },
      experimentalFeaturesResponse: {
        data: [
          {
            name: "steer",
            stage: "underDevelopment",
            enabled: true,
            defaultEnabled: true,
            displayName: "Steer mode",
            description: "Legacy steer feature row.",
            announcement: null,
          },
          {
            name: "responses_websockets",
            stage: "underDevelopment",
            enabled: false,
            defaultEnabled: false,
            displayName: null,
            description: null,
            announcement: null,
          },
        ],
        nextCursor: null,
      },
    });

    await screen.findByText(
      "Use Responses API WebSocket transport for OpenAI by default.",
    );
    expect(screen.queryByText("Steer mode")).toBeNull();
  });

  it("toggles background terminal in stable features", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderFeaturesSection({
      onUpdateAppSettings,
      appSettings: { unifiedExecEnabled: true },
    });

    const terminalTitle = await screen.findByText("Background terminal");
    const terminalRow = terminalTitle.closest(".settings-toggle-row");
    expect(terminalRow).not.toBeNull();

    const toggle = within(terminalRow as HTMLElement).getByRole("button");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ unifiedExecEnabled: false }),
      );
    });
  });

  it("shows fallback description when Codex omits feature description", async () => {
    renderFeaturesSection({
      experimentalFeaturesResponse: {
        data: [
          {
            name: "responses_websockets",
            stage: "underDevelopment",
            enabled: false,
            defaultEnabled: false,
            displayName: null,
            description: null,
            announcement: null,
          },
        ],
        nextCursor: null,
      },
    });

    await screen.findByText(
      "Use Responses API WebSocket transport for OpenAI by default.",
    );
  });
});

describe("SettingsView Composer", () => {
  it("toggles follow-up hint visibility", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderComposerSection({
      onUpdateAppSettings,
      appSettings: {
        composerFollowUpHintEnabled: true,
      },
    });

    const hintTitle = await screen.findByText("Show follow-up hint while processing");
    const hintRow = hintTitle.closest(".settings-toggle-row");
    expect(hintRow).not.toBeNull();
    fireEvent.click(within(hintRow as HTMLElement).getByRole("button"));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ composerFollowUpHintEnabled: false }),
      );
    });
  });

  it("updates follow-up behavior from queue to steer", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderComposerSection({
      onUpdateAppSettings,
      appSettings: {
        steerEnabled: true,
        followUpMessageBehavior: "queue",
      },
    });

    fireEvent.click(screen.getByRole("radio", { name: "Steer" }));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ followUpMessageBehavior: "steer" }),
      );
    });
  });

  it("disables steer follow-up behavior when steer is unavailable", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderComposerSection({
      onUpdateAppSettings,
      appSettings: {
        steerEnabled: false,
        followUpMessageBehavior: "queue",
      },
    });

    const steerOption = screen.getByRole("radio", { name: "Steer" });
    expect(steerOption.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText(
        "Steer is unavailable in the current Codex config. Follow-ups will queue.",
      ),
    ).not.toBeNull();

    fireEvent.click(steerOption);
    await waitFor(() => {
      expect(onUpdateAppSettings).not.toHaveBeenCalled();
    });
  });
});

