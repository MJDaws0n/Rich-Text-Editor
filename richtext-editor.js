// richtext-editor.js
// Rich text editor class (no execCommand)
// By MJDawson
// https://github.com/MJDaws0n/Rich-Text-Editor/tree/main

class RichTextEditor {
	/**
	 * Event listeners stuff
	 */
	_listeners = {};
	/**
	 * @param {HTMLElement} editableElement - The contenteditable element
	 */
	constructor(editableElement) {
		if (!editableElement || !(editableElement instanceof HTMLElement)) {
			throw new Error('Editable element must be a valid HTMLElement');
		}
		if (!editableElement.isContentEditable) {
			throw new Error('Element must have contenteditable="true"');
		}
		this.el = editableElement;
		// The models like: [{ text: string, bold?: true, italic?: true, ... }]
		this.model = [{ text: '' }];
		// The model is always an array of contiguous runs of text with formatting:
		// [{ text: "Bold ", bold: true }, { text: "Italic ", italic: true }, ...]
		this._bindEvents();
		this._render();
		this._emit('change', this.getHTML());
	}
	/**
	 * Add an event listener
	 * @param {string} event
	 * @param {Function} callback
	 */
	on(event, callback) {
		if (!this._listeners[event]) this._listeners[event] = [];
		this._listeners[event].push(callback);
	}

	/**
	 * Remove an event listener
	 * @param {string} event
	 * @param {Function} callback
	 */
	off(event, callback) {
		if (!this._listeners[event]) return;
		this._listeners[event] = this._listeners[event].filter(fn => fn !== callback);
	}

	/**
	 * Emit an event
	 * @param {string} event
	 * @param  {...any} args
	 */
	_emit(event, ...args) {
		if (!this._listeners[event]) return;
		for (const fn of this._listeners[event]) {
			try { fn(...args); } catch (e) { }
		}
	}

	// --- Public API ---
	// These are example functions made for the example

	// You can add you own here, but most likely you will
	// want to just trigger instance.toggleFormat('classname'); in
	// your own code

	bold() {
		this.toggleFormat('bold');
	}

	highlight(value = '#ffff00') {
		this.addFormat('highlight', value);
	}

	/**
	 * Add a format to all spans in the selected lines
	 * @param {string} format
	 * @param {string|undefined} value
	 */
	addFormatToLine(format, value) {
		const valueKey = format + 'Value';
		const lines = this._getSelectedLines();
		if (!lines || lines.length === 0) return;
		let newModel = [];
		for (let i = 0; i < this.model.length; ++i) {
			const span = this.model[i];
			if (lines.includes(this._getLineIndexOfSpan(i))) {
				let newSpan = { ...span };
				newSpan[format] = true;
				if (typeof value !== 'undefined') {
					newSpan[valueKey] = value;
				}
				newModel.push(newSpan);
			} else {
				newModel.push({ ...span });
			}
		}
		this.model = this._mergeSpans(newModel);
		this._render();
		this._emit('change', this.getHTML());
	}

	/**
	 * Remove a format from all spans in the selected lines
	 * @param {string} format
	 */
	removeFormatFromLine(format) {
		const valueKey = format + 'Value';
		const lines = this._getSelectedLines();
		if (!lines || lines.length === 0) return;
		let newModel = [];
		for (let i = 0; i < this.model.length; ++i) {
			const span = this.model[i];
			if (lines.includes(this._getLineIndexOfSpan(i))) {
				let newSpan = { ...span };
				delete newSpan[format];
				delete newSpan[valueKey];
				newModel.push(newSpan);
			} else {
				newModel.push({ ...span });
			}
		}
		this.model = this._mergeSpans(newModel);
		this._render();
		this._emit('change', this.getHTML());
	}

