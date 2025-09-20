// richtext-editor.js
// Rich text editor class (no execCommand)
// By MJDawson
// https://github.com/MJDaws0n/Rich-Text-Editor/tree/main

class RichTextEditor {
    /**
     * Internal content model.
     * Array of lines; each line is an array of text items with optional metadata.
     * @type {Array<Array<{type:'text', content:string, className?:string, styles?:Object}>> & Array<{_lineClassName?:string, _lineStyles?:Object}>}
     */
    content = [];

	/**
	 * Create a RichTextEditor bound to a contenteditable root element.
	 * @param {HTMLElement} textarea - The contenteditable container element.
	 */
	constructor(textarea) {
        this.textarea = textarea;
        this.textarea.addEventListener('input', this.handleInput.bind(this));

        // Basic event system
        this._listeners = {};
        this._lastSelection = { start: null, end: null };

        // Selection tracking
        this._onSelectionChangeBound = this._onSelectionChange.bind(this);
        document.addEventListener('selectionchange', this._onSelectionChangeBound);
    }

    /**
     * Register an event listener.
     * Supported events: `change` (model/html changed), `select` (selection changed).
     * @param {string} type - Event type.
     * @param {Function} handler - Callback invoked with event-specific args.
     * @returns {this}
     */
    on(type, handler) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(handler);
        return this;
    }

    /**
     * Emit an internal event to registered listeners.
     * @private
     * @param {string} type - Event type.
     * @param {...any} args - Arguments passed to listeners.
     */
    _emit(type, ...args) {
        const list = this._listeners[type] || [];
        for (const fn of list) {
            try { fn(...args); } catch (e) { /* noop */ }
        }
    }

    /**
     * Internal: handler for document selection changes.
     * Emits `select` with [start, end] and selected text.
     * @private
     */
    _onSelectionChange() {
        console.log('selectionchange');
        // Only emit if selection is in this editor
        const sel = window.getSelection?.();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!this.textarea.contains(range.startContainer) && !this.textarea.contains(range.endContainer)) return;

        const start = this.getCaretStartIndex();
        const end = this.getCaretIndex();

        // Still emit regardless of change, to allow select event even if no change
        const selectedText = this._getPlainTextInRange(start, end);
        this._emit('select', [start, end], selectedText);


        if (start === this._lastSelection.start && end === this._lastSelection.end) return;

        this._lastSelection = { start, end };
    }

    /**
     * Internal: get plain text between two linear indices.
     * @private
     * @param {number} selectionStart - Start index (inclusive).
     * @param {number} selectionEnd - End index (exclusive).
     * @returns {string} Plain text within the given range.
     */
    _getPlainTextInRange(selectionStart, selectionEnd) {
        if (selectionStart > selectionEnd) { const t = selectionStart; selectionStart = selectionEnd; selectionEnd = t; }
        if (selectionStart === selectionEnd) return '';

        let idx = 0;
        let acc = '';

        this.content.forEach((line) => {
            // Account for the DIV token in index math; do not add text for it
            idx += 1;

            line.forEach((item) => {
                if (item.type !== 'text') return;

                if (item.content === '') {
                    // BR counts as +1 in index math; do not add text for it
                    idx += 1;
                    return;
                }

                const len = item.content.length;
                const chunkStart = idx;
                const chunkEnd = idx + len;

                const overlapStart = Math.max(selectionStart, chunkStart);
                const overlapEnd = Math.min(selectionEnd, chunkEnd);

                if (overlapStart < overlapEnd) {
                    const localStart = overlapStart - chunkStart;
                    const localEnd = overlapEnd - chunkStart;
                    acc += item.content.slice(localStart, localEnd);
                }

                idx += len;
            });
        });

        return acc;
    }

    /**
     * Toggle format on the selected text.
     * Adds the class/styles if not present on the entire selection; otherwise removes it.
     * @param {string} className - Space-separated CSS class(es) to toggle.
     * @param {Object|Array} [styles={}] - Optional inline styles to apply when adding. Accepts object or array of [prop, value] pairs or objects.
     * @returns {void}
     */
    toggleFormat(className, styles = {}) {
        if (this.lineHasFormat(className)) {
            this.unapplyFormat(className);
        } else {
            this.applyFormat(className, styles);
        }
    }

    /**
     * Toggle format on the current line(s).
     * Applies the class/styles to all selected lines if missing; otherwise removes them.
     * @param {string} className - Space-separated CSS class(es) to toggle on lines.
     * @param {Object|Array} [styles={}] - Optional inline styles for line elements.
     * @returns {void}
     */
    toggleFormatOnLine(className, styles = {}) {
        if(this.lineHasFormat()){
            this.removeFormatFromLine(className);
        } else {
            this.applyFormatOnLine(className, styles);
        }
    }

    /**
     * Apply format to the selected text.
     * Merges class tokens and shallow-merges inline styles on overlapping ranges.
     * @param {string} className - Space-separated CSS class(es) to add.
     * @param {Object|Array} [styles={}] - Optional inline styles to apply; array/object accepted.
     * @returns {void}
     */
    applyFormat(className, styles = {}) {
        let selectionStart = this.getCaretStartIndex();
        let selectionEnd = this.getCaretIndex();

        // Normalise selection bounds
        if (selectionStart > selectionEnd) {
            const tmp = selectionStart;
            selectionStart = selectionEnd;
            selectionEnd = tmp;
        }
        if (selectionStart === selectionEnd) return;

        // Normalize styles input to an object of {prop: value}
        const normalizeStyles = (val) => {
            if (!val) return {};
            if (typeof val === 'object' && !Array.isArray(val)) return val;
            if (Array.isArray(val)) {
                const out = {};
                for (const entry of val) {
                    if (!entry) continue;
                    if (Array.isArray(entry) && entry.length >= 2) out[String(entry[0])] = String(entry[1]);
                    else if (typeof entry === 'object') {
                        Object.entries(entry).forEach(([k, v]) => { out[String(k)] = String(v); });
                    }
                }
                return out;
            }
            return {};
        };
        const selectionStyles = normalizeStyles(styles);

        const toClassSet = (cls) => new Set(String(cls || '').trim().split(/\s+/).filter(Boolean));
        const canonClass = (cls) => Array.from(toClassSet(cls)).sort().join(' ');
        const mergeClasses = (orig, add) => {
            const set = toClassSet(orig);
            for (const token of toClassSet(add)) set.add(token);
            return Array.from(set).join(' ');
        };

        const makeItem = (text, cls, stl) => {
            const obj = { type: 'text', content: text };
            if (cls) obj.className = canonClass(cls);
            const stlObj = normalizeStyles(stl);
            if (Object.keys(stlObj).length) obj.styles = stlObj;
            return obj;
        };
        const sameStyles = (a, b) => {
            const A = a || null, B = b || null;
            try { return JSON.stringify(A) === JSON.stringify(B); } catch { return false; }
        };
        const mergeAdjacent = (arr) => {
            const out = [];
            for (const it of arr) {
                if (out.length) {
                    const prev = out[out.length - 1];
                    const bothText = prev.type === 'text' && it.type === 'text';
                    const nonEmpty = prev.content !== '' && it.content !== '';
                    const sameClass = canonClass(prev.className) === canonClass(it.className);
                    const sameA = sameStyles(prev.styles, it.styles);
                    if (bothText && nonEmpty && sameClass && sameA) {
                        prev.content += it.content;
                        continue;
                    }
                }
                out.push(it);
            }
            return out;
        };

        let idx = 0;
        const updatedContent = [];

        this.content.forEach((line) => {
            const updatedLine = [];
            idx += 1; // account for DIV

            for (const item of line) {
                if (item.type !== 'text') {
                    updatedLine.push(item);
                    continue;
                }

                if (item.content === '') {
                    idx += 1; // BR
                    updatedLine.push(item);
                    continue;
                }

                const originalClass = item.className;
                const originalStyles = item.styles;
                const text = item.content;
                let offset = 0;
                let remaining = text.length;

                while (remaining > 0) {
                    const chunkStart = idx;
                    const chunkEnd = idx + remaining;

                    // Entirely outside selection
                    if (selectionEnd <= chunkStart || selectionStart >= chunkEnd) {
                        updatedLine.push(makeItem(text.slice(offset, offset + remaining), originalClass, originalStyles));
                        idx += remaining;
                        remaining = 0;
                        break;
                    }

                    // Pre-selection
                    if (selectionStart > chunkStart) {
                        const preLen = Math.min(remaining, selectionStart - chunkStart);
                        if (preLen > 0) {
                            updatedLine.push(makeItem(text.slice(offset, offset + preLen), originalClass, originalStyles));
                            idx += preLen;
                            offset += preLen;
                            remaining -= preLen;
                            continue;
                        }
                    }

                    // Selected
                    const selLen = Math.min(remaining, selectionEnd - idx);
                    if (selLen > 0) {
                        // Merge class tokens (add new class without removing existing)
                        const mergedClass = className ? mergeClasses(originalClass, className) : originalClass;
                        // Merge styles shallowly; new styles override same-name props
                        const mergedStyles = Object.keys(selectionStyles).length
                            ? { ...(originalStyles || {}), ...selectionStyles }
                            : originalStyles;

                        updatedLine.push(makeItem(text.slice(offset, offset + selLen), mergedClass, mergedStyles));
                        idx += selLen;
                        offset += selLen;
                        remaining -= selLen;
                        continue;
                    }
                }
            }

            // Merge and preserve line-level metadata
            const mergedLine = mergeAdjacent(updatedLine);
            mergedLine._lineClassName = line._lineClassName;
            if (line._lineStyles) mergedLine._lineStyles = { ...line._lineStyles };
            updatedContent.push(mergedLine);
        });

        this.content = updatedContent;
        this.updateDom(this.content);
        // Preserve selection
        this.setSelection(selectionStart, selectionEnd);
        // Emit change with content and html
        this._emit('change', this.content, this.textarea.innerHTML);
    }

    /**
     * Remove formatting from the selected text.
     * If `className` is provided, removes only those class token(s). If empty/falsy, removes all classes and inline styles in the selection.
     * @param {string} [className] - Space-separated class token(s) to remove. If omitted/empty, clears all formatting.
     * @returns {void}
     */
    unapplyFormat(className) {
        let selectionStart = this.getCaretStartIndex();
        let selectionEnd = this.getCaretIndex();

        if (selectionStart > selectionEnd) {
            const tmp = selectionStart;
            selectionStart = selectionEnd;
            selectionEnd = tmp;
        }
        if (selectionStart === selectionEnd) return;

        const removeAll = className == null || String(className).trim() === '';

        // Class helpers
        const toClassSet = (cls) => new Set(String(cls || '').trim().split(/\s+/).filter(Boolean));
        const canonClass = (cls) => Array.from(toClassSet(cls)).sort().join(' ');
        const removeClasses = (orig, remove) => {
            const set = toClassSet(orig);
            for (const token of toClassSet(remove)) set.delete(token);
            return Array.from(set).join(' ');
        };

        const makeItem = (text, cls, styles) => {
            const obj = { type: 'text', content: text };
            const canon = canonClass(cls);
            if (canon) obj.className = canon;
            if (styles && Object.keys(styles).length) obj.styles = styles;
            return obj;
        };
        const sameStyles = (a, b) => {
            const A = a || null, B = b || null;
            try { return JSON.stringify(A) === JSON.stringify(B); } catch { return false; }
        };
        const mergeAdjacent = (arr) => {
            const out = [];
            for (const it of arr) {
                if (out.length) {
                    const prev = out[out.length - 1];
                    const bothText = prev.type === 'text' && it.type === 'text';
                    const nonEmpty = prev.content !== '' && it.content !== '';
                    const sameClass = canonClass(prev.className) === canonClass(it.className);
                    const sameA = sameStyles(prev.styles, it.styles);
                    if (bothText && nonEmpty && sameClass && sameA) {
                        prev.content += it.content;
                        continue;
                    }
                }
                out.push(it);
            }
            return out;
        };

        let idx = 0;
        const updatedContent = [];

        this.content.forEach((line) => {
            const updatedLine = [];
            idx += 1; // account for DIV per line

            for (const item of line) {
                if (item.type !== 'text') {
                    updatedLine.push(item);
                    continue;
                }

                if (item.content === '') {
                    idx += 1; // BR
                    updatedLine.push(item);
                    continue;
                }

                const originalClass = item.className;
                const originalStyles = item.styles;
                const text = item.content;

                let offset = 0;
                let remaining = text.length;

                while (remaining > 0) {
                    const chunkStart = idx;
                    const chunkEnd = idx + remaining;

                    // Entirely outside selection
                    if (selectionEnd <= chunkStart || selectionStart >= chunkEnd) {
                        updatedLine.push(makeItem(text.slice(offset, offset + remaining), originalClass, originalStyles));
                        idx += remaining;
                        remaining = 0;
                        break;
                    }

                    // Pre-selection
                    if (selectionStart > chunkStart) {
                        const preLen = Math.min(remaining, selectionStart - chunkStart);
                        if (preLen > 0) {
                            updatedLine.push(makeItem(text.slice(offset, offset + preLen), originalClass, originalStyles));
                            idx += preLen;
                            offset += preLen;
                            remaining -= preLen;
                            continue;
                        }
                    }

                    // Selected portion
                    const selLen = Math.min(remaining, selectionEnd - idx);
                    if (selLen > 0) {
                        const newClass = removeAll ? undefined : removeClasses(originalClass, className);
                        const newStyles = removeAll ? undefined : originalStyles;
                        updatedLine.push(makeItem(text.slice(offset, offset + selLen), newClass, newStyles));
                        idx += selLen;
                        offset += selLen;
                        remaining -= selLen;
                        continue;
                    }
                }
            }

            // Merge and preserve line-level metadata
            const mergedLine = mergeAdjacent(updatedLine);
            mergedLine._lineClassName = line._lineClassName;
            if (line._lineStyles) mergedLine._lineStyles = { ...line._lineStyles };
            updatedContent.push(mergedLine);
        });

        this.content = updatedContent;
        this.updateDom(this.content);
        // Preserve selection
        this.setSelection(selectionStart, selectionEnd);
        // Emit change with content and html
        this._emit('change', this.content, this.textarea.innerHTML);
    }

    /**
     * Remove formatting across the entire editor.
     * If `className` is provided, removes only that/those class(es) everywhere; otherwise clears all classes and styles.
     * Preserves selection and emits `change`.
     * @param {string} [className] - Space-separated class token(s) to remove globally; if omitted/empty, removes all.
     * @returns {void}
     */
    unapplyAllFormat(className) {
        console.log('here');
        const selectionStart = this.getCaretStartIndex();
        const selectionEnd = this.getCaretIndex();

        const removeAll = className == null || String(className).trim() === '';

        // Helpers (match logic used elsewhere)
        const toClassSet = (cls) => new Set(String(cls || '').trim().split(/\s+/).filter(Boolean));
        const canonClass = (cls) => Array.from(toClassSet(cls)).sort().join(' ');
        const removeClasses = (orig, remove) => {
            const set = toClassSet(orig);
            for (const token of toClassSet(remove)) set.delete(token);
            return Array.from(set).join(' ');
        };
        const sameStyles = (a, b) => {
            const A = a || null, B = b || null;
            try { return JSON.stringify(A) === JSON.stringify(B); } catch { return false; }
        };
        const mergeAdjacent = (arr) => {
            const out = [];
            for (const it of arr) {
                if (out.length) {
                    const prev = out[out.length - 1];
                    const bothText = prev.type === 'text' && it.type === 'text';
                    const nonEmpty = prev.content !== '' && it.content !== '';
                    const sameClass = (canonClass(prev.className) === canonClass(it.className));
                    const sameA = sameStyles(prev.styles, it.styles);
                    if (bothText && nonEmpty && sameClass && sameA) {
                        prev.content += it.content;
                        continue;
                    }
                }
                out.push(it);
            }
            return out;
        };

        const updatedContent = this.content.map((line) => {
            const updatedLine = line.map((item) => {
                if (item.type !== 'text') return item;
                if (item.content === '') return item; // keep BRs

                let newClass = item.className;
                let newStyles = item.styles;

                if (removeAll) {
                    newClass = undefined;
                    newStyles = undefined;
                } else {
                    newClass = removeClasses(newClass, className);
                }

                const obj = { type: 'text', content: item.content };
                const canon = canonClass(newClass);
                if (canon) obj.className = canon;
                if (!removeAll && newStyles && Object.keys(newStyles).length) obj.styles = newStyles;
                return obj;
            });

            // Merge and preserve line-level metadata
            const merged = mergeAdjacent(updatedLine);
            merged._lineClassName = line._lineClassName;
            if (line._lineStyles) merged._lineStyles = { ...line._lineStyles };
            return merged;
        });

        this.content = updatedContent;
        this.updateDom(this.content);
        this.setSelection(selectionStart, selectionEnd);
        this._emit('change', this.content, this.textarea.innerHTML);
    }

    /**
     * Apply a class and optional inline styles to the entire line(s).
     * If selection is collapsed, applies to the caret line.
     * @param {string} className - Space-separated CSS class(es) to add to line elements.
     * @param {Object|Array} [styles={}] - Inline styles to merge into line elements.
     * @returns {void}
     */
    applyFormatOnLine(className, styles = {}) {
        if (!className || String(className).trim() === '') return;

        const selectionStart = this.getCaretStartIndex();
        const selectionEnd = this.getCaretIndex();

        // Helpers
        const normalizeStyles = (val) => {
            if (!val) return {};
            if (typeof val === 'object' && !Array.isArray(val)) return val;
            if (Array.isArray(val)) {
                const out = {};
                for (const entry of val || []) {
                    if (!entry) continue;
                    if (Array.isArray(entry) && entry.length >= 2) out[String(entry[0])] = String(entry[1]);
                    else if (typeof entry === 'object') Object.entries(entry).forEach(([k, v]) => out[String(k)] = String(v));
                }
                return out;
            }
            return {};
        };
        const toClassSet = (cls) => new Set(String(cls || '').trim().split(/\s+/).filter(Boolean));
        const canonClass = (cls) => Array.from(toClassSet(cls)).sort().join(' ');
        const mergeClasses = (orig, add) => {
            const set = toClassSet(orig);
            for (const token of toClassSet(add)) set.add(token);
            return Array.from(set).join(' ');
        };

        const lineIndexes = this._getSelectedLineIndexes(selectionStart, selectionEnd);
        const mergedStyles = normalizeStyles(styles);

        lineIndexes.forEach((li) => {
            const line = this.content[li];
            if (!line) return;
            const newClass = mergeClasses(line._lineClassName, className);
            line._lineClassName = canonClass(newClass) || undefined;
            if (Object.keys(mergedStyles).length) {
                line._lineStyles = { ...(line._lineStyles || {}), ...mergedStyles };
            }
        });

        this.updateDom(this.content);
        this.setSelection(selectionStart, selectionEnd);
        this._emit('change', this.content, this.textarea.innerHTML);
    }

    /**
     * Remove a class (or all formatting if empty) from the entire line(s).
     * If selection is collapsed, removes from the caret line.
     * @param {string} [className] - Space-separated class token(s) to remove from lines; empty clears all line formatting.
     * @returns {void}
     */
    removeFormatFromLine(className) {
        const selectionStart = this.getCaretStartIndex();
        const selectionEnd = this.getCaretIndex();
        const removeAll = className == null || String(className).trim() === '';

        const toClassSet = (cls) => new Set(String(cls || '').trim().split(/\s+/).filter(Boolean));
        const canonClass = (cls) => Array.from(toClassSet(cls)).sort().join(' ');
        const removeClasses = (orig, remove) => {
            const set = toClassSet(orig);
            for (const token of toClassSet(remove)) set.delete(token);
            return Array.from(set).join(' ');
        };

        const lineIndexes = this._getSelectedLineIndexes(selectionStart, selectionEnd);

        lineIndexes.forEach((li) => {
            const line = this.content[li];
            if (!line) return;
            if (removeAll) {
                delete line._lineClassName;
                delete line._lineStyles;
            } else {
                const newClass = removeClasses(line._lineClassName, className);
                line._lineClassName = (canonClass(newClass) || undefined);
            }
        });

        this.updateDom(this.content);
        this.setSelection(selectionStart, selectionEnd);
        this._emit('change', this.content, this.textarea.innerHTML);
    }

    /**
     * Check whether all selected lines (or caret line) have the given class(es).
     * @param {string} className - Space-separated class token(s) to check.
     * @returns {boolean} True if every selected line includes all tokens.
     */
    lineHasFormat(className) {
        if (!className || String(className).trim() === '') return false;

        const selectionStart = this.getCaretStartIndex();
        const selectionEnd = this.getCaretIndex();

        const toClassSet = (cls) => new Set(String(cls || '').trim().split(/\s+/).filter(Boolean));
        const required = toClassSet(className);
        if (required.size === 0) return false;

        const lineIndexes = this._getSelectedLineIndexes(selectionStart, selectionEnd);
        if (lineIndexes.length === 0) return false;

        for (const li of lineIndexes) {
            const line = this.content[li];
            const have = toClassSet(line && line._lineClassName);
            for (const token of required) {
                if (!have.has(token)) return false;
            }
        }
        return true;
    }

    /**
     * Internal: get selected line indexes (inclusive).
     * Uses DOM to resolve lines. Collapsed selection returns caret line.
     * @private
     * @param {number} selectionStart - Linear selection start index.
     * @param {number} selectionEnd - Linear selection end index.
     * @returns {number[]} Array of line indexes covered by the selection.
     */
    _getSelectedLineIndexes(selectionStart, selectionEnd) {
        const divs = Array.from(this.textarea.querySelectorAll('div'));
        if (divs.length === 0) return [];

        const sel = window.getSelection && window.getSelection();
        if (!sel || sel.rangeCount === 0) return [];

        const range = sel.getRangeAt(0);
        const getLineIndexForNode = (node) => {
            let el = node;
            if (el && el.nodeType !== 1) el = el.parentNode;
            while (el && el !== this.textarea && el.nodeName && el.nodeName.toLowerCase() !== 'div') {
                el = el.parentNode;
            }
            if (!el || el === this.textarea) return -1;
            return divs.indexOf(el);
        };

        let startIdx = getLineIndexForNode(range.startContainer);
        let endIdx = getLineIndexForNode(range.endContainer);

        // If collapsed or any index invalid, try fallback to caret position line via end index
        if (selectionStart === selectionEnd) {
            if (endIdx === -1) {
                // try start
                endIdx = startIdx;
            }
            if (endIdx === -1) return [];
            startIdx = endIdx;
        }

        if (startIdx === -1 && endIdx !== -1) startIdx = endIdx;
        if (endIdx === -1 && startIdx !== -1) endIdx = startIdx;
        if (startIdx === -1 && endIdx === -1) return [];

        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        const out = [];
        for (let i = from; i <= to; i++) out.push(i);
        return out;
    }

    /**
     * Whether the editor has text focus.
     * @returns {boolean} True if selection/caret is within the editor.
     */
    focused() {
        const sel = window.getSelection && window.getSelection();
        if (document.activeElement === this.textarea) return true;
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            return this.textarea.contains(range.startContainer) || this.textarea.contains(range.endContainer);
        }
        return false;
    }

    /**
     * Handle input events from the contenteditable element.
     * Parses DOM into the internal model, re-renders, preserves caret, and emits `change`.
     * @param {Event|null} [event=null] - Input event; may be null for manual triggering.
     * @returns {void}
    */
    handleInput(event = null) {
        if (event) event.preventDefault();
        this.content = [];
        const lines = [];
        var lastNodeType = null;
        var caratIndexOffset = 0;
    
        Array.from(this.textarea.querySelectorAll('div')).forEach(line => {
            const currentLine = []
            // Capture line-level class and styles
            const lineClass = line.getAttribute('class') || undefined;
            if (lineClass) currentLine._lineClassName = lineClass;
            const lineStyles = {};
            const lineStyleDecl = line.style;
            for (let i = 0; i < lineStyleDecl.length; i++) {
                const name = lineStyleDecl[i];
                const value = lineStyleDecl.getPropertyValue(name);
                lineStyles[name] = value;
            }
            if (Object.keys(lineStyles).length) currentLine._lineStyles = lineStyles;

            Array.from(line.childNodes).forEach(child => {
                const nodeType = child.nodeName.toLowerCase();
                if(nodeType === '#text') {
                    currentLine.push({ type: 'text', content: child.textContent });
                }
                if(nodeType === 'span') {
                    // Preserve className and inline styles (including CSS custom properties)
                    const className = child.getAttribute('class') || undefined;
                    const stylesObj = {};
                    const styleDecl = child.style;
                    for (let i = 0; i < styleDecl.length; i++) {
                        const name = styleDecl[i];
                        const value = styleDecl.getPropertyValue(name);
                        stylesObj[name] = value;
                    }
                    const item = { type: 'text', content: child.textContent };
                    if (className) item.className = className;
                    if (Object.keys(stylesObj).length) item.styles = stylesObj;
                    currentLine.push(item);
                }
                if(nodeType === 'br') {
                    currentLine.push({ type: 'text', content: '' });
                }
                lastNodeType = nodeType;
            });
            lines.push(currentLine);
        });

        if(lastNodeType === 'br') {
            caratIndexOffset += 1;
        }

        // Nothing in the editor, just plop the current content in a div
        if(Array.from(this.textarea.querySelectorAll('div')).length === 0 && this.textarea.textContent !== '') {
            lines.push([{ type: 'text', content: this.textarea.textContent }]);
        }

        this.content = lines;
        const cursorPosition = this.getCaretIndex();
        this.updateDom(this.content);
        this.setCaretIndex(cursorPosition+caratIndexOffset);

        // Emit change with (content, html)
        this._emit('change', this.content, this.textarea.innerHTML);

        console.log(this.content);
    }

    /**
     * Update the DOM based on the content model.
     * @param {Array} content - The content model to render (typically `this.content`).
     * @returns {void}
     */
    updateDom(content) {
        this.textarea.innerHTML = '';
        content.forEach(line => {
            const appliedLine = document.createElement('div');

            // Detect a line that only contains a newline (BR-only)
            const isBrOnlyLine = line.every(item => item.type === 'text' && item.content === '');

            // Apply line-level class and styles if present AND not a BR-only line
            if (!isBrOnlyLine) {
                if (line._lineClassName) appliedLine.className = line._lineClassName;
                if (line._lineStyles && typeof line._lineStyles === 'object') {
                    Object.entries(line._lineStyles).forEach(([k, v]) => appliedLine.style.setProperty(String(k), String(v)));
                }
            }

            line.forEach(item => {
                if(item.type === 'text') {
                    if(item.content !== ''){
                        const span = document.createElement('span');
                        if (item.className) span.className = item.className;
                        // Apply inline styles if present (supports objects and arrays of pairs/objects)
                        if (item.styles) {
                            const applyStyles = (styles) => {
                                if (Array.isArray(styles)) {
                                    styles.forEach(s => {
                                        if (!s) return;
                                        if (Array.isArray(s) && s.length >= 2) span.style.setProperty(String(s[0]), String(s[1]));
                                        else if (typeof s === 'object') {
                                            Object.entries(s).forEach(([k, v]) => span.style.setProperty(String(k), String(v)));
                                        }
                                    });
                                } else if (typeof styles === 'object') {
                                    Object.entries(styles).forEach(([k, v]) => span.style.setProperty(String(k), String(v)));
                                }
                            };
                            applyStyles(item.styles);
                        }
                        span.textContent = item.content;
                        appliedLine.appendChild(span);
                    } else{
                        const br = document.createElement('br');
                        appliedLine.appendChild(br);
                    }
                }
            });
            if(appliedLine.childNodes.length !== 0) {
                this.textarea.appendChild(appliedLine);
            }
        });
    }

    /**
     * Combine adjacent texts from the content array.
     * Not implemented.
     * @returns {void}
    */
    combineAdjacentContent() {

    }

    /**
     * Set content from an HTML string (alias of `setContentFromHTML`).
     * @param {string} html - HTML to load into the editor.
     * @returns {void}
     */
    setContent(html) {
        this.setContentFromHTML(html);
    }

    /**
     * Parse HTML and load it into the editor model, then render.
     * Expects HTML produced by this editor (div lines containing spans/br). Falls back to a single div if none present.
     * @param {string} html - HTML to parse into the model.
     * @returns {void}
     */
    setContentFromHTML(html) {
        if (typeof html !== 'string') return;

        // Replace DOM with provided HTML, normalizing to div lines if needed
        const scratch = document.createElement('div');
        scratch.innerHTML = html;

        const incomingDivs = Array.from(scratch.querySelectorAll('div'));

        this.textarea.innerHTML = '';
        if (incomingDivs.length > 0) {
            incomingDivs.forEach(d => this.textarea.appendChild(d.cloneNode(true)));
        } else {
            const lineDiv = document.createElement('div');
            lineDiv.innerHTML = scratch.innerHTML;
            this.textarea.appendChild(lineDiv);
        }

        // Parse DOM -> model and re-render (handleInput also emits 'change')
        this.handleInput(null);

        // Move caret to end for a clean insertion point
        try {
            let endIndex = 0;
            this.content.forEach(line => {
                endIndex += 1; // line DIV
                line.forEach(item => {
                    if (item.type !== 'text') return;
                    if (item.content === '') endIndex += 1; else endIndex += item.content.length;
                });
            });
            this.setCaretIndex(endIndex);
        } catch {}
    }

    /**
     * Set content directly from a JSON model compatible with `this.content`.
     * Performs a shallow normalization of items and line metadata, renders, places caret at end, and emits `change`.
     * @param {Array} json - Content model to load.
     * @returns {void}
     */
    setContentFromJson(json) {
        if (!Array.isArray(json)) return;

        // Shallow normalization to expected shape
        const normalizeStylesObj = (obj) => {
            if (!obj || typeof obj !== 'object') return undefined;
            const out = {};
            Object.entries(obj).forEach(([k, v]) => out[String(k)] = String(v));
            return Object.keys(out).length ? out : undefined;
        };

        const normalized = json.map(line => {
            const outLine = [];
            if (Array.isArray(line)) {
                line.forEach(item => {
                    if (!item || typeof item !== 'object') return;
                    if (item.type === 'text') {
                        const obj = { type: 'text', content: String(item.content || '') };
                        if (item.className) obj.className = String(item.className);
                        const styles = normalizeStylesObj(item.styles);
                        if (styles) obj.styles = styles;
                        outLine.push(obj);
                    }
                });
            }
            // Preserve line-level metadata if present
            if (line && typeof line === 'object') {
                if (line._lineClassName) outLine._lineClassName = String(line._lineClassName);
                const ls = normalizeStylesObj(line._lineStyles);
                if (ls) outLine._lineStyles = ls;
            }
            return outLine;
        });

        this.content = normalized;
        this.updateDom(this.content);

        // Place caret at end and emit change
        let endIndex = 0;
        this.content.forEach(line => {
            endIndex += 1;
            line.forEach(item => {
                if (item.type !== 'text') return;
                if (item.content === '') endIndex += 1; else endIndex += item.content.length;
            });
        });
        this.setCaretIndex(endIndex);
        this._emit('change', this.content, this.textarea.innerHTML);
    }

    /**
     * Get the current HTML content (as rendered by `updateDom`).
     * @returns {string} The editor's HTML.
     */
    getHTML() {
        // DOM is kept in sync by updateDom; return it directly
        return this.textarea.innerHTML;
    }

    /**
     * Get the current caret index within the content (or selection end).
     * Counts DIV/BR/P as +1 (newline) for linearization.
     * @returns {number} Caret index.
     */
    getCaretIndex() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;

        const range = sel.getRangeAt(0);
        let index = 0;

        // Walk nodes until caret
        const walker = document.createTreeWalker(this.textarea, NodeFilter.SHOW_ALL, null);
        while (walker.nextNode()) {
            const node = walker.currentNode;

            if (node === range.endContainer) {
                if (node.nodeType === 3) {
                    index += range.endOffset; // within text node
                }
                break;
            }

            if (node.nodeType === 3) {
                index += node.textContent.length;
            } else if (node.nodeName === "BR" || node.nodeName === "DIV" || node.nodeName === "P") {
                index += 1; // count as newline
            }
        }
        return index;
    }
    /**
     * Get the current selection start index within the content.
     * Counts DIV/BR/P as +1 (newline) for linearization.
     * @returns {number} Selection start index.
     */
    getCaretStartIndex() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;

        const range = sel.getRangeAt(0);
        let index = 0;

        // Walk nodes until caret start
        const walker = document.createTreeWalker(this.textarea, NodeFilter.SHOW_ALL, null);
        while (walker.nextNode()) {
            const node = walker.currentNode;

            if (node === range.startContainer) {
                if (node.nodeType === 3) {
                    index += range.startOffset; // within text node
                }
                break;
            }

            if (node.nodeType === 3) {
                index += node.textContent.length;
            } else if (node.nodeName === "BR" || node.nodeName === "DIV" || node.nodeName === "P") {
                index += 1; // count as newline
            }
        }
        return index;
    }

    /**
     * Set the caret index within the content.
     * Interprets indexes using the same linearization as `getCaretIndex`.
     * @param {number} targetIndex - Target caret index.
     * @returns {void}
     */
    setCaretIndex(targetIndex) {
        const sel = window.getSelection();
        const range = document.createRange();
        let index = 0;

        const walker = document.createTreeWalker(this.textarea, NodeFilter.SHOW_ALL, null);
        while (walker.nextNode()) {
            const node = walker.currentNode;

            if (node.nodeType === 3) {
                const nextIndex = index + node.textContent.length;
                if (targetIndex <= nextIndex && targetIndex - index >= 0) {
                    range.setStart(node, targetIndex - index);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return;
                }
                index = nextIndex;
            } else if (node.nodeName === "BR" || node.nodeName === "DIV" || node.nodeName === "P") {
                index += 1; // newline
                if (targetIndex === index) {
                    range.setStartAfter(node);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return;
                }
            }
        }
    }

    /**
     * Set a selection range by linear indices (matching `getCaretStartIndex`/`getCaretIndex`).
     * @param {number} startIndex - Selection start index.
     * @param {number} endIndex - Selection end index.
     * @returns {void}
     */
    setSelection(startIndex, endIndex) {
        if (typeof startIndex !== 'number' || typeof endIndex !== 'number') return;
        let s = Math.max(0, startIndex);
        let e = Math.max(0, endIndex);
        if (s > e) { const t = s; s = e; e = t; }

        const sel = window.getSelection();
        if (!sel) return;

        const locate = (targetIndex) => {
            let index = 0;
            const walker = document.createTreeWalker(this.textarea, NodeFilter.SHOW_ALL, null);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (node.nodeType === 3) {
                    const nextIndex = index + node.textContent.length;
                    if (targetIndex <= nextIndex) {
                        return { kind: 'text', node, offset: Math.max(0, targetIndex - index) };
                    }
                    index = nextIndex;
                } else if (node.nodeName === 'BR' || node.nodeName === 'DIV' || node.nodeName === 'P') {
                    index += 1;
                    if (targetIndex === index) {
                        return { kind: 'after', node };
                    }
                }
            }
            return null;
        };

        const startPos = locate(s);
        const endPos = locate(e);

        const range = document.createRange();

        // Fallbacks: if positions not found, collapse at end
        if (startPos) {
            if (startPos.kind === 'text') range.setStart(startPos.node, startPos.offset);
            else range.setStartAfter(startPos.node);
        } else {
            // fallback to start of textarea
            const firstText = this.textarea.firstChild;
            if (firstText) range.setStart(firstText, 0);
        }

        if (endPos) {
            if (endPos.kind === 'text') range.setEnd(endPos.node, endPos.offset);
            else range.setEndAfter(endPos.node);
        } else {
            // fallback to end of textarea
            const walker = document.createTreeWalker(this.textarea, NodeFilter.SHOW_TEXT, null);
            let lastText = null;
            while (walker.nextNode()) lastText = walker.currentNode;
            if (lastText) range.setEnd(lastText, lastText.textContent.length);
        }

        sel.removeAllRanges();
        sel.addRange(range);
    }

    /**
     * Check if any selected text includes the given class(es).
     * @param {string} className - Space-separated class token(s) to check.
     * @returns {boolean} True if any part of the selection has all tokens.
     */
    includesClass(className) {
        let selectionStart = this.getCaretStartIndex();
        let selectionEnd = this.getCaretIndex();
        if (selectionStart > selectionEnd) { const t = selectionStart; selectionStart = selectionEnd; selectionEnd = t; }
        if (selectionStart === selectionEnd) return false;

        const toClassSet = (cls) => new Set(String(cls || '').trim().split(/\s+/).filter(Boolean));
        const required = toClassSet(className);
        if (required.size === 0) return false;

        let idx = 0;

        for (const line of this.content) {
            idx += 1; // account for line DIV
            for (const item of line) {
                if (item.type !== 'text') continue;

                if (item.content === '') { // BR represented as empty string
                    idx += 1;
                    continue;
                }

                const len = item.content.length;
                const chunkStart = idx;
                const chunkEnd = idx + len;

                const overlapStart = Math.max(selectionStart, chunkStart);
                const overlapEnd = Math.min(selectionEnd, chunkEnd);

                if (overlapStart < overlapEnd) {
                    const itemSet = toClassSet(item.className);
                    let hasAll = true;
                    for (const token of required) {
                        if (!itemSet.has(token)) { hasAll = false; break; }
                    }
                    if (hasAll) return true;
                }

                idx += len;
            }
        }

        return false;
    }

    /**
     * Check if the entire selected text has the given class(es).
     * @param {string} className - Space-separated class token(s) to check.
     * @returns {boolean} True if all selected text includes all tokens.
     */
    hasFormat(className) {
        let selectionStart = this.getCaretStartIndex();
        let selectionEnd = this.getCaretIndex();
        if (selectionStart > selectionEnd) { const t = selectionStart; selectionStart = selectionEnd; selectionEnd = t; }
        if (selectionStart === selectionEnd) return false;

        const toClassSet = (cls) => new Set(String(cls || '').trim().split(/\s+/).filter(Boolean));
        const required = toClassSet(className);
        if (required.size === 0) return false;

        let idx = 0;
        let seenAnyText = false;
        let allHave = true;

        for (const line of this.content) {
            idx += 1; // account for line DIV
            for (const item of line) {
                if (item.type !== 'text') continue;

                if (item.content === '') { // BR represented as empty string
                    idx += 1;
                    continue;
                }

                const len = item.content.length;
                const chunkStart = idx;
                const chunkEnd = idx + len;

                const overlapStart = Math.max(selectionStart, chunkStart);
                const overlapEnd = Math.min(selectionEnd, chunkEnd);

                if (overlapStart < overlapEnd) {
                    seenAnyText = true;
                    const itemSet = toClassSet(item.className);
                    for (const token of required) {
                        if (!itemSet.has(token)) { allHave = false; break; }
                    }
                    if (!allHave) return false; // early exit
                }

                idx += len;
            }
        }

        if (!seenAnyText) return false;
        return allHave;
    }

        /**
         * Get the current content as a JSON-compatible model.
         * @returns {Array} Array of lines with items and optional line-level metadata.
         */
    getJson() {
		const cloneStyles = (obj) => {
			if (!obj || typeof obj !== 'object') return undefined;
			const out = {};
			for (const [k, v] of Object.entries(obj)) out[String(k)] = String(v);
			return Object.keys(out).length ? out : undefined;
		};

		return this.content.map(line => {
			const outLine = line.map(item => {
				if (!item || item.type !== 'text') return null;
				const cloned = { type: 'text', content: String(item.content || '') };
				if (item.className) cloned.className = String(item.className);
				const styles = cloneStyles(item.styles);
				if (styles) cloned.styles = styles;
				return cloned;
			}).filter(Boolean);

			// Preserve line-level metadata
			if (line && typeof line === 'object') {
				if (line._lineClassName) outLine._lineClassName = String(line._lineClassName);
				const ls = cloneStyles(line._lineStyles);
				if (ls) outLine._lineStyles = ls;
			}
			return outLine;
		});
	}
}

// Expose globally for demo usage
window.RichTextEditor = RichTextEditor;
