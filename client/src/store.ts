import type { User } from "./serverTypes/user/user.model";


function makeStore() {
    return reactive({
        user: null as User,
        authToken: localStorage.getItem('authToken'),
        tokenExpires: localStorage.getItem('tokenExpires'),
    })   
}

export function setUser(user, authToken, tokenExpires) {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('tokenExpires', tokenExpires);
    store.user = user;
    store.authToken = authToken;
    store.tokenExpires = tokenExpires;
}

function logout() {
    localStorage.clear();
    for(let key in store) {
        delete (store as any)[key];
    }
    Object.assign(store, makeStore());
}

export const store = makeStore();