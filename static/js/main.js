import { request } from './api.js';
import * as UI from './ui.js';
import * as Engine from './editor-engine.js';
import * as Spells from './spells.js';
import * as Auth from './auth.js';
import { MAX_HISTORY } from './config.js';

// --- CONSTANTS ---
const HTML_NO_BOOK = `
    <div class="h-full flex flex-col items-center justify-center opacity-30 select-none">
        <div class="text-6xl mb-4 grayscale">📚</div>
        <div class="font-serif text-2xl italic text-amber-900">Grimoire Locked</div>
        <div class="text-xs uppercase tracking-widest mt-2 text-amber-800">Select a book from the shelf</div>
    </div>
`;

const HTML_NO_CHAPTER = `
    <div class="h-full flex flex-col items-center justify-center opacity-30 select-none">
        <div class="text-6xl mb-4 grayscale">✒️</div>
        <div class="font-serif text-2xl italic text-amber-900">Unwritten Pages</div>
        <div class="text-xs uppercase tracking-widest mt-2 text-amber-800">Select a chapter to write</div>
    </div>
`;

// --- GLOBAL STATE ---
let state = {
    currentRange: null,
    currentChapterId: null,
    activeBookId: null,
    activeChapterList: [],
    undoStack: [],
    redoStack: [],
    savedSpells: [],
    activeSpellIds: [],
    latestSpell: null,
    editingSpellId: null 
};

const editor = document.getElementById('editor');
const titleInput = document.getElementById('chapter-title'); 

// --- INITIALIZATION ---
window.onload = () => {
    if (localStorage.getItem('journal_token')) initApp();
};

async function initApp() {
    const authModal = document.getElementById('auth-modal');
    if (authModal) {
        authModal.classList.remove('modal-open');
        authModal.classList.add('hidden');
    }
    document.getElementById('main-layout').classList.remove('hidden');
    
    // Default State: No Book Selected
    editor.innerHTML = HTML_NO_BOOK;
    titleInput.value = "";
    titleInput.disabled = true;

    loadBooks();
    document.addEventListener('click', () => {
        document.getElementById('context-menu').style.display = 'none';
    });
}

// --- BOOK & CHAPTER CRUD ---
async function loadBooks() {
    const books = await request('/books');
    if (!Array.isArray(books)) return;
    const list = document.getElementById('book-list');
    list.innerHTML = books.map(b => `
        <li class="book-item" data-id="${b.id}">
            <a onclick="selectBook('${b.id}')" class="${state.activeBookId === b.id ? 'active bg-white/10' : ''}">${b.title}</a>
        </li>`).join('');
}

async function selectBook(id) {
    state.activeBookId = id;
    const books = await request('/books');
    const book = books.find(b => b.id === id);
    state.activeChapterList = book?.chapters || [];
    state.currentChapterId = null;
    
    //Show "Select Chapter" state
    editor.innerHTML = HTML_NO_CHAPTER;
    editor.contentEditable = "false";

    // Clear and Disable Title
    titleInput.value = "";
    titleInput.placeholder = "Select a chapter...";
    titleInput.disabled = true;

    loadBooks(); 
    renderChapters();
}

async function createNewBook() {
    UI.openPrettyPrompt("Name your new Book", "My Grimoire", async (title) => {
        if (!title) return;
        await request('/books', 'POST', { title });
        loadBooks();
    });
}

// --- CHAPTERS ---
function renderChapters() {
    document.getElementById('chapter-list').innerHTML = state.activeChapterList.map((c, i) => `
        <div onclick="loadChapter('${c.id}')" data-id="${c.id}" class="chapter-item p-4 cursor-pointer flex justify-between items-center ${state.currentChapterId === c.id ? 'border-l-4 border-amber-600 bg-black/5' : ''}">
            <div class="flex-1">
                <div class="font-bold text-sm text-amber-900 chap-name">${c.title || 'Untitled'}</div>
                <div class="text-[10px] opacity-40 uppercase">Chapter ${i + 1}</div>
            </div>
            <div class="flex flex-col gap-1">
                <button onclick="event.stopPropagation(); moveChapter('${c.id}', -1)" class="text-xs hover:text-amber-600">▲</button>
                <button onclick="event.stopPropagation(); moveChapter('${c.id}', 1)" class="text-xs hover:text-amber-600">▼</button>
            </div>
        </div>`).join('');
}

