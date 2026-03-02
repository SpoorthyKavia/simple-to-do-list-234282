import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const STORAGE_KEY = "retro_todo_v1";
const FILTERS = /** @type {const} */ ({
  all: "all",
  active: "active",
  completed: "completed",
});

const TASK_TEXT_MAX_LEN = 120;

/**
 * Normalizes user-entered task text.
 * - Trims leading/trailing whitespace
 * - Collapses internal whitespace runs to a single space
 * - Enforces a max length (defensive; input maxLength is not enough)
 */
function normalizeTaskText(raw) {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TASK_TEXT_MAX_LEN);
}

/**
 * Ensures an unknown value conforms to our Task model, or returns null.
 * @param {unknown} t
 * @returns {{ id: string, text: string, completed: boolean, createdAt: number } | null}
 */
function coerceTask(t) {
  if (!t || typeof t !== "object") return null;

  // @ts-ignore - runtime coercion from unknown shape
  const id = String(t.id ?? cryptoRandomId());
  // @ts-ignore - runtime coercion from unknown shape
  const text = normalizeTaskText(t.text ?? "");
  // @ts-ignore - runtime coercion from unknown shape
  const completed = Boolean(t.completed);
  // @ts-ignore - runtime coercion from unknown shape
  const createdAtRaw = Number(t.createdAt);

  const createdAt = Number.isFinite(createdAtRaw) ? createdAtRaw : Date.now();
  if (!text) return null;

  return { id, text, completed, createdAt };
}

/**
 * Best-effort detection of whether localStorage is usable.
 * In some environments (Safari private browsing, disabled storage, etc),
 * merely accessing localStorage can throw.
 */
function isLocalStorageAvailable() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const testKey = "__retro_todo_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads and sanitizes tasks from localStorage, tolerating corrupted or unexpected data.
 * Returns an empty array on any failure (including unavailable storage).
 */
function loadTasksFromStorage() {
  if (!isLocalStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    const sanitized = parsed.map(coerceTask).filter(Boolean);

    // Ensure stable ordering: newest first
    sanitized.sort((a, b) => b.createdAt - a.createdAt);

    return sanitized;
  } catch {
    return [];
  }
}

/**
 * Attempts to persist tasks to localStorage. Returns true on success, false on failure.
 * Failure is intentionally non-fatal: the app continues in-memory.
 */
function persistTasksToStorage(tasks) {
  if (!isLocalStorageAvailable()) return false;

  try {
    // Persist only the canonical task shape.
    const canonical = tasks.map(coerceTask).filter(Boolean);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(canonical));
    return true;
  } catch {
    // Quota exceeded / disabled storage / other errors.
    return false;
  }
}

