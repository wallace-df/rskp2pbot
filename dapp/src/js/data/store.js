const state = {
    loading: false,
    activeSection: "",
    activeWallet: null
};

const mutations = {
    setLoading(state, loading) {
        state.loading = loading;
    },

    setActiveSection(state, activeSection) {
        state.activeSection = activeSection;
    },

    setActiveWallet(state, activeWallet) {
        state.activeWallet = activeWallet;
    }
};

const getters = {}

const actions = {}

export default {
    state,
    getters,
    mutations,
    actions
}