<template>
  <div class="loading_container" v-if="loading">
    <div class="spinner-border text-primary" role="status"><span class="sr-only"></span></div>
  </div>
  <div class="loading_container" v-else-if="error">
    <h2 class="text-danger">{{error}}</h2>
  </div>
  <div class="p-5" v-else>
    <div>
      <h2 class="text-success text-center mb-4">Your locked funds <i class="text-secondary">(seller)</i></h2>
      <div v-if="sellerOrders.length === 0" class="text-center">
        <i class="text-primary">(You have no locked funds)</i>
      </div>
      <table class="text-left mt-4" style="margin: 0 auto" v-for="order in sellerOrders" :key="order.id">
        <tbody>
          <tr>
            <th>Order ID</th>
            <td>{{order.id}}</td>
          </tr>
          <tr>
            <th>Timestamp</th>
            <td>{{formatTimestamp(order.timestamp)}}</td>
          </tr>
          <tr>
            <th>Seller Address</th>
            <td>{{order.sellerAddress.toLowerCase()}}</td>
          </tr>
          <tr>
            <th>Buyer Address</th>
            <td>{{order.buyerAddress.toLowerCase()}}</td>
          </tr>
          <tr>
            <th>Amount</th>
            <td>
              {{formatOrderAmount(order)}}
            </td>
          </tr>
          <tr>
            <th>Fee</th>
            <td>{{formatOrderFee(order)}}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="mt-2">
      <h2 class="text-center text-success mt-5 mb-4">Funds locked for you <i class="text-secondary">(buyer)</i></h2>
      <div v-if="buyerOrders.length === 0" class="text-center">
        <i class="text-primary">(No locked funds for you)</i>
      </div>
      <table class="text-left mt-4" style="margin: 0 auto" v-for="order in buyerOrders" :key="order.id">
        <tbody>
          <tr>
            <th>Order ID</th>
            <td>{{order.id}}</td>
          </tr>
          <tr>
            <th>Timestamp</th>
            <td>{{formatTimestamp(order.timestamp)}}</td>
          </tr>
          <tr>
            <th>Seller Address</th>
            <td>{{order.sellerAddress.toLowerCase()}}</td>
          </tr>
          <tr>
            <th>Buyer Address</th>
            <td>{{order.buyerAddress.toLowerCase()}}</td>
          </tr>
          <tr>
            <th>Amount</th>
            <td>{{formatOrderAmount(order)}}</td>
          </tr>
          <tr>
            <th>Fee</th>
            <td>{{formatOrderFee(order)}}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
import Wallet from "../../js/services/wallet.js";

export default {
  name: "HomePage",

  components: { },

  created() {
    this.$store.commit("setActiveSection", "HomePage");
    this.loadOffers();
  },

  data() {
    return { 
      sellerOrders: [],
      buyerOrders: [],
      error: null,
    }
  },

  computed: {
    loading() {
      return this.$store.state.loading;
    },
  },

  methods: {
    async loadOffers() {
      this.$store.commit("setLoading", true);
      try {
        let walletInstance = await Wallet.getInstance();
        let userOrders = await walletInstance.contract.methods.userOrders(walletInstance.walletAddress).call();
        let lockedOrders = userOrders.filter(order => order.status === '2');
        
        for(let i = 0; i < lockedOrders.length; i++) {
          lockedOrders[i] = {...lockedOrders[i]};
          lockedOrders[i].token = this.getTokenByAddress(lockedOrders[i].tokenContractAddress);
          lockedOrders[i].token = this.getTokenByAddress('0x19f64674d8a5b4e652319f5e239efd3bc969a1fe');

        }

        this.sellerOrders = lockedOrders.filter(order => order.sellerAddress.toLowerCase() === walletInstance.walletAddress.toLowerCase());
        this.buyerOrders = lockedOrders.filter(order => order.buyerAddress.toLowerCase() === walletInstance.walletAddress.toLowerCase());

        this.$store.commit("setLoading", false);

      } catch(err) {
        this.error = err;
        this.$store.commit("setLoading", false);
      }
    },

    formatOrderAmount(order) {
      let amount = this.formatAmount(this.toBN(order.amount), this.getTokenByAddress(order.tokenContractAddress))
      if (amount) {
        return amount;
      }
      return '-';
    },
    formatOrderFee(order) {
      let amount = this.formatAmount(this.toBN(order.fee), this.getTokenByAddress(order.tokenContractAddress))
      if (amount) {
        return amount;
      }
      return '-';
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

