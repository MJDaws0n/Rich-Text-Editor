// RichTextEditor.js
// Production-ready, extensible rich text editor class (no execCommand)

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
    this._bindEvents();
  }

  // --- Public API ---

  bold() {
    this._wrapSelection('strong');
  }

  italic() {
    this._wrapSelection('em');
  }

  // Add more formatting methods here, e.g. underline, code, etc.

  // --- Private helpers ---

  _bindEvents() {
    // Optional: handle input, selection, etc. for future features
    this.el.addEventListener('input', () => {
      // Could emit change events, etc.
    });
  }

  /**
   * Wraps the current selection in a tag (e.g. 'strong', 'em')
   * @param {string} tagName
   */
  _wrapSelection(tagName) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    // Only allow formatting inside the editor
    if (!this.el.contains(range.commonAncestorContainer)) return;

    // Extract the selected content
    const fragment = range.extractContents();
    const wrapper = document.createElement(tagName);
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
    // Move selection to after the inserted node
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    sel.addRange(newRange);
  }
}

// Expose globally for demo usage
window.RichTextEditor = RichTextEditor;
