const API = "http://127.0.0.1:8000";
const editor = document.getElementById('editor');
const menu = document.getElementById('context-menu');

// --- GLOBAL STATE ---
let currentRange = null;
let currentChapterId = null;
let activeBookId = null;
let currentChapter = { id: null, style_manifest: {} }; 
let activeChapterList = []; 
let undoStack = []; 
let redoStack = [];
let savedSpells = [];
let activeSpellIds = []; // Stores IDs of the 3 spells shown in the menu
let editingSpellId = null;
let latestSpell = null;
const MAX_HISTORY = 50;

// --- INITIALIZATION ---
window.onload = () => {
    const token = localStorage.getItem('journal_token');
    if (token) initApp();
};

function initApp() {
    const authModal = document.getElementById('auth-modal');
    if (authModal) {
        authModal.classList.remove('modal-open');
        authModal.classList.add('hidden');
    }
    document.getElementById('main-layout').classList.remove('hidden');
    loadBooks();
}

// --- PRETTY MODAL LOGIC ---
function openPrettyPrompt(title, defaultValue, onConfirm) {
    const modal = document.getElementById('pretty-modal');
    const input = document.getElementById('pretty-modal-input');
    const titleEl = document.getElementById('pretty-modal-title');
    const confirmBtn = document.getElementById('pretty-modal-confirm');

    titleEl.innerText = title;
    input.value = defaultValue || "";
    modal.classList.add('modal-open');
    input.focus();

    // Set up the confirm button click
    confirmBtn.onclick = () => {
        onConfirm(input.value);
        closePrettyModal();
    };

    // Allow "Enter" key to submit
    input.onkeydown = (e) => {
        if (e.key === 'Enter') confirmBtn.click();
        if (e.key === 'Escape') closePrettyModal();
    };
}

function closePrettyModal() {
    document.getElementById('pretty-modal').classList.remove('modal-open');
}

function openDeleteModal(title, description, onConfirm) {
    const modal = document.getElementById('delete-modal');
    const confirmBtn = document.getElementById('delete-modal-confirm');
    
    document.getElementById('delete-modal-title').innerText = title;
    document.getElementById('delete-modal-desc').innerText = description;
    
    modal.classList.add('modal-open');

    confirmBtn.onclick = () => {
        onConfirm();
        closeDeleteModal();
    };
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('modal-open');
}

// --- AUTHENTICATION ---
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

function logout() { localStorage.clear(); location.reload(); }

// --- UNDO, REDO & SHORTCUTS ---
function saveState() {
    undoStack.push(editor.innerHTML);
    redoStack = []; 
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
}

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (undoStack.length > 0) {
            redoStack.push(editor.innerHTML);
            editor.innerHTML = undoStack.pop();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        if (redoStack.length > 0) {
            undoStack.push(editor.innerHTML);
            editor.innerHTML = redoStack.pop();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        sync();
    }
});

// --- BOOK & CHAPTER CRUD ---

async function loadBooks() {
    const res = await fetch(`${API}/books`, {
        headers: {'Authorization': `Bearer ${localStorage.getItem('journal_token')}`}
    });
    const books = await res.json();
    if (!Array.isArray(books)) return;

    const list = document.getElementById('book-list');
    list.innerHTML = books.map(b => `
        <li class="book-item" data-id="${b.id}">
            <a onclick="selectBook('${b.id}')" class="${activeBookId === b.id ? 'active bg-white/10' : ''}">${b.title}</a>
        </li>
    `).join('');
}

async function selectBook(id) {
    activeBookId = id;
    const res = await fetch(`${API}/books`, {
        headers: {'Authorization': `Bearer ${localStorage.getItem('journal_token')}`}
    });
    const all = await res.json();
    const book = all.find(b => b.id === id);
    activeChapterList = book ? (book.chapters || []) : [];
    
    currentChapterId = null;
    editor.innerHTML = "<p class='opacity-30 italic'>Select a chapter...</p>";
    editor.contentEditable = "false";
    document.getElementById('chapter-title').value = "";
    document.getElementById('chapter-title').disabled = true;
    
    loadBooks(); 
    renderChapters(activeChapterList);
}

