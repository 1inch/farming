const { expectRevert } = require('@openzeppelin/test-helpers');

const Farm = artifacts.require('Farm');
const TokenMock = artifacts.require('TokenMock');

contract('Farm', function ([wallet1, wallet2]) {
    beforeEach(async function () {
        this.token = await TokenMock.new('1INCH', '1INCH');
        this.gift = await TokenMock.new('UDSC', 'USDC');
        this.Farm = await Farm.new(this.token.address, this.gift.address);

        await this.token.mint(wallet1, '1000000000');
        await this.token.mint(wallet2, '1000000000');
        await this.token.approve(this.Farm.address, '1000000000', { from: wallet1 });
        await this.token.approve(this.Farm.address, '1000000000', { from: wallet2 });
    });

    describe('mint', async function () {
        it('should be mint', async function () {
            await this.Farm.deposit('1000', { from: wallet1 });
            expect(await this.Farm.balanceOf(wallet1)).to.be.bignumber.equal('1000');
            expect(await this.Farm.totalSupply()).to.be.bignumber.equal('1000');
        });
    });

    describe('burn', async function () {
        it('should be burn', async function () {
            console.log('x');
            await this.Farm.deposit('1000', { from: wallet1 });
            console.log('y');
            await this.Farm.withdraw('999', { from: wallet1 });
            console.log('z');
            expect(await this.Farm.balanceOf(wallet1)).to.be.bignumber.equal('1');
            expect(await this.Farm.totalSupply()).to.be.bignumber.equal('1');
        });

        it('should be thrown', async function () {
            expectRevert(
                this.Farm.withdraw('1', { from: wallet1 }),
                'Burn amount exceeds balance',
            );
        });
    });
});
