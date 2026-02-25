import { useEffect, useRef } from "react";
import type { AppServerEvent } from "../../../types";
import { subscribeAppServerEvents } from "../../../services/events";
import {
  getAppServerParams,
  getAppServerRawMethod,
  getAppServerRequestId,
  isApprovalRequestMethod,
  isSupportedAppServerMethod,
} from "../../../utils/appServerEvents";
import {
  METHODS_ROUTED_IN_USE_APP_SERVER_EVENTS,
  dispatchSupportedAppServerEvent,
  type AppServerEventHandlers,
} from "./appServerEventRouting";

type UseAppServerEventHandlers = AppServerEventHandlers & {
  onAppServerEvent?: (event: AppServerEvent) => void;
};

export { METHODS_ROUTED_IN_USE_APP_SERVER_EVENTS };
export type { AppServerEventHandlers };

export function useAppServerEvents(handlers: UseAppServerEventHandlers) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const unlisten = subscribeAppServerEvents((event) => {
      const currentHandlers = handlersRef.current;
      currentHandlers.onAppServerEvent?.(event);

      const method = getAppServerRawMethod(event);
      if (!method) {
        return;
      }

      const params = getAppServerParams(event);
      const requestId = getAppServerRequestId(event);

      if (isApprovalRequestMethod(method) && requestId !== null) {
        currentHandlers.onApprovalRequest?.({
          workspace_id: event.workspace_id,
          request_id: requestId,
          method,
          params,
        });
        return;
      }

      if (!isSupportedAppServerMethod(method)) {
        return;
      }

      dispatchSupportedAppServerEvent({
        method,
        workspaceId: event.workspace_id,
        params,
        requestId,
        handlers: currentHandlers,
      });
    });

    return () => {
      unlisten();
    };
  }, []);
}