function createNewBook() {
    openPrettyPrompt("Name your new Book", "My Grimoire", async (title) => {
        if (!title) return;
        const res = await fetch(`${API}/books`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${localStorage.getItem('journal_token')}` 
            },
            body: JSON.stringify({ title: title })
        });
        if (res.ok) await loadBooks();
    });
}

function createNewChapter() {
    if (!activeBookId) return alert("Please select a book first!");
    openPrettyPrompt("Chapter Title", "The next page...", async (title) => {
        if (!title) return;
        const newId = crypto.randomUUID();
        const payload = {
            id: newId,
            title: title,
            html: "<p>The ink begins to flow...</p>",
            meta: {},
            book_id: activeBookId,
            order: activeChapterList.length
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
            await selectBook(activeBookId);
            await loadChapter(newId);
        }
    });
}

async function loadChapter(id) {
    const chapterData = activeChapterList.find(c => c.id === id);
    if (chapterData) {
        currentChapterId = id;
        // Update the global state object correctly
        currentChapter = { 
            id: id, 
            style_manifest: chapterData.style_manifest || chapterData.meta || {} 
        };
        
        editor.contentEditable = !document.body.classList.contains('reading-mode');
        document.getElementById('chapter-title').value = chapterData.title;
        document.getElementById('chapter-title').disabled = false;
        document.getElementById('sticky-title').innerText = chapterData.title || "Untitled Chapter";
        
        // Use html_content from the backend or html from our local sync
        editor.innerHTML = chapterData.html_content || chapterData.html || "";
        renderChapters(activeChapterList);
    }
}

// --- RENDER & REORDERING ---

function renderChapters(chapters) {
    const list = document.getElementById('chapter-list');
    list.innerHTML = chapters.map((c, i) => `
        <div data-id="${c.id}" onclick="loadChapter('${c.id}')" 
             class="chapter-item p-4 cursor-pointer hover:bg-black/5 border-b border-black/5 group flex justify-between items-center ${currentChapterId === c.id ? 'border-l-4 border-amber-600 bg-black/5' : ''}">
            <div class="flex-1">
                <div class="font-bold text-sm text-amber-900 chap-name">${c.title || 'Untitled'}</div>
                <div class="text-[10px] opacity-40 uppercase tracking-tighter">Chapter ${i + 1}</div>
            </div>
            <div class="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="event.stopPropagation(); moveChapter('${c.id}', -1)" class="hover:text-amber-600 text-xs px-1" title="Move Up">▲</button>
                <button onclick="event.stopPropagation(); moveChapter('${c.id}', 1)" class="hover:text-amber-600 text-xs px-1" title="Move Down">▼</button>
            </div>
        </div>
    `).join('');
}

async function moveChapter(id, direction) {
    const currentIndex = activeChapterList.findIndex(c => c.id === id);
    const newIndex = currentIndex + direction;
    if (newIndex < 0 || newIndex >= activeChapterList.length) return;

    const [movedChapter] = activeChapterList.splice(currentIndex, 1);
    activeChapterList.splice(newIndex, 0, movedChapter);
    renderChapters(activeChapterList);

    await fetch(`${API}/chapters/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('journal_token')}` },
        body: JSON.stringify({ ordered_ids: activeChapterList.map(c => c.id) })
    });
}

// --- SMART CONTEXT MENU ---

window.addEventListener('contextmenu', (e) => {
    const bookEl = e.target.closest('.book-item');
    const chapterEl = e.target.closest('.chapter-item');
    const isEditorSelection = editor.contains(e.target) && window.getSelection().toString().length > 0;

    if (bookEl || chapterEl) {
        e.preventDefault();
        const id = bookEl ? bookEl.dataset.id : chapterEl.dataset.id;
        const type = bookEl ? 'book' : 'chapter';
        const currentTitle = bookEl ? bookEl.innerText.trim() : chapterEl.querySelector('.chap-name').innerText;
        showManageMenu(e.pageX, e.pageY, id, type, currentTitle);
    } else if (isEditorSelection && editor.contentEditable !== "false") {
        e.preventDefault();
        currentRange = window.getSelection().getRangeAt(0);
        showSpellMenu(e.pageX, e.pageY);
    }
});

function showManageMenu(x, y, id, type, title) {
    let menuItems = `
        <li class="menu-title opacity-50 font-bold px-4 py-2 text-xs">Manage ${type}</li>
        ${type === 'book' ? `<li><a onclick="renameBook('${id}', '${title}')" class="px-4 py-2 block hover:bg-black/5 cursor-pointer">✏️ Rename Book</a></li>` : ''}
        <li><a onclick="handleDelete('${id}', '${type}')" class="px-4 py-2 block hover:bg-black/5 cursor-pointer text-error font-bold">🗑️ Delete ${type}</a></li>
    `;
    menu.innerHTML = menuItems;
    displayMenu(x, y);
}

function showSpellMenu(x, y) {
    const equipped = savedSpells.filter(s => activeSpellIds.includes(s.id));

    let spellLinks = equipped.map(s => `
        <li class="flex justify-between items-center hover:bg-black/5 group">
            <a onclick="applySavedSpell('${s.id}')" class="flex-1 px-4 py-2 font-serif italic text-amber-900">📜 ${s.name}</a>
            <button onclick="event.stopPropagation(); refineWithAI('${s.id}')" class="px-3 opacity-0 group-hover:opacity-100 text-[10px] font-bold text-amber-600">REFINE ✨</button>
        </li>
    `).join('');

    menu.innerHTML = `
        <li class="menu-title opacity-40 font-bold px-4 py-2 text-[10px] uppercase">Quick Spells</li>
        ${spellLinks || '<li class="px-4 py-2 text-[10px] opacity-30 italic">No spells equipped</li>'}
        <div class="divider my-0 opacity-10"></div>
        <li><a onclick="castSpell('ai')" class="px-4 py-2 block hover:bg-black/5 cursor-pointer font-bold">✨ New AI Vibe</a></li>
        <li><a onclick="dispelMagic()" class="px-4 py-2 block hover:bg-black/5 cursor-pointer text-error font-bold">🚫 Dispel</a></li>
    `;
    displayMenu(x, y);
}

async function refineWithAI(spellId) {
    const spell = savedSpells.find(s => s.id === spellId);
    const text = currentRange.toString();

    openPrettyPrompt(`Refine ${spell.name}`, "make it more subtle", async (refinePrompt) => {
        if (!refinePrompt) return;
        
        const res = await fetch(`${API}/ai/spell`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${localStorage.getItem('journal_token')}` 
            },
            body: JSON.stringify({ 
                selected_text: text, 
                user_prompt: refinePrompt,
                current_css: spell.css_code // Passing the base spell's CSS
            })
        });
        const data = await res.json();
        
        const match = data.html.match(/style="([^"]*)"/);
        const css = match ? match[1] : "";

        // Store this new variation as the latest draft
        latestSpell = { prompt: `${spell.name} + ${refinePrompt}`, css: css };
        
        insertHTML(data.html);
    });
}

