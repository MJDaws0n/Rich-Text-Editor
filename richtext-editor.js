// richtext-editor.js
// Rich text editor class (no execCommand)
// By MJDawson
// https://github.com/MJDaws0n/Rich-Text-Editor/tree/main

class RichTextEditor {
	/**
	 * Event listeners storage
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
		// The model: [{ text: string, bold?: true, italic?: true, ... }]
		this.model = [{ text: '' }];
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

	bold() {
		this.toggleFormat('bold');
	}

	italic() {
		this.toggleFormat('italic');
	}

	underline() {
		this.toggleFormat('underline');
	}


	strikethrough() {
		this.toggleFormat('strikethrough');
	}

	highlight(value = '#ffff00') {
		this.toggleFormat('highlight', value);
	}

	/**
	 * Set the editor content from HTML (expects spans with class/style as output by this editor)
	 * Falls back to plain text if parsing fails.
	 * @param {string} html
	 */
	setContent(html) {
		let model = [];
		try {
			// Parse HTML string into DOM
			const container = document.createElement('div');
			container.innerHTML = html;
			// Helper to extract formats from a span
			function parseSpan(span) {
				let obj = { text: span.textContent || '' };
				// Classes
				if (span.classList && span.classList.length) {
					for (const cls of span.classList) {
						obj[cls] = true;
					}
				}
				// Style (CSS variables)
				if (span.hasAttribute && span.hasAttribute('style')) {
					const style = span.getAttribute('style');
					// Match --key: value; pairs
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
			// Walk children, flattening nested spans
			function walk(node) {
				if (node.nodeType === 3) { // text
					if (node.textContent) model.push({ text: node.textContent });
				} else if (node.nodeType === 1 && node.tagName === 'SPAN') {
					// Only handle <span>
					let obj = parseSpan(node);
					// If span has only text nodes, use as one span
					if ([...node.childNodes].every(n => n.nodeType === 3)) {
						model.push(obj);
					} else {
						// If nested, walk children
						for (const child of node.childNodes) walk(child);
					}
				} else if (node.nodeType === 1) {
					// For other elements, walk children
					for (const child of node.childNodes) walk(child);
				}
			}
			for (const child of container.childNodes) walk(child);
			// Remove empty spans
			model = model.filter(s => s.text && s.text.length > 0);
			if (model.length === 0) model = [{ text: '' }];
		} catch (e) {
			// Fallback: treat as plain text
			model = [{ text: (html || '').replace(/<[^>]+>/g, '') }];
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
		// First pass: determine if all selected text has the format
		let idx = 0;
		let allHaveFormat = true;
		for (const span of this.model) {
			const spanStart = idx;
			const spanEnd = idx + span.text.length;
			if (spanEnd <= start || spanStart >= end) {
				// Not affected
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
		// Second pass: build new model with uniform format for selection
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

	_bindEvents() {
		// Handle input events
		this.el.addEventListener('input', (e) => {
			this._updateModelFromDOM();
			this._render();
			this._emit('change', this.getHTML());
		});
		// Prevent default formatting (e.g. browser bold)
		this.el.addEventListener('beforeinput', (e) => { // you don't really need to change this even if you add more options
			if (["formatBold", "formatItalic", "formatUnderline", "insertParagraph", "insertLineBreak"].includes(e.inputType)) {
				e.preventDefault();
			}
		});
	}

	/**
	 * Render the model to the contenteditable div
	 */
	_render() {
		// Save selection
		const selInfo = this._getSelectionOffsets();
		// Build HTML
		let html = '';
		for (const span of this.model) {
			let classList = [];
			let styleList = [];
			for (const key of Object.keys(span)) {
				if (key === 'text') continue;
				if (key.endsWith('Value')) {
					// e.g. highlightValue -> --highlight: #ff0;
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
		// Try to preserve formatting for unchanged text
		let newModel = [];
		let idx = 0;
		for (const span of this.model) {
			if (!span.text) continue;
			const part = text.slice(idx, idx + span.text.length);
			if (part === span.text) {
				newModel.push({ ...span });
				idx += span.text.length;
			} else {
				break;
			}
		}
		// Add any new text as unformatted
		if (idx < text.length) {
			newModel.push({ text: text.slice(idx) });
		}
		if (newModel.length === 0) newModel = [{ text: '' }];
		this.model = newModel;
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
