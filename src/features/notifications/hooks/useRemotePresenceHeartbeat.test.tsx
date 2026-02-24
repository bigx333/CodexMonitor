// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useRemotePresenceHeartbeat } from "./useRemotePresenceHeartbeat";

const sendPresenceHeartbeatMock = vi.fn();
const getSystemIdleSecondsMock = vi.fn();

let isWindowFocused = true;
let mobilePlatform = false;

vi.mock("@/services/tauri", () => ({
  sendPresenceHeartbeat: (...args: unknown[]) => sendPresenceHeartbeatMock(...args),
  getSystemIdleSeconds: (...args: unknown[]) => getSystemIdleSecondsMock(...args),
}));

vi.mock("@/features/layout/hooks/useWindowFocusState", () => ({
  useWindowFocusState: () => isWindowFocused,
}));

vi.mock("@/utils/platformPaths", () => ({
  isMobilePlatform: () => mobilePlatform,
}));

describe("useRemotePresenceHeartbeat", () => {
  beforeEach(() => {
    sendPresenceHeartbeatMock.mockReset();
    getSystemIdleSecondsMock.mockReset();
    getSystemIdleSecondsMock.mockResolvedValue(null);
    isWindowFocused = true;
    mobilePlatform = false;
  });

  it("sends desktop heartbeat in remote mode", async () => {
    renderHook(() =>
      useRemotePresenceHeartbeat({
        backendMode: "remote",
        workspaces: [
          {
            id: "ws-1",
            name: "Workspace",
            path: "/tmp/ws-1",
            connected: true,
            settings: { sidebarCollapsed: false },
          },
        ],
      }),
    );

    await waitFor(() => {
      expect(sendPresenceHeartbeatMock).toHaveBeenCalled();
    });
    expect(sendPresenceHeartbeatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientKind: "desktop",
        isAfk: false,
        activeWorkspaceIds: ["ws-1"],
      }),
    );
  });

  it("marks AFK when native idle exceeds timeout", async () => {
    getSystemIdleSecondsMock.mockResolvedValue(900);
    renderHook(() =>
      useRemotePresenceHeartbeat({
        backendMode: "remote",
        workspaces: [],
      }),
    );

    await waitFor(() => {
      expect(sendPresenceHeartbeatMock).toHaveBeenCalled();
    });
    expect(sendPresenceHeartbeatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isAfk: true,
      }),
    );
  });

  it("does not send heartbeats outside remote mode", async () => {
    renderHook(() =>
      useRemotePresenceHeartbeat({
        backendMode: "local",
        workspaces: [],
      }),
    );

    await Promise.resolve();
    expect(sendPresenceHeartbeatMock).not.toHaveBeenCalled();
  });
});