	/**
	 * Toggle a format on all spans in the selected lines
	 * @param {string} format
	 * @param {string|undefined} value
	 */
	toggleFormatOnLine(format, value) {
		const valueKey = format + 'Value';
		const lines = this._getSelectedLines();
		if (!lines || lines.length === 0) return;
		const allHaveFormat = this.lineHasFormat(format);
		let newModel = [];
		for (let i = 0; i < this.model.length; ++i) {
			const span = this.model[i];
			if (lines.includes(this._getLineIndexOfSpan(i))) {
				let newSpan = { ...span };
				if (!allHaveFormat) {
					newSpan[format] = true;
					if (typeof value !== 'undefined') {
						newSpan[valueKey] = value;
					}
				} else {
					delete newSpan[format];
					delete newSpan[valueKey];
				}
				newModel.push(newSpan);
			} else {
				newModel.push({ ...span });
			}
		}
		this.model = this._mergeSpans(newModel);
		this._render();
		this._emit('change', this.getHTML());
	}

	/**
	 * Check if all spans in the selected lines have the format
	 * @param {string} format
	 * @returns {boolean|null}
	 */
	lineHasFormat(format) {
		const lines = this._getSelectedLines();
		if (!lines || lines.length === 0) return null;
		let allHave = true;
		for (let i = 0; i < this.model.length; ++i) {
			const span = this.model[i];
			if (lines.includes(this._getLineIndexOfSpan(i))) {
				if (!span[format]) {
					allHave = false;
					break;
				}
			}
		}
		return allHave;
	}

	/**
	 * Set the editor content from HTML (expects spans with class/style as output by this editor)
	 * Falls back to plain text if parsing fails.
	 * @param {string} html
	 */
	setContent(html) {
		let model = [];
		try {
			const container = document.createElement('div');
			container.innerHTML = html;

			function parseSpan(span) {
				let obj = { text: span.textContent || '' };
				if (span.classList && span.classList.length) {
					for (const cls of span.classList) {
						obj[cls] = true;
					}
				}
				if (span.hasAttribute && span.hasAttribute('style')) {
					const style = span.getAttribute('style');
					const re = /--([\w-]+)\s*:\s*([^;]+);?/g;
					let m;
					while ((m = re.exec(style))) {
						const key = m[1];
						const value = m[2].trim();
						obj[key] = true;
						obj[key + 'Value'] = value;
					}
				}
				return obj;
			}

			function walk(node) {
				if (node.nodeType === 3) { // text node
					const text = node.textContent || '';
					if (text.length > 0) {
						let lines = text.split(/(\n)/);
						for (let i = 0; i < lines.length; ++i) {
							if (lines[i] === '\n') {
								model.push({ text: '\n' });
							} else if (lines[i]) {
								model.push({ text: lines[i] });
							}
						}
					}
				} else if (node.nodeType === 1 && node.tagName === 'SPAN') {
					let obj = parseSpan(node);
					if ([...node.childNodes].every(n => n.nodeType === 3)) {
						let text = obj.text;
						if (text.includes('\n')) {
							let lines = text.split(/(\n)/);
							for (let i = 0; i < lines.length; ++i) {
								if (lines[i] === '\n') {
									model.push({ text: '\n' });
								} else if (lines[i]) {
									let newSpan = {};
									for (const key in obj) {
										if (key !== 'text') newSpan[key] = obj[key];
									}
									newSpan.text = lines[i];
									model.push(newSpan);
								}
							}
						} else {
							let newSpan = {};
							for (const key in obj) {
								if (key !== 'text') newSpan[key] = obj[key];
							}
							newSpan.text = text;
							model.push(newSpan);
						}
					} else {
						for (const child of node.childNodes) walk(child);
					}
				} else if (node.nodeType === 1) {
					for (const child of node.childNodes) walk(child);
				}
			}

			for (const child of container.childNodes) walk(child);

			model = model.filter(s => s.text && s.text.length > 0 || s.text === '\n');
			if (model.length === 0) model = [{ text: '' }];
		} catch (e) {
			let text = (html || '').replace(/<[^>]+>/g, '');
			let lines = text.split(/(\n)/);
			for (let i = 0; i < lines.length; ++i) {
				if (lines[i] === '\n') {
					model.push({ text: '\n' });
				} else if (lines[i]) {
					model.push({ text: lines[i] });
				}
			}
			if (model.length === 0) model = [{ text: '' }];
		}
		this.model = model;

		this._render();
		this._emit('change', this.getHTML());
	}

