export function saveState(state, editor, MAX_HISTORY) {
    state.undoStack.push(editor.innerHTML);
    state.redoStack = []; 
    if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
}

export function undo(state, editor) {
    if (state.undoStack.length > 0) {
        state.redoStack.push(editor.innerHTML);
        editor.innerHTML = state.undoStack.pop();
    }
}

export function redo(state, editor) {
    if (state.redoStack.length > 0) {
        state.undoStack.push(editor.innerHTML);
        editor.innerHTML = state.redoStack.pop();
    }
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

    if (parentSpan.tagName === 'SPAN') {
        const newRange = document.createRange();
        newRange.selectNode(parentSpan);
        selection.removeAllRanges();
        selection.addRange(newRange);
        range = newRange;
    }

    const text = selection.toString();
    const textNode = document.createTextNode(text);
    range.deleteContents();
    range.insertNode(textNode);
    selection.removeAllRanges();
}