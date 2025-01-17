const { expect } = require('chai');
const { expectEvent, expectRevert, constants } = require('@openzeppelin/test-helpers');
const EthordleToken = artifacts.require("./EthordleToken.sol");
const chai = require('chai');
const BN = require('bn.js');
const bnChai = require('bn-chai');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');

chai.use(bnChai(BN));

contract('EthordleToken', function ([owner, winner, other, transferee]) {

    const name = 'Ethordle Token';
    const symbol = 'EthordleToken';
    const initialPrice = web3.utils.toWei(new BN(1), 'ether'); 
    const royaltyRate = '500';
    const priceEscalationRate = '11000';
    const solution = 'STARE';
    const otherSolutions = ['CHOMP', 'SPORK', 'BLURT', 'REIFY', 'GLYPH' ];
    const tokenURI = 'https://ipfs.infura.io/ipfs/ethordle';
    const otherTokenURIs = ['https://ipfs.infura.io/ipfs/ethordle.com/0', 'https://ipfs.infura.io/ipfs/ethordle.com/1', 'https://ipfs.infura.io/ipfs/ethordle/2', 'https://ipfs.infura.io/ipfs/ethordle.com/3', 'ttps://ipfs.infura.io/ipfs/ethordle.com/4'];
    
    const getTransactionCost = async (receipt) => {
        const gasUsed = new BN(receipt.receipt.gasUsed);
        const tx = await web3.eth.getTransaction(receipt.tx);
        const gasPrice = new BN(tx.gasPrice);
        const totalGas = gasPrice.mul(gasUsed);

        return totalGas;
    };

    const verifyToken = async (token, index) => {
        expect(token.id.toString()).is.a.bignumber.that.equals(new BN(index));
        expect(token.owner).to.equal(winner);
        expect(token.url).to.equal(otherTokenURIs[index]);
        expect(token.solution).to.equal(otherSolutions[index]);        
    }

    beforeEach(async function () {
        this.contract = await EthordleToken.new(name, symbol, initialPrice, royaltyRate, priceEscalationRate, { from: owner });
    });

    it('has metadata', async function () {
        expect(await this.contract.name()).to.equal(name);
        expect(await this.contract.symbol()).to.equal(symbol);
        expect((await this.contract.initialPrice()).toString()).to.equal(initialPrice.toString());
        expect((await this.contract.royaltyRate()).toString()).to.equal(royaltyRate);
        expect((await this.contract.priceEscalationRate()).toString()).to.equal(priceEscalationRate);
    });

    it('ignores disallowed methods', async function () {
        const receipt = await this.contract.mint(winner, solution, tokenURI, { from: owner, value: initialPrice });
        const token = await this.contract.tokenById(0);
        const price = token.price;

        await expectRevert(
            this.contract.transferFrom(winner, transferee, 0, { from: winner, value: price }), 
            'revert' // why not 'Method may only be called by the owner'?
        );

        await expectRevert(
            this.contract.safeTransferFrom(winner, transferee, 0, { from: winner, value: price }), 
            'revert'
        );

        await expectRevert(
            this.contract.safeTransferFrom(winner, transferee, 0, new Uint8Array(16), { from: winner, value: price }), 
            'revert'
        );
    });
    
    it('rejects methods reserved for owner', async function () {
        await expectRevert(
            this.contract.setInitialPrice(web3.utils.toWei(new BN(2), 'ether'), { from: winner }),
            'caller is not the owner'
        );

        await expectRevert(
            this.contract.setRoyaltyRate('600', { from: winner }),
            'caller is not the owner'
        );

        await expectRevert(
            this.contract.setPriceEscalationRate('1500', { from: winner }),
            'caller is not the owner'
        );

        await expectRevert(
            this.contract.setBaseURI('https://hammerbeam.com', { from: winner}),
            'caller is not the owner'
        );

    });
 
    it('can set initial price', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        const token = await this.contract.tokenById(0);
        const expectedPrice = initialPrice.mul(new BN('11000')).div(new BN('10000')).toString();
        expect(token.price.toString()).to.equal(expectedPrice);
        expect(token.lastPrice.toString()).to.equal(initialPrice.toString());
        
        const newInitialPrice = web3.utils.toWei(new BN(3), 'ether');
        await this.contract.setInitialPrice(newInitialPrice, { from: owner });

        await expectRevert(
            this.contract.mint(winner, otherSolutions[0], otherTokenURIs[0], { from: owner, value: initialPrice }),
            'Insufficient ether sent with this transaction'
        );
        
        await this.contract.mint(winner, otherSolutions[1], otherTokenURIs[1], { from: owner, value: newInitialPrice });     
        const newToken = await this.contract.tokenById(1);
        const newExpectedPrice = newInitialPrice.mul(new BN('11000')).div(new BN('10000')).toString();
        expect(newToken.price.toString()).to.equal(newExpectedPrice);        
        expect(newToken.lastPrice.toString()).to.equal(newInitialPrice.toString());        
    });

    it('can set royalty rate', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        await this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: winner });
      
        const ownerBalance = await web3.eth.getBalance(owner);
        
        const token = await this.contract.tokenById(0);
        await this.contract.buy(transferee, 0, { from: transferee, value: token.price });
        await this.contract.allowSale(transferee, 0, initialPrice.mul(new BN('11000')).mul(new BN('11000')).div(new BN('100000000')), { from: transferee });
      
        const newToken = await this.contract.tokenById(0);
        const expectedRoyalty = web3.utils.toWei('0.055', 'ether');        
        const newOwnerBalance = await web3.eth.getBalance(owner);
        const newExpectedOwnerBalance = new BN(ownerBalance).add(new BN(expectedRoyalty));
        expect(newOwnerBalance.toString()).to.be.a.bignumber.that.equals(newExpectedOwnerBalance);
    
        const receipt = await this.contract.setRoyaltyRate('2000', { from: owner });
        const gas = await getTransactionCost(receipt);
        expect((await this.contract.royaltyRate()).toString()).to.equal('2000');

        await this.contract.buy(other, 0, { from: other, value: newToken.price });
        const finalExpectedRoyalty = web3.utils.toWei('0.242', 'ether');                
        const finalOwnerBalance = await web3.eth.getBalance(owner);
        const finalExpectedOwnerBalance = new BN(ownerBalance).add(new BN(expectedRoyalty)).add(new BN(finalExpectedRoyalty).sub(new BN(gas)));

        expect(finalOwnerBalance.toString()).to.be.a.bignumber.that.equals(finalExpectedOwnerBalance);         
    });

    it('can set price escalation rate', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        await this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: winner });
      
        const token = await this.contract.tokenById(0);
        const expectedPrice = initialPrice.mul(new BN('11000')).div(new BN('10000'));        
        expect(token.price.toString()).to.equal(expectedPrice.toString());
        expect(token.lastPrice.toString()).to.equal(initialPrice.toString());  

        await this.contract.buy(transferee, 0, { from: transferee, value: token.price });
        await this.contract.allowSale(transferee, 0, initialPrice.mul(new BN('11000')).mul(new BN('11000')).div(new BN('100000000')), { from: transferee });
      
        const newToken = await this.contract.tokenById(0);
        const newExpectedPrice = initialPrice.mul(new BN('11000')).mul(new BN('11000')).div(new BN('100000000'));
        expect(newToken.price.toString()).to.equal(newExpectedPrice.toString());
        expect(newToken.lastPrice.toString()).to.equal(expectedPrice.toString());  

        const receipt = await this.contract.setPriceEscalationRate('15000', { from: owner });
        const gas = await getTransactionCost(receipt);
        expect((await this.contract.priceEscalationRate()).toString()).to.equal('15000');

        await this.contract.buy(other, 0, { from: other, value: newToken.price });
        const finalExpectedPrice = initialPrice.mul(new BN('11000')).mul(new BN('11000')).mul(new BN('15000')).div(new BN('1000000000000'));
        const finalToken = await this.contract.tokenById(0);        
        expect(finalToken.price.toString()).to.equal(finalExpectedPrice.toString());      
        expect(finalToken.lastPrice.toString()).to.equal(newExpectedPrice.toString());   
    });
    
    it('can mint token as minter', async function () {
        const receipt = await this.contract.mint(winner, solution, tokenURI, { from: owner, value: initialPrice });
        const token = await this.contract.tokenById(0);
        
        expect(token.id.toString()).is.a.bignumber.that.equals(new BN(0));
        expect(token.owner).to.equal(winner);
        expect(token.url).to.equal('https://ipfs.infura.io/ipfs/ethordle');
        expect(token.solution).to.equal('STARE');
        expect(token.isForSale).to.equal(false);
        expect(token.transactionCount.toString()).is.a.bignumber.that.equals(new BN(1));
        expect(await this.contract.tokenCount()).is.a.bignumber.that.equals(new BN(1));
        expect(await this.contract.tokenURI(0)).to.equal('https://ipfs.infura.io/ipfs/ethordle');
        
        const expectedPrice = initialPrice.mul(new BN('11000')).div(new BN('10000')).toString();
        expect(token.price.toString()).to.equal(expectedPrice);
        expect(token.lastPrice.toString()).to.equal(initialPrice.toString());  

        const tokens = await this.contract.tokensOfOwner(winner);
        expect(tokens.length).to.equal(1);
        expect(tokens[0].id).is.a.bignumber.that.equals(new BN(0));

        const allTokens = await this.contract.tokens();
        expect(allTokens.length).to.equal(1);
        expect(allTokens[0].id).is.a.bignumber.that.equals(new BN(0));

        expectEvent(receipt, 'Transfer', { from: constants.ZERO_ADDRESS, to: winner, tokenId: '0' });
    });
 
    it('can mint token as normal accounnt', async function () {
        const receipt = await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        const token = await this.contract.tokenById(0);
        
        expect(token.id.toString()).is.a.bignumber.that.equals(new BN(0));
        expect(token.owner).to.equal(winner);
        expect(token.url).to.equal(tokenURI);
        expect(token.solution).to.equal(solution);
        expect(token.isForSale).to.equal(false);
        expect(token.transactionCount.toString()).is.a.bignumber.that.equals(new BN(1));
        expect(token.lastPrice.toString()).to.equal(initialPrice.toString());  

        const expectedPrice = initialPrice.mul(new BN('11000')).div(new BN('10000')).toString();
        expect(token.price.toString()).to.equal(expectedPrice);
        
        const tokens = await this.contract.tokensOfOwner(winner);
        expect(tokens.length).to.equal(1);
        expect(tokens[0].id).is.a.bignumber.that.equals(new BN(0));

        const allTokens = await this.contract.tokens();
        expect(allTokens.length).to.equal(1);
        expect(allTokens[0].id).is.a.bignumber.that.equals(new BN(0));

        expectEvent(receipt, 'Transfer', { from: constants.ZERO_ADDRESS, to: winner, tokenId: '0' });
    });

    it('can mint multiple tokens as normal account', async function () {       
        for (let i = 0; i < 4; i++) {
            await this.contract.mint(winner, otherSolutions[i], otherTokenURIs[i], { from: winner, value: initialPrice });
            const token = await this.contract.tokenById(i);    
            await verifyToken(token, i);
        }
        
        expect(await this.contract.tokenCount()).is.a.bignumber.that.equals(new BN(4));

        const tokens = await this.contract.tokensOfOwner(winner);

        expect(tokens.length).to.equal(4);

        for (let i = 0; i < 4; i++) {
            expect(tokens[i].id).is.a.bignumber.that.equals(new BN(i));
        }
       
        await this.contract.mint(other, otherSolutions[4], otherTokenURIs[4], { from: other, value: initialPrice });

        const otherTokens = await this.contract.tokensOfOwner(other);
        const winnerTokens = await this.contract.tokensOfOwner(winner);
        const allTokens = await this.contract.tokens();

        expect(otherTokens.length).to.equal(1);
        expect(winnerTokens.length).to.equal(4);
        expect(allTokens.length).to.equal(5);
    });

    it('rejects bad token ids', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: owner, value: initialPrice });
        const token = await this.contract.tokenById(0);
        
        expect(token.id.toString()).is.a.bignumber.that.equals(new BN(0));
                
        await expectRevert(
            this.contract.tokenById(1), 
            'TokenId does not exist'
        );
    });
 
    it('can determine solution uniqueness', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: owner, value: initialPrice });

        expect(await this.contract.isSolutionUnique(solution)).to.equal(false);
        expect(await this.contract.isSolutionUnique(otherSolutions[0])).to.equal(true);
    });

    it('rejects attempt to reuse solution', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });

        await expectRevert(
            this.contract.mint(other, solution, otherTokenURIs[0], { from: other, value: initialPrice }), 
            'A token has already been minted with this solution'
        );
    });

    it('rejects attempt to reuse token URI', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });

        await expectRevert(
            this.contract.mint(other, otherSolutions[0], tokenURI, { from: other, value: initialPrice }), 
            'A token has already been minted with this URI'
        );
    });

    it('rejects attempt to send to owner', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        await this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: winner });      
        const token = await this.contract.tokenById(0);
        
        await expectRevert(
            this.contract.buy(winner, 0, { from: transferee, value: token.price }),
            'Buyer already owns token'
        );

        await expectRevert(
            this.contract.buy(winner, 0, { from: winner, value: token.price }),
            'Buyer already owns token'
        );
    });

    it('rejects attempt to buy invalid token', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        await this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: winner });
        const token = await this.contract.tokenById(0);
        
        await expectRevert(
            this.contract.buy(winner, 1, { from: winner, value: initialPrice }),
            'TokenId does not exist'
        );
    });

    it('rejects attempt to mint without required values', async function () {        
        await expectRevert(
            this.contract.mint(winner, '', tokenURI, { from: winner, value: initialPrice }),
            'A value for solution is required'
        );

        await expectRevert(
            this.contract.mint(winner, solution, '', { from: winner, value: initialPrice }),
            'A value for tokenURI is required'
        );
    });


    it('rejects insufficient value sent', async function () {
        await expectRevert(
            this.contract.mint(winner, solution, tokenURI, { from: owner, value: initialPrice.sub(new BN('1000')) }), 
            'Insufficient ether sent with this transaction'
        );
    });

    it('transfers value to owner', async function () {
        const ownerBalance = await web3.eth.getBalance(owner);
        const winnerBalance = await web3.eth.getBalance(winner);
       
        const receipt0 = await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        const receipt1 = await this.contract.mint(winner, otherSolutions[0], otherTokenURIs[0], { from: winner, value: initialPrice });
        const receipt2 = await this.contract.mint(winner, otherSolutions[1], otherTokenURIs[1], { from: winner, value: initialPrice });
        const receipt3 = await this.contract.mint(winner, otherSolutions[2], otherTokenURIs[2], { from: winner, value: initialPrice });

        const gas0 = await getTransactionCost(receipt0);
        const gas1 = await getTransactionCost(receipt1);
        const gas2 = await getTransactionCost(receipt2);
        const gas3 = await getTransactionCost(receipt3);

        const newOwnerBalance = await web3.eth.getBalance(owner);
        const newWinnerBalance = await web3.eth.getBalance(winner);
        
        const expectedNewOwnerBalance = new BN(ownerBalance).add(initialPrice.mul(new BN('4')))
        expect(new BN(newOwnerBalance)).to.be.a.bignumber.that.equals(expectedNewOwnerBalance);

        const expectedNewWinnerBalance = new BN(winnerBalance).sub(initialPrice.mul(new BN('4'))).sub(gas0).sub(gas1).sub(gas2).sub(gas3);
        expect(new BN(newWinnerBalance)).to.be.a.bignumber.equals(expectedNewWinnerBalance);        
    });

    it('allows transfers', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        await this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: winner });
      
        const ownerBalance = await web3.eth.getBalance(owner);
        const winnerBalance = await web3.eth.getBalance(winner);
        const transfereeBalance = await web3.eth.getBalance(transferee);
        
        const token = await this.contract.tokenById(0);
        const expectedPrice = initialPrice.mul(new BN('11000')).div(new BN('10000'));
        expect(token.price.toString()).to.equal(expectedPrice.toString());
        expect(token.lastPrice.toString()).to.equal(initialPrice.toString());  
        expect(token.isForSale).to.equal(true);
        expect(token.transactionCount.toString()).to.equal('1');
        
        const receipt = await this.contract.buy(transferee, 0, { from: transferee, value: token.price });
        const gas = await getTransactionCost(receipt);
 
        const newToken = await this.contract.tokenById(0);
        const newExpectedPrice = initialPrice.mul(new BN('11000')).mul(new BN('11000')).div(new BN('100000000'));
        expect(newToken.price.toString()).to.equal(newExpectedPrice.toString());
        expect(newToken.lastPrice.toString()).to.equal(expectedPrice.toString());  
        expect(newToken.isForSale).to.equal(false);
        expect(newToken.transactionCount.toString()).to.equal('2');
        
        const newOwnerBalance = await web3.eth.getBalance(owner);
        const newWinnerBalance = await web3.eth.getBalance(winner);
        const newTransfereeBalance = await web3.eth.getBalance(transferee);
        const expectedRoyalty = expectedPrice.mul(new BN('500')).div(new BN('10000'));
        
        const newExpectedOwnerBalance = new BN(ownerBalance).add(expectedRoyalty);
        expect(newOwnerBalance.toString()).to.equal(newExpectedOwnerBalance.toString());
              
        const newExpectedWinnerBalance = new BN(winnerBalance).add(expectedPrice).sub(expectedRoyalty);
        expect(newWinnerBalance.toString()).to.equal(newExpectedWinnerBalance.toString());

        const newExpectedTransfereeBalance = new BN(transfereeBalance).sub(expectedPrice).sub(gas);
        expect(newTransfereeBalance.toString()).to.equal(newExpectedTransfereeBalance.toString());        
    });

    it('rounds high-precision values down during one-off transaction', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        await this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: winner });
      
        const token = await this.contract.tokenById(0);

        const expectedPrice = initialPrice.mul(new BN('11000')).div(new BN('10000'));
        expect(token.price.toString()).to.equal(expectedPrice.toString());
        
        await this.contract.buy(transferee, 0, { from: transferee, value: new BN('1234567890123456789') });
        
        const newToken = await this.contract.tokenById(0);
        const newExpectedPrice = new BN('1358000000000000000');
        expect(newToken.price.toString()).to.equal(newExpectedPrice.toString());
    });

    it('rounds high-precision values down as transfers occur', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        await this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: winner });
      
        let token = await this.contract.tokenById(0);
        const expectedPrice = initialPrice.mul(new BN('11000')).div(new BN('10000'));
        expect(token.price.toString()).to.equal(expectedPrice.toString());
        
        for (let i = 0; i < 3; i++) {
            await this.contract.buy(transferee, 0, { from: transferee, value: token.price });
            await this.contract.allowSale(transferee, 0, new BN(token.price).mul(new BN('11000')).div(new BN('10000')), { from: transferee });
      
            token = await this.contract.tokenById(0);
           
            await this.contract.buy(other, 0, { from: other, value: token.price });
            await this.contract.allowSale(other, 0, new BN(token.price).mul(new BN('11000')).div(new BN('10000')), { from: other });
      
            token = await this.contract.tokenById(0);
            
            await this.contract.buy(winner, 0, { from: winner, value: token.price });
            await this.contract.allowSale(winner, 0, new BN(token.price).mul(new BN('11000')).div(new BN('10000')), { from: winner });
      
            token = await this.contract.tokenById(0);        
        }

        const newExpectedPrice = new BN('2591000000000000000');
        expect(token.price.toString()).to.equal(newExpectedPrice.toString());
    });  

    it('allows and denies token sale', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        let token = await this.contract.tokenById(0);
        expect(token.isForSale).to.equal(false);

        await this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: winner });
        token = await this.contract.tokenById(0);
        expect(token.isForSale).to.equal(true);
    });  

    it('prevents sale when token is not marked for sale', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        let token = await this.contract.tokenById(0);
        expect(token.isForSale).to.equal(false);

        await expectRevert(
            this.contract.buy(transferee, 0, { from: transferee, value: token.price }),
                'Token is not for sale'
        );    
    });  

    it('requires toggle of token marked for sale to be owner', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        let token = await this.contract.tokenById(0);
        expect(token.isForSale).to.equal(false);

        await expectRevert(
            this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: transferee }),
                'Sender must be token owner or contract owner'
        );    

        await expectRevert(
            this.contract.allowSale(transferee, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: transferee }),
                'Sender must be token owner or contract owner'
        );  
        
        await this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: winner });
        token = await this.contract.tokenById(0);
        expect(token.isForSale).to.equal(true);

        await expectRevert(
            this.contract.preventSale(winner, 0, { from: transferee }),
                'Sender must be token owner or contract owner'
        );    

        await expectRevert(
            this.contract.preventSale(transferee, 0, { from: transferee }),
                'Sender must be token owner or contract owner'
        );  
        
        await this.contract.preventSale(winner, 0, { from: winner });

        token = await this.contract.tokenById(0);
        expect(token.isForSale).to.equal(false);
    });  

    it('reverts sale toggle if already in that state', async function () {
        await this.contract.mint(winner, solution, tokenURI, { from: winner, value: initialPrice });
        let token = await this.contract.tokenById(0);
        expect(token.isForSale).to.equal(false);

        await expectRevert(
            this.contract.preventSale(winner, 0, { from: winner }),
                'Token is already prevented from being sold'
        );    

        await this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: winner });
        token = await this.contract.tokenById(0);
        expect(token.isForSale).to.equal(true);

        await expectRevert(
            this.contract.allowSale(winner, 0, initialPrice.mul(new BN('11000')).div(new BN('10000')), { from: winner }),
                'Token is already marked for sale'
        );    
    }); 

});