function applySavedSpell(spellId) {
    const spell = savedSpells.find(s => s.id === spellId);
    if (spell) {
        insertHTML(`<span style="${spell.css_code}">${currentRange.toString()}</span>`);
    }
}

function displayMenu(x, y) {
    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

document.addEventListener('click', () => menu.style.display = 'none');

// --- MANAGEMENT ACTIONS ---

function renameBook(id, oldTitle) {
    openPrettyPrompt("Rename Book", oldTitle, async (newTitle) => {
        if (!newTitle || newTitle === oldTitle) return;
        const res = await fetch(`${API}/books/${id}`, {
            method: 'PATCH', 
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${localStorage.getItem('journal_token')}` 
            },
            body: JSON.stringify({ title: newTitle })
        });
        if (res.ok) loadBooks();
    });
}

async function handleDelete(id, type) {
    const title = `DESTROY ${type.toUpperCase()}?`;
    const desc = `Are you sure you wish to banish this ${type}? These words cannot be un-written.`;

    openDeleteModal(title, desc, async () => {
        const endpoint = type === 'book' ? `/books/${id}` : `/chapters/${id}`;
        
        const res = await fetch(`${API}${endpoint}`, {
            method: 'DELETE',
            headers: {'Authorization': `Bearer ${localStorage.getItem('journal_token')}`}
        });

        if (res.ok) {
            if (type === 'book') {
                activeBookId = null;
                loadBooks();
                editor.innerHTML = "<p class='opacity-30 italic'>Select a chapter...</p>";
            } else {
                selectBook(activeBookId);
            }
        }
    });
}

// --- SYNC & EDITOR TOOLS ---

async function sync() {
    if (!currentChapterId) return;
    const btn = document.getElementById('sync-btn');
    const titleInput = document.getElementById('chapter-title');
    if(btn) btn.innerText = "SAVING...";

    const payload = {
        id: currentChapterId,
        title: titleInput.value,
        html: editor.innerHTML, 
        meta: currentChapter.style_manifest, 
        book_id: activeBookId,
        order: activeChapterList.findIndex(c => c.id === currentChapterId)
    };

    const res = await fetch(`${API}/chapters/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('journal_token')}` },
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        // 1. Update the Sticky UI
        document.getElementById('sticky-title').innerText = payload.title;

        // 2. Update the local memory list so switching chapters doesn't revert the title
        const chapterInList = activeChapterList.find(c => c.id === currentChapterId);
        if (chapterInList) {
            chapterInList.title = payload.title;
            chapterInList.html_content = payload.html; 
        }

        // 3. Visual feedback
        if(btn) {
            btn.innerText = "SYNCED";
            setTimeout(() => {
                btn.innerText = "SYNC";
                // 4. Re-render the sidebar to show the new chapter title immediately
                renderChapters(activeChapterList);
            }, 1000);
        }
    }
}

async function castSpell(type) {
    const text = currentRange.toString();
    if (type === 'ai') {
        openPrettyPrompt("AI Vibe", "ethereal moonlight", async (promptText) => {
            if (!promptText) return;
            
            const res = await fetch(`${API}/ai/spell`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${localStorage.getItem('journal_token')}` 
                },
                body: JSON.stringify({ selected_text: text, user_prompt: promptText })
            });
            const data = await res.json();
            
            // Extract the CSS code from the returned HTML
            const match = data.html.match(/style="([^"]*)"/);
            const css = match ? match[1] : "";

            // Silently store as the latest spell
            latestSpell = { prompt: promptText, css: css };
            
            insertHTML(data.html);
        });
    }
}

