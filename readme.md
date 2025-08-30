Rich Text Editor
===============================================

Preview it [here](https://mjdaws0n.github.io/Rich-Text-Editor/example.html)

https://mjdaws0n.github.io/Rich-Text-Editor/example.html

What is this?
-------------
It's a rich text editor. You can bold, italic, and type stuff. It works off a JSON model, not the DOM, so it's less likely to break in weird ways. You can select text, hit bold or italic, and it does the right thing (even if you select a mix of bold and not-bold, it will make it all bold or all not-bold, like a real editor should). The main idea is that you can create your own options for it.


How do I use it?
----------------
1. Open `index.html` in your browser. That's it. No build step, no npm, no nothing. Just double click or drag it into Chrome/Safari/whatever.

2. You'll see a toolbar with Bold and Italic buttons, and a big white box. Type in the box. Select some text, click Bold or Italic. Magic.

3. The editor keeps its state in a JSON model, so you could (if you wanted) add export/import features, or inspect the model for fun. (Not included by default, but easy to add.)

4. You can also set the content from HTML using the new `setContent(html)` method. This lets you load HTML (with spans, classes, and style attributes as output by the editor) directly into the editor.

Example: Setting content from HTML
---------------------------------

```js
editor.setContent(
	'<span class="bold">Bold </span>' +
	'<span class="italic">Italic </span>' +
	'<span class="underline">Underline </span>' +
	'<span class="strikethrough">Strike </span>' +
	'<span class="highlight" style="--highlight: #ff0;">Yellow Highlight </span>' +
	'<span class="highlight" style="--highlight: #0af;">Blue Highlight</span>'
);
```

This will load the given HTML into the editor, converting it to the internal JSON model. If the HTML is invalid or not in the expected format, it will just load the plain text.

How does it work?
-----------------
- All the text and formatting is stored in a JS array like:

	```js
	[
		{ text: "Hello ", bold: true },
		{ text: "world", italic: true }
	]
	```

- When you type or format, it updates the model and re-renders the editor. No `execCommand`, no browser weirdness.

Features
--------
- Bold and Italic (more can be added easily)
- Handles mixed selections (see above)
- No dependencies, just HTML/CSS/JS
- Modern, clean UI (see `styles.css`)

Example custom usage
-------------

```html
<div id="editor" class="richtext-editor" contenteditable="true"></div>
<script src="richtext-editor.js"></script>
<script>
	const editor = new RichTextEditor(document.getElementById('editor'));
	// To bold: editor.bold();
	// To italic: editor.italic();
</script>
```

You can hook up your own buttons, or feel free to use the ones in the demo.


Want to add your own formats?
----------------------------
It's super easy now. All formatting is handled by classes, so you can add any format you want (like `code`, `highlight`, `red`, etc) and style it in CSS.


How to add a new format (with or without a value):

1. Add a method to the class (with optional value):

```js
// With a value (e.g. color)
highlight(color = '#ffff00') {
	this.toggleFormat('highlight', color);
}
// Or without a value
code() {
	this.toggleFormat('code');
}
```

2. Add a button in your HTML and hook it up:

```html
<button onclick="editor.highlight('#ff0000')">Highlight Red</button>
<button onclick="editor.highlight('#0000ff')">Highlight Blue</button>
```

3. Add a CSS rule for the class, using the CSS variable if you want:

```css
.highlight {
	background: var(--highlight, yellow); /* fallback to yellow if not set */
}
/* You can add more, e.g. custom font size: */
.customfontsize {
	font-size: var(--customfontsize, 24px);
}
```

That's it! When you call `editor.highlight('#ff0000')`, it will toggle the `highlight` class and set the CSS variable `--highlight: #ff0000;` on the selected text. You can add as many as you want, and style them however you like. If you don't pass a value, no CSS variable is set.


How does it work?
-----------------
- Each format is just a key in the model (e.g. `{ text: 'foo', bold: true, highlight: true, highlightValue: '#ff0000' }`).
- When rendering, all formats are turned into classes on a `<span>`, and any value is turned into a CSS variable (e.g. `style="--highlight: #ff0000;"`).
- The `toggleFormat` method does all the logic for you—no need to change the rendering or model code.

That's it. Enjoy!

Please credit any remixes or modifications, however you don't need to credit the project in production environment.
