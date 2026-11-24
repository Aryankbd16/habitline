# Habitline Focus

## Stage 1 architecture audit and implementation plan

**Decision for review.** Build a standalone Windows x64 application with Tauri 2, a dedicated React and TypeScript UI, and a Rust session engine backed by its own SQLite database. Ship the timer and floating window architecture first. Enable optional hosts-file blocking only after an elevated recovery prototype proves it can clean up after a crash or reboot without reopening the app. Keep the timer available whenever blocking is unavailable.

### 1. Repository and Windows audit

- The repository was clean on `main` at `b0cba97`. The requested local `habitline_checkpointBranch` pointed to the same commit and tracked its remote. The checkout was switched to that branch for this document.
- The web app is React/Vite in `web/`, with a Dexie/IndexedDB client store and a separate Express API in `server/` using `better-sqlite3`. The server defaults to `data/habit_tracker.db`. The Kotlin Android companion uses on-device SharedPreferences. Existing React experience transfers to the desktop project, while the existing pages, API, credentials, database and Android storage stay outside its runtime dependency graph.
- The host reports x64 Windows build 26300 (26H2) and 10.64 GiB free on C:. Node 22.20.0 and npm were detected. Visual Studio discovery returned 2019 and 2022 Build Tools with the x86/x64 C++ component, Windows SDK libraries for 10.0.19041.0 and 10.0.26100.0 were found, and an Edge WebView2 application directory was present. Rust tools were absent from the shell and rustup was absent from its usual per-user path. RAM was not measured because the CIM query was denied. A working compiler/linker, SDK selection, and usable WebView2 runtime still need a smoke build after approval.

### 2. Stack and architecture

| Component | Responsibility |
| --- | --- |
| Tauri 2 | Native Windows process and windows, tray, packaged assets, scoped frontend IPC and installer configuration. Uses the system WebView2 runtime. |
| React and TypeScript | Dedicated UI, typed session snapshots and form state. Vite builds static assets. Node and npm are development tools only. |
| Rust | Owns session transitions, clocks, persistence, window orchestration, OS lifecycle events and the blocking interface. A separate executable handles elevated operations. |
| SQLite | Local transactional storage and migrations. Use a thin Rust driver such as rusqlite with bundled SQLite, subject to the smoke build. |

