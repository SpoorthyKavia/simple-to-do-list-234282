import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

const STORAGE_KEY = "retro_todo_v1";
const FILTERS = /** @type {const} */ ({
    all: "all",
    active: "active",
    completed: "completed",
});

// PUBLIC_INTERFACE
function App() {
    /**
     * Task model:
     * { id: string, text: string, completed: boolean, createdAt: number }
     */
    const [tasks, setTasks] = useState([]);
    const [newTaskText, setNewTaskText] = useState("");
    const [filter, setFilter] = useState(FILTERS.all);

    /**
     * Edit model:
     * - editingTaskId: which task is currently being edited (null when none)
     * - editingText: draft text for the task being edited
     */
    const [editingTaskId, setEditingTaskId] = useState(null);
    const [editingText, setEditingText] = useState("");

    // Load from localStorage once
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);

            // Defensive parsing to avoid runtime issues if storage is corrupted
            if (Array.isArray(parsed)) {
                const sanitized = parsed
                    .filter((t) => t && typeof t === "object")
                    .map((t) => ({
                        id: String(t.id ?? cryptoRandomId()),
                        text: String(t.text ?? "").trim(),
                        completed: Boolean(t.completed),
                        createdAt: Number(t.createdAt ?? Date.now()),
                    }))
                    .filter((t) => t.text.length > 0);
                setTasks(sanitized);
            }
        } catch {
            // If parsing fails, start fresh; do not crash the app
            setTasks([]);
        }
    }, []);

    // Persist to localStorage on change
    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        } catch {
            // Ignore quota/disabled storage errors; app still functions in-memory
        }
    }, [tasks]);

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
        const trimmed = text.trim();
        if (!trimmed) return;

        const task = {
            id: cryptoRandomId(),
            text: trimmed,
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
        // If the task being edited is deleted, exit edit mode to avoid stale UI state.
        setEditingTaskId((prev) => (prev === id ? null : prev));
        setEditingText((prev) => (editingTaskId === id ? "" : prev));

        setTasks((prev) => prev.filter((t) => t.id !== id));
    };

    // PUBLIC_INTERFACE
    const clearCompleted = () => {
        // If the currently edited task is completed, it may be removed; exit edit mode proactively.
        if (editingTaskId) {
            const editedTask = tasks.find((t) => t.id === editingTaskId);
            if (editedTask?.completed) {
                setEditingTaskId(null);
                setEditingText("");
            }
        }
        setTasks((prev) => prev.filter((t) => !t.completed));
    };

    // PUBLIC_INTERFACE
    const beginEditTask = (id) => {
        const task = tasks.find((t) => t.id === id);
        if (!task) return;

        setEditingTaskId(id);
        setEditingText(task.text);
    };

    // PUBLIC_INTERFACE
    const cancelEditTask = () => {
        setEditingTaskId(null);
        setEditingText("");
    };

    // PUBLIC_INTERFACE
    const saveEditTask = (id) => {
        const trimmed = editingText.trim();

        // Treat an empty edit as "no-op": keep user in edit mode if empty, so they can fix it.
        if (!trimmed) return;

        setTasks((prev) =>
            prev.map((t) => (t.id === id ? { ...t, text: trimmed } : t))
        );
        setEditingTaskId(null);
        setEditingText("");
    };

    const onSubmit = (e) => {
        e.preventDefault();
        addTask(newTaskText);
    };

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
                            maxLength={120}
                            autoComplete="off"
                        />
                        <button className="btn btnPrimary" type="submit">
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
                    >
                        All <span className="tabCount">{counts.total}</span>
                    </button>
                    <button
                        type="button"
                        className={`tab ${filter === FILTERS.active ? "isActive" : ""}`}
                        onClick={() => setFilter(FILTERS.active)}
                    >
                        Active <span className="tabCount">{counts.active}</span>
                    </button>
                    <button
                        type="button"
                        className={`tab ${filter === FILTERS.completed ? "isActive" : ""}`}
                        onClick={() => setFilter(FILTERS.completed)}
                    >
                        Completed <span className="tabCount">{counts.completed}</span>
                    </button>
                </nav>

                <section className="listCard" aria-label="Task list">
                    {filteredTasks.length === 0 ? (
                        <div className="emptyState">
                            <div className="emptyIcon" aria-hidden="true">
                                ▢
                            </div>
                            <p className="emptyTitle">No tasks here.</p>
                            <p className="emptyHint">
                                {filter === FILTERS.completed
                                    ? "Complete a task to see it here."
                                    : filter === FILTERS.active
                                        ? "You’re all caught up — add a new task!"
                                        : "Add your first task above."}
                            </p>
                        </div>
                    ) : (
                        <ul className="taskList">
                            {filteredTasks.map((t) => {
                                const isEditing = editingTaskId === t.id;
                                return (
                                    <li key={t.id} className={`task ${t.completed ? "done" : ""}`}>
                                        <button
                                            type="button"
                                            className="checkBtn"
                                            onClick={() => toggleTask(t.id)}
                                            aria-label={
                                                t.completed ? "Mark as active" : "Mark as completed"
                                            }
                                            aria-pressed={t.completed}
                                            disabled={isEditing}
                                            title={isEditing ? "Finish editing to toggle" : undefined}
                                        >
                                            <span className="checkBox" aria-hidden="true">
                                                {t.completed ? "✓" : ""}
                                            </span>
                                        </button>

                                        <div className="taskMain">
                                            {isEditing ? (
                                                <form
                                                    className="taskEditForm"
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        saveEditTask(t.id);
                                                    }}
                                                >
                                                    <label className="srOnly" htmlFor={`edit_${t.id}`}>
                                                        Edit task
                                                    </label>
                                                    <input
                                                        id={`edit_${t.id}`}
                                                        className="input inputSmall"
                                                        value={editingText}
                                                        onChange={(e) => setEditingText(e.target.value)}
                                                        maxLength={120}
                                                        autoComplete="off"
                                                        aria-invalid={editingText.trim().length === 0}
                                                    />
                                                    <div className="taskEditActions">
                                                        <button
                                                            className="btn btnSmall btnPrimary"
                                                            type="submit"
                                                            disabled={editingText.trim().length === 0}
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            className="btn btnSmall btnGhost"
                                                            type="button"
                                                            onClick={cancelEditTask}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </form>
                                            ) : (
                                                <div className="taskText">{t.text}</div>
                                            )}
                                        </div>

                                        <div className="taskActions">
                                            {!isEditing ? (
                                                <button
                                                    type="button"
                                                    className="btn btnSmall btnGhost"
                                                    onClick={() => beginEditTask(t.id)}
                                                    aria-label={`Edit task: ${t.text}`}
                                                >
                                                    Edit
                                                </button>
                                            ) : null}

                                            <button
                                                type="button"
                                                className="btn btnSmall btnDanger"
                                                onClick={() => deleteTask(t.id)}
                                                aria-label={`Delete task: ${t.text}`}
                                                disabled={isEditing}
                                                title={isEditing ? "Finish editing to delete" : undefined}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
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
        if (typeof window !== "undefined" && window.crypto?.randomUUID) {
            return window.crypto.randomUUID();
        }
    } catch {
        // ignore
    }
    return `t_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default App;
