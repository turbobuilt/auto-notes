import type { User } from "./serverTypes/user/user.model";


function makeStore() {
    let userString = localStorage.getItem('user');
    var user = null as User;
    if (userString) {
        user = JSON.parse(userString);
    }

    return reactive({
        user: user,
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