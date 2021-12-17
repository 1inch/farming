// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";

import "./interfaces/IERC20Farm.sol";
import "./interfaces/IERC20Farmable.sol";
import "./accounting/FarmAccounting.sol";

contract ERC20Farm is IERC20Farm, Ownable {
    using SafeERC20 for IERC20;
    using FarmAccounting for FarmAccounting.FarmInfo;

    event RewardAdded(uint256 reward, uint256 duration);

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    FarmAccounting.FarmInfo public info;
    address public distributor;

    constructor(IERC20 stakingToken_, IERC20 rewardsToken_) {
        stakingToken = stakingToken_;
        rewardsToken = rewardsToken_;
    }

    function setDistributor(address distributor_) external onlyOwner {
        distributor = distributor_;
    }

    /// @dev Use block.timestamp for checkpoint if needed, try not to revert
    function farmingCheckpoint() public virtual override {
        info.farmingCheckpoint();
    }

    /// @dev Requires extra 18 decimals for precision, result should not exceed 10**54
    function farmedSinceCheckpointScaled(uint256 updated) public view virtual override returns(uint256 amount) {
        return info.farmedSinceCheckpointScaled(updated);
    }

    function startFarming(uint256 amount, uint256 period) external {
        require(msg.sender == distributor, "FA: access denied");
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 reward = info.startFarming(amount, period, _updateFarmingState);

        emit RewardAdded(reward, period);
    }

    function claimFor(address account, uint256 amount) external override {
        require(msg.sender == address(stakingToken), "ERC20: Access denied");
        rewardsToken.safeTransfer(account, amount);
    }

    // FarmAccounting bindings

    function _updateFarmingState() internal {
        IERC20Farmable(address(stakingToken)).checkpoint(address(this));
    }
}