async function loadChapter(id) {
    const data = state.activeChapterList.find(c => c.id === id);
    if (!data) return;
    
    state.currentChapterId = id;
    
    // Enable Editing
    const isReading = document.body.classList.contains('reading-mode');
    editor.contentEditable = isReading ? "false" : "true";
    
    editor.innerHTML = data.html_content || data.html || "";
    
    // Set Title
    titleInput.value = data.title;
    titleInput.disabled = false; 
    titleInput.placeholder = "Chapter Title";
    
    document.getElementById('sticky-title').innerText = data.title;
    renderChapters();
}

async function createNewChapter() {
    if (!state.activeBookId) return UI.showToast("You must open a book before writing.", "error");

    UI.openPrettyPrompt("Chapter Title", "New Chapter", async (title) => {
        if (!title) return;
        const newId = crypto.randomUUID();
        const payload = {
            id: newId, 
            title, 
            html: "<p>The ink begins to flow...</p>", 
            meta: {}, 
            book_id: state.activeBookId, 
            order: state.activeChapterList.length
        };
        await request('/chapters/save', 'POST', payload);
        await selectBook(state.activeBookId); 
        await loadChapter(newId);
    });
}

async function moveChapter(id, direction) {
    const idx = state.activeChapterList.findIndex(c => c.id === id);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= state.activeChapterList.length) return;
    
    const [item] = state.activeChapterList.splice(idx, 1);
    state.activeChapterList.splice(newIdx, 0, item);
    renderChapters();
    
    await request('/chapters/reorder', 'POST', { ordered_ids: state.activeChapterList.map(c => c.id) });
}

async function navigateChapter(direction) {
    if (!state.activeChapterList.length || !state.currentChapterId) return;
    const currentIndex = state.activeChapterList.findIndex(c => c.id === state.currentChapterId);
    const newIndex = currentIndex + direction;

    if (newIndex >= 0 && newIndex < state.activeChapterList.length) {
        const nextChapter = state.activeChapterList[newIndex];
        await loadChapter(nextChapter.id);
        const scrollContainer = document.getElementById('scroll-container');
        if (scrollContainer) scrollContainer.scrollTop = 0;
    }
}

// --- SYNC ---
async function sync() {
    if (!state.currentChapterId) return;
    UI.updateSyncUI("SAVING...");
    const currentChap = state.activeChapterList.find(c => c.id === state.currentChapterId);
    const payload = {
        id: state.currentChapterId,
        title: titleInput.value,
        html: editor.innerHTML,
        meta: currentChap ? (currentChap.meta || currentChap.style_manifest || {}) : {},
        book_id: state.activeBookId,
        order: state.activeChapterList.findIndex(c => c.id === state.currentChapterId)
    };
    if (await request('/chapters/save', 'POST', payload)) {
        UI.updateSyncUI("SYNCED");
        setTimeout(() => UI.updateSyncUI("SYNC"), 1000);
        if (currentChap) {
            currentChap.title = payload.title;
            currentChap.html_content = payload.html;
        }
        renderChapters();
    }
}

// --- EVENTS ---
window.addEventListener('contextmenu', (e) => {
    const bookEl = e.target.closest('.book-item');
    const chapterEl = e.target.closest('.chapter-item');
    
    if (bookEl || chapterEl) {
        e.preventDefault();
        const id = bookEl ? bookEl.dataset.id : chapterEl.dataset.id;
        const type = bookEl ? 'book' : 'chapter';
        const title = bookEl ? bookEl.innerText : chapterEl.querySelector('.chap-name').innerText;
        UI.showManageMenu(e.pageX, e.pageY, id, type, title); 
        return;
    }

    const isEditor = editor.contains(e.target) && window.getSelection().toString().length > 0;
    if (isEditor && editor.contentEditable !== "false") {
        e.preventDefault();
        state.currentRange = window.getSelection().getRangeAt(0);
        UI.showSpellMenu(e.pageX, e.pageY, state.savedSpells, state.activeSpellIds);
    }
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey)) {
        if (e.key === 's') { e.preventDefault(); sync(); }
        if (e.key === 'z') { e.preventDefault(); Engine.undo(state, editor); }
        if (e.key === 'y') { e.preventDefault(); Engine.redo(state, editor); }
    }
});

// --- EXPOSE TO WINDOW ---
window.handleAuth = async (type) => { if (await Auth.handleAuth(type)) initApp(); };
window.logout = Auth.logout;
window.selectBook = selectBook;
window.loadChapter = loadChapter;
window.moveChapter = moveChapter;
window.createNewBook = createNewBook;
window.createNewChapter = createNewChapter;
window.sync = sync;