async function learnSpell(name, css) {
    await fetch(`${API}/spells`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${localStorage.getItem('journal_token')}` 
        },
        body: JSON.stringify({ name: name, css_code: css })
    });
    alert("Spell added to your Grimoire!");
}

// Toggle the Spellbook UI
async function toggleSpellbook() {
    const res = await fetch(`${API}/spells`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('journal_token')}` }
    });
    savedSpells = await res.json();
    renderSpellbook();
    document.getElementById('spellbook-modal').classList.add('modal-open');
}

// Render the list of spells with "Equip" and "Edit" buttons
function renderSpellbook() {
    const list = document.getElementById('spell-list');
    let html = "";

    // 1. Show the Latest Spell slot if it exists
    if (latestSpell) {
        html += `
            <div class="p-4 mb-4 bg-amber-100/30 border-2 border-dashed border-amber-900/20 rounded-lg animate-pulse">
                <div class="flex justify-between items-center">
                    <div>
                        <span class="text-[9px] font-bold text-amber-800 uppercase tracking-widest">Latest Casting</span>
                        <div class="text-sm italic">"${latestSpell.prompt}"</div>
                    </div>
                    <button onclick="saveLatestSpell()" class="btn btn-xs btn-primary font-bold">✨ Save to Grimoire</button>
                </div>
            </div>
        `;
    }

    // 2. Render the rest of the saved spells
    html += savedSpells.map(spell => `
        <div class="flex items-center justify-between p-4 bg-white/50 border border-amber-900/10 rounded-lg mb-2">
            <div>
                <div class="font-bold text-amber-900">${spell.name}</div>
                <div class="text-[10px] opacity-40">PROMPT: ${spell.prompt || 'Manual Edit'}</div>
            </div>
            <div class="flex gap-2">
                <button onclick="equipSpell('${spell.id}')" class="btn btn-xs ${activeSpellIds.includes(spell.id) ? 'btn-success' : 'btn-outline'}">
                    ${activeSpellIds.includes(spell.id) ? 'Equipped' : 'Equip'}
                </button>
                <button onclick="editSpellUI('${spell.id}')" class="btn btn-xs btn-ghost">✏️</button>
            </div>
        </div>
    `).join('');

    list.innerHTML = html || "<p class='opacity-40 italic'>Your Grimoire is empty...</p>";
}

