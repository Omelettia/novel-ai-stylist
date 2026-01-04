export const menu = document.getElementById('context-menu');

// --- MODALS ---
export function openPrettyPrompt(title, defaultValue, onConfirm) {
    const modal = document.getElementById('pretty-modal');
    const input = document.getElementById('pretty-modal-input');
    const titleEl = document.getElementById('pretty-modal-title');
    const confirmBtn = document.getElementById('pretty-modal-confirm');

    titleEl.innerText = title;
    input.value = defaultValue || "";
    modal.classList.add('modal-open');
    input.focus();

    confirmBtn.onclick = () => {
        onConfirm(input.value);
        closePrettyModal();
    };

    input.onkeydown = (e) => {
        if (e.key === 'Enter') confirmBtn.click();
        if (e.key === 'Escape') closePrettyModal();
    };
}

export function closePrettyModal() {
    document.getElementById('pretty-modal').classList.remove('modal-open');
}

export function openDeleteModal(title, description, onConfirm) {
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

export function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('modal-open');
}

export function updateSyncUI(status) {
    const btn = document.getElementById('sync-btn');
    if (btn) btn.innerText = status;
}

export function openEditSpellModal(spell) {
    document.getElementById('edit-spell-prompt').value = spell.name || ""; 
    document.getElementById('edit-spell-css').value = spell.css_code || "";
    document.getElementById('spell-editor-modal').classList.add('modal-open');
}

export function closeEditSpellModal() {
    document.getElementById('spell-editor-modal').classList.remove('modal-open');
}

// --- MENUS ---
export function displayMenu(x, y) {
    if (!menu) return;
    menu.classList.remove('hidden');
    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

export function showManageMenu(x, y, id, type, title) {
    let menuItems = `
        <li class="menu-title opacity-50 font-bold px-4 py-2 text-xs">Manage ${type}</li>
        ${type === 'book' ? `<li><a onclick="renameBook('${id}', '${title}')" class="px-4 py-2 block hover:bg-black/5 cursor-pointer">✏️ Rename Book</a></li>` : ''}
        <li><a onclick="handleDelete('${id}', '${type}')" class="px-4 py-2 block hover:bg-black/5 cursor-pointer text-error font-bold">🗑️ Delete ${type}</a></li>
    `;
    menu.innerHTML = menuItems;
    displayMenu(x, y);
}

export function showSpellMenu(x, y, savedSpells, activeSpellIds) {
    const equipped = savedSpells.filter(s => activeSpellIds.includes(s.id));
    
    let spellLinks = equipped.map(s => `
        <li class="flex justify-between items-center hover:bg-black/5 group">
            <a onclick="applySavedSpell('${s.id}')" class="flex-1 px-4 py-2 font-serif italic text-amber-900">📜 ${s.name}</a>
            <button 
                onclick="event.stopPropagation(); refineKnownSpell(\`${s.css_code}\`, \`${s.name}\`)" 
                class="px-3 opacity-0 group-hover:opacity-100 text-[10px] font-bold text-amber-600"
                title="Apply this spell with tweaks"
            >
                REFINE ✨
            </button>
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

export function renderSpellbook(savedSpells, activeSpellIds, latestSpell) {
    const list = document.getElementById('spell-list');
    let html = "";

    if (latestSpell) {
        html += `
            <div class="p-4 mb-4 bg-amber-100/30 border-2 border-dashed border-amber-900/20 rounded-lg">
                <div class="flex justify-between items-center">
                    <div>
                        <span class="text-[9px] font-bold text-amber-800 uppercase">Latest Casting</span>
                        <div class="text-sm italic">"${latestSpell.prompt}"</div>
                    </div>
                    <button onclick="saveLatestSpell()" class="btn btn-xs btn-primary">✨ Save</button>
                </div>
            </div>`;
    }

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
                
                <button onclick="editSpellUI('${spell.id}')" class="btn btn-xs btn-ghost" title="Edit">✏️</button>
                
                <button onclick="deleteSpell('${spell.id}')" class="btn btn-xs btn-ghost text-red-400 hover:bg-red-50 hover:text-red-600" title="Delete">🗑️</button>
            </div>
        </div>
    `).join('');

    list.innerHTML = html || "<p class='opacity-40 italic'>Your Grimoire is empty...</p>";
}

// --- NOTIFICATIONS ---
export function showToast(message, type = 'neutral') {
    const container = document.getElementById('toast-container');
    
    const el = document.createElement('div');

    const baseClass = "pointer-events-auto px-6 py-4 rounded-lg shadow-2xl border-l-4 font-serif italic text-sm min-w-[300px] flex items-center gap-3 transition-all duration-500 transform translate-y-10 opacity-0";
    

    let colors = "bg-[#fdfaf3] text-amber-900 border-amber-500";
    let icon = "✨";
    
    if (type === 'error') {
        colors = "bg-white text-red-800 border-red-500";
        icon = "⚡"; 
    }

    el.className = `${baseClass} ${colors}`;
    el.innerHTML = `
        <span class="text-xl grayscale opacity-50">${icon}</span>
        <span>${message}</span>
    `;

    container.appendChild(el);

    // 1. Animate In (Slide Up)
    requestAnimationFrame(() => {
        el.classList.remove('translate-y-10', 'opacity-0');
    });

    // 2. Auto Dismiss after 3 seconds
    setTimeout(() => {
        el.classList.add('translate-y-10', 'opacity-0'); 
        setTimeout(() => el.remove(), 500); 
    }, 3000);
}