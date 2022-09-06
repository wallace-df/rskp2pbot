<template>
  <div>
    <div style="text-align: right;" v-if="this.activeConnection">
      <h2 class="badge bg-dark m-3 fs-5"> {{activeConnection.networkName}}  - {{formatAddress(activeConnection.walletAddress)}}</h2>
    </div>
    <router-view></router-view>
  </div>
</template>

<script>

export default {
  name: "App",

  components: { },

  data() {
    return {}
  },

  computed: {
    activeConnection() {
      return this.$store.state.activeConnection;
    },
  },

  methods: { }
}
</script>
