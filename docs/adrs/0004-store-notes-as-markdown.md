# 4. Edit notes with TipTap and store them as Markdown

Date: 2026-09-24

## Status

Proposed

## Context

Users write meeting notes in a rich text editor: they can make text bold, add headings, and make lists, including checklists for action items. The feature ticket asks for the TipTap editor and for notes to be stored as Markdown in the database.

TipTap is a rich text editor for the web, built on a lower level library called ProseMirror. Internally, TipTap keeps a document as a tree of nodes, such as paragraphs, headings, and list items. It can export that tree as JSON or HTML. Markdown is a plain text format in which formatting is written with punctuation, such as `## Agenda` for a heading or `- [ ] Send notes` for an unchecked checklist item. Markdown is easy to read without special tools and easy to export or search later.

We had to decide where the conversion between the editor's document and Markdown happens, and which editing features are available.

## Decision

- The editor is TipTap, version 3, used through `@tiptap/react`.
- The editing features are those of TipTap's `StarterKit`, which includes paragraphs, headings, bold, italic, bullet lists, numbered lists, block quotes, and code, plus task lists (`TaskList` and `TaskItem`) for action items. Users can apply formatting from a small toolbar or type Markdown shortcuts, such as `- ` to start a list.
- The conversion to and from Markdown happens in the frontend, with TipTap's official `@tiptap/markdown` extension. When a note is opened, its Markdown is parsed into the editor. When a note is saved, the editor's content is converted to Markdown with `editor.getMarkdown()`, and the frontend sends that text to the backend.
- The backend stores the Markdown as plain text in the `notes` column and does not parse it or change it.
- The editable area has the accessible role `textbox`, the label "Notes", and is marked as multi-line, so that screen readers and our tests can find it.

## Consequences

- The backend does not need a Markdown library, and the stored notes are readable with any SQLite tool.
- Only formatting that Markdown can express can be saved. New editor features, such as text color, must either have a Markdown form or not be added. Every editor extension that we add must have Markdown support in `@tiptap/markdown`.
- Converting from the editor to Markdown and back can change how a note is written without changing what it means, for example `*` bullets can become `-` bullets. Users see the formatted note, not the Markdown, so this does not affect them.

## Alternatives considered

- Store the editor's JSON document instead of Markdown. This keeps every detail of the editor exactly, but the ticket asks for Markdown, and JSON is hard to read or use outside the application.
- Convert to Markdown in the Rust backend. The frontend would send HTML or JSON and the backend would convert it. That requires a second implementation of the editor's document format in Rust that must stay in step with the editor's extensions.
- The community package `tiptap-markdown`. It was the common choice before TipTap published its own extension, but it is no longer updated as often as the official one.
