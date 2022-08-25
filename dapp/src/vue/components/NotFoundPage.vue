<template>
    <div class="loading_container">
       <h2 class="text-warning">Page not found</h2>
    </div>
</template>

<script>
export default {
   name: "NotFoundPage",

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
