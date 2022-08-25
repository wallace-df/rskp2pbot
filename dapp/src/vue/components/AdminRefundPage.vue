<template>
  <div class="loading_container">
    <h2 class="text-warning">RSK P2P Bot</h2>
  </div>
</template>

<script>

export default {
  name: "HomePage",

  components: { },

  created() {
    this.$store.commit("setActiveSection", "HomePage");
  },

  data() {
    return { 
    }
  },

  computed: {
  },

  methods: {
  }
}
</script>

