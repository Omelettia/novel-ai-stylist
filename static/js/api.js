import { API_URL } from './config.js';

export async function request(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem('journal_token');
    const headers = { 'Authorization': `Bearer ${token}` };
    if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${API_URL}${endpoint}`, { 
        method, 
        headers, 
        body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : null 
    });
    return res.json();
}