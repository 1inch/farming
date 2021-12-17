// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./interfaces/IFarm.sol";
import "./interfaces/IERC20Farmable.sol";
import "./BaseFarm.sol";

contract Farm is IFarm, BaseFarm {
    using SafeERC20 for IERC20;
    using FarmAccounting for FarmAccounting.Info;

    constructor(IERC20 stakingToken_, IERC20 rewardsToken_) BaseFarm(stakingToken_, rewardsToken_) {}

    /// @dev Use block.timestamp for checkpoint if needed, try not to revert
    function farmingCheckpoint() public override {
        farmInfo.farmingCheckpoint();
    }

    /// @dev Requires extra 18 decimals for precision, result should not exceed 10**54
    function farmedSinceCheckpointScaled(uint256 updated) public view override returns(uint256 amount) {
        return farmInfo.farmedSinceCheckpointScaled(updated);
    }

    function claimFor(address account, uint256 amount) external override {
        require(msg.sender == address(stakingToken), "ERC20: Access denied");
        rewardsToken.safeTransfer(account, amount);
    }

    function _updateFarmingState() internal override {
        IERC20Farmable(address(stakingToken)).checkpoint(address(this));
    }
}