	/**
	 * Generic format toggler
	 * @param {string} format - e.g. 'bold', 'italic', 'underline', etc.
	 * @param {string|undefined} value - optional value for the format (e.g. color)
	 */
	toggleFormat(format, value) {
		const valueKey = format + 'Value';
		const sel = this._getSelectionOffsets();
		if (!sel) return;
		const { start, end } = sel;
		if (start === end) return; // No selection
		// Determine if all selected text has the format
		let idx = 0;
		let allHaveFormat = true;
		for (const span of this.model) {
			const spanStart = idx;
			const spanEnd = idx + span.text.length;
			if (spanEnd <= start || spanStart >= end) {
				// Do nowt
			} else {
				const selStart = Math.max(start, spanStart);
				const selEnd = Math.min(end, spanEnd);
				if (selEnd > selStart && !span[format]) {
					allHaveFormat = false;
					break;
				}
			}
			idx += span.text.length;
		}
		const shouldAdd = !allHaveFormat;
		// Build new model with uniform format for selection
		idx = 0;
		let newModel = [];
		for (const span of this.model) {
			const spanStart = idx;
			const spanEnd = idx + span.text.length;
			if (spanEnd <= start || spanStart >= end) {
				// Not affected
				newModel.push({ ...span });
			} else {
				// Split as needed
				if (spanStart < start) {
					newModel.push({ ...span, text: span.text.slice(0, start - spanStart) });
				}
				const selStart = Math.max(start, spanStart);
				const selEnd = Math.min(end, spanEnd);
				const selectedText = span.text.slice(selStart - spanStart, selEnd - spanStart);
				let newSpan = { ...span, text: selectedText };
				if (shouldAdd) {
					newSpan[format] = true;
					if (typeof value !== 'undefined') {
						newSpan[valueKey] = value;
					}
				} else {
					// Yall had no clue there was such a thing as delete in javascript
					delete newSpan[format];
					delete newSpan[valueKey];
				}
				newModel.push(newSpan);
				if (spanEnd > end) {
					newModel.push({ ...span, text: span.text.slice(end - spanStart) });
				}
			}
			idx += span.text.length;
		}
		// Merge adjacent spans with same formatting
		this.model = this._mergeSpans(newModel);
		this._render();
		this._emit('change', this.getHTML());
	}

	/**
	 * Explicitly add a format to the current selection
	 * @param {string} format
	 * @param {string|undefined} value
	 */
	addFormat(format, value) {
		const valueKey = format + 'Value';
		const sel = this._getSelectionOffsets();
		if (!sel) return;
		const { start, end } = sel;
		if (start === end) return; // No selection
		let idx = 0;
		let newModel = [];
		for (const span of this.model) {
			const spanStart = idx;
			const spanEnd = idx + span.text.length;
			if (spanEnd <= start || spanStart >= end) {
				// Not affected
				newModel.push({ ...span });
			} else {
				// Split as needed
				if (spanStart < start) {
					newModel.push({ ...span, text: span.text.slice(0, start - spanStart) });
				}
				const selStart = Math.max(start, spanStart);
				const selEnd = Math.min(end, spanEnd);
				const selectedText = span.text.slice(selStart - spanStart, selEnd - spanStart);
				let newSpan = { ...span, text: selectedText };
				newSpan[format] = true;
				if (typeof value !== 'undefined') {
					newSpan[valueKey] = value;
				}
				newModel.push(newSpan);
				if (spanEnd > end) {
					newModel.push({ ...span, text: span.text.slice(end - spanStart) });
				}
			}
			idx += span.text.length;
		}
		this.model = this._mergeSpans(newModel);
		this._render();
		this._emit('change', this.getHTML());
	}

