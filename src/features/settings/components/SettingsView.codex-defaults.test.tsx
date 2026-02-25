// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SettingsViewComponent as SettingsView,
  baseSettings,
  createDoctorResult,
  createUpdateResult,
  getModelListMock,
  workspace,
} from "./SettingsView.test.helpers";

describe("SettingsView Codex defaults", () => {
  const createModelListResponse = (models: Array<Record<string, unknown>>) => ({
    result: { data: models },
  });

  it("uses the latest model and medium effort by default (no Default option)", async () => {
    cleanup();
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    getModelListMock.mockResolvedValue(
      createModelListResponse([
        {
          id: "gpt-4.1",
          model: "gpt-4.1",
          displayName: "GPT-4.1",
          description: "",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "" },
            { reasoningEffort: "medium", description: "" },
            { reasoningEffort: "high", description: "" },
          ],
          defaultReasoningEffort: "medium",
          isDefault: false,
        },
        {
          id: "gpt-5.1",
          model: "gpt-5.1",
          displayName: "GPT-5.1",
          description: "",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "" },
            { reasoningEffort: "medium", description: "" },
            { reasoningEffort: "high", description: "" },
          ],
          defaultReasoningEffort: "medium",
          isDefault: false,
        },
      ]),
    );

    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Ungrouped",
            workspaces: [workspace({ id: "w1", name: "Workspace", connected: true })],
          },
        ]}
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

    const modelSelect = screen.getByLabelText("Model") as HTMLSelectElement;
    const effortSelect = screen.getByLabelText(
      "Reasoning effort",
    ) as HTMLSelectElement;

    await waitFor(() => {
      expect(getModelListMock).toHaveBeenCalledWith("w1");
      expect(modelSelect.value).toBe("gpt-5.1");
    });

    expect(within(modelSelect).queryByRole("option", { name: /default/i })).toBeNull();
    expect(within(effortSelect).queryByRole("option", { name: /default/i })).toBeNull();
    expect(effortSelect.value).toBe("medium");

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          lastComposerModelId: "gpt-5.1",
          lastComposerReasoningEffort: "medium",
        }),
      );
    });
  });

  it("updates model and effort when the user changes the selects", async () => {
    cleanup();
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    getModelListMock.mockResolvedValue(
      createModelListResponse([
        {
          id: "gpt-4.1",
          model: "gpt-4.1",
          displayName: "GPT-4.1",
          description: "",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "" },
            { reasoningEffort: "medium", description: "" },
            { reasoningEffort: "high", description: "" },
          ],
          defaultReasoningEffort: "medium",
          isDefault: false,
        },
        {
          id: "gpt-5.1",
          model: "gpt-5.1",
          displayName: "GPT-5.1",
          description: "",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "" },
            { reasoningEffort: "medium", description: "" },
            { reasoningEffort: "high", description: "" },
          ],
          defaultReasoningEffort: "medium",
          isDefault: false,
        },
      ]),
    );

    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[
          {
            id: null,
            name: "Ungrouped",
            workspaces: [workspace({ id: "w1", name: "Workspace", connected: true })],
          },
        ]}
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

    const modelSelect = screen.getByLabelText("Model") as HTMLSelectElement;
    const effortSelect = screen.getByLabelText(
      "Reasoning effort",
    ) as HTMLSelectElement;

    await waitFor(() => {
      expect(modelSelect.disabled).toBe(false);
      expect(modelSelect.value).toBe("gpt-5.1");
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ lastComposerModelId: "gpt-5.1" }),
      );
    });

    onUpdateAppSettings.mockClear();
    fireEvent.change(modelSelect, { target: { value: "gpt-4.1" } });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ lastComposerModelId: "gpt-4.1" }),
      );
    });

    onUpdateAppSettings.mockClear();
    fireEvent.change(effortSelect, { target: { value: "high" } });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ lastComposerReasoningEffort: "high" }),
      );
    });
  });
});
