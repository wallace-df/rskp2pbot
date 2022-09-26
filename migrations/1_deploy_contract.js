const RSKEscrow = artifacts.require("RSKEscrow");

module.exports = function (deployer) {
  return deployer.deploy(RSKEscrow);
};