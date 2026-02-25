// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";
import {
  SettingsViewComponent as SettingsView,
  baseSettings,
  createDoctorResult,
  createUpdateResult,
  listWorkspacesMock,
} from "./SettingsView.test.helpers";

describe("SettingsView Codex section", () => {
  it("updates review mode in codex section", async () => {
    cleanup();
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={onUpdateAppSettings}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        onRunCodexUpdate={vi.fn().mockResolvedValue(createUpdateResult())}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="codex"
      />,
    );

    fireEvent.change(screen.getByLabelText("Review mode"), {
      target: { value: "detached" },
    });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ reviewDeliveryMode: "detached" }),
      );
    });
  });

  it("renders mobile daemon controls in local backend mode for TCP provider", async () => {
    cleanup();
    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={{
          ...baseSettings,
          backendMode: "local",
          remoteBackendProvider: "tcp",
        }}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        onTestSystemNotification={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="server"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start daemon" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Stop daemon" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Refresh status" })).toBeTruthy();
      expect(screen.getByLabelText("Remote backend host")).toBeTruthy();
      expect(screen.getByLabelText("Remote backend token")).toBeTruthy();
    });
  });

  it("shows mobile-only server controls on iOS runtime", async () => {
    cleanup();
    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "platform",
    );
    const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "userAgent",
    );
    const originalTouchPointsDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "maxTouchPoints",
    );

    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "iPhone",
    });
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    });
    Object.defineProperty(window.navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });

    try {
      render(
        <SettingsView
          workspaceGroups={[]}
          groupedWorkspaces={[]}
          ungroupedLabel="Ungrouped"
          onClose={vi.fn()}
          onMoveWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          reduceTransparency={false}
          onToggleTransparency={vi.fn()}
          appSettings={{
            ...baseSettings,
            backendMode: "local",
            remoteBackendProvider: "tcp",
          }}
          openAppIconById={{}}
          onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
          onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
          onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
          scaleShortcutTitle="Scale shortcut"
          scaleShortcutText="Use Command +/-"
          onTestNotificationSound={vi.fn()}
          onTestSystemNotification={vi.fn()}
          dictationModelStatus={null}
          onDownloadDictationModel={vi.fn()}
          onCancelDictationDownload={vi.fn()}
          onRemoveDictationModel={vi.fn()}
          initialSection="server"
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText("Remote backend host")).toBeTruthy();
        expect(screen.getByLabelText("Remote backend token")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Connect & test" })).toBeTruthy();
      });

      expect(screen.queryByLabelText("Backend mode")).toBeNull();
      expect(screen.queryByRole("button", { name: "Start daemon" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Detect Tailscale" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Start Runner" })).toBeNull();
      expect(
        screen.getByText(/get the tailscale hostname and token from your desktop/i),
      ).toBeTruthy();
    } finally {
      if (originalPlatformDescriptor) {
        Object.defineProperty(window.navigator, "platform", originalPlatformDescriptor);
      } else {
        Reflect.deleteProperty(window.navigator, "platform");
      }
      if (originalUserAgentDescriptor) {
        Object.defineProperty(window.navigator, "userAgent", originalUserAgentDescriptor);
      } else {
        Reflect.deleteProperty(window.navigator, "userAgent");
      }
      if (originalTouchPointsDescriptor) {
        Object.defineProperty(
          window.navigator,
          "maxTouchPoints",
          originalTouchPointsDescriptor,
        );
      } else {
        Reflect.deleteProperty(window.navigator, "maxTouchPoints");
      }
    }
  });

  it("supports multiple saved remotes on iOS runtime", async () => {
    cleanup();
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "platform",
    );
    const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "userAgent",
    );
    const originalTouchPointsDescriptor = Object.getOwnPropertyDescriptor(
      window.navigator,
      "maxTouchPoints",
    );

    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: "iPhone",
    });
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    });
    Object.defineProperty(window.navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });

    try {
      render(
        <SettingsView
          workspaceGroups={[]}
          groupedWorkspaces={[]}
          ungroupedLabel="Ungrouped"
          onClose={vi.fn()}
          onMoveWorkspace={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
          reduceTransparency={false}
          onToggleTransparency={vi.fn()}
          appSettings={{
            ...baseSettings,
            remoteBackendProvider: "tcp",
            remoteBackendHost: "127.0.0.1:4732",
            remoteBackendToken: "token-a",
            remoteBackends: [
              {
                id: "remote-a",
                name: "Home Mac",
                provider: "tcp",
                host: "127.0.0.1:4732",
                token: "token-a",
              },
              {
                id: "remote-b",
                name: "Office Mac",
                provider: "tcp",
                host: "office-mac.tailnet.ts.net:4732",
                token: "token-b",
              },
            ],
            activeRemoteBackendId: "remote-a",
          }}
          openAppIconById={{}}
          onUpdateAppSettings={onUpdateAppSettings}
          onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
          onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
          scaleShortcutTitle="Scale shortcut"
          scaleShortcutText="Use Command +/-"
          onTestNotificationSound={vi.fn()}
          onTestSystemNotification={vi.fn()}
          dictationModelStatus={null}
          onDownloadDictationModel={vi.fn()}
          onCancelDictationDownload={vi.fn()}
          onRemoveDictationModel={vi.fn()}
          initialSection="server"
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole("list", { name: "Saved remotes" })).toBeTruthy();
        expect(screen.getByLabelText("Remote name")).toBeTruthy();
      });
      expect(screen.getAllByText(/Last connected: Never/i).length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole("button", { name: "Use Office Mac remote" }));

      await waitFor(() => {
        expect(onUpdateAppSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            activeRemoteBackendId: "remote-b",
            remoteBackendProvider: "tcp",
            remoteBackendHost: "office-mac.tailnet.ts.net:4732",
            remoteBackendToken: "token-b",
          }),
        );
      });

      onUpdateAppSettings.mockClear();
      fireEvent.change(screen.getByLabelText("Remote name"), {
        target: { value: "Home Mac" },
      });
      fireEvent.blur(screen.getByLabelText("Remote name"));

      await waitFor(() => {
        expect(
          screen.getAllByText('A remote named "Home Mac" already exists.').length,
        ).toBeGreaterThan(0);
      });

      onUpdateAppSettings.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Add remote" }));
      expect(screen.getByRole("dialog", { name: "Add remote" })).toBeTruthy();
      expect(onUpdateAppSettings).toHaveBeenCalledTimes(0);

      fireEvent.click(screen.getByRole("button", { name: "Close add remote modal" }));
      expect(screen.queryByRole("dialog", { name: "Add remote" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Add remote" }));
      fireEvent.change(screen.getByLabelText("New remote name"), {
        target: { value: "Travel Mac" },
      });
      fireEvent.change(screen.getByLabelText("New remote host"), {
        target: { value: "travel-mac.tailnet.ts.net:4732" },
      });
      fireEvent.change(screen.getByLabelText("New remote token"), {
        target: { value: "token-travel" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Connect & add" }));

      await waitFor(() => {
        expect(onUpdateAppSettings).toHaveBeenCalledTimes(2);
      });
      const trialSettings = onUpdateAppSettings.mock.calls[0]?.[0] as AppSettings;
      const connectedSettings = onUpdateAppSettings.mock.calls[1]?.[0] as AppSettings;
      expect(trialSettings.remoteBackends).toHaveLength(3);
      expect(trialSettings.activeRemoteBackendId).toBeTruthy();
      expect(trialSettings.remoteBackendHost).toBe("travel-mac.tailnet.ts.net:4732");
      expect(trialSettings.remoteBackendToken).toBe("token-travel");
      expect(connectedSettings.remoteBackends).toHaveLength(3);
      const connectedEntry = connectedSettings.remoteBackends.find(
        (entry) => entry.id === connectedSettings.activeRemoteBackendId,
      );
      expect(connectedEntry?.lastConnectedAtMs).toEqual(expect.any(Number));
      expect(screen.queryByRole("dialog", { name: "Add remote" })).toBeNull();
      expect(listWorkspacesMock).toHaveBeenCalled();

      onUpdateAppSettings.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Add remote" }));
      fireEvent.change(screen.getByLabelText("New remote token"), {
        target: { value: "" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Connect & add" }));

      await waitFor(() => {
        expect(screen.getByText("Remote backend token is required.")).toBeTruthy();
      });

      onUpdateAppSettings.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Move Home Mac down" }));

      await waitFor(() => {
        expect(onUpdateAppSettings).toHaveBeenCalledTimes(1);
        const nextSettings = onUpdateAppSettings.mock.calls[0]?.[0] as AppSettings;
        expect(nextSettings.remoteBackends[0]?.id).toBe("remote-b");
      });

      onUpdateAppSettings.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Delete Office Mac" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete remote" }));

      await waitFor(() => {
        expect(onUpdateAppSettings).toHaveBeenCalledTimes(1);
        const nextSettings = onUpdateAppSettings.mock.calls[0]?.[0] as AppSettings;
        expect(nextSettings.remoteBackends.length).toBeGreaterThanOrEqual(1);
      });
    } finally {
      if (originalPlatformDescriptor) {
        Object.defineProperty(window.navigator, "platform", originalPlatformDescriptor);
      } else {
        Reflect.deleteProperty(window.navigator, "platform");
      }
      if (originalUserAgentDescriptor) {
        Object.defineProperty(window.navigator, "userAgent", originalUserAgentDescriptor);
      } else {
        Reflect.deleteProperty(window.navigator, "userAgent");
      }
      if (originalTouchPointsDescriptor) {
        Object.defineProperty(
          window.navigator,
          "maxTouchPoints",
          originalTouchPointsDescriptor,
        );
      } else {
        Reflect.deleteProperty(window.navigator, "maxTouchPoints");
      }
    }
  }, 15000);

});
