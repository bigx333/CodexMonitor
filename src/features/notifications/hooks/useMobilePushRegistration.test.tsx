// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMobilePushRegistration } from "./useMobilePushRegistration";

const requestNotificationPermissionOnStartMock = vi.fn();
const getMobilePushRegistrationInfoMock = vi.fn();
const registerPushDeviceMock = vi.fn();

let mobilePlatform = true;

vi.mock("@/services/tauri", () => ({
  requestNotificationPermissionOnStart: (...args: unknown[]) =>
    requestNotificationPermissionOnStartMock(...args),
  getMobilePushRegistrationInfo: (...args: unknown[]) =>
    getMobilePushRegistrationInfoMock(...args),
  registerPushDevice: (...args: unknown[]) => registerPushDeviceMock(...args),
}));

vi.mock("@/utils/platformPaths", () => ({
  isMobilePlatform: () => mobilePlatform,
}));

describe("useMobilePushRegistration", () => {
  beforeEach(() => {
    requestNotificationPermissionOnStartMock.mockReset();
    getMobilePushRegistrationInfoMock.mockReset();
    registerPushDeviceMock.mockReset();
    requestNotificationPermissionOnStartMock.mockResolvedValue(true);
    getMobilePushRegistrationInfoMock.mockResolvedValue(null);
    mobilePlatform = true;
  });

  it("requests notification permission on startup for mobile", async () => {
    renderHook(() =>
      useMobilePushRegistration({
        backendMode: "local",
        remoteBackendHost: "",
        remoteBackendToken: null,
      }),
    );

    await waitFor(() => {
      expect(requestNotificationPermissionOnStartMock).toHaveBeenCalledTimes(1);
    });
    expect(registerPushDeviceMock).not.toHaveBeenCalled();
  });

  it("registers Android push device in remote mode", async () => {
    getMobilePushRegistrationInfoMock.mockResolvedValue({
      platform: "android",
      deviceId: "android-123",
      token: "token-abc",
      label: "Pixel",
    });

    renderHook(() =>
      useMobilePushRegistration({
        backendMode: "remote",
        remoteBackendHost: "192.168.1.109:4732",
        remoteBackendToken: "secret",
      }),
    );

    await waitFor(() => {
      expect(registerPushDeviceMock).toHaveBeenCalledTimes(1);
    });
    expect(registerPushDeviceMock).toHaveBeenCalledWith(
      "android-123",
      "android",
      "token-abc",
      "Pixel",
    );
  });

  it("does not register when permission is denied", async () => {
    requestNotificationPermissionOnStartMock.mockResolvedValue(false);
    getMobilePushRegistrationInfoMock.mockResolvedValue({
      platform: "android",
      deviceId: "android-123",
      token: "token-abc",
      label: "Pixel",
    });

    renderHook(() =>
      useMobilePushRegistration({
        backendMode: "remote",
        remoteBackendHost: "192.168.1.109:4732",
        remoteBackendToken: "secret",
      }),
    );

    await waitFor(() => {
      expect(requestNotificationPermissionOnStartMock).toHaveBeenCalled();
    });
    expect(registerPushDeviceMock).not.toHaveBeenCalled();
  });
});
