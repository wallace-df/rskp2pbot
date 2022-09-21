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

    { path: "/rsk", component: HomePage },
    { path: "/rsk/status", component: EscrowStatusPage },
    { path: "/rsk/lock", component: LockPage },
    { path: "/rsk/release", component: ReleasePage },
    { path: "/rsk/refund", component: RefundPage },
    { path: "/rsk/adminRelease", component: AdminReleasePage },
    { path: "/rsk/adminRefund", component: AdminRefundPage },

    { path: "/:catchAll(.*)", component: NotFoundPage }
];

export default routes;