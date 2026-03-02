import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";

const STORAGE_KEY = "retro_todo_v1";

/**
 * Creates a controllable localStorage mock.
 * We intentionally implement only what App uses: getItem/setItem/removeItem.
 */
function createLocalStorageMock(initial = {}) {
  let store = { ...initial };

  return {
    getItem: jest.fn((key) => {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    }),
    setItem: jest.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    /** test helper */
    __getStore: () => ({ ...store }),
  };
}

function addTask(text) {
  const input = screen.getByLabelText(/new task/i);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
}

function getTaskList() {
  return screen.getByRole("region", { name: /task list/i });
}

function getToggleButtonForTask(taskText) {
  // Toggle button has aria-label "Mark as completed: <text>" or "Mark as active: <text>"
  const list = getTaskList();
  return within(list).getByRole("button", { name: new RegExp(`: ${escapeRegExp(taskText)}$`, "i") });
}

function getDeleteButtonForTask(taskText) {
  const list = getTaskList();
  return within(list).getByRole("button", {
    name: new RegExp(`^delete task: ${escapeRegExp(taskText)}$`, "i"),
  });
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("App critical flows", () => {
  let localStorageMock;

  beforeEach(() => {
    jest.restoreAllMocks();

    // Keep id generation deterministic for assertions if needed.
    Object.defineProperty(window, "crypto", {
      value: {
        randomUUID: jest.fn(() => "uuid-1"),
      },
      configurable: true,
    });

    localStorageMock = createLocalStorageMock();
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
  });

  test("renders the title and core controls", () => {
    render(<App />);

    // The title uses a non-breaking hyphen between "To" and "Do", so don't regex the hyphen.
    expect(screen.getByRole("heading", { name: /retro/i })).toBeInTheDocument();

    expect(screen.getByLabelText(/new task/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /^all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^active/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^completed/i })).toBeInTheDocument();
  });

  test("adds a task (trims/collapses whitespace) and shows it in the list", () => {
    render(<App />);

    addTask("   buy    milk   ");

    expect(screen.getByText("buy milk")).toBeInTheDocument();
    // After adding, input should clear
    expect(screen.getByLabelText(/new task/i)).toHaveValue("");
  });

  test("toggles a task completion state (active -> completed -> active)", () => {
    render(<App />);

    addTask("Write tests");

    const toggleBtn = getToggleButtonForTask("Write tests");

    // Initially active: button label indicates it will mark as completed
    expect(toggleBtn).toHaveAttribute("aria-label", expect.stringMatching(/^Mark as completed:/i));
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggleBtn);

    // Now completed: aria-pressed true, label indicates it will mark as active
    expect(getToggleButtonForTask("Write tests")).toHaveAttribute("aria-pressed", "true");
    expect(getToggleButtonForTask("Write tests")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/^Mark as active:/i)
    );

    fireEvent.click(getToggleButtonForTask("Write tests"));

    // Back to active
    expect(getToggleButtonForTask("Write tests")).toHaveAttribute("aria-pressed", "false");
    expect(getToggleButtonForTask("Write tests")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/^Mark as completed:/i)
    );
  });

  test("deletes a task from the list", () => {
    render(<App />);

    addTask("Task to delete");
    expect(screen.getByText("Task to delete")).toBeInTheDocument();

    fireEvent.click(getDeleteButtonForTask("Task to delete"));

    expect(screen.queryByText("Task to delete")).not.toBeInTheDocument();
    // Empty state should be visible again
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
  });

  test("filters tasks by All / Active / Completed", () => {
    render(<App />);

    addTask("Active task");
    addTask("Completed task");

    // Mark "Completed task" as completed
    fireEvent.click(getToggleButtonForTask("Completed task"));

    // All: both visible
    fireEvent.click(screen.getByRole("button", { name: /^all/i }));
    expect(screen.getByText("Active task")).toBeInTheDocument();
    expect(screen.getByText("Completed task")).toBeInTheDocument();

    // Active: only active visible
    fireEvent.click(screen.getByRole("button", { name: /^active/i }));
    expect(screen.getByText("Active task")).toBeInTheDocument();
    expect(screen.queryByText("Completed task")).not.toBeInTheDocument();

    // Completed: only completed visible
    fireEvent.click(screen.getByRole("button", { name: /^completed/i }));
    expect(screen.queryByText("Active task")).not.toBeInTheDocument();
    expect(screen.getByText("Completed task")).toBeInTheDocument();
  });

  test("persists tasks to localStorage on add/toggle/delete and hydrates tasks on mount", () => {
    // 1) First mount: no tasks in storage
    render(<App />);

    // On mount App probes storage availability and re-saves sanitized loaded tasks.
    // With no tasks stored, it will still do a best-effort setItem with [].
    expect(localStorageMock.getItem).toHaveBeenCalledWith(STORAGE_KEY);

    addTask("Persist me");

    // After add, the app persists tasks to localStorage
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.stringContaining("Persist me")
    );

    // Toggle completion should persist updated state
    fireEvent.click(getToggleButtonForTask("Persist me"));
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.stringContaining('"completed":true')
    );

    // Delete should persist removal (no longer contains the text)
    fireEvent.click(getDeleteButtonForTask("Persist me"));
    const setItemCalls = localStorageMock.setItem.mock.calls
      .filter(([key]) => key === STORAGE_KEY)
      .map(([, value]) => value);

    expect(setItemCalls[setItemCalls.length - 1]).not.toContain("Persist me");

    // 2) Hydration test: remount with pre-populated storage
    const prepopulated = [
      { id: "t1", text: "Hydrated active", completed: false, createdAt: 1000 },
      { id: "t2", text: "Hydrated done", completed: true, createdAt: 2000 },
    ];
    localStorageMock = createLocalStorageMock({
      [STORAGE_KEY]: JSON.stringify(prepopulated),
    });
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });

    render(<App />);

    expect(screen.getByText("Hydrated active")).toBeInTheDocument();
    expect(screen.getByText("Hydrated done")).toBeInTheDocument();

    // Ensure hydration read happens
    expect(localStorageMock.getItem).toHaveBeenCalledWith(STORAGE_KEY);
  });
});
