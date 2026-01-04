
export function saveState(state, editor, MAX_HISTORY) {
    if (state.undoStack.length > 0 && state.undoStack[state.undoStack.length - 1] === editor.innerHTML) {
        return;
    }

    state.undoStack.push(editor.innerHTML);
    state.redoStack = [];
    
    if (state.undoStack.length > MAX_HISTORY) {
        state.undoStack.shift(); 
    }
}

export function undo(state, editor) {

    if (state.undoStack.length <= 1) return;

    const current = state.undoStack.pop();
    state.redoStack.push(current);

    const previous = state.undoStack[state.undoStack.length - 1];
    editor.innerHTML = previous;
}

export function redo(state, editor) {
    if (state.redoStack.length === 0) return;

    const next = state.redoStack.pop();
    
    state.undoStack.push(next);
    
    editor.innerHTML = next;
}

export function insertHTMLAtRange(range, html) {
    if (!range) return;
    range.deleteContents();
    const el = document.createElement("div");
    el.innerHTML = html;
    const frag = document.createDocumentFragment();
    while (el.firstChild) frag.appendChild(el.firstChild);
    range.insertNode(frag);
}

export function dispelMagicAtSelection() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    let range = selection.getRangeAt(0);
    let container = range.commonAncestorContainer;
    
    let parentSpan = container.nodeType === 3 ? container.parentElement : container;

    if (parentSpan.tagName !== 'SPAN' || !parentSpan.hasAttribute('style')) {
         parentSpan = parentSpan.closest('span[style]');
    }

    if (parentSpan) {
        const newRange = document.createRange();
        newRange.selectNode(parentSpan);
        selection.removeAllRanges();
        selection.addRange(newRange);
        range = newRange;

        const text = selection.toString();
        const textNode = document.createTextNode(text);
        range.deleteContents();
        range.insertNode(textNode);
        
        selection.removeAllRanges();
    }
}