Rich Text Editor (no execCommand)
=================================

Preview: https://mjdaws0n.github.io/Rich-Text-Editor/example.html

Overview
--------
RichTextEditor is a tiny, class-based rich text editor that keeps state in a JSON model (not the DOM). You control formatting by applying classes (and optional inline styles such as CSS variables) to selections or entire lines. The editor:
- Parses the contenteditable content into a clean model.
- Applies formatting by splitting/merging segments in the model.
- Re-renders the DOM from the model.
- Preserves selections and emits events.

Key Features
------------
- Class-based inline formatting (bold, italic, underline, strikethrough, custom, etc.).
- Inline styles with CSS variables (e.g., --highlight).
- Line-level formatting (e.g., align-left/center/right) applied to whole lines.
- Robust multi-line selection handling with precise splitting/merging.
- Events: change (content + HTML), select (range + selected text).
- Selection helpers and caret APIs.
- BR-only lines never receive line-level styles (so caret behaves correctly after Enter).

Quick Start
-----------
1) Include the script and a contenteditable element:
```html
<div id="editor" class="richtext-editor" contenteditable="true"></div>
<script src="richtext-editor.js"></script>
<script>
  const editor = new RichTextEditor(document.getElementById('editor'));
</script>
```

2) Define some CSS for classes you plan to use:
```css
.bold { font-weight: bold; }
.italic { font-style: italic; }
.underline { text-decoration: underline; }
.strikethrough { text-decoration: line-through; }
.highlight { background-color: var(--highlight); }
```

Functions
---------
- **toggleFormat(className, styles?)**
  - Toggle a class on the selected text. styles is an object of inline styles (supports CSS variables).
  - Example: `editor.toggleFormat('highlight', {'--highlight': '#ff0'});`

- **applyFormat(className, styles?)**
  - Apply a class (and optional inline styles) to the selected text without removing existing classes.
  - Example: `editor.applyFormat('bold');`

- **unapplyFormat(className?)**
  - Remove a class from the selected text. If className is empty/falsy, removes all classes and inline styles from the selection.
  - Example: `editor.unapplyFormat('underline');` or `editor.unapplyFormat();`

- **unapplyAllFormat(className?)**
  - Remove formatting across the entire editor. With a className, removes only that class; with no className, removes all classes and inline styles everywhere.
  - Example: `editor.unapplyAllFormat();` or `editor.unapplyAllFormat('highlight');`

- **toggleFormatOnLine(className, styles?)**
  - Toggle a line-level class (and optional styles) on the entire line(s) intersecting the selection (collapsed selection affects the caret line).
  - Example: `editor.toggleFormatOnLine('align-right');`

- **applyFormatOnLine(className, styles?)**
  - Apply a line-level class/styles to entire line(s).
  - Example: `editor.applyFormatOnLine('align-center');`

- **removeFormatFromLine(className?)**
  - Remove a line-level class from the line(s). If className is empty/falsy, clears all line-level classes and styles.
  - Example: `editor.removeFormatFromLine('align-left');` or `editor.removeFormatFromLine();`

- **lineHasFormat(className)**
  - Returns true if all selected lines (or caret line) have the class.

- **includesClass(className)**
  - Returns true if any part of the current selection includes the class.

- **hasFormat(className)**
  - Returns true if the entire selection has the class.

Content APIs
------------
- **setContent(html)**
  - Set the editor content from an HTML string (alias of setContentFromHTML).
  - Example: `editor.setContent('<div><span class="bold">Hello</span></div>');`

- **setContentFromHTML(html)**
  - Parse HTML (as produced by this editor) into the model and render it.

- **setContentFromJson(json)**
  - Set the content directly from a JSON model: Array<Line>, where each Line is an Array of items like { type: 'text', content, className?, styles? }. Optional line._lineClassName and line._lineStyles are supported.

- **getHTML()**
  - Return the current HTML string rendered by the editor.

- **getJson()**
  - Return the current content model as JSON (deep-cloned), including line-level metadata.

Events
------
- **on(event, callback)**
  - Add an event listener.
  - 'change' => callback(contentArray, htmlString)
  - 'select' => callback([start, end], selectedPlainText)
  - Example:
    `editor.on('change', (content, html) => console.log(html));`
    `editor.on('select', ([s, e], text) => console.log(s, e, text));`

Utilities
---------
- **setSelection(startIndex, endIndex)**
  - Programmatically set the selection by linear indices.
- **focused()**
  - Returns true if the editor currently has text focus.