// PUBLIC_INTERFACE
function App() {
  /**
   * Task model:
   * { id: string, text: string, completed: boolean, createdAt: number }
   */
  const [tasks, setTasks] = useState([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [filter, setFilter] = useState(FILTERS.all);

  // Track whether persistence is currently working. This is used only to avoid
  // repeated failing writes; it does NOT change in-memory behavior.
  const [isStorageWorking, setIsStorageWorking] = useState(true);

  // Avoid double-writing the "loaded" state on first mount.
  const hasHydratedRef = useRef(false);

  // Load from localStorage once
  useEffect(() => {
    const storageOk = isLocalStorageAvailable();
    setIsStorageWorking(storageOk);

    const loaded = storageOk ? loadTasksFromStorage() : [];
    setTasks(loaded);

    // If storage is available, proactively re-save sanitized data so future runs
    // don't repeatedly parse bad/corrupted data. This is best-effort.
    if (storageOk) {
      const ok = persistTasksToStorage(loaded);
      if (!ok) setIsStorageWorking(false);
    }

    hasHydratedRef.current = true;
  }, []);

  // Persist to localStorage on change (best-effort; never break in-memory)
  useEffect(() => {
    // Don't immediately persist the state we just loaded on mount; we already did
    // a best-effort sanitize+persist above.
    if (!hasHydratedRef.current) return;

    // If we've already detected storage failures, avoid repeatedly attempting writes.
    if (!isStorageWorking) return;

    const ok = persistTasksToStorage(tasks);
    if (!ok) setIsStorageWorking(false);
  }, [tasks, isStorageWorking]);

  const filteredTasks = useMemo(() => {
    if (filter === FILTERS.active) return tasks.filter((t) => !t.completed);
    if (filter === FILTERS.completed) return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, filter]);

  const counts = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    return { total, completed, active: total - completed };
  }, [tasks]);

  // PUBLIC_INTERFACE
  const addTask = (text) => {
    const normalized = normalizeTaskText(text);
    if (!normalized) return;

    const task = {
      id: cryptoRandomId(),
      text: normalized,
      completed: false,
      createdAt: Date.now(),
    };

    setTasks((prev) => [task, ...prev]);
    setNewTaskText("");
  };

  // PUBLIC_INTERFACE
  const toggleTask = (id) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  // PUBLIC_INTERFACE
  const deleteTask = (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  // PUBLIC_INTERFACE
  const clearCompleted = () => {
    setTasks((prev) => prev.filter((t) => !t.completed));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    addTask(newTaskText);
  };

  const isAddDisabled = normalizeTaskText(newTaskText).length === 0;

  return (
    <div className="App">
      <div className="retroBg" aria-hidden="true" />
      <main className="page">
        <header className="header">
          <div className="badge" aria-hidden="true">
            8-BIT TODO
          </div>
          <h1 className="title">Retro To‑Do List</h1>
          <p className="subtitle">
            Add tasks, toggle completion, delete items, and filter your list —
            saved automatically in your browser.
          </p>
        </header>

        <section className="card" aria-label="Add a new task">
          <form className="addForm" onSubmit={onSubmit}>
            <label className="srOnly" htmlFor="newTask">
              New task
            </label>
            <input
              id="newTask"
              className="input"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder="Type a new task…"
              maxLength={TASK_TEXT_MAX_LEN}
              autoComplete="off"
            />
            <button className="btn btnPrimary" type="submit" disabled={isAddDisabled}>
              Add
            </button>
          </form>

          <div className="metaRow" role="status" aria-live="polite">
            <span className="metaPill">
              Total: <strong>{counts.total}</strong>
            </span>
            <span className="metaPill">
              Active: <strong>{counts.active}</strong>
            </span>
            <span className="metaPill">
              Completed: <strong>{counts.completed}</strong>
            </span>

            <div className="metaSpacer" />

            <button
              className="btn btnGhost"
              type="button"
              onClick={clearCompleted}
              disabled={counts.completed === 0}
            >
              Clear completed
            </button>
          </div>
        </section>

        <nav className="tabs" aria-label="Task filters">
          <button
            type="button"
            className={`tab ${filter === FILTERS.all ? "isActive" : ""}`}
            onClick={() => setFilter(FILTERS.all)}
            aria-pressed={filter === FILTERS.all}
          >
            All <span className="tabCount">{counts.total}</span>
          </button>
          <button
            type="button"
            className={`tab ${filter === FILTERS.active ? "isActive" : ""}`}
            onClick={() => setFilter(FILTERS.active)}
            aria-pressed={filter === FILTERS.active}
          >
            Active <span className="tabCount">{counts.active}</span>
          </button>
          <button
            type="button"
            className={`tab ${filter === FILTERS.completed ? "isActive" : ""}`}
            onClick={() => setFilter(FILTERS.completed)}
            aria-pressed={filter === FILTERS.completed}
          >
            Completed <span className="tabCount">{counts.completed}</span>
          </button>
        </nav>

        <section className="listCard" aria-label="Task list">
          {filteredTasks.length === 0 ? (
            <div className="emptyState" role="status" aria-live="polite">
              <div className="emptyIcon" aria-hidden="true">
                ▢
              </div>
              <p className="emptyTitle">
                {filter === FILTERS.completed
                  ? "No completed tasks."
                  : filter === FILTERS.active
                    ? "No active tasks."
                    : "No tasks yet."}
              </p>
              <p className="emptyHint">
                {filter === FILTERS.completed
                  ? "Complete a task to see it here."
                  : filter === FILTERS.active
                    ? "You’re all caught up — add a new task!"
                    : "Add your first task above."}
              </p>
              {!isStorageWorking ? (
                <p className="emptyHint">
                  Note: Saving is unavailable (storage is disabled or full). Your
                  tasks will still work for this session.
                </p>
              ) : null}
            </div>
          ) : (
            <>
              {!isStorageWorking ? (
                <div className="emptyState" role="status" aria-live="polite">
                  <p className="emptyHint">
                    Note: Saving is unavailable (storage is disabled or full). Your
                    tasks will still work for this session.
                  </p>
                </div>
              ) : null}
              <ul className="taskList">
                {filteredTasks.map((t) => (
                  <li key={t.id} className={`task ${t.completed ? "done" : ""}`}>
                    <button
                      type="button"
                      className="checkBtn"
                      onClick={() => toggleTask(t.id)}
                      aria-label={`${
                        t.completed ? "Mark as active" : "Mark as completed"
                      }: ${t.text}`}
                      aria-pressed={t.completed}
                    >
                      <span className="checkBox" aria-hidden="true">
                        {t.completed ? "✓" : ""}
                      </span>
                    </button>

                    <div className="taskMain">
                      <div className="taskText">{t.text}</div>
                    </div>

                    <div className="taskActions">
                      <button
                        type="button"
                        className="btn btnSmall btnDanger"
                        onClick={() => deleteTask(t.id)}
                        aria-label={`Delete task: ${t.text}`}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <footer className="footer">
          <span className="footerHint">
            Tip: Your tasks are stored in <code>localStorage</code>.
          </span>
        </footer>
      </main>
    </div>
  );
}

/**
 * Generates a random id using crypto if available, with a safe fallback.
 * Kept internal (not exported) to avoid expanding public API surface.
 */
function cryptoRandomId() {
  try {
    // Prefer standard API when present.
    if (typeof window !== "undefined" && window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    // Fallback: RFC4122-ish v4 UUID using getRandomValues when available.
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);

      // Per RFC4122 section 4.4
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

      const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
        16,
        20
      )}-${hex.slice(20)}`;
    }
  } catch {
    // ignore
  }

  // Last-resort fallback (still unique enough for this app).
  return `t_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default App;
