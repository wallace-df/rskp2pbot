<template>
  <div class="loading_container" v-if="loading">
    <div class="spinner-border text-primary" role="status"><span class="sr-only"></span></div>
  </div>
  <div class="loading_container" v-else-if="error">
    <h2 class="text-danger">{{error}}</h2>
  </div>
  <div class="loading_container" v-else>
    <h2 class="text-success mb-2">Escrow status</h2>

    <table class="text-left" style="margin: 0 auto">
      <table class="text-left mt-4" style="margin: 0 auto">
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
            <th>Buyer address</th>
            <td>{{buyerAddress}}</td>
          </tr>
          <tr>
            <th>Order amount</th>
            <td>{{orderAmount}}</td>
          </tr>
          <tr v-if="refunded">
            <th>Fee</th>
            <td>{{orderAmount}}</td>
          </tr>
          <tr v-if="refunded">
            <th>Total</th>
            <td>{{totalAmount}}</td>
          </tr>
          <tr>
            <th>Status</th>
            <td>
              <span class="badge bg-warning" v-if="locked">LOCKED</span>
              <span class="badge bg-success" v-else-if="released">{{adminAction ? 'RELEASED TO BUYER BY ADMIN' : 'RELEASED TO BUYER'}}</span>
              <span class="badge bg-danger" v-else>{{adminAction ? 'SELLER REFUNDED BY ADMIN' : 'SELLER REFUNDED'}}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </table>

    <div class="text-center mt-4" v-if="token.id !== 'RBTC'">
      <button class="btn btn-primary btn-block" @click="addToken(token)"><i class="fa fa-plus"></i> Add {{token.symbol}} to your wallet</button>
    </div>


  </div>
</template>

<script>
import Wallet from "../../js/services/wallet.js";

export default {
  components: { },

  created() {
    this.$store.commit("setActiveSection", "RefundPage");
    this.loadParams();
  },

  data() {
    return { 
      orderId: null,
      token: null,
      timestamp: null,
      sellerAddress: null,
      buyerAddress: null,
      orderAmount: null,
      feeAmount: null,
      totalAmount: null,
      error: null,
      locked: false,
      released: false,
      refunded: false,
      adminAction: false
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
        this.token = this.getTokenByAddress(order.tokenContractAddress);

        if (!this.token) {
           throw "There was an error fetching details: token not supported."; 
        }

        if (order.status === "0") {
          throw "Order not found. Please, verify your link.";
        } else if (order.status === "1") {
          this.locked = true;
        } else if (order.status === "2") {
          this.released = true;
        } else if (order.status === "3") {
          this.refunded = true;
        } else {
          throw "There was an error fetching details: order status not supported.";
        }

        this.timestamp = this.formatTimestamp(order.timestamp);
        this.buyerAddress = order.buyerAddress.toLowerCase();
        this.sellerAddress = order.sellerAddress.toLowerCase();
        this.orderAmount = this.formatOrderAmount(order);
        this.feeAmount = this.formatOrderFeeAmount(order);
        this.totalAmount = this.formatOrderTotalAmount(order);
        this.adminAction = order.adminAction;

        this.$store.commit("setLoading", false);

      } catch(err) {
        this.error = err;
        this.$store.commit("setLoading", false);
      }
    },

    async addToken(token) {
      let params = {
        type: 'ERC20',
        options: {...token}
      };      
      window.ethereum.request({ method: 'wallet_watchAsset', params });
    }
  }
}
</script>

