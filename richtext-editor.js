// richtext-editor.js
// Rich text editor class (no execCommand)
// By MJDawson



class RichTextEditor {
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
    this.model = [ { text: '' } ];
    this._bindEvents();
    this._render();
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

  /**
   * Generic format toggler
   * @param {string} format - e.g. 'bold', 'italic', 'underline', etc.
   */
  toggleFormat(format) {
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
        } else {
          delete newSpan[format];
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
  }

  // --- Private helpers ---

  _bindEvents() {
    // Handle input events
    this.el.addEventListener('input', (e) => {
      this._updateModelFromDOM();
      this._render();
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
      for (const key of Object.keys(span)) {
        if (key !== 'text' && span[key]) classList.push(key);
      }
      const classAttr = classList.length ? ` class="${classList.join(' ')}"` : '';
      html += `<span${classAttr}>${this._escapeHTML(span.text)}</span>`;
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
    if (newModel.length === 0) newModel = [ { text: '' } ];
    this.model = newModel;
  }

  /**
   * Merge adjacent spans with same formatting
   */
  _mergeSpans(spans) {
    if (!spans.length) return [ { text: '' } ];
    let merged = [ { ...spans[0] } ];
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
      } catch (e) {}
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
