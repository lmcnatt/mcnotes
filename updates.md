# McNotes — Planned Updates (Requirements)

This document captures the gathered requirements for a set of updates to McNotes. It is written for the agent that will implement them. **Do not guess beyond what is written here; where a detail is marked "agent decides", use sensible judgment.**

> [!IMPORTANT]
> Read `AGENTS.md` first. This project uses **Next.js 16.2** with breaking changes vs. older versions — consult `node_modules/next/dist/docs/` before writing Next-specific code (e.g. `src/proxy.ts` replaces middleware).

## Codebase orientation

| Area | File |
|---|---|
| Main dashboard: projects, sidebar, search, note loading, wiki-link resolution, modals | `src/app/page.tsx` |
| Editor: textarea, keyboard handlers, preview/split/live modes, header path, footer stats | `src/components/EditorArea.tsx` |
| Sidebar tree (expanded state stored in `localStorage['notes-expanded-folders']`) | `src/components/FileTree.tsx` |
| Filesystem ops, tree building, search | `src/lib/notes.ts` |
| Viewport config | `src/app/layout.tsx` |
| Global styles | `src/app/globals.css` |
| API routes | `src/app/api/notes/*` |

Key facts:
- Storage layout: `<USERS_DIR>/<username>/<Project>/<folders…>/<Note>.md`. A **project ("notebook") is a top-level directory** under the user dir.
- All `relativePath`s used by the client include the project prefix (`Project/Folder/Note.md`). `page.tsx` strips the prefix before passing the tree to `FileTree` and re-adds it in callbacks.
- `/api/notes?project=X` returns only that project's tree. `/api/notes/search` searches **all** projects.
- Active project: `localStorage['notes-active-project']`; last note: `localStorage['notes-selected-path']`.
- Styling is Tailwind v4 with theme CSS vars (`bg-card-bg`, `text-text-muted`, `border-border-theme`, `accent`, etc.). Match the existing look (sepia/light/dark themes). Icons: `lucide-react`.
- Mobile breakpoint used throughout: `lg` (≥1024px = desktop).

Implementation order: **agent decides** (suggested: small fixes → toolbar → breadcrumb navigator → links system).

---

## 1. Header breadcrumb navigator

Currently the editor header shows a static path (`folderPath > noteName` in `EditorArea.tsx`). Make it an interactive breadcrumb **like VS Code's breadcrumb bar**.

### Segments
- Path renders as segments: `[Project] > [Folder] > [Subfolder] > [Note]`.
- **Every segment is clickable** and opens a dropdown anchored below that segment.
- Show the project's **emoji** in the project segment (same emoji source as the sidebar project switcher; fallback 📁).

### Dropdown contents per segment
- **Project segment:** a list of **all projects** (with emojis). Each project is expandable (tree) to browse its folders/notes. **Opening a note from another project switches the active project** (same effect as the sidebar project switcher, then open that note).
- **Folder segment:** shows that folder's **siblings/contents tree** at that level (VS Code style: the dropdown for a segment lists the items in the parent of that segment, with the current one highlighted, and folders expandable inline).
- **Note (last) segment:** shows the **sibling notes in the same folder** (and sibling folders, expandable), current note highlighted.

### Behavior
- Folders behave as a **collapsible tree** inside the dropdown (chevrons, expand inline).
- Sort order: same as sidebar — **folders first, then notes, alphabetical**.
- Supported actions: **open a note**, **expand/collapse folders**. (No create/rename/delete/filter in this navigator.)
- **Keyboard navigation:** arrows to move (Right expands / Left collapses or goes to parent, Up/Down move), Enter opens/toggles, Esc closes. Click outside closes.
- Use a **dropdown on all devices** (not a bottom sheet). Must be usable on mobile and desktop equally (touch targets ≥ 40px tall on mobile, dropdown constrained to viewport).
- Opening a note via the navigator must **reveal it in the sidebar** (see §4).

### Overflow
- Show the full path when it fits. When it doesn't, **collapse middle segments into a clickable `…`** segment (its dropdown lists the hidden segments / their contents). Always keep project and note name visible where possible.

### Data
- Browsing other projects requires their trees. Fetch on demand (e.g. `/api/notes?project=X` when a project is expanded) or add an endpoint that returns all project trees — agent decides; keep it efficient.

---

## 2. Prevent iOS auto-zoom

### Problem
On **iPhone / iOS Safari**, tapping into **modal inputs** (new note/folder name, rename, word goal) and **search / sidebar inputs** zooms the page in, and it **stays zoomed** until the user pinches out.

### Requirements
- Stop the automatic zoom-on-focus.
- **Intentional pinch-zoom must still work** — do NOT set `maximum-scale=1` / `user-scalable=no` as the fix.
- Fix approach (approved): on mobile, ensure all `input`, `textarea`, `select` have **computed font-size ≥ 16px**. Changing font sizes on mobile is acceptable. Apply to the editor textarea too, and to all new inputs created by this update (link maker, table inputs, etc.).
- Desktop sizes may stay as-is.

