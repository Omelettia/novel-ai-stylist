const API = "http://127.0.0.1:8000";
const editor = document.getElementById('editor');
const menu = document.getElementById('context-menu');

// --- GLOBAL STATE ---
let currentRange = null;
let currentChapterId = null;
let activeBookId = null;
let currentChapter = { id: null, style_manifest: {} }; 
let activeChapterList = []; 
let historyStack = [];
const MAX_HISTORY = 50;

// --- PERSISTENT AUTH ---
window.onload = () => {
    const token = localStorage.getItem('journal_token');
    if (token) initApp();
};

async function handleAuth(type) {
    const username = document.getElementById('user-in').value;
    const password = document.getElementById('pass-in').value;
    const endpoint = type === 'login' ? '/login' : '/signup';
    
    let body = type === 'login' ? new FormData() : JSON.stringify({ username, password });
    if (type === 'login') { body.append('username', username); body.append('password', password); }

    const res = await fetch(`${API}${endpoint}`, { 
        method: 'POST', 
        headers: type === 'signup' ? {'Content-Type': 'application/json'} : {},
        body: body 
    });
    
    const data = await res.json();
    if (data.access_token) {
        localStorage.setItem('journal_token', data.access_token);
        initApp();
    } else if (res.ok) {
        alert("Account ready! Please log in.");
    }
}

function initApp() {
    document.getElementById('auth-modal').classList.remove('modal-open');
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('main-layout').classList.remove('hidden');
    loadBooks();
}

// --- UNDO & SHORTCUTS ---
function saveState() {
    historyStack.push(editor.innerHTML);
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
}

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (historyStack.length > 0) editor.innerHTML = historyStack.pop();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        sync();
    }
});

// --- SURGICAL DISPEL MAGIC ---
function dispelMagic() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    saveState();
    let range = selection.getRangeAt(0);
    let container = range.commonAncestorContainer;
    let parentSpan = container.nodeType === 3 ? container.parentElement : container;
    
    // Auto-expand to whole spell if inside or clicking a span
    if (parentSpan.tagName === 'SPAN' && (parentSpan.className.includes('spell') || parentSpan.getAttribute('style'))) {
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
    menu.style.display = 'none';
}

// --- CREATION LOGIC (FIXED) ---

async function createNewBook() {
    const title = prompt("Enter Book Name:");
    if (!title) return;

    const res = await fetch(`${API}/books`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('journal_token')}`
        },
        body: JSON.stringify({ title: title })
    });

    if (res.ok) {
        await loadBooks(); // Refresh sidebar to show the new book
    } else {
        alert("Failed to create book. Please check your connection.");
    }
}

async function createNewChapter() {
    if (!activeBookId) return alert("Please select a book on the left first!");
    
    const title = prompt("Chapter Title:");
    if (!title) return;

    // Generate a temporary UUID for the new chapter
    const newId = crypto.randomUUID();

    const payload = {
        id: newId,
        title: title,
        html: "<p>The ink begins to flow...</p>",
        meta: {}, // Initial empty style manifest
        book_id: activeBookId,
        order: activeChapterList.length // Place at the end of the list
    };

    const res = await fetch(`${API}/chapters/save`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('journal_token')}`
        },
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        // Reload the current book's chapter list to include the new one
        await selectBook(activeBookId);
        // Automatically load the newly created chapter into the editor
        await loadChapter(newId);
    } else {
        alert("Failed to create chapter.");
    }
}

// --- LOADERS & NAV ---
async function loadBooks() {
    const res = await fetch(`${API}/books`, {
        headers: {'Authorization': `Bearer ${localStorage.getItem('journal_token')}`}
    });
    const books = await res.json();
    if (!Array.isArray(books)) return;

    const list = document.getElementById('book-list');
    list.innerHTML = books.map(b => `
        <li><a onclick="selectBook('${b.id}')" class="${activeBookId === b.id ? 'active bg-white/10' : ''}">${b.title}</a></li>
    `).join('');
}

