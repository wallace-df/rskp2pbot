<template>
  <div class="loading_container" v-if="loading">
    <div class="spinner-border text-primary" role="status"><span class="sr-only"></span></div>
  </div>
  <div class="loading_container" v-else-if="error">
    <h2 class="text-danger">{{error}}</h2>
  </div>
  <div class="loading_container" v-else-if="locked">
    <h2 class="text-success mb-4">Funds successfully locked for order <i class="text-secondary">{{this.orderId}}</i></h2>
    <p class="text-primary">Please while the bot automatically updates your order...</p>
  </div>
  <div class="loading_container" v-else>
    <h2 class="text-success mb-4">Lock funds for order <i class="text-secondary">{{this.orderId}}</i></h2>

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
          <th>Seller Address</th>
          <td>{{sellerAddress}}</td>
        </tr>
        <tr>
          <th>Amount</th>
          <td>{{formatAmount(amount, token)}}</td>
        </tr>
        <tr>
          <th>Fee</th>
          <td>{{formatAmount(fee, token)}}</td>
        </tr>
      </tbody>
    </table>

    <div class="text-center mt-4">
      <button class="btn btn-primary btn-block" disabled v-if="locking">Locking funds...</button>
      <button class="btn btn-primary btn-block" v-else @click="lockFunds()">Lock {{formatAmount(totalAmount, token)}}</button>
    </div>

  </div>
</template>

<script>
import Config from "../../../resources/config.js";
import Wallet from "../../js/services/wallet.js";
import Web3 from "web3";

export default {
  name: "HomePage",

  components: { },

  created() {
    this.$store.commit("setActiveSection", "LockPage");
    this.loadParams();
  },

  data() {
    return { 
      orderId: null,
      buyerAddress: null,
      buyerHash: null,
      sellerAddress: null,
      sellerHash: null,
      token: null,
      amount: null,
      fee: null,
      totalAmount: null,
      error: null,
      locking: false,
      locked: false,
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
        this.buyerAddress = this.$route.query.buyerAddress;
        this.buyerHash = this.$route.query.buyerHash;
        this.sellerHash = this.$route.query.sellerHash;
        this.token = this.getToken(this.$route.query.token);
        this.amount = this.$route.query.amount;
        this.fee = this.$route.query.fee;

        if (this.isStringEmpty(this.orderId)) {
          throw "OrderID not specified. Please, verify your link.";
        } else if (this.isStringEmpty(this.buyerAddress) || !this.isValidAddress(this.buyerAddress)) {
          throw "BuyerAddress not specified. Please, verify your link.";
        } else if (this.isStringEmpty(this.buyerHash)) {
          throw "BuyerHash not specified. Please, verify your link.";
        } else if (this.isStringEmpty(this.sellerHash)) {
          throw "SellerHash not specified. Please, verify your link.";
        } else if (!this.token) {
          throw "Invalid token specified. Please, verify your link.";
        } else if (this.isStringEmpty(this.amount) || !this.isValidAmount(this.amount, this.token.decimals, "1")) {
          throw "Invalid amount. Please, verify your link.";
        } else if (this.isStringEmpty(this.fee) || !this.isValidAmount(this.fee, this.token.decimals, "0")) {
          throw "Invalid fee. Please, verify your link.";
        }

        let walletInstance = await Wallet.getInstance();
        let order = await walletInstance.contract.methods.orderById(this.orderId).call();

        if (order.status !== "0") {
          throw "OrderID already exists. Please, verify your link.";
        }

        this.buyerAddress = this.buyerAddress.toLowerCase();
        this.sellerAddress = walletInstance.walletAddress.toLowerCase();
        this.totalAmount = this.toBN(this.amount).add(this.toBN(this.fee));
        this.$store.commit("setLoading", false);

      } catch(err) {
        this.error = err;
        this.$store.commit("setLoading", false);
      }
    },
    
    async lockFunds() {
      this.locking = true;
      try {
        let walletInstance = await Wallet.getInstance();        
        let buyerHashBytes32 = "0x" + this.buyerHash.toLowerCase();
        let sellerHashBytes32 = "0x" + this.sellerHash.toLowerCase();

        if (this.token.id === "RBTC") {
          let params = [this.orderId, this.buyerAddress, buyerHashBytes32, sellerHashBytes32, this.amount, this.fee];
          await walletInstance.contract.methods.escrowRBTC(...params).send({from: walletInstance.walletAddress, value: this.totalAmount});
        } else if (this.token.id === "RIF") {

          let erc20Contract = new walletInstance.web3Instance.eth.Contract(Config.erc20ABI, this.token.address);
          let allowance = await erc20Contract.methods.allowance(walletInstance.walletAddress, walletInstance.contract._address).call({from: walletInstance.walletAddress});
          let balance = await erc20Contract.methods.balanceOf(walletInstance.walletAddress).call({from: walletInstance.walletAddress});

          if (this.toBN(balance.toString()).lt(this.totalAmount)) {
            throw "Not enough " + this.token.symbol;
          }

          if (this.toBN(allowance.toString()).lt(this.totalAmount)) {
            await erc20Contract.methods.approve(walletInstance.contract._address, this.toBN(2).pow(this.toBN(255)).toString()).send({from: walletInstance.walletAddress});
          }
          

          let params = [this.orderId, this.token.address, this.buyerAddress, buyerHashBytes32, sellerHashBytes32, this.amount, this.fee];
          await walletInstance.contract.methods.escrowERC20(...params).send({from: walletInstance.walletAddress});
        } else {
          throw "Unsupported token: " + this.token.id;
        }
        
        this.locked = true;
        this.locking = false;
      } catch(err) {
        this.locking = false;
        this.showError(err);
      }
    }
  }
}
</script>