	/**
	 * Explicitly remove a format from the current selection
	 * @param {string} format
	 */
	removeFormat(format) {
		const valueKey = format + 'Value';
		const sel = this._getSelectionOffsets();
		if (!sel) return;
		const { start, end } = sel;
		if (start === end) return; // No selection
		let idx = 0;
		let newModel = [];
		for (const span of this.model) {
			const spanStart = idx;
			const spanEnd = idx + span.text.length;
			if (spanEnd <= start || spanStart >= end) {
				// Not affected
				newModel.push({ ...span });
			} else {
				// Split as needed
				if (spanStart < start) {
					newModel.push({ ...span, text: span.text.slice(0, start - spanStart) });
				}
				const selStart = Math.max(start, spanStart);
				const selEnd = Math.min(end, spanEnd);
				const selectedText = span.text.slice(selStart - spanStart, selEnd - spanStart);
				let newSpan = { ...span, text: selectedText };
				delete newSpan[format];
				delete newSpan[valueKey];
				newModel.push(newSpan);
				if (spanEnd > end) {
					newModel.push({ ...span, text: span.text.slice(end - spanStart) });
				}
			}
			idx += span.text.length;
		}
		this.model = this._mergeSpans(newModel);
		this._render();
		this._emit('change', this.getHTML());
	}

	/**
	 * Check if the current selection has a given format applied
	 * @param {string} format
	 * @returns {boolean|null} true if all selected text has the format, false if none, null if no selection
	 */
	hasFormat(format) {
		const sel = this._getSelectionOffsets();
		if (!sel) return null;
		const { start, end } = sel;
		if (start === end) return null; // No selection
		let idx = 0;
		let allHave = true;
		let noneHave = true;
		for (const span of this.model) {
			const spanStart = idx;
			const spanEnd = idx + span.text.length;
			if (spanEnd <= start || spanStart >= end) {
				// Not affected
			} else {
				const selStart = Math.max(start, spanStart);
				const selEnd = Math.min(end, spanEnd);
				if (selEnd > selStart) {
					if (!span[format]) {
						allHave = false;
					} else {
						noneHave = false;
					}
				}
			}
			idx += span.text.length;
		}
		// If all selected have the format, return true; if none, false; if mixed, return either (here: true if all, else false)
		return allHave;
	}

	/**
	 * Check if the current selection contains any part with the given format
	 * @param {string} format
	 * @returns {boolean|null} true if any selected text has the format, false if none, null if no selection
	 */
	hasFormatContained(format) {
		const sel = this._getSelectionOffsets();
		if (!sel) return null;
		const { start, end } = sel;
		if (start === end) return null; // No selection
		let idx = 0;
		for (const span of this.model) {
			const spanStart = idx;
			const spanEnd = idx + span.text.length;
			if (spanEnd <= start || spanStart >= end) {
				// Not affected
			} else {
				const selStart = Math.max(start, spanStart);
				const selEnd = Math.min(end, spanEnd);
				if (selEnd > selStart && span[format]) {
					return true;
				}
			}
			idx += span.text.length;
		}
		return false;
	}

	/**
	 * Remove all formatting from the entire editor content
	 */
	removeAllFormatting() {
		this.model = this.model.map(span => ({ text: span.text }));
		this._render();
		this._emit('change', this.getHTML());
	}

	/**
	 * Remove all formatting from the selected text only
	 */
	removeFormattingOnSelected() {
		const sel = this._getSelectionOffsets();
		if (!sel) return;
		const { start, end } = sel;
		if (start === end) return; // No selection
		let idx = 0;
		let newModel = [];
		for (const span of this.model) {
			const spanStart = idx;
			const spanEnd = idx + span.text.length;
			if (spanEnd <= start || spanStart >= end) {
				// Not affected
				newModel.push({ ...span });
			} else {
				// Split as needed
				if (spanStart < start) {
					newModel.push({ ...span, text: span.text.slice(0, start - spanStart) });
				}
				const selStart = Math.max(start, spanStart);
				const selEnd = Math.min(end, spanEnd);
				const selectedText = span.text.slice(selStart - spanStart, selEnd - spanStart);
				newModel.push({ text: selectedText });
				if (spanEnd > end) {
					newModel.push({ ...span, text: span.text.slice(end - spanStart) });
				}
			}
			idx += span.text.length;
		}
		this.model = this._mergeSpans(newModel);
		this._render();
		this._emit('change', this.getHTML());
	}

