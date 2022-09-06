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
          <th>Timestamp</th>
          <td>{{timestamp}}</td>
        </tr>
        <tr>
          <th>Seller address</th>
          <td>{{sellerAddress}}</td>
        </tr>
        <tr>
          <th>Order amount</th>
          <td>{{orderAmount}}</td>
        </tr>
        <tr>
          <th>Fee</th>
          <td>{{feeAmount}}</td>
        </tr>
        <tr>
          <th>Total</th>
          <td>{{totalAmount}}</td>
        </tr>
      </tbody>
    </table>

    <div class="text-center mt-4">
      <button class="btn btn-primary btn-block" disabled v-if="refunding">Refunding seller...</button>
      <button class="btn btn-warning btn-block" disabled v-else-if="released">Funds have been released to buyer</button>
      <button class="btn btn-success btn-block" disabled v-else-if="refunded">Seller already refunded</button>
      <button class="btn btn-primary btn-block" v-else @click="refund()">Refund {{totalAmount}}</button>
    </div>

  </div>
</template>

<script>
import Wallet from "../../js/services/wallet.js";

export default {
  name: "HomePage",

  components: { },

  created() {
    this.$store.commit("setActiveSection", "RefundPage");
    this.loadParams();
  },

  data() {
    return { 
      orderId: null,
      timestamp: null,
      sellerAddress: null,
      sellerCode: null,
      orderAmount: null,
      feeAmount: null,
      totalAmount: null,
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
        this.sellerCode = this.$route.query.sellerCode;

        if (this.isStringEmpty(this.orderId)) {
          throw "OrderID not specified. Please, verify your link.";
        } else if (this.isStringEmpty(this.sellerCode)) {
          throw "SellerCode not specified. Please, verify your link.";
        }

        let walletInstance = await Wallet.getInstance();
        let order = await walletInstance.contract.methods.orderById(this.orderId).call();

        if (order.status === "0") {
          throw "Order not found. Please, verify your link.";
        } else if (order.status === "2") {
          this.released = true;
        } else if (order.status === "3") {
          this.refunded = true;
        } else if (order.status !== "1") {
          throw "There was an error fetching details: order status not supported.";
        }

        this.timestamp = this.formatTimestamp(order.timestamp);
        this.sellerAddress = order.sellerAddress.toLowerCase();
        this.orderAmount = this.formatOrderAmount(order);
        this.feeAmount = this.formatOrderFeeAmount(order);
        this.totalAmount = this.formatOrderTotalAmount(order);
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
        let codeBytes32 = "0x" + this.sellerCode;

        await walletInstance.contract.methods.refundSeller(this.orderId, codeBytes32).send({from: walletInstance.walletAddress});
        
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

