const MultiSigWallet = artifacts.require("MultiSigWallet");
const { assert } = require('chai');
const chai = require('chai');
const truffleAssert = require('truffle-assertions');


contract('MultiSigWallet', async function(accounts) {
    let wallet 
    
    before(async () => {
        wallet = await MultiSigWallet.deployed()
        await wallet.deposit({from: accounts[0], value: web3.utils.toWei("3", "ether")})
    })
    describe('initializes contract correctly', async() => {
        it('initializes contract with correct values', async() => {
            let owner1 = await wallet.owners(0)
            let owner2 = await wallet.owners(1)
            let owner3 = await wallet.owners(2)
            let confirmationsRequired = await wallet.confirmationsRequired()
            
            assert.equal(owner1, accounts[0], 'first owner is not correct')
            assert.equal(owner2, accounts[1], 'second owner is not correct')
            assert.equal(owner3, accounts[2], 'third owner is not correct')
            assert.equal(confirmationsRequired, 2, 'wrong number of confirmations')
        })
        it('should reject if no owners', async() => {
            await truffleAssert.fails(MultiSigWallet.new([], 2)), truffleAssert.ErrorType.REVERT 
        })
        it('should reject if confirmations required number is incorrect', async() => {
            await truffleAssert.fails(MultiSigWallet.new([accounts[0], accounts[1], accounts[2]], 0)), truffleAssert.ErrorType.REVERT 
            await truffleAssert.fails(MultiSigWallet.new([accounts[0], accounts[1], accounts[2]], 4)), truffleAssert.ErrorType.REVERT 
        })
    })
    
    describe('submits transaction correctly', async() => {
        it('creates transaction correctly', async() => {
            let to = accounts[3]    
            let value = web3.utils.toWei("1", "ether")
            let data = "0x0123"
            //submit tx
            let result = await wallet.submitTransaction(to, value, data, {from: accounts[0]})
            
            let tx = await wallet.transactions(0)
            //check if tx is created correctly
            assert.equal(tx.to, to, 'receiver is incorrect')
            assert.equal(tx.value, value, 'value is incorrect')
            assert.equal(tx.data, data, 'data is incorrect')
            //check if event is created correctly
            let event = result.logs[1]
            assert.equal(event.args.txIndex, 0, 'wrong tx index')
            assert.equal(event.args.creator, accounts[0], 'wrong tx creator')
            assert.equal(event.args.to, accounts[3], 'wrong receiver')
            assert.equal(event.args.value.toString(), value, 'wrong tx value')
        })
        it('non owner cannot submit transaction', async() => {
            let value = web3.utils.toWei("1", "ether")
            await truffleAssert.fails(wallet.submitTransaction(accounts[3], value, 0x00, {from: accounts[3]})), truffleAssert.ErrorType.REVERT 
        })
    })
    describe('confirms transaction correctly', async() => {
        it('non owner cannot confirm tx', async() => {
            await truffleAssert.fails(wallet.confirmTransaction(0)), truffleAssert.ErrorType.REVERT
        })
        it('cannot confirm tx which doesnt exist', async() => {
            await truffleAssert.fails(wallet.confirmTransaction(1)), truffleAssert.ErrorType.REVERT
        })
        it('cannot confirm transaction already confirmed', async() => {
            await truffleAssert.fails(wallet.confirmTransaction(0, {from: accounts[0]})), truffleAssert.ErrorType.REVERT
        })
        it('confirms tx correctly and adds confirmation correctly', async() => {
            let txBefore = await wallet.transactions(0)
            let result = await wallet.confirmTransaction(0, {from: accounts[1]})
            let txAfter = await wallet.transactions(0)
            assert.equal(txAfter.confirmationsNr.toNumber(), txBefore.confirmationsNr.toNumber() + 1)

            //check if event is correct
            let event = result.logs[0]
            assert.equal(event.args.txIndex, 0)
            assert.equal(event.args.confirmedBy, accounts[1])
        })
    })
    describe('revokes confirmations correctly', async() => {
        it('cannot revoke confirmation which wasnt confirmed by user', async() => {
            await truffleAssert.fails(wallet.revokeConfirmation(0, {from: accounts[2]})), truffleAssert.ErrorType.REVERT
        })
        it('revokes confirmation correctly', async() => {
            let result = await wallet.revokeConfirmation(0, {from: accounts[0]})
            //check if confirmation was revoked
            let check = await wallet.isConfirmed(0, accounts[0])
            assert.equal(check, false, 'did not revoke confirmation correctly')
            
            //check if event is correct
            let event = result.logs[0]
            assert.equal(event.args.txIndex, 0, 'event value txIndex is incorrect')
            assert.equal(event.args.revokedBy, accounts[0], 'event value revokedBy is incorrect')
            
            await wallet.confirmTransaction(0, {from: accounts[0]})
        })
    })
    describe('executes transaction correctly', async() => {
        it('non owner cannot execute tx', async() => {
            await truffleAssert.fails(wallet.executeTransaction(0, {from: accounts[3]})), truffleAssert.ErrorType.REVERT
        })
        it('executes transaction correctly', async() => {
            let result = await wallet.executeTransaction(0, {from: accounts[0]})
            let tx = await wallet.transactions(0)
            assert.equal(tx.executed, true)

            //check if event is correct
            let event = result.logs[0]
            assert.equal(event.args.to, accounts[3])
            assert.equal(event.args.value.toString(), web3.utils.toWei("1", "ether"))
            assert.equal(event.args.executedBy, accounts[0])
        })
        it('cannot confirm already executed tx', async() => {
            await truffleAssert.fails(wallet.confirmTransaction(0, {from: accounts[2]}))
        })
    })
    describe('changes owners correctly', async() => {
        it('adds new owner correctly', async() => {
            //create bytes data to add to submitTransaction function
            let addOwnerData = await web3.eth.abi.encodeFunctionCall({
                name: 'addOwner',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: '_newOwner'
                }]}, ['0xa748B7f6dD59e5b23BFfAEd1477E7222f63c980D']);
            
            let to = wallet.address
            //submit tx
            await wallet.submitTransaction(to, 0, addOwnerData, {from: accounts[0]})
            
            //check if tx was created correctly
            let tx = await wallet.transactions(1)
            assert.equal(tx.to, to, 'receiver is incorrect')
            assert.equal(tx.value, 0, 'value is incorrect')
            assert.equal(tx.data, addOwnerData, 'data is incorrect')
            
            //confirm tx
            await wallet.confirmTransaction(1, {from: accounts[1]})
            
            //execute tx
            let result = await wallet.executeTransaction(1, {from: accounts[0]})
            let check = await wallet.isOwner('0xa748B7f6dD59e5b23BFfAEd1477E7222f63c980D')
            assert.equal(check, true, 'didnt add new owner correctly')
            //check if event is correct
            let event = result.logs[0]
            assert.equal(event.args.newOwner, '0xa748B7f6dD59e5b23BFfAEd1477E7222f63c980D', 'event OwnerAdder is incorrect')
        })
        it('cannot add already existing owner', async() => {
            let addOwnerData = await web3.eth.abi.encodeFunctionCall({
                name: 'addOwner',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: '_newOwner'
                }]}, ['0xa748B7f6dD59e5b23BFfAEd1477E7222f63c980D']);
            
            await wallet.submitTransaction(wallet.address, 0, addOwnerData, {from: accounts[0]})
            await wallet.confirmTransaction(2, {from: accounts[1]})
            await truffleAssert.fails(wallet.executeTransaction(2, {from: accounts[0]}))
        })
        it('cannot add 0 address as a new owner', async() => {
            let addOwnerData = await web3.eth.abi.encodeFunctionCall({
                name: 'addOwner',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: '_newOwner'
                }]}, ['0x0000000000000000000000000000000000000000']);
            
            await wallet.submitTransaction(wallet.address, 0, addOwnerData, {from: accounts[0]})
            await wallet.confirmTransaction(3, {from: accounts[1]})
            await truffleAssert.fails(wallet.executeTransaction(3, {from: accounts[0]}))
        })
        it('removes owner correctly', async() => {
            let removeOwnerData = await web3.eth.abi.encodeFunctionCall({
                name: 'deleteOwner',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: '_owner'
                }]}, ['0xa748B7f6dD59e5b23BFfAEd1477E7222f63c980D']);

            await wallet.submitTransaction(wallet.address, 0, removeOwnerData, {from: accounts[0]})
            await wallet.confirmTransaction(4, {from: accounts[1]})
            //execute tx
            let result = await wallet.executeTransaction(4)
            
            //check if owner was removed
            let check = await wallet.isOwner('0xa748B7f6dD59e5b23BFfAEd1477E7222f63c980D')
            assert.equal(check, false, 'didnt remove owner correctly')
            
            //check if event is correct
            let event = result.logs[0]
            assert.equal(event.args.owner, '0xa748B7f6dD59e5b23BFfAEd1477E7222f63c980D', 'event deleteOwner incorrect')
        })
        it('cannot remove owner which doesnt exist', async() => {
            let removeOwnerData = await web3.eth.abi.encodeFunctionCall({
                name: 'deleteOwner',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: '_owner'
                }]}, ['0xa748B7f6dD59e5b23BFfAEd1477E7222f63c980D']);

            await wallet.submitTransaction(wallet.address, 0, removeOwnerData, {from: accounts[0]})
            await wallet.confirmTransaction(5, {from: accounts[1]})
            await truffleAssert.fails(wallet.executeTransaction(5)), truffleAssert.ErrorType.REVERT
        })
        it('replaces owners correctly', async() => {
            let replaceOwnersData = await web3.eth.abi.encodeFunctionCall({
                name: 'replaceOwners',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: '_oldOwner'
                }, {
                    type: 'address',
                    name: '_newOwner'
                }]}, ['0x23C528d890aAA9c56b0BB5d12Ecb17a0EC16633E', '0x0EBc43534609f74aA241Fb30eb624162f6Ab652F'])
            
            //check second position in owners array
            let ownerToReplace = await wallet.owners(1)
            assert.equal(ownerToReplace, '0x23C528d890aAA9c56b0BB5d12Ecb17a0EC16633E')
            
            await wallet.submitTransaction(wallet.address, 0, replaceOwnersData, {from: accounts[0]})
            await wallet.confirmTransaction(6, {from: accounts[1]})
            let result = await wallet.executeTransaction(6)

            //check second position in owners array after replacement
            let ownerAdded = await wallet.owners(1)
            assert.equal(ownerAdded, '0x0EBc43534609f74aA241Fb30eb624162f6Ab652F')

            //check if owner was correctly added/removed
            let oldOwner = await wallet.isOwner('0x23C528d890aAA9c56b0BB5d12Ecb17a0EC16633E')
            let newOwner = await wallet.isOwner('0x0EBc43534609f74aA241Fb30eb624162f6Ab652F')
            assert.equal(oldOwner, false, 'did not remove old owner')
            assert.equal(newOwner, true, 'did not add new owner')

            //check events
            let addEvent = result.logs[0]
            assert.equal(addEvent.args.newOwner, ownerAdded, 'addOwner event incorrect')
            
            let deleteEvent = result.logs[1]
            assert.equal(deleteEvent.args.owner, ownerToReplace, 'deleteOwner event incorrect')
        })
    })
    describe('changes requirement correctly', async() => {
        it('changes requirement correctly', async() => {
            let changeRequirementData = await web3.eth.abi.encodeFunctionCall({
                name: 'changeRequirement',
                type: 'function',
                inputs: [{
                    type: 'uint256',
                    name: '_confirmationsRequired'
                }]}, ['3'])
            
            await wallet.submitTransaction(wallet.address, 0, changeRequirementData, {from: accounts[0]})
            await wallet.confirmTransaction(7, {from: accounts[2]})
            let result = await wallet.executeTransaction(7)

            //check if confirmationsRequired was changed correctly
            let check = await wallet.confirmationsRequired()
            assert.equal(check, 3, 'wrong confirmation requirement number')

            //check an event
            let event = result.logs[0]
            assert.equal(event.args.requirement.toNumber(), check, 'changedRequirement event incorrect')
        })
    })
    
})