async function selectBook(id) {
    activeBookId = id;
    loadBooks(); 
    const res = await fetch(`${API}/books`, {
        headers: {'Authorization': `Bearer ${localStorage.getItem('journal_token')}`}
    });
    const all = await res.json();
    const book = all.find(b => b.id === id);
    activeChapterList = book.chapters || [];
    
    currentChapterId = null;
    editor.innerHTML = "<p class='opacity-30 italic'>Select a chapter...</p>";
    editor.contentEditable = "false";
    document.getElementById('chapter-title').value = "";
    document.getElementById('chapter-title').disabled = true;
    renderChapters(activeChapterList);
}

function renderChapters(chapters) {
    const list = document.getElementById('chapter-list');
    list.innerHTML = chapters.map(c => `
        <div onclick="loadChapter('${c.id}')" class="p-4 cursor-pointer hover:bg-black/5 border-b border-black/5 ${currentChapterId === c.id ? 'border-l-4 border-amber-600 bg-black/5' : ''}">
            <div class="font-bold text-sm text-amber-900">${c.title || 'Untitled'}</div>
            <div class="text-xs opacity-40 truncate">${c.html_content ? c.html_content.replace(/<[^>]*>/g, '').substring(0, 40) : '...'}</div>
        </div>
    `).join('');
}

async function loadChapter(id) {
    const res = await fetch(`${API}/books`, {
        headers: {'Authorization': `Bearer ${localStorage.getItem('journal_token')}`}
    });
    const books = await res.json();
    let chapterData;
    books.forEach(b => {
        const found = b.chapters.find(c => c.id === id);
        if (found) chapterData = found;
    });

    if (chapterData) {
        currentChapterId = id;
        currentChapter = { id: id, style_manifest: chapterData.style_manifest || {} };
        editor.contentEditable = !document.body.classList.contains('reading-mode');
        document.getElementById('chapter-title').disabled = false;
        document.getElementById('chapter-title').value = chapterData.title;
        editor.innerHTML = chapterData.html_content;
        renderChapters(activeChapterList);
    }
}

function navigateChapter(direction) {
    const currentIndex = activeChapterList.findIndex(c => c.id === currentChapterId);
    let nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < activeChapterList.length) {
        loadChapter(activeChapterList[nextIndex].id);
        document.getElementById('scroll-container').scrollTop = 0;
    }
}

// --- SYNC & AI ---
async function sync() {
    if (!currentChapterId) return;
    const btn = document.getElementById('sync-btn');
    btn.innerText = "SAVING...";

    const payload = {
        id: currentChapterId,
        title: document.getElementById('chapter-title').value,
        html: editor.innerHTML,
        meta: currentChapter.style_manifest,
        book_id: activeBookId,
        order: 0
    };

    await fetch(`${API}/chapters/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('journal_token')}` },
        body: JSON.stringify(payload)
    });
    btn.innerText = "SYNCED";
    setTimeout(() => btn.innerText = "SYNC", 2000);
}

async function castSpell(type) {
    const text = currentRange.toString();
    if (type === 'ai') {
        const promptText = prompt("Vibe:");
        if (!promptText) return;
        const res = await fetch(`${API}/ai/spell`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('journal_token')}` },
            body: JSON.stringify({ selected_text: text, user_prompt: promptText })
        });
        const data = await res.json();
        insertHTML(data.html);
    } else {
        insertHTML(`<span class="spell-${type}">${text}</span>`);
    }
}

function insertHTML(html) {
    saveState();
    currentRange.deleteContents();
    const el = document.createElement("div");
    el.innerHTML = html;
    const frag = document.createDocumentFragment();
    while (el.firstChild) frag.appendChild(el.firstChild);
    currentRange.insertNode(frag);
}

function toggleReadingMode() {
    const isZen = document.body.classList.toggle('reading-mode');
    if (currentChapterId) editor.contentEditable = !isZen;
}

function logout() { localStorage.clear(); location.reload(); }

editor.addEventListener('contextmenu', (e) => {
    if (editor.contentEditable === "false") return;
    const selection = window.getSelection();
    if (selection.toString().length > 0) {
        e.preventDefault();
        currentRange = selection.getRangeAt(0);
        menu.style.display = 'block';
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';
    }
});
document.addEventListener('click', () => menu.style.display = 'none');