const Farm = artifacts.require('Farm');
const TokenMock = artifacts.require('TokenMock');

contract('Farm', function ([wallet1, wallet2]) {
    beforeEach(async function () {
        this.token = await TokenMock.new('1INCH', '1INCH');
        this.Farm = await Farm.new(this.token.address);
    });

    describe('modules', async function () {
        it('should something', async function () {
            // todo: something
        });
    });
});
