const { expect } = require('chai');
const { expectRevert, BN } = require('@openzeppelin/test-helpers');

const FarmMock = artifacts.require('FarmMock');
const TokenMock = artifacts.require('TokenMock');

contract('Farm', function ([wallet1, wallet2]) {
    beforeEach(async function () {
        this.token = await TokenMock.new('1INCH', '1INCH');
        this.FarmMock = await FarmMock.new(this.token.address);
    });

    describe('_mint', async function () {
        it('should be mint', async function () {
            const value = new BN(web3.utils.randomHex(32));
            await this.FarmMock.__mint(wallet1, value);
            expect(await this.FarmMock.balanceOf(wallet1)).to.be.bignumber.equal(value);
            expect(await this.FarmMock.totalSupply()).to.be.bignumber.equal(value);
        });
    });

    describe('_burn', async function () {
        it('should be burn', async function () {
            const value = new BN(web3.utils.randomHex(32));
            await this.FarmMock.__mint(wallet1, value);
            await this.FarmMock.__burn(wallet1, value.subn(1));
            expect(await this.FarmMock.balanceOf(wallet1)).to.be.bignumber.equal('1');
            expect(await this.FarmMock.totalSupply()).to.be.bignumber.equal('1');
        });

        it('should be thrown', async function () {
            expectRevert(
                this.FarmMock.__burn(wallet1, '1'),
                'Burn amount exceeds balance',
            );
        });
    });
});
