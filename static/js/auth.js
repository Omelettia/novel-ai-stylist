import { request } from './api.js';
import * as UI from './ui.js';

export async function handleAuth(type) {
    const username = document.getElementById('user-in').value;
    const password = document.getElementById('pass-in').value;
    
    // Basic Client-side Validation
    if (!username || !password) {
        UI.showToast("Please enter both username and password.", "error");
        return false;
    }

    const endpoint = type === 'login' ? '/login' : '/signup';
    
    let body;
    if (type === 'login') {
        body = new FormData();
        body.append('username', username);
        body.append('password', password);
    } else {
        body = { username, password };
    }

    //Send Request
    const data = await request(endpoint, 'POST', body);
    
    //Handle Network/Server Crash
    if (!data) {
        UI.showToast("Server unreachable. Is the Grimoire running?", "error");
        return false;
    }

    // Handle Backend Errors 
    if (data.detail) {
        UI.showToast(data.detail, "error");
        return false;
    }

    // Handle Success
    if (type === 'login' && data.access_token) {
        localStorage.setItem('journal_token', data.access_token);
        UI.showToast("Welcome back, Traveler.");
        return true; 
    } 
    
    if (type === 'signup') {
        UI.showToast("Registration successful! You may now unlock.");
        document.getElementById('pass-in').value = ""; 
        return false;
    }

    return false;
}

export function logout() {
    localStorage.clear();
    location.reload();
}