	/**
	 * List all formatting on the selected text
	 * @returns {Array<Object>} Array of formatting objects for each formatted region in selection
	 */
	listFormattingOnSelected() {
		const sel = this._getSelectionOffsets();
		if (!sel) return [];
		const { start, end } = sel;
		if (start === end) return [];
		let idx = 0;
		let result = [];
		for (const span of this.model) {
			const spanStart = idx;
			const spanEnd = idx + span.text.length;
			if (spanEnd <= start || spanStart >= end) {
				// Not affected
			} else {
				const selStart = Math.max(start, spanStart);
				const selEnd = Math.min(end, spanEnd);
				if (selEnd > selStart) {
					let fmt = {};
					for (const key of Object.keys(span)) {
						if (key !== 'text') {
							fmt[key] = span[key];
						}
					}
					result.push(fmt);
				}
			}
			idx += span.text.length;
		}
		return result;
	}
	/**
	 * Get the current HTML content of the editor
	 * @returns {string}
	 */
	getHTML() {
		let html = '';
		for (const span of this.model) {
			let classList = [];
			let styleList = [];
			for (const key of Object.keys(span)) {
				if (key === 'text') continue;
				if (key.endsWith('Value')) {
					const format = key.slice(0, -5);
					if (span[format]) {
						styleList.push(`--${format}: ${span[key]}`);
					}
				} else if (span[key]) {
					classList.push(key);
				}
			}
			const classAttr = classList.length ? ` class="${classList.join(' ')}"` : '';
			const styleAttr = styleList.length ? ` style="${styleList.join('; ')};"` : '';
			html += `<span${classAttr}${styleAttr}>${this._escapeHTML(span.text)}</span>`;
		}
		return html || '<br>';
	}