Tauri creates real Windows windows while WebView2 renders the new interface. The shipping build loads packaged local assets and starts from the Start menu without Express, a browser tab, internet access, Node or Rust. Electron would add a private Chromium and Node runtime without removing the need for Windows-specific privilege and cleanup work. Use a single desktop process with two windows and one Rust session engine. Keep the UI behind typed commands and events, without a local HTTP server. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) · [Tauri Windows packaging](https://v2.tauri.app/distribute/windows-installer/)

### 3. Proposed layout

```text
desktop/focus/
  package.json                 # Independent frontend scripts and dependencies
  package-lock.json
  src/
    screens/                   # Dashboard, setup, active, history, settings
    floating/                  # Compact second-window UI
    ipc/                       # Typed command and event wrappers
    styles/                    # Shared desktop theme tokens
  src-tauri/
    Cargo.toml
    tauri.conf.json
    capabilities/              # Explicit grants for main and floating windows
    migrations/
    src/                       # Session engine, storage, windows and blocker client
    tests/
  windows/blocker/             # Optional privileged helper crate
```

### 4. User interface and Windows lifecycle

| Area | Planned behavior |
| --- | --- |
| Dashboard | Today's focus time and completed count, active-session card, recent activity and preset quick starts. Quick start preselects a duration and still requires a user-written objective and review of domain selections. |
| Session setup | Required objective, optional notes, 25/45/60/90/120-minute presets and a bounded custom duration. Review the exact hostnames before starting. |
| Active session | Countdown, progress, exact objective, verified blocking status and end control. Stage 2 begins with continuous sessions. Pause/resume is deferred because it changes the deadline, recovery lease and duration accounting. |
| History | Prior objectives, planned and actual duration, timestamps, completion status and local daily/weekly totals. |
| Settings | Default duration, preferred domains, custom hostname list, floating position and visibility, optional launch at sign-in, completion notifications and system/light/dark theme. Site preferences prefill a reviewable selection. |

Use clear timer typography with tabular digits, restrained gradients, clean cards and subtle depth. Keep the active view quiet. Respect reduced motion, keyboard navigation, usable contrast and Windows scaling. Use bundled/system fonts and lightweight CSS, with the countdown as the only regular visible update during a session.

Launch a single instance, run migrations and reconcile stored state before showing the main window. A second launch opens the existing main window. Closing the main window during a session leaves the session running in the tray, with explicit **Open Habitline Focus**, **Show floating window**, **End session** and **Quit** actions. Quit confirms ending an active session and initiates cleanup. Outside a session, closing the main window exits by default. Launch-at-sign-in is opt-in and independent of privileged cleanup.

### 5. Floating window

Create a second Tauri `WebviewWindow` labeled `focus` on demand. Use native topmost ordering and a dedicated drag area. Open and restore it without activating it, avoid periodic attempts to regain topmost or focus, and verify Windows behavior with both pointer and keyboard. If ordinary Tauri show/restore steals focus, use a narrowly scoped native no-activate show path. Keep controls keyboard-accessible through deliberate interaction and provide equivalent controls in the main window and tray. Keep it off the taskbar if tray restoration passes usability testing.

Show remaining time, the exact objective with wrapping and scroll access for long text, and active state. Persist position and visibility separately from session state. Clamp restored bounds to a connected monitor's work area and account for per-monitor DPI. Hide/minimize affects only visibility. Topmost is scoped to the interactive desktop. UAC secure desktop, lock screen, some fullscreen apps and Windows virtual desktop behavior are platform limits to verify. Destroy the floating surface when the session ends.

Both windows fetch the same Rust snapshot on mount, show and resume, and receive transition events with a revision. Visible UI refreshes its display at about 1 Hz from the deadline. Rust owns completion even if both renderers are throttled or hidden. [Tauri window configuration](https://v2.tauri.app/reference/config/#windowconfig) · [Tauri WebviewWindow API](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/)

### 6. Website blocking

| Option | Finding |
| --- | --- |
| Windows hosts file | Recommended for an opt-in prototype. Exact hostnames, low steady-state cost, machine-wide effects and mandatory privileged cleanup. Coverage depends on whether an app honors the mappings. |
| Windows Firewall | IP rules can affect unrelated sites on shared addresses. Microsoft's dynamic FQDN support adds Defender and DNS prerequisites and has gaps with proxies, cached IPs, DoH and some VPNs. |
| Local DNS proxy | Can enforce exact names on clients that use it. Requires resolver configuration, a running process and rollback for network changes, resolver failures and VPN interactions. |
| Browser extension | Viable fallback for an explicitly supported browser. Declarative session rules can limit scope to that browser and clear on exit, but still need expiry while the browser stays open and a separate install/permission workflow. |
| Proxy or traffic interception | Too much installation, privacy and compatibility overhead for this feature. |

[Microsoft DNS lookup behavior](https://learn.microsoft.com/en-us/windows-server/networking/dns/queries-lookups) · [Windows Firewall FQDN requirements](https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/dynamic-keywords) · [Chrome declarative request rules](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest/)

Start with no selected sites. Offer Instagram, Facebook, Reddit and X/Twitter as unchecked suggestions. List any proposed apex or `www` variants explicitly and preview every hostname. YouTube, Google, educational platforms, documentation and learning management systems are available by default. Apply any hostname only when explicitly selected for that session. Explain that changes affect other local users too, and show the scope before UAC.

Validate in Rust and again in the helper. Normalize case and international hostnames to canonical ASCII where supported, deduplicate, cap count and length, accept exact DNS hostname syntax, and reject wildcards, IP literals, URLs, credentials, ports, whitespace, controls and system/local names. Never discover or expand to related hosts in the background. Detect conflicts with existing mappings and preserve them. Account for both IPv4 and IPv6 in the prototype.

Display **Off**, **Applying**, **Active · Windows hosts rules**, **Partial**, **Unavailable** or **Cleanup needed**, with the per-domain result and reason in the main window. Confirm the managed entries from disk before reporting them applied. Verification of a hosts change establishes its presence and does not establish that every browser blocks the site. Consider a Windows DNS cache refresh after apply/remove and report failures separately. Browser DNS caches, service workers, open connections and pooled sockets may outlive a change. Browser DoH, VPNs, proxies, alternate resolvers or custom networking can skip the Windows lookup path depending on their configuration. A different resolver does not by itself prove that a client ignores hosts. Document observed behavior with real browsers. Avoid changing DNS settings, disabling DoH or touching VPN policy.

### 7. SQLite proposal

Put `focus.sqlite3` in Tauri's per-user local application-data directory under a stable, dedicated app identifier. Use durable transactions, foreign keys, parameterized queries and versioned migrations. Enable WAL only if useful for concurrent reads and include sidecars in backup/diagnostic handling. Serialize writes through the engine. Fail visibly if the DB cannot open or migrate and preserve it for recovery.

| Table | Proposed fields and invariants |
| --- | --- |
| `sessions` | UUID primary key, exact `objective`, optional `notes`, `planned_seconds`, UTC epoch-ms `started_at`, `planned_end_at`, nullable `ended_at`, `actual_seconds`, status (`active`, `completed`, `ended_early`, `interrupted`), optional end reason, last blocking outcome. Partial unique index allows one active row. Index by start for history. |
| `session_domains` | Session UUID FK plus canonical hostname as composite key, apply outcome and optional failure code. Immutable selection once started. |
| `preferences` | Typed singleton row for duration, theme, window behavior and last position, sign-in startup and notifications. |
| `preferred_domains` | Canonical hostname PK and preference flags for custom-list membership and prefill. |

Terminal rows are the persistent source for statistics. Compute daily and weekly totals on read with no separate counters initially. Use current local calendar boundaries, including DST, with Monday as the proposed week start. Credit completed/early-ended intervals to each day they overlap, capped by actual duration, and count completions by local end date. Label elapsed time as focus timer time, including time asleep if an uninterrupted session crosses sleep. Document how interrupted sessions are counted before implementation. Keep elevated recovery state in a separate machine-owned journal so cleanup works even if the user database is missing.

### 8. Session timing and recovery

1. Validate the objective, duration and selections. Commit the active row and deadline together **before** any external mutation. Publish the active snapshot and open the floating window immediately. Start permission and blocking work concurrently so dismissal or delay at UAC never holds up the timer. Any late apply must confirm a live session, matching operation ID and unexpired deadline.
2. Rust schedules completion against the persisted UTC deadline and reconciles at launch, resume and relevant OS lifecycle events. Calculate remaining time from the deadline. Use an in-process monotonic reading where available to detect clock discontinuities, re-read wall time after wake or clock changes, and never rewrite the deadline silently. The recovery prototype must validate sleep semantics of the chosen clocks. After restart, UTC is the available authority. Large backward changes surface a clock warning and the helper uses a bounded recovery policy so blocking does not extend indefinitely.
3. Complete expired sessions using the planned deadline as the effective end even if detected later. Manual end uses a timestamp clamped between start and deadline. Set actual elapsed seconds within the planned duration. Race timer expiry and manual end through one idempotent transaction and ignore stale results from prior sessions. Persist the terminal state even if cleanup temporarily fails.
4. On process crash or force-kill, allow the persisted timer to resume before the deadline. An unexpired lease can remain in place until expiry. On reboot, clear the old lease through boot recovery. On logout, attempt immediate release and fall back to independent expiry cleanup if Windows stops the app first. Show the resumed timer with blocking off once release has been verified. Reapplication requires an explicit action. If the app detects an expired row at launch, finalize it once. After normal sleep, wake reconciles both timer and rule state; a sleeping machine cannot run a cleanup task until Windows is available.

### 9. Privilege, restoration and uninstall

- Run the UI as the signed-in user. Offer a separately consented machine-wide blocker component provisioned with UAC and installed in an administrator-writable, user-read-only location. A task running with elevated rights must never launch a binary from a user-writable app directory. Use a narrow helper interface for apply, release and repair with fixed OS-resolved targets. Bind requests to the caller's identity and session, serialize them with machine-wide synchronization and reject competing leases from other Windows users with a clear status. Use protected ACLs for the helper, recovery tasks, backup and journal. Verify the helper path and provenance before privileged use.
- Before modifying hosts, write a protected backup and durable intent with lease ID, owner, expiry and expected managed block. Arm and verify cleanup before the first write. Use one application-owned marked block, preserve unrelated bytes, formatting and security metadata, validate paths against reparse-point substitution, and use a Windows-safe checked replacement strategy. Re-read before replacement and verify after it. External editors do not honor app locks, so treat conflicting edits as a recoverable failure and require live tests of replacement semantics. Never overwrite a newer hosts file with a full backup during routine cleanup.
- Trial a one-shot Task Scheduler cleanup at expiry with missed-run and retry semantics plus a boot cleanup trigger. Verify behavior on battery, after missed triggers, and with no signed-in user. No resident elevated service is planned. Use a boot cleanup for old leases and a bounded retry policy for locked files or temporary failures. For orderly logout, attempt release if possible and retain the independent deadline/boot path if Windows stops the app first. On launch and wake, reconcile app state with the helper journal. Arm a conservative expiry bound and verify time changes cannot leave a lease indefinitely active. If scheduler behavior or reliable restoration cannot be demonstrated, keep hosts blocking disabled. [Microsoft boot triggers](https://learn.microsoft.com/en-us/windows/win32/taskschd/starting-an-executable-on-system-boot) · [Missed-trigger behavior](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-startwhenavailable-settingstype-element)
- Make recovery idempotent across interrupted apply or release. Compare the live block with the recorded owned block. Remove only verifiably owned entries while keeping concurrent unrelated edits. Missing owned entries count as already released. If markers are damaged or ownership is ambiguous, retain backup and journal, show **Cleanup needed**, and offer **Restore website access** through the fixed repair operation. Provide administrator recovery instructions for a reviewed diff if Windows or a third-party policy prevents automated repair. Never report restoration until a read-back confirms removal.
- An uninstall or update must acquire the same lock and run cleanup before removing the helper, recovery task or journal. If cleanup fails, preserve recovery components and show the repair route. Use installer hooks only after proving ordering, privilege and rollback. Keep per-user history by default and make deletion a separate uninstall choice.
- Use bundled assets, a restrictive CSP and explicit Tauri capabilities per window. Register custom command permissions through the app manifest since registered commands otherwise default to being available to all windows. The floating view receives session state and narrowly scoped window controls. Keep privileged controls in the main view. Validate all IPC input in Rust, provide no frontend shell, arbitrary file path, raw SQL or generic elevation API, and prevent navigation to remote pages. Render objectives and notes as text. Store them under user ACLs and omit their contents and domain lists from routine logs. Local storage is accessible to the Windows user and administrators. [Tauri capabilities](https://v2.tauri.app/security/capabilities/)

### 10. Future Habitline integration

Preserve stable session UUIDs and UTC timestamps. A later versioned interchange format can export user-approved history for import into Habitline. The desktop DB remains authoritative for local sessions until an approved synchronization design defines ownership, idempotency and conflicts. Linking habits can add opaque remote habit IDs. Shared sign-in should use a browser-based authorization flow with scoped tokens stored through OS credential facilities. Keep Habitline passwords, current auth state and server database files outside the desktop trust boundary. Domain preferences and private notes should require separate consent before any future sync.

### 11. Storage and performance budget

These are planning allowances, not measurements. Check free space before each approved install or first build. Reuse installed Node, VS 2022 tools, one SDK and the Evergreen WebView2 runtime if the smoke check succeeds.

| Component | Working storage estimate |
| --- | --- |
| Single Rust stable MSVC toolchain, minimal profile | 0.5–1.2 GiB installed, plus transient download/unpack space |
| Cargo downloads and Tauri compilation artifacts | 0.3–0.9 GiB for caches, 1.5–4 GiB for one build profile. Keeping debug and release together can exceed this range. |
| React, TypeScript, Vite, JS Tauri CLI and npm cache | 0.2–0.6 GiB |
| MSVC and one Windows SDK | Near zero incremental cost if existing tools work. Reserve roughly 4–10+ GiB if components are missing, and check the installer estimate before proceeding. |
| Bundled SQLite and data | Low single-digit MiB allowance in native outputs, with a small initial user DB growing with history and journal sidecars. |
| NSIS tooling, packaging staging and outputs | 0.2–1 GiB incremental working space, excluding optional embedded WebView2. Aim for a single-digit to low tens of MiB app installer before embedding a runtime. |

Target NSIS x64, a normal per-user install for the base app, and the shared Evergreen runtime. Default to the download bootstrapper if WebView2 is missing. Offer a separate offline-install build if needed. Tauri documents approximately 127 MB for embedding the Evergreen offline installer and 180 MB for a fixed runtime. Test dependency-free launch with the runtime present and measure WebView2's own disk use separately. [Tauri WebView2 install options](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options)

Reserve roughly 6–8 GiB for a first build with available system prerequisites, keep several GiB free for Windows, and recheck headroom before switching to release builds. Revisit the plan if MSVC or SDK installation is needed. Avoid VMs, emulators, duplicate toolchains and parallel debug/release artifacts on this laptop. Limit build parallelism if memory pressure warrants. Provisional acceptance budgets on this machine are under 1% average total CPU idle over five minutes and below 250 MiB combined private working set for the app and its attributable WebView2 processes with both windows open. Measure cold start and active timer CPU separately. Treat these as targets to validate on a release build.

### 12. Development phases and checkpoints

| Phase | Exit checkpoint |
| --- | --- |
| 1. Audit | Review this document and explicitly approve implementation. |
| 2. Build spike | Verify existing MSVC/SDK and WebView2, approve measured toolchain cost, and run an isolated Tauri skeleton and NSIS smoke install. Prove non-activating floating-window behavior. |
| 3. Core app | Deliver session engine, migrations, dashboard, setup, active view, floating window, tray, settings and history. Pass offline, sleep and restart tests with timer-only sessions. |
| 4. Blocking spike | Exercise fixture edits and failure-injection first. With explicit consent for live system tests, prove UAC, independent recovery, protected installation, safe uninstall, and browser behavior. If hosts recovery misses the gate, evaluate the browser-scoped fallback before shipping blocking. |
| 5. Release validation | Sign the release artifacts where distribution signing is available, test clean install, upgrade and uninstall, and record resource and recovery results on supported Windows machines. Define the supported OS minimum from tested builds before release. |

### 13. Tests and acceptance criteria

- **Install and launch.** Start a packaged build from the Start menu on x64 Windows with Node, Rust and the Habitline backend absent. Complete a session and open history offline. Verify installation both with WebView2 already present and with the selected runtime redistribution mode.
- **Timer and persistence.** Test presets, custom bounds, empty objectives, Unicode and multiline objectives, simultaneous starts, end/expiry races, crash between writes, wake before and after expiry, app restart, Windows reboot, clock jumps, time-zone changes, midnight/DST boundaries and settings retention. After wake or relaunch the visible timer should agree with the authoritative deadline within one display tick, and each session should produce one history row.
- **Floating window.** Test Alt+Tab and typing in another app, drag, hide and restore, monitor unplug, DPI scaling, keyboard and screen reader behavior. Verify the window stays visible over ordinary windows, does not interrupt foreground typing, and shows the exact objective. Verify documented fullscreen and secure-desktop limits.
- **Blocking scope.** Test empty selection, permission denial and timeout, explicit site selection, malformed/duplicate names, mixed success and pre-existing overrides. Inspect both address families, confirm unrelated site access and verify YouTube remains available by default. Compare Edge, Chrome and Firefox with normal and secure DNS, as well as VPN/proxy and warm-cache scenarios. Check UI status against the observed managed rule state.
- **Blocking recovery.** Fault-inject at every intent/task/write step. Test forced termination, reboot and logout without reopening the app, missed deadlines during sleep, battery mode, third-party hosts edits, conflicts, file locks, permission changes, helper interruption, competing user sessions, repeated cleanup, upgrade and uninstall. Require verified file restoration and preserved unrelated entries. Prototype target is cleanup within 60 seconds while Windows is awake and healthy, and within five minutes of becoming available after wake/boot. If Windows prevents cleanup, confirm retained recovery state and actionable repair. Validate inputs and helper integrity before any live hosts test.
- **Resource and security.** Measure installer size, clean build disk use, idle CPU, private working set and launch time. Exercise window-specific command permissions, XSS-like inputs in objectives, permission-denied states, privileged binary replacement protections and restricted filesystem paths. Test fixture-based restoration without requiring administrator privileges for the ordinary suite.

### 14. Risks and approval decisions

| Risk | Decision or release gate |
| --- | --- |
| Hosts rules persist across crashes and can affect every local user | Opt-in and machine-wide disclosure. Require a protected expiry and boot recovery path before any live write. No claim of tamper-proof coverage or instantaneous recovery while Windows is unavailable. |
| Device policy, endpoint security or third-party hosts edits can block restoration | Preserve independent recovery and repair state, preserve other owners' changes, and avoid shipping hosts mode until the failure matrix is demonstrated. |
| Clock changes, sleep and renderer throttling | Durable UTC deadline and Rust reconciliation. Verify recovery clocks and missed-task behavior. |
| Focus theft or topmost exceptions on Windows | Native activation spike first and record real desktop behavior. |
| Low disk headroom | Reuse tools, constrain artifacts and check capacity before installing or compiling. |
| Installer trust and support | Verify WebView2 prerequisite installation, code signing expectations, rollback and elevated component removal before distribution. |

Approval for Stage 2 covers the Tauri/Rust build spike and standalone timer foundation. Review the continuous-session design, counting rules, and machine-wide blocking tradeoff before committing to the blocking prototype and any live system changes.
