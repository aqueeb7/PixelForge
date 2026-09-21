---
trigger: always_on
---

# Rust Rules

Use Rust for functionality that benefits from native desktop execution.

Prefer:

- explicit types
- Result<T, E>
- structured errors
- small modules
- deterministic functions
- unit tests

Avoid:

- unwrap() in production paths
- giant command handlers
- business logic inside main.rs
- unnecessary global state

Tauri commands should be thin.

Example:

Tauri command
    ↓
service
    ↓
domain/core logic

CPU-heavy operations should not block the UI thread.

Video processing should run asynchronously where appropriate.