	// --- Private helpers ---

// --- Private helpers ---

// Bind events for input and selection
_bindEvents() {
	this.el.addEventListener('input', (e) => {
		this._updateModelFromDOM();
		this.model = this._mergeSpans(this.model);
		this._render();
		this._emit('change', this.getHTML());
	});
	this.el.addEventListener('beforeinput', (e) => {
		if (["formatBold", "formatItalic", "formatUnderline", "insertParagraph", "insertLineBreak"].includes(e.inputType)) {
			e.preventDefault();
		}
	});
	this._selectionHandler = () => {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		if (this.el.contains(range.startContainer) || this.el === range.startContainer) {
			this._emit('select');
		}
	};
	document.addEventListener('selectionchange', this._selectionHandler);
}

// Split a span at a given offset, returns [before, after]
_splitSpan(span, offset) {
	if (offset <= 0) return [null, { ...span }];
	if (offset >= span.text.length) return [{ ...span }, null];
	let before = { ...span, text: span.text.slice(0, offset) };
	let after = { ...span, text: span.text.slice(offset) };
	return [before, after];
}

// Split model at a given offset, returns [before, after]
_splitModelAtOffset(model, offset) {
	let idx = 0;
	let before = [], after = [];
	for (let i = 0; i < model.length; ++i) {
		let span = model[i];
		if (idx + span.text.length < offset) {
			before.push({ ...span });
			idx += span.text.length;
		} else if (idx <= offset && offset < idx + span.text.length) {
			let [b, a] = this._splitSpan(span, offset - idx);
			if (b) before.push(b);
			if (a) after.push(a);
			idx += span.text.length;
		} else {
			after.push({ ...span });
			idx += span.text.length;
		}
	}
	return [before, after];
}

// Merge adjacent spans with identical formatting
_mergeSpans(spans) {
	if (!spans.length) return [{ text: '' }];
	let merged = [{ ...spans[0] }];
	for (let i = 1; i < spans.length; ++i) {
		const prev = merged[merged.length - 1];
		const curr = spans[i];
		const prevKeys = Object.keys(prev).filter(k => k !== 'text');
		const currKeys = Object.keys(curr).filter(k => k !== 'text');
		const sameKeys = prevKeys.length === currKeys.length && prevKeys.every(k => curr[k] === prev[k]);
		if (prev.text && curr.text && sameKeys) {
			prev.text += curr.text;
		} else {
			merged.push({ ...curr });
		}
	}
	return merged.filter(s => s.text);
}

// Map DOM selection to model offsets
_getSelectionOffsets() {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return null;
	const range = sel.getRangeAt(0);
	if (!this.el.contains(range.startContainer) || !this.el.contains(range.endContainer)) return null;
	let start = this._getOffsetFromNode(range.startContainer, range.startOffset);
	let end = this._getOffsetFromNode(range.endContainer, range.endOffset);
	if (start > end) [start, end] = [end, start];
	return { start, end };
}

// Update model from DOM input (robust diffing)
_updateModelFromDOM() {
	const text = this.el.innerText.replace(/\r?\n$/, '');
	let oldModel = this.model;
	let newModel = [];
	let idx = 0, oldIdx = 0, oldSpanIdx = 0;
	while (idx < text.length) {
		if (oldSpanIdx < oldModel.length) {
			let span = oldModel[oldSpanIdx];
			let matchLen = 0;
			for (let k = 0; k < span.text.length && idx + k < text.length; ++k) {
				if (text[idx + k] === span.text[k]) {
					matchLen++;
				} else {
					break;
				}
			}
			if (matchLen > 0) {
				newModel.push({ ...span, text: text.substr(idx, matchLen) });
				idx += matchLen;
				oldSpanIdx++;
				continue;
			}
			// Divergence: insert new text, inherit formatting from previous span if possible
			let insertStart = idx;
			let nextMatchIdx = -1;
			for (let j = idx + 1; j <= text.length; ++j) {
				let sub = text.slice(j, j + span.text.length);
				if (sub && sub === span.text.slice(0, sub.length)) {
					nextMatchIdx = j;
					break;
				}
			}
			let newText = text.slice(insertStart, nextMatchIdx === -1 ? text.length : nextMatchIdx);
			let fmtSpan = oldSpanIdx > 0 ? oldModel[oldSpanIdx - 1] : span;
			let newSpan = { text: newText };
			for (const key of Object.keys(fmtSpan)) {
				if (key !== 'text') newSpan[key] = fmtSpan[key];
			}
			newModel.push(newSpan);
			idx += newText.length;
			if (nextMatchIdx !== -1) {
				// Resume matching with current span
			}
		} else {
			// New text at the end, inherit formatting from last span if possible
			let fmtSpan = oldModel.length ? oldModel[oldModel.length - 1] : {};
			let newSpan = { text: text[idx] };
			for (const key of Object.keys(fmtSpan)) {
				if (key !== 'text') newSpan[key] = fmtSpan[key];
			}
			newModel.push(newSpan);
			idx++;
		}
	}
	// Split at line breaks
	let splitModel = [];
	for (const span of newModel) {
		if (span.text.includes('\n')) {
			let lines = span.text.split(/(\n)/);
			for (let i = 0; i < lines.length; ++i) {
				if (lines[i] === '\n') {
					splitModel.push({ text: '\n' });
				} else if (lines[i]) {
					let newSpan = {};
					for (const key in span) {
						if (key !== 'text') newSpan[key] = span[key];
					}
					newSpan.text = lines[i];
					splitModel.push(newSpan);
				}
			}
		} else {
			let newSpan = {};
			for (const key in span) {
				if (key !== 'text') newSpan[key] = span[key];
			}
			newSpan.text = span.text;
			splitModel.push(newSpan);
		}
	}
	newModel = splitModel.filter(s => s.text && s.text.length > 0 || s.text === '\n');
	if (newModel.length === 0) newModel = [{ text: '' }];
	this.model = newModel;
}

	/**
	 * Render the model to the contenteditable div
	 */
	_render() {
				console.log(this.model);
			// Save selection
			const selInfo = this._getSelectionOffsets();
			// Build HTML
			let html = '';
			for (const span of this.model) {
				if (span.text === '\n') {
					html += '<br>';
					continue;
				}
				let classList = [];
				let styleList = [];
				for (const key of Object.keys(span)) {
					if (key === 'text') continue;
					if (key.endsWith('Value')) {
						const format = key.slice(0, -5);
						if (span[format]) {
							styleList.push(`--${format}: ${span[key]}`);
						}
					} else if (span[key]) {
						classList.push(key);
					}
				}
				const classAttr = classList.length ? ` class="${classList.join(' ')}"` : '';
				const styleAttr = styleList.length ? ` style="${styleList.join('; ')};"` : '';
				html += `<span${classAttr}${styleAttr}>${this._escapeHTML(span.text)}</span>`;
			}
			this.el.innerHTML = html || '<br>';
			// Restore selection
			this._restoreSelectionOffsets(selInfo);
	}