---

## 3. Tab / Shift+Tab behavior in the editor

Currently `handleTabKey` in `EditorArea.tsx` indents list lines and then **selects the whole affected block**, and does nothing (browser default focus change) on non-list lines.

### Rules
| Situation | Tab | Shift+Tab |
|---|---|---|
| Cursor (no selection) on a **list line** (`-`, `*`, `+`, `1.`, `1)`, incl. checkboxes) | Indent line by 2 spaces | Outdent line by up to 2 spaces |
| Cursor (no selection) on a **non-list line** | Insert 2 spaces **at the cursor** | Outdent the line by up to 2 spaces |
| **Multi-line selection** (list or not) | Indent every selected line by 2 spaces | Outdent every selected line by up to 2 spaces |
| Selection within a single **non-list** line | Indent the line by 2 spaces | Outdent line by up to 2 spaces |

- **Cursor placement (no selection):** cursor stays at the **same position relative to the text** (e.g. if after "foo", it remains after "foo"; i.e. shift by the number of characters added/removed before it, clamped to line start).
- **Multi-line selection:** after the operation, **select the whole affected lines** (current behavior is correct here).
- Indent unit: **2 spaces**.
- **Do not highlight text** in the single-cursor case (this is the main bug being fixed).
- Tab must always `preventDefault` inside the editor (never move focus out).
- **Numbered lists renumber** on indent/outdent, following standard Obsidian/Typora behavior:
  - The indented item becomes a child of the previous item; it starts at `1.` (or continues an existing child numbered list under that parent).
  - Remaining siblings at the old level renumber sequentially to close the gap.
  - Outdenting merges the item into the parent-level list and renumbers that list and the list it left.
  - Preserve the delimiter (`.` vs `)`) of the list being joined.
- **Each Tab/Shift+Tab press = exactly one undo step** (use `applyEdit`).

---

## 4. Reveal the opened note in the sidebar

### Problem
Selecting a note from search loads it in the editor, but the sidebar tree doesn't change to show it. Also, search covers all projects but selecting a result from another project does not switch projects.

### Requirements
Whenever a note is opened, the sidebar must reveal it. Applies to:
- Opening via **search results**
- Opening via **links** (new link system, §6)
- Opening via the **header breadcrumb navigator** (§1)
- **Restoring the last-open note on page load**
- **Creating a new note**

Reveal behavior:
1. If the note belongs to a **different project**, **switch the active project automatically** (persist to localStorage, fetch tree), then open the note.
2. **Expand all ancestor folders** of the note.
3. **Collapse unrelated folders** that were open (only the ancestor chain stays expanded).
4. **Highlight** the note (existing selected styling).
5. **Scroll the sidebar** so the note is visible (e.g. `scrollIntoView({ block: 'nearest' })` after render).
- Persist the resulting expanded state to `localStorage['notes-expanded-folders']`. Note: `FileTree` currently owns `expandedFolders`; lift it up or expose a reveal API — agent decides. Keep in mind FileTree receives project-stripped paths.
- Existing behavior where search clears the query on selection stays.
- On mobile the sidebar may close after opening a note (current behavior); when the user reopens it, the note must already be revealed.

---

## 5. Smooth view-mode switching

### Problem
Switching between Source / Split / Live Preview shows the new view at the top and then jumps to the saved scroll position (current code restores a scroll **ratio** after a 50ms `setTimeout`). Happens on **all** transitions. Does not happen elsewhere.

### Requirements
- **No visible jump** on any mode transition. Either approach is acceptable:
  - restore scroll before first paint (e.g. `useLayoutEffect`), or
  - keep the new view hidden (opacity 0) until scroll is restored, then show it (≤ ~150ms fade).
- Position must map **by content, not percentage**: the same paragraph/heading that was at the top of the viewport stays at the top after switching. Use the existing source-line ↔ preview-anchor machinery (`data-source-line` attributes, mirror-div line offsets) to determine the top-visible source line before switching and scroll the new view to it.
- When returning to Source or Split, **restore the textarea cursor/selection** to where it was (without the restore itself causing the textarea to scroll away from the restored position).
- **Persist the view mode** globally on this device in localStorage (one mode for all notes, survives note switches and reloads).

---

## 6. Links between notes (relative references)

Design **and implement** a linking system. Notebook = project.

