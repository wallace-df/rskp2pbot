import HomePage from "../../vue/components/HomePage.vue";
import ReleasePage from "../../vue/components/ReleasePage.vue";
import RefundPage from "../../vue/components/RefundPage.vue";
import AdminReleasePage from "../../vue/components/AdminReleasePage.vue";
import AdminRefundPage from "../../vue/components/AdminRefundPage.vue";
import NotFoundPage from "../../vue/components/NotFoundPage.vue";

const routes = [
    { path: "", component: HomePage },
    { path: "/release", component: ReleasePage },
    { path: "/refund", component: RefundPage },
    { path: "/adminRelease", component: AdminReleasePage },
    { path: "/adminRefund", component: AdminRefundPage },
    { path: "/:catchAll(.*)", component: NotFoundPage },
];

export default routes;