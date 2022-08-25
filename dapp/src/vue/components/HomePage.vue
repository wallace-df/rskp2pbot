<template>
  <div class="loading_container">
    <h2 class="text-success">RSK P2P Bot</h2>
  </div>
</template>

<script>

export default {
  name: "HomePage",

  components: { },

  created() {
    this.$store.commit("setActiveSection", "HomePage");
    this.$store.commit("setLoading", false);
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

