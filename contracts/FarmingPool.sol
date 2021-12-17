// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./interfaces/IFarmingPool.sol";
import "./accounting/UserAccounting.sol";
import "./BaseFarm.sol";

contract FarmingPool is IFarmingPool, BaseFarm, ERC20 {
    using SafeERC20 for IERC20;
    using FarmAccounting for FarmAccounting.Info;
    using UserAccounting for UserAccounting.Info;

    UserAccounting.Info public userInfo;

    constructor(IERC20Metadata stakingToken_, IERC20 rewardsToken_)
        BaseFarm(stakingToken_, rewardsToken_)
        ERC20(
            string(abi.encodePacked("Farming of ", stakingToken_.name())),
            string(abi.encodePacked("farm", stakingToken_.symbol()))
        )
    {}

    function decimals() public view override returns (uint8) {
        return IERC20Metadata(address(stakingToken)).decimals();
    }

    function farmedPerToken() public view override returns (uint256) {
        return userInfo.farmedPerToken(address(0), _getTotalSupply, _getFarmedSinceCheckpointScaled);
    }

    function farmed(address account) public view override returns (uint256) {
        return userInfo.farmed(account, balanceOf(account), farmedPerToken());
    }

    function deposit(uint256 amount) external override {
        _mint(msg.sender, amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) public override {
        _burn(msg.sender, amount);
        stakingToken.safeTransfer(msg.sender, amount);
    }

    function claim() public override {
        uint256 fpt = farmedPerToken();
        uint256 balance = balanceOf(msg.sender);
        uint256 amount = userInfo.farmed(msg.sender, balance, fpt);
        if (amount > 0) {
            userInfo.eraseFarmed(msg.sender, balance, fpt);
            rewardsToken.safeTransfer(msg.sender, amount);
        }
    }

    function exit() public override {
        withdraw(balanceOf(msg.sender));
        claim();
    }

    // ERC20 overrides

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        super._beforeTokenTransfer(from, to, amount);

        if (amount > 0) {
            userInfo.updateBalances(farmedPerToken(), from, to, amount, from != address(0), to != address(0));
        }
    }

    // UserAccounting bindings

    function _getTotalSupply(address /* farm */) internal view returns(uint256) {
        return totalSupply();
    }

    function _getFarmedSinceCheckpointScaled(address /* farm */, uint256 updated) internal view returns(uint256) {
        return farmInfo.farmedSinceCheckpointScaled(updated);
    }

    // BaseFarm overrides

    function _updateFarmingState() internal override {
        userInfo.checkpoint(farmedPerToken());
        farmInfo.farmingCheckpoint();
    }
}
