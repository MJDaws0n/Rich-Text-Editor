Rich Text Editor
===============================================

Preview it at [https://mjdaws0n.github.io/Rich-Text-Editor/example.html](https://mjdaws0n.github.io/Rich-Text-Editor/example.html).

What is this?
-------------
It's a rich text editor. You can make buttons that add/remove classes from selected text such as bold or italic. It works off a JSON model, not the DOM, so it's less likely to break in weird ways. You can select text, hit somin like bold or italic, and it does the right thing (even if you select a mix of bold and not-bold, it will make it all bold or all not-bold, like a real editor should). The main idea is that you can create your own options for it.

How do I use it?
----------------
Take a look `index.html`. This shows a basic implementation of it. More will be said bellow on how to use it properly.

Hows it work?
----------------
- When you type, the rich text editor (rte) will convert your input into a span and then simplify, basically without fomatting just appears to enter you text into a blank span.
- The editor keeps its state in a JSON model, this makes it easier to work with. I would't know how to make it otherwise tbh.
- When a format is toggled the code takes the selected text and checks to see if it has the class of the toggled format. If it does, it removes it, if not it adds it. The same is for addFormat - just adds the format regardless of if it's already applied and removeFormat - i'm not gonna explain this again.
- Lost more magic stuff that I stuggle to understand now looking over it, so it better never just stop working.


Details of how the data is stored
-----------------
- All the text and formatting is stored in a JS array like:

	```js
	[
		{ text: "Hello ", bold: true },
		{ text: "world", italic: true }
	]
	```
- When you type or format, it updates the model and re-renders the editor. No `execCommand`, no browser weirdness.


RichTextEditor Public API Functions
-----------------------------------

Below are all the main functions you can call on a `RichTextEditor` instance. You can use these to build your own toolbar or custom features. Each function assumes you have an editor instance like:

```js
const editor = new RichTextEditor(document.getElementById('editor'));
```

### Formatting Functions

- **bold()**
	- Toggles bold formatting on the selected text. Essentially just an example function.
	- Example:
		```javascript
		editor.bold();
		```
- **highlight(value = '#ffff00')**
	- Adds highlight formatting with the given color to the selected text. Another example function
	- Example:
		```js
		editor.highlight('#ff0');
		```

- **toggleFormat(format, value?)**
	- Toggles a format (e.g. 'italic', 'underline', 'strikethrough', etc) on the selected text. Optionally pass a value (e.g. color). This simply adds a class with that name to the object so set the respective css such as 
		```css
		.underline {
			text-decoration: underline;
		}
		```
		to make it work correctly. The second argument, can be accessed via var(--name);. So for the highlight example, you may have:
		```css
		.highlight {
			background-color: var(--highlight);
		}
		```
	- Example:
		```js
		editor.toggleFormat('italic');
		editor.toggleFormat('underline');
		editor.toggleFormat('highlight', '#ff0');
		```

- **addFormat(format, value?)**
	- Explicitly adds a format to the selected text, regardless of current state. Similarly, it just adds the class.
	- Example:
		```js
		editor.addFormat('highlight', '#00ff00');
		```

- **removeFormat(format)**
	- Removes a format from the selected text. Similarly, it just removes the class.
	- Example:
		```js
		editor.removeFormat('highlight');
		editor.removeFormat('bold');
		```

- **removeAllFormatting()**
	- Removes all formatting from the entire editor content (not just selected). I don't really see why this would be used much. In the example it's used if no text is selected to clear format on everything.
	- Example:
		```js
		editor.removeAllFormatting();
		```

- **removeFormattingOnSelected()**
	- Removes all formatting from the selected text only.
	- Example:
		```js
		editor.removeFormattingOnSelected();
		```

### Content Functions

- **setContent(html)**
	- Sets the editor content from an HTML string (expects spans with class/style as output by this editor). Should all work correctly assuming it's valid html.
	- Example:
		```js
		editor.setContent('<span class="bold">Bold</span> <span class="italic">Italic</span>');
		```

- **getHTML()**
	- Gets the current HTML content of the editor (as produced by the editor's model).
	- Example:
		```js
		const html = editor.getHTML();
		```

### Query Functions

- **hasFormat(format)**
	- Returns `true` if all selected text has the given format, `false` if none, or `null` if no selection.
	- Example - set state of the button based on selected text (see [event functions](#event-functions)):
		```js
		editor.on('select', () => {
			if (editor.hasFormat('bold')) {
				document.getElementById('bold-btn').classList.add('active');
			} else {
				document.getElementById('bold-btn').classList.remove('active');
			}
		});
		```

- **hasFormatContained(format)**
	- Returns `true` if any part of the selection has the format, `false` if none, or `null` if no selection. Used in more specific cases such as needing to specifically remove a format.
	- Example:
		```js
		editor.on('select', () => {
			if (editor.hasFormatContained('highlight')) {
				document.getElementById('highlight-btn').classList.add('active');
			} else {
				document.getElementById('highlight-btn').classList.remove('active');
			}
		});
		```

- **listFormattingOnSelected()**
	- Returns an array of formatting objects for each formatted region in the selection.
	- Example:
		```js
		const formats = editor.listFormattingOnSelected();
		```
	- Example response:
		```javascript
		[{bold: true}, {italic: true}, {underline: true}, {strikethrough: true}, {highlight: true, highlightValue: "#ff0"}, {highlight: true, highlightValue: "#0af"}]
		```

### Event Functions

- **on(event, callback)**
	- Adds an event listener. Events: 'change' (content changed), 'select' (selection changed). More may be added later.
	- Example:
		```js
		editor.on('change', html => console.log('Changed:', html));
		editor.on('select', () => { /* ... */ });
		```

- **off(event, callback)**
	- Removes an event listener. You aint ever gonna need this.
	- Example:
		```js
		function onChange(html) { /* ... */ }
		editor.on('change', onChange);
		editor.off('change', onChange);
		```

---

You can use these functions to build your own toolbar, keyboard shortcuts, or custom formatting options. See `example.html` for a basic implementation.