async function saveLatestSpell() {
    if (!latestSpell) return;
    
    openPrettyPrompt("Name your spell", latestSpell.prompt, async (name) => {
        if (!name) return;
        
        const res = await fetch(`${API}/spells`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${localStorage.getItem('journal_token')}` 
            },
            body: JSON.stringify({ 
                name: name, 
                prompt: latestSpell.prompt, 
                css_code: latestSpell.css,
                is_favorite: false 
            })
        });

        if (res.ok) {
            latestSpell = null; 
            toggleSpellbook(); // Refresh list
        }
    });
}

// 2. Equip spell to context menu (Limit to 3)
function equipSpell(id) {
    if (activeSpellIds.includes(id)) {
        activeSpellIds = activeSpellIds.filter(s => s !== id);
    } else {
        if (activeSpellIds.length >= 3) activeSpellIds.shift(); 
        activeSpellIds.push(id);
    }
    renderSpellbook();
}

// Opens the UI and fills it with current data
function editSpellUI(id) {
    const spell = savedSpells.find(s => s.id === id);
    if (!spell) return;

    editingSpellId = id;
   
    document.getElementById('edit-spell-prompt').value = spell.name || ""; 
    document.getElementById('edit-spell-css').value = spell.css_code || "";
    
    const modal = document.getElementById('spell-editor-modal');
    modal.classList.add('modal-open');

    // Attach the save logic
    document.getElementById('save-edited-spell-btn').onclick = async () => {
        await updateSpell(id);
        modal.classList.remove('modal-open');
    };
}

async function updateSpell(id) {
    const spell = savedSpells.find(s => s.id === id);
    
    const updatedData = {
        name: document.getElementById('edit-spell-prompt').value, // New Name
        prompt: spell.prompt,
        css_code: document.getElementById('edit-spell-css').value, // New CSS
        category: spell.category || "General",
        is_favorite: activeSpellIds.includes(id)
    };

    const res = await fetch(`${API}/spells/${id}`, {
        method: 'PATCH',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${localStorage.getItem('journal_token')}` 
        },
        body: JSON.stringify(updatedData)
    });

    if (res.ok) {
        // Refresh local list and UI
        const updateRes = await fetch(`${API}/spells`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('journal_token')}` }
        });
        savedSpells = await updateRes.json();
        renderSpellbook();
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

function dispelMagic() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    saveState();
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
    menu.style.display = 'none';
}

function navigateChapter(direction) {
    if (!activeChapterList.length || !currentChapterId) return;

    // Find the index of the current chapter
    const currentIndex = activeChapterList.findIndex(c => c.id === currentChapterId);
    let newIndex = currentIndex + direction;

    // Boundary checks
    if (newIndex >= 0 && newIndex < activeChapterList.length) {
        const nextChapter = activeChapterList[newIndex];
        loadChapter(nextChapter.id);
        
        // Auto-scroll to top when changing chapters in reading mode
        document.getElementById('scroll-container').scrollTop = 0;
    } else {
        // Optional: Visual feedback when reaching the end/start
        console.log("Reached the beginning or end of the book.");
    }
}

function toggleReadingMode() {
    const isZen = document.body.classList.toggle('reading-mode');
    if (currentChapterId) editor.contentEditable = !isZen;
}