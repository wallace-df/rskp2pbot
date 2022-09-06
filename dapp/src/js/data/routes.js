import HomePage from "../../vue/components/HomePage.vue";
import EscrowStatusPage from "../../vue/components/EscrowStatusPage.vue";
import LockPage from "../../vue/components/LockPage.vue";
import ReleasePage from "../../vue/components/ReleasePage.vue";
import RefundPage from "../../vue/components/RefundPage.vue";
import AdminReleasePage from "../../vue/components/AdminReleasePage.vue";
import AdminRefundPage from "../../vue/components/AdminRefundPage.vue";
import NotFoundPage from "../../vue/components/NotFoundPage.vue";

const routes = [
    { path: "", component: HomePage },
    { path: "/status", component: EscrowStatusPage },
    { path: "/lock", component: LockPage },
    { path: "/release", component: ReleasePage },
    { path: "/refund", component: RefundPage },
    { path: "/adminRelease", component: AdminReleasePage },
    { path: "/adminRefund", component: AdminRefundPage },

    { path: "/rskp2pbot-dapp", component: HomePage },
    { path: "/rskp2pbot-dapp/status", component: EscrowStatusPage },
    { path: "/rskp2pbot-dapp/lock", component: LockPage },
    { path: "/rskp2pbot-dapp/release", component: ReleasePage },
    { path: "/rskp2pbot-dapp/refund", component: RefundPage },
    { path: "/rskp2pbot-dapp/adminRelease", component: AdminReleasePage },
    { path: "/rskp2pbot-dapp/adminRefund", component: AdminRefundPage },

    { path: "/:catchAll(.*)", component: NotFoundPage }
];

export default routes;