<template>
  <div class="loading_container" v-if="loading">
    <div class="spinner-border text-primary" role="status"><span class="sr-only"></span></div>
  </div>
  <div class="loading_container" v-else-if="error">
    <h2 class="text-danger">{{error}}</h2>
  </div>
  <div class="loading_container" v-else>
    <h2 class="text-success mb-4">Release funds to buyer</h2>

    <table class="text-left" style="margin: 0 auto">
      <tbody>
        <tr>
          <th>Order ID</th>
          <td>{{orderId}}</td>
        </tr>
        <tr>
          <th>Buyer Address</th>
          <td>{{buyerAddress}}</td>
        </tr>
        <tr>
          <th>Amount</th>
          <td>{{amount}}</td>
        </tr>
      </tbody>
    </table>

    <div class="text-center mt-4">
      <button class="btn btn-primary btn-block" disabled v-if="releasing">Releasing funds...</button>
      <button class="btn btn-success btn-block" disabled v-else-if="released">Funds already released to buyer</button>
      <button class="btn btn-warning btn-block" disabled v-else-if="refunded">Funds have been refunded to seller</button>
      <button class="btn btn-primary btn-block" v-else @click="release()">Release</button>
    </div>

  </div>
</template>

<script>
import StringUtils from "../../js/utils/string.js";
import Wallet from "../../js/services/wallet.js";
import Web3Utils from "web3-utils";

export default {
  name: "HomePage",

  components: { },

  created() {
    this.$store.commit("setActiveSection", "ReleasePage");
    this.loadParams();
  },

  data() {
    return { 
      orderId: null,
      buyerAddress: null,
      buyerCode: null,
      amount: null,
      error: null,
      releasing: false,
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
        this.buyerCode = this.$route.query.buyerCode;

        if (StringUtils.isEmpty(this.orderId)) {
          throw "OrderID not specified. Please, verify your link.";
        } else if (StringUtils.isEmpty(this.buyerCode)) {
          throw "BuyerCode not specified. Please, verify your link.";
        }

        let walletInstance = await Wallet.getInstance();
        let order = await walletInstance.contract.methods.orderById(this.orderId).call();

        this.buyerAddress = order.buyerAddress;
        this.amount = this.formatAmount(order.amount, order.tokenContractAddress);
        
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
    
    async release() {
      this.releasing = true;
      try {
        let walletInstance = await Wallet.getInstance();        
        let codeBytes32 = Web3Utils.fromAscii(this.buyerCode);
        
        await walletInstance.contract.methods.releaseToBuyer(this.orderId, codeBytes32).send({from: walletInstance.walletAddress});
        
        this.released = true;
        this.releasing = false;
        this.showSuccess("Funds released to buyer!");
      } catch(err) {
        this.releasing = false;
        this.showError(err);
      }
    }
  }
}
</script>

