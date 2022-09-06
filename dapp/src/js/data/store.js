const state = {
    loading: false,
    activeSection: "",
    activeConnection: null
};

const mutations = {
    setLoading(state, loading) {
        state.loading = loading;
    },

    setActiveSection(state, activeSection) {
        state.activeSection = activeSection;
    },

    setActiveConnection(state, activeConnection) {
        state.activeConnection = activeConnection;
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