	/**
	 * Update the model from the DOM (plain text only, formatting is lost on direct input)
	 */
	_updateModelFromDOM() {
		// Get plain text
		const text = this.el.innerText.replace(/\r?\n$/, ''); // Remove trailing newline
		let newModel = [];
		let oldModel = this.model;
		let textPos = 0;
		let oldSpanIdx = 0;
		let oldSpanOffset = 0;
		while (textPos < text.length) {
			if (oldSpanIdx < oldModel.length) {
				let span = oldModel[oldSpanIdx];
				let spanRem = span.text.length - oldSpanOffset;
				let matchLen = 0;
				// Find how much of the text matches the old span
				for (let k = 0; k < spanRem && textPos + k < text.length; ++k) {
					if (text[textPos + k] === span.text[oldSpanOffset + k]) {
						matchLen++;
					} else {
						break;
					}
				}
				if (matchLen > 0) {
					newModel.push({ ...span, text: text.substr(textPos, matchLen) });
					textPos += matchLen;
					oldSpanOffset += matchLen;
					if (oldSpanOffset >= span.text.length) {
						oldSpanIdx++;
						oldSpanOffset = 0;
					}
					continue;
				}
				// If no match, insert new text up to the next span boundary
				let nextSpanIdx = oldSpanIdx + 1;
				let insertEnd = text.length;
				if (nextSpanIdx < oldModel.length) {
					let nextSpanText = oldModel[nextSpanIdx].text;
					let boundaryIdx = -1;
					if (text.substr(textPos, nextSpanText.length) === nextSpanText) {
						boundaryIdx = textPos;
					} else {
						// Only allow exact match at boundary
						for (let i = 1; i <= text.length - textPos - nextSpanText.length + 1; ++i) {
							if (text.substr(textPos + i, nextSpanText.length) === nextSpanText) {
								boundaryIdx = textPos + i;
								break;
							}
						}
					}
					if (boundaryIdx !== -1) {
						insertEnd = boundaryIdx;
					}
				}
				if (insertEnd > textPos) {
					let fmtSpan = span;
					let newSpan = { text: text.substring(textPos, insertEnd) };
					for (const key of Object.keys(fmtSpan)) {
						if (key !== 'text') newSpan[key] = fmtSpan[key];
					}
					newModel.push(newSpan);
				}
				textPos = insertEnd;
				if (nextSpanIdx < oldModel.length && text.substr(textPos, oldModel[nextSpanIdx].text.length) === oldModel[nextSpanIdx].text) {
					oldSpanIdx = nextSpanIdx;
					oldSpanOffset = 0;
				} else {
					// If not matching, stay on current span
				}
				continue;
			} else {
				// New text at the end, inherit formatting from last span if possible
				let fmtSpan = oldModel.length ? oldModel[oldModel.length - 1] : {};
				let newSpan = { text: text[textPos] };
				for (const key of Object.keys(fmtSpan)) {
					if (key !== 'text') newSpan[key] = fmtSpan[key];
				}
				newModel.push(newSpan);
				textPos++;
			}
		}
		// Split at line breaks
		let splitModel = [];
		for (const span of newModel) {
			if (span.text.includes('\n')) {
				let lines = span.text.split(/(\n)/);
				for (let i = 0; i < lines.length; ++i) {
					if (lines[i] === '\n') {
						splitModel.push({ text: '\n' });
					} else if (lines[i]) {
						let newSpan = { ...span, text: lines[i] };
						delete newSpan.text; newSpan.text = lines[i];
						splitModel.push(newSpan);
					}
				}
			} else {
				splitModel.push(span);
			}
		}
		newModel = splitModel.filter(s => s.text && s.text.length > 0 || s.text === '\n');
		if (newModel.length === 0) newModel = [{ text: '' }];
		this.model = newModel;
	}

