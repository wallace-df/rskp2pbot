import { createApp } from "vue"
import { createWebHistory, createRouter } from "vue-router";
import { createStore } from "vuex";

import App from "./vue/App.vue";

import storeData from "./js/data/store.js"
import routesData from "./js/data/routes.js"
import commonFunctions from "./js/data/commons.js";

if (localStorage) {
    try {
        localStorage.removeItem('walletconnect');
    } catch (err) {
        console.log(err);
    }
}
const store = createStore(storeData);
const router = createRouter({ history: createWebHistory(), routes: routesData });
const app = createApp(App);

app.use(router);
app.use(store);

app.mixin(commonFunctions);
app.mount("#app");