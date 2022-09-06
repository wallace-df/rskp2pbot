<template>
    <div class="loading_container">
       <h2 class="text-danger">Page not found</h2>
    </div>
</template>

<script>
export default {
   created() {
    this.$store.commit("setActiveSection", "");
    this.$store.commit("setLoading", false);
  },   
  
  components: { },

  data() {
    return { }
  },

  methods: { }
}
</script>
