// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'
import { addConfig } from './lib/config'
import router from './router'
import { serverMethods } from './serverMethods'
// import { loadLlm } from './llm'

async function main() {
    const app = createApp(App)

    app.use(router)
    addConfig(app);
    app.mount('#app')
    await router.isReady();
    // console.log("Loading LLM");
    // loadLlm();
    
    let unauthenticatedRoutes = new Set(['/app/login', '/app/register', '/app/video-call']);
    if (unauthenticatedRoutes.has(router.currentRoute.value.path) || !router.currentRoute.value.path.startsWith('/app') || router.currentRoute.value.path.startsWith('/app/video-call')) {
        return;
    }
    let mePromise = serverMethods.user.me();
    let me = await mePromise;
    if (me.error) {
        router.push('/app/login');
    }
}

main();