### 6.1 Link format (stored markdown)
- Use **standard markdown links** with paths **relative to the current note's file**:
  - Same folder: `[Text](Other%20Note.md)`
  - Other folder, same project: `[Text](../Folder/Note.md)`
  - Another project: climb above the project root: `[Text](../../OtherProject/Folder/Note.md)`
  - Heading: `[Text](../Folder/Note.md#heading-slug)`
  - Block/paragraph: `[Text](../Folder/Note.md#^abc123)`
  - Same note heading/block: `[Text](#heading-slug)` / `[Text](#^abc123)`
  - Folder: `[Text](../Folder/)` (trailing slash)
  - External: `[Text](https://…)`
- Encode spaces and special chars in paths with percent-encoding (`%20`) for portability.
- Heading slugs: use **GitHub-style slugs** (lowercase, strip punctuation, spaces → `-`, dedupe with `-1`, `-2`). Update preview heading `id` generation to match so in-note anchors work.
- Block IDs: Obsidian-style `^id` at the end of a paragraph (e.g. `Some paragraph text ^k3x9q2`). In preview, hide the `^id` marker text and attach it as the element's id/anchor.
- Resolution must never escape the user directory (reuse `resolveUserPath` traversal protection on the server).

### 6.2 Remove wiki links
- **Drop `[[Note]]` wiki-link support.** Remove the `[[…]]` preprocessing and `onSelectWikiLink` flow. Existing `[[…]]` text in notes is left untouched and simply renders as plain text. No migration.

