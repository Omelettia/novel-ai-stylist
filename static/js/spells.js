import { request } from './api.js';
import * as UI from './ui.js';
import * as Engine from './editor-engine.js';

export async function fetchSpells() {
    return await request('/spells');
}

export async function castAISpell(range, promptText) {
    const text = range.toString();
    const data = await request('/ai/spell', 'POST', { 
        selected_text: text, 
        user_prompt: promptText 
    });
    
    if (data && data.html) {
        const match = data.html.match(/style="([^"]*)"/);
        const css = match ? match[1] : "";
        Engine.insertHTMLAtRange(range, data.html);
        return { prompt: promptText, css: css };
    }
    return null;
}

export async function refineSpell(range, baseSpell, refinePrompt) {
    const text = range.toString();
    const data = await request('/ai/spell', 'POST', { 
        selected_text: text, 
        user_prompt: refinePrompt,
        current_css: baseSpell.css_code 
    });

    if (data && data.html) {
        const match = data.html.match(/style="([^"]*)"/);
        const css = match ? match[1] : "";
        Engine.insertHTMLAtRange(range, data.html);
        return { prompt: `${baseSpell.name} + ${refinePrompt}`, css: css };
    }
    return null;
}