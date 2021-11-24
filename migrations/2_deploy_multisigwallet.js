const MultiSigWallet = artifacts.require("MultiSigWallet");

module.exports = function(deployer, network, accounts) {
    let owners = [accounts[0], accounts[1], accounts[2]]
    
    deployer.deploy(MultiSigWallet, owners, 2);
};