### 6.3 Link maker dialog
- Open with **Ctrl/Cmd+K** (must `preventDefault` to block the browser's search shortcut) and via the **Link** toolbar button (§7). **Ctrl/Cmd+Shift+E** opens it with **Embed** pre-checked.
- Fields:
  1. **Link text**
  2. **Link content** (path or URL) — with a **file/browse button to the right of the field**. User may also just paste/type a link (URL or relative path).
  3. **Section** (optional) — dropdown listing the chosen note's **headings and paragraphs**. Only enabled when a note (or "This note") is chosen.
  4. **Embed** checkbox.
- Prefill rules:
  - Selected text → prefill **Link text**.
  - If the selection is itself a URL → prefill **Link content** instead.
  - If the cursor is inside an existing link → open **prefilled for editing**; saving replaces that link.
- If Link text is left empty, default to the target's name (note name without `.md`, or the heading text if a section is chosen, or the folder name / URL).
- On submit, the app **formats the markdown**: computes the relative path from the current note to the target, appends `#slug` / `#^id`, prefixes `!` if Embed, and inserts at the cursor (replacing the selection). One undo step.
- Picking a **paragraph** in Section: if the paragraph has no `^id`, **auto-generate a short unique id** (e.g. 6 chars base36) and **append it to that paragraph in the target note file** (save via API), then link to it.

### 6.4 File picker (opened by the browse button)
- Opens at the **root of all projects** (list of projects with emojis), with the **current note's folder pre-expanded**.
- Collapsible tree, same sorting as sidebar.
- **"This note"** option at the top (for same-note heading/block links).
- **Folders are selectable** (for folder links), as well as notes.
- **Type-to-filter / fuzzy search** by note name across all projects.
- **Keyboard navigation** (arrows, Enter, Esc).
- Selecting an item fills **Link content** with the computed relative path and populates the **Section** dropdown.

### 6.5 Following links
- **Preview (Live/Split):** clicking a note link opens the note (**switching project if needed**), scrolls to the target heading/block (no highlight), and **reveals it in the sidebar** (§4). Same-note anchors just scroll. External links open in a new tab (current behavior).
- **Folder links:** reveal/expand the folder in the sidebar; **open the sidebar on mobile**.
- **Source mode:** when the cursor is inside a link, show a **small floating "Open link" button near the cursor line** in the textarea (compute caret position, e.g. with the existing mirror-div technique). Clicking it follows the link as above.
- **Broken links** (missing note, heading, or block): styled distinctly as broken (e.g. muted red + dashed underline). Clicking shows a **"Note not found"** message (toast/inline). Do not auto-create.
- Link-existence checking needs knowledge of files across projects; agent decides (e.g. a lightweight endpoint returning all note paths, cached client-side, refreshed on tree changes).

### 6.6 Embeds (transclusion)
- Syntax: markdown image syntax pointing to a note: `![](../Note.md)`, `![](../Note.md#heading)`, `![](../Note.md#^blockid)`.
- Granularities: **whole note**, **heading section** (heading through to the next heading of the same or higher level), **single `^block` paragraph**.
- Rendered in preview **read-only**, **visually framed** (border + source note title header), with a **click-through to open the source note** (at the section, if any).
- **Nested embeds supported** with a depth limit (e.g. 3) and **cycle protection** (show a notice instead of recursing).
- Creating: **Embed checkbox in the link maker**, **Ctrl/Cmd+Shift+E**, or manually typing the `!`. (No separate Embed toolbar button.)
- Regular images (`![](x.png)`) must keep working as images; only `.md` targets are treated as note embeds.

### 6.7 Renames / moves
- When a note or folder is **renamed or moved** (rename API / drag-and-drop), find all links (and embeds) **across all projects** that point to it (or into it, for folders), and **show a confirmation with the count of links that will change** (e.g. "Update 7 links in 4 notes?"). On confirm, rewrite them (recomputing relative paths); on decline, perform the rename without rewriting.
- Also rewrite links **inside** the moved note(s) whose relative paths change due to the move.
- Project renames (via project PATCH) should be handled the same way for cross-project links.

### 6.8 Deletes
- Deleting a note/folder that other notes link to: the delete confirmation shows a warning **"X notes link here"**.

### 6.9 Backlinks
- In the **editor footer, right side** (same bar as word count; coexist with the word-goal indicator), show an **"N backlinks"** button.
- Clicking expands a **panel upward from the footer** listing notes that link to the current note (title + path, optionally a snippet). Clicking an entry opens that note (with reveal, project switching as needed).
- Backlink index computed server-side across all projects (agent decides caching/invalidation).

---

## 7. Formatting toolbar (new)

Add a toolbar **directly under the editor header**.

### Visibility
- Shown in **Source** and **Split** modes; **hidden in Live Preview**.
- On narrow screens, buttons that don't fit collapse into a **`…` overflow menu** that expands on click.
- **On mobile, the toolbar stays visible above the on-screen keyboard** (use `visualViewport` to position it; ensure tapping toolbar buttons does not blur the textarea / dismiss the keyboard — e.g. `onMouseDown`/`onPointerDown` preventDefault).

### Buttons
| Button | Behavior |
|---|---|
| **H1 ▾** (headings) | Shows "H1"; click opens dropdown H1–H6. Button displays the **current line's heading level** when applicable. |
| **Bold** | Wrap/unwrap `**` (reuse `handleWrapShortcut`) |
| **Italic** | Wrap/unwrap `_` |
| **Underline** | Wrap/unwrap `++` |
| **More text ▾** | Dropdown: **Strikethrough** (`~~`), **Inline code** (`` ` ``) |
| **Code block** | Wrap selection/line in ``` fences |
| **Blockquote** | Toggle `> ` prefix |
| **List ▾** | One button with dropdown: **Bullet**, **Numbered**, **Checkbox**. Button shows/applies the **last used** list type. |
| **Table** | Popover with **two number inputs (rows, columns)**, defaults **3×3**, max **20 rows × 10 columns**. Inserts a markdown table (header row + separator + empty rows) on its own lines at the cursor. |
| **Horizontal rule** | Insert `---` on its own line |
| **Link** | Opens the link maker (§6.3) |

- Undo/Redo and Word Goal **stay in the header** (not moved).
- No Embed button (embed lives in the link maker). No Indent/Outdent buttons.

### Behaviors
- **Active state:** buttons reflect the formatting at the cursor/selection (e.g. Bold highlighted inside `**bold**`, heading level shown, list type, quote).
- **Toggle:** clicking an active style removes it.
- **Multi-line selection** for line-level formats (headings, lists, quote, checkbox): apply to **every selected line**; if all already have it, remove it.
- **Tooltips show keyboard shortcuts.**
- New shortcuts: **Ctrl/Cmd+Alt+1…6** set heading level H1–H6 on the current/selected lines (toggle off if already that level).
- Existing shortcuts remain: Ctrl/Cmd+B/I/U/L, Ctrl/Cmd+Z/Y/Shift+Z, Ctrl/Cmd+S. Add Ctrl/Cmd+K (link maker), Ctrl/Cmd+Shift+E (embed).
- Every toolbar action is **one undo step** and returns focus to the textarea with a sensible selection.
- Use the **same dropdown pattern** (button + chevron + popover, keyboard accessible, click-outside to close) for headings, More text, and List.

---

## Acceptance checklist
- [ ] Breadcrumb segments open VS Code-style tree dropdowns; project segment lists all projects; keyboard nav; `…` overflow; opening reveals in sidebar.
- [ ] No auto-zoom on iOS input focus; pinch-zoom still works.
- [ ] Tab/Shift+Tab per table in §3; cursor preserved; numbered lists renumber; one undo step.
- [ ] Opening a note from any source switches project if needed, expands ancestors, collapses others, highlights, scrolls into view.
- [ ] No visible jump when switching modes; content-anchored position; cursor restored; mode persisted.
- [ ] Wiki-link support removed; markdown relative links with headings/blocks/folders/cross-project work; link maker with picker, Section, Embed; floating "Open link" in Source; broken-link styling; embeds with nesting limits; rename link-rewrite with confirmation; delete warning; backlinks panel in footer.
- [ ] Formatting toolbar with listed buttons, dropdowns, active states, overflow menu, mobile keyboard docking, heading shortcuts.
- [ ] `npm run lint` and `npm run build` pass.
