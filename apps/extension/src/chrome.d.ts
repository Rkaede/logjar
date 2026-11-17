interface ChromeTab {
  id?: number;
  title?: string;
  url?: string;
}

interface ChromeRuntimeMessageSender {
  tab?: ChromeTab;
}

type ChromeMessageListener = (
  message: unknown,
  sender: ChromeRuntimeMessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

interface ChromeStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

declare const chrome: {
  runtime: {
    onInstalled: {
      addListener: (callback: () => void) => void;
    };
    onMessage: {
      addListener: (callback: ChromeMessageListener) => void;
    };
    sendMessage: (message: unknown) => Promise<unknown>;
  };
  storage: {
    local: ChromeStorageArea;
    session: ChromeStorageArea;
  };
  tabs: {
    onRemoved: {
      addListener: (callback: (tabId: number) => void) => void;
    };
    query: (queryInfo: { active?: boolean; currentWindow?: boolean }) => Promise<ChromeTab[]>;
    sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
  };
};
