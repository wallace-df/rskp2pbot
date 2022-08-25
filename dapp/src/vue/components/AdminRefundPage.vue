<template>
  <div class="loading_container" v-if="loading">
    <div class="spinner-border text-primary" role="status"><span class="sr-only"></span></div>
  </div>
  <div class="loading_container" v-else-if="error">
    <h2 class="text-danger">{{error}}</h2>
  </div>
  <div class="loading_container" v-else>
    <h2 class="text-success mb-4">Refund seller</h2>

    <table class="text-left" style="margin: 0 auto">
      <tbody>
        <tr>
          <th>Order ID</th>
          <td>{{orderId}}</td>
        </tr>
        <tr>
          <th>Seller Address</th>
          <td>{{sellerAddress}}</td>
        </tr>
        <tr>
          <th>Amount</th>
          <td>{{amount}}</td>
        </tr>
      </tbody>
    </table>

    <div class="text-center mt-4">
      <button class="btn btn-primary btn-block" disabled v-if="refunding">Refunding seller...</button>
      <button class="btn btn-warning btn-block" disabled v-else-if="released">Funds have been released to buyer</button>
      <button class="btn btn-success btn-block" disabled v-else-if="refunded">Seller already refunded</button>
      <button class="btn btn-primary btn-block" v-else @click="refund()">Refund</button>
    </div>

  </div>
</template>

<script>
import Wallet from "../../js/services/wallet.js";

export default {
  name: "HomePage",

  components: { },

  created() {
    this.$store.commit("setActiveSection", "AdminRefundPage");
    this.loadParams();
  },

  data() {
    return { 
      orderId: null,
      sellerAddress: null,
      amount: null,
      error: null,
      refunding: false,
      released: false,
      refunded: false
    }
  },

  computed: {
    loading() {
      return this.$store.state.loading;
    },
  },

  methods: {
    async loadParams() {
      this.$store.commit("setLoading", true);
      try {
        this.orderId = this.$route.query.orderId;

        if (this.isStringEmpty(this.orderId)) {
          throw "OrderID not specified. Please, verify your link.";
        }

        let walletInstance = await Wallet.getInstance();
        let order = await walletInstance.contract.methods.orderById(this.orderId).call();

        this.sellerAddress = order.sellerAddress;
        this.amount = this.formatAmount(this.toBN(order.amount).add(this.toBN(order.fees)), this.getToken(order.tokenContractAddress));
        
        if (this.amount === null) {
          throw "There was an error fetching details: order amount invalid.";
        }

        if (order.status === "0") {
          throw "Order not found. Please, verify your link.";
        } else if (order.status === "2") {
          this.released = true;
        } else if (order.status === "3") {
          this.refunded = true;
        } else if (order.status !== "1") {
          throw "There was an error fetching details: order status not supported.";
        }

        this.$store.commit("setLoading", false);

      } catch(err) {
        this.error = err;
        this.$store.commit("setLoading", false);
      }
    },
    
    async refund() {
      this.refunding = true;
      try {
        let walletInstance = await Wallet.getInstance();        
        
        await walletInstance.contract.methods.adminRefundSeller(this.orderId).send({from: walletInstance.walletAddress});
        
        this.refunded = true;
        this.refunding = false;
        this.showSuccess("Seller refunded!");
      } catch(err) {
        this.refunding = false;
        this.showError(err);
      }
    }
  }
}
</script>