window.renameBook = async (id, oldTitle) => {
    UI.openPrettyPrompt("Rename Book", oldTitle, async (newTitle) => {
        if (!newTitle || newTitle === oldTitle) return;
        await request(`/books/${id}`, 'PATCH', { title: newTitle });
        loadBooks();
    });
};

window.handleDelete = async (id, type) => {
    UI.openDeleteModal(`DESTROY ${type.toUpperCase()}?`, `Permanently delete this ${type}?`, async () => {
        await request(type === 'book' ? `/books/${id}` : `/chapters/${id}`, 'DELETE');
        if (type === 'book') { 
            state.activeBookId = null; 
            loadBooks(); 
            editor.innerHTML = HTML_NO_BOOK;
            titleInput.value = "";
            titleInput.disabled = true;
        } else { 
            selectBook(state.activeBookId); 
        }
    });
};

window.toggleSpellbook = async () => {
    state.savedSpells = await Spells.fetchSpells();
    UI.renderSpellbook(state.savedSpells, state.activeSpellIds, state.latestSpell);
    document.getElementById('spellbook-modal').classList.add('modal-open');
};

window.castSpell = async (type) => {
    if (type === 'ai') {
        UI.openPrettyPrompt("AI Vibe", "ethereal moonlight", async (prompt) => {
            Engine.saveState(state, editor, MAX_HISTORY);
            const res = await Spells.castAISpell(state.currentRange, prompt);
            if(res) state.latestSpell = res;
        });
    }
};

window.applySavedSpell = (id) => {
    const spell = state.savedSpells.find(s => s.id === id);
    if(spell) {
        Engine.saveState(state, editor, MAX_HISTORY);
        const html = `<span style="${spell.css_code}">${state.currentRange.toString()}</span>`;
        Engine.insertHTMLAtRange(state.currentRange, html);
    }
};

window.saveLatestSpell = async () => {
    if (!state.latestSpell) return;
    UI.openPrettyPrompt("Name Spell", state.latestSpell.prompt, async (name) => {
        const payload = { 
            name: name,
            prompt: state.latestSpell.prompt,
            css_code: state.latestSpell.css, 
            is_favorite: false
        };
        await request('/spells', 'POST', payload);
        window.toggleSpellbook();
    });
};

window.editSpellUI = (id) => {
    const spell = state.savedSpells.find(s => s.id === id);
    if(!spell) return;
    state.editingSpellId = id;
    UI.openEditSpellModal(spell);
    
    const saveBtn = document.getElementById('save-edited-spell-btn');
    saveBtn.onclick = async () => {
        const updatedData = {
            name: document.getElementById('edit-spell-prompt').value,
            css_code: document.getElementById('edit-spell-css').value,
            prompt: spell.prompt,
            is_favorite: state.activeSpellIds.includes(id)
        };
        await request(`/spells/${id}`, 'PATCH', updatedData);
        UI.closeEditSpellModal();
        window.toggleSpellbook();
    };
};

window.deleteSpell = async (id) => {
    UI.openDeleteModal("Forget Spell?", "This incantation will be lost forever.", async () => {
        await request(`/spells/${id}`, 'DELETE');
        window.toggleSpellbook();
    });
};

window.equipSpell = (id) => {
    if (state.activeSpellIds.includes(id)) {
        state.activeSpellIds = state.activeSpellIds.filter(s => s !== id);
    } else {
        if (state.activeSpellIds.length >= 3) state.activeSpellIds.shift();
        state.activeSpellIds.push(id);
    }
    UI.renderSpellbook(state.savedSpells, state.activeSpellIds, state.latestSpell);
};

window.dispelMagic = () => {
    Engine.saveState(state, editor, MAX_HISTORY);
    Engine.dispelMagicAtSelection();
    document.getElementById('context-menu').style.display = 'none';
};

window.closePrettyModal = UI.closePrettyModal;
window.closeDeleteModal = UI.closeDeleteModal;
window.toggleReadingMode = () => {
    document.body.classList.toggle('reading-mode');
    if (state.currentChapterId) editor.contentEditable = !document.body.classList.contains('reading-mode');
};
window.navigateChapter = navigateChapter;

window.refineKnownSpell = async (cssCode, spellName) => {

    UI.openPrettyPrompt(`Refine ${spellName}`, "Make it darker...", async (prompt) => {
        Engine.saveState(state, editor, MAX_HISTORY);
        
        const baseSpell = { css_code: cssCode, name: spellName };
        
        const res = await Spells.refineSpell(state.currentRange, baseSpell, prompt);
        
        if (res) state.latestSpell = res;
    });
};