	/**
	 * Helper: get line indices of spans in the model
	 * Returns array of line indices for selected lines
	 */
	_getSelectedLines() {
		const sel = this._getSelectionOffsets();
		if (!sel) return [];
		const { start, end } = sel;
		// If collapsed, treat as selecting the line at cursor
		let idx = 0;
		let charToLine = [];
		let line = 0;
		for (const span of this.model) {
			for (let i = 0; i < span.text.length; ++i) {
				charToLine.push(line);
				if (span.text[i] === '\n') line++;
			}
		}
		if (charToLine.length === 0) return [];
		let startLine = charToLine[Math.min(start, charToLine.length - 1)];
		let endLine = charToLine[Math.max(end - 1, 0)];
		if (start === end) endLine = startLine;
		let lines = [];
		for (let l = startLine; l <= endLine; ++l) lines.push(l);
		return lines;
	}

	/**
	 * Helper: get line index for a span in the model
	 * @param {number} spanIdx
	 * @returns {number}
	 */
	_getLineIndexOfSpan(spanIdx) {
		let idx = 0;
		let line = 0;
		for (let i = 0; i < this.model.length; ++i) {
			const span = this.model[i];
			if (i === spanIdx) return line;
			for (let j = 0; j < span.text.length; ++j) {
				if (span.text[j] === '\n') line++;
			}
		}
		return line;
	}

	/**
	 * Merge adjacent spans with same formatting
	 */
	_mergeSpans(spans) {
		if (!spans.length) return [{ text: '' }];
		let merged = [{ ...spans[0] }];
		for (let i = 1; i < spans.length; ++i) {
			const prev = merged[merged.length - 1];
			const curr = spans[i];
			// Compare all keys except text
			const prevKeys = Object.keys(prev).filter(k => k !== 'text');
			const currKeys = Object.keys(curr).filter(k => k !== 'text');
			const sameKeys = prevKeys.length === currKeys.length && prevKeys.every(k => curr[k] === prev[k]);
			if (prev.text && curr.text && sameKeys) {
				prev.text += curr.text;
			} else {
				merged.push({ ...curr });
			}
		}
		return merged.filter(s => s.text);
	}

	/**
	 * Get selection offsets (start/end) in plain text
	 */
	_getSelectionOffsets() {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return null;
		const range = sel.getRangeAt(0);
		// Only support selection within the editor
		if (!this.el.contains(range.startContainer) || !this.el.contains(range.endContainer)) return null;
		// Walk DOM to compute offset
		let start = this._getOffsetFromNode(range.startContainer, range.startOffset);
		let end = this._getOffsetFromNode(range.endContainer, range.endOffset);
		if (start > end) [start, end] = [end, start];
		return { start, end };
	}

	/**
	 * Restore selection from offsets
	 */
	_restoreSelectionOffsets(selInfo) {
		if (!selInfo) return;
		const { start, end } = selInfo;
		// Walk DOM to find nodes
		let node = this.el;
		let offset = 0;
		let startNode = null, startOffset = 0, endNode = null, endOffset = 0;
		function walk(node) {
			for (let child of node.childNodes) {
				if (child.nodeType === 3) { // text
					const len = child.textContent.length;
					if (!startNode && offset + len >= start) {
						startNode = child;
						startOffset = start - offset;
					}
					if (!endNode && offset + len >= end) {
						endNode = child;
						endOffset = end - offset;
					}
					offset += len;
				} else {
					walk(child);
				}
			}
		}
		walk(node);
		if (startNode && endNode) {
			const sel = window.getSelection();
			const range = document.createRange();
			try {
				range.setStart(startNode, startOffset);
				range.setEnd(endNode, endOffset);
				sel.removeAllRanges();
				sel.addRange(range);
			} catch (e) { }
		}
	}

	/**
	 * Get offset in plain text from a node/offset
	 */
	_getOffsetFromNode(node, nodeOffset) {
		let offset = 0;
		function walk(n) {
			if (n === node) {
				if (n.nodeType === 3) {
					offset += nodeOffset;
				}
				return true;
			}
			if (n.nodeType === 3) {
				offset += n.textContent.length;
			} else {
				for (let child of n.childNodes) {
					if (walk(child)) return true;
				}
			}
			return false;
		}
		walk(this.el);
		return offset;
	}

	/**
	 * Escape HTML for rendering
	 */
	_escapeHTML(str) {
		return str.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
	}
}

// Expose globally for demo usage
window.RichTextEditor = RichTextEditor;
