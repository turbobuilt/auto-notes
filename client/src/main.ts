// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'
import { addConfig } from './lib/config'
import router from './router'
import callMethod from './lib/callMethod'
import { serverMethods } from './serverMethods'
import { store } from './store'

async function main() {
    const app = createApp(App)

    app.use(router)
    addConfig(app);

    app.mount('#app')
    await router.isReady();
    console.log("storeis", store)
    let unauthenticatedRoutes = new Set(['/app/login', '/app/register']);
    if (unauthenticatedRoutes.has(router.currentRoute.value.path) || !router.currentRoute.value.path.startsWith('/app')) {
        return;
    }
    let mePromise = serverMethods.user.me();
    let me = await mePromise;
    console.log(me)
    if (me.error) {
        router.push('/app/login');
    } else {
        router.push('/app/dashboard');
